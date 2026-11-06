import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { GoogleGenAI } from "@google/genai";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const TEXT_ID = process.env.TEXT_ID ?? "gatsby";
const CHUNKS = Number(process.env.CHUNKS ?? 3);
const CHUNK_OFFSET = Number(process.env.CHUNK_OFFSET ?? 0);
const USER_ID = process.env.USER_ID ?? "default";

// ---------------------------------------------------------------------------
// Writing forms
// ---------------------------------------------------------------------------
type Form = { name: string; label: string; min: number; max: number };

const FORMS: Record<string, Form> = {
  "1": { name: "nano-fic", label: "nano-fic (15-25 words)",      min: 15,  max: 25  },
  "2": { name: "drabble",  label: "drabble (exactly 100 words)", min: 100, max: 100 },
};

async function chooseForm(rl: ReturnType<typeof createInterface>): Promise<Form> {
  // Optional override: FORM=nano-fic or FORM=drabble skips the prompt.
  const env = process.env.FORM?.toLowerCase();
  if (env === "nano-fic" || env === "nano") return FORMS["1"];
  if (env === "drabble") return FORMS["2"];

  while (true) {
    const a = (
      await rl.question(
        "\nChoose your form:\n  1) nano-fic (15-25 words)\n  2) drabble  (exactly 100 words)\n> "
      )
    )
      .trim()
      .toLowerCase();
    if (a === "1" || a === "nano-fic" || a === "nano") return FORMS["1"];
    if (a === "2" || a === "drabble") return FORMS["2"];
    console.log("Please enter 1 or 2.");
  }
}

// Hyphenated words (e.g. "well-lit") count as one word.
const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

async function main() {
  const rl = createInterface({ input, output });

  // 0. Pick the form (nano-fic or drabble)
  const form = await chooseForm(rl);
  const MIN_WORDS = form.min;
  const MAX_WORDS = form.max;
  const target = MIN_WORDS === MAX_WORDS ? `exactly ${MIN_WORDS}` : `${MIN_WORDS}-${MAX_WORDS}`;

  // 1. Connect to the Go MCP server
  const transport = new StdioClientTransport({
    command: join(root, "bin", "mcp-server.exe"),
    env: { ...process.env, LITFLOW_TEXTS: join(root, "datasets", "texts") },
  });
  const mcp = new Client({ name: "orchestrator", version: "0.1.0" });
  await mcp.connect(transport);

  // 2. Read chunks via books.get_chunk (starting at CHUNK_OFFSET)
  let corpus = "";
  for (let i = 0; i < CHUNKS; i++) {
    const res: any = await mcp.callTool({
      name: "books.get_chunk",
      arguments: { text_id: TEXT_ID, chunk_idx: i + CHUNK_OFFSET },
    });
    const chunk = res.content?.[0]?.text ?? "";
    if (chunk.includes("[end of text]")) break;
    corpus += chunk + "\n\n";
  }

  // 3. Read prior milestones via user.read_history
  const hist: any = await mcp.callTool({
    name: "user.read_history",
    arguments: { user_id: USER_ID },
  });

  console.log(`\n=== READ: ${TEXT_ID} (chunks ${CHUNK_OFFSET}–${CHUNK_OFFSET + CHUNKS - 1}) ===\n`);
  console.log(corpus);

  // 4. YOU write the piece — enforce word bounds for the chosen form
  console.log("\n=== WRITE ===\n");
  let piece = "";
  let wc = 0;
  while (wc < MIN_WORDS || wc > MAX_WORDS) {
    if (piece) {
      console.log(
        `\nThat was ${wc} words — a ${form.name} must be ${target}. Try again.\n`
      );
    }
    piece = (
      await rl.question(
        `Write your ${form.label} echoing the passage above:\n\n> `
      )
    ).trim();
    wc = countWords(piece);
  }
  rl.close();

  // 5. Gemini judges your piece
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const judgePrompt = `You are a strict literary evaluator. Score this piece
against the source passages on style alignment, motif reuse, precision, concision, originality.
Score each metric on a 0-10 scale.

The writer chose the "${form.name}" form, which requires ${target} words. This submission is ${wc} words.
Judge concision and precision relative to that form's length, and penalize if the word count is outside the allowed range.

ORIGINALITY means: does the piece transform its influences into something fresh,
rather than copying phrases verbatim or producing generic filler?

SOURCE PASSAGES:
${corpus}

PIECE (${form.name}):
${piece}

Respond ONLY with valid JSON — no markdown, no explanation:
{"word_count": ${wc}, "style_alignment": 0.0, "motif_reuse": 0.0, "precision": 0.0, "concision": 0.0, "originality": 0.0, "notes": "one sentence"}`;

  const gen = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: judgePrompt,
  });
  const raw = gen.text ?? "";
  const jsonStr = raw.replace(/```json|```/g, "").trim();
  const verdict = JSON.parse(jsonStr);

  console.log("\n=== JUDGMENT ===");
  console.table(verdict);

  // 6. Save to state
  const stateDir = join(root, ".state");
  await mkdir(stateDir, { recursive: true });
  const path = join(stateDir, `${USER_ID}.json`);
  let ms: any[] = [];
  try {
    ms = JSON.parse(await readFile(path, "utf8"));
  } catch {}
  ms.push({
    id: `${TEXT_ID}-${Date.now()}`,
    form: form.name,
    text: piece,
    ...verdict,
  });
  await writeFile(path, JSON.stringify(ms, null, 2));
  console.log(`\nsaved -> ${path}`);

  await mcp.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
