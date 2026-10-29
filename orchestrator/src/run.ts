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
const USER_ID = "default";

// Drabble length bounds — change these later to 95–105 for full drabbles
const MIN_WORDS = Number(process.env.MIN_WORDS ?? 15);
const MAX_WORDS = Number(process.env.MAX_WORDS ?? 25);

async function main() {
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

  // 4. YOU write the flash piece — enforce word bounds
  const rl = createInterface({ input, output });
  console.log("\n=== WRITE ===\n");
  let drabble = "";
  let wc = 0;
  while (wc < MIN_WORDS || wc > MAX_WORDS) {
    if (drabble) {
      console.log(`\nThat was ${wc} words — needs to be ${MIN_WORDS}–${MAX_WORDS}. Try again.\n`);
    }
    drabble = (await rl.question(
      `Write your ${MIN_WORDS}–${MAX_WORDS}-word flash piece echoing the passage above:\n\n> `
    )).trim();
    wc = drabble.split(/\s+/).length;
  }
  rl.close();

  // 5. Gemini judges your piece
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const judgePrompt = `You are a strict literary evaluator. Score this flash piece
against the source passages on style alignment, motif reuse, precision, concision, originality.

The form requires ${MIN_WORDS}–${MAX_WORDS} words. This submission is ${wc} words.
Penalize concision if far from the target range.

ORIGINALITY means: does the piece transform its influences into something fresh,
rather than copying phrases verbatim or producing generic filler?

SOURCE PASSAGES:
${corpus}

FLASH PIECE:
${drabble}

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
  try { ms = JSON.parse(await readFile(path, "utf8")); } catch {}
  ms.push({
    id: `${TEXT_ID}-${Date.now()}`,
    text: drabble,
    ...verdict,
  });
  await writeFile(path, JSON.stringify(ms, null, 2));
  console.log(`\nsaved -> ${path}`);

  await mcp.close();
}

main().catch((e) => { console.error(e); process.exit(1); });