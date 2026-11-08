import { GoogleGenAI } from "@google/genai";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const USER_ID = process.env.USER_ID ?? "default";
const MODEL_NAME = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";

// ---------------------------------------------------------------------------
// Writing forms
// ---------------------------------------------------------------------------
type Form = { name: string; label: string; min: number; max: number };

const FORMS: Record<string, Form> = {
  "1": { name: "epigram",  label: "Epigram  (15-25 words)", min: 15,  max: 25  },
  "2": { name: "vignette", label: "Vignette (30-50 words)", min: 30,  max: 50  },
  "3": { name: "drabble",  label: "Drabble  (exactly 100 words)", min: 100, max: 100 },
};

async function chooseForm(rl: ReturnType<typeof createInterface>): Promise<Form> {
  const env = process.env.FORM?.toLowerCase();
  if (env === "epigram" || env === "1") return FORMS["1"];
  if (env === "vignette" || env === "2") return FORMS["2"];
  if (env === "drabble" || env === "3") return FORMS["3"];

  while (true) {
    const a = (
      await rl.question(
        "\nChoose your form:\n  1) Epigram  (15-25 words)\n  2) Vignette (30-50 words)\n  3) Drabble  (exactly 100 words)\n> "
      )
    )
      .trim()
      .toLowerCase();

    if (a === "1" || a === "epigram") return FORMS["1"];
    if (a === "2" || a === "vignette") return FORMS["2"];
    if (a === "3" || a === "drabble") return FORMS["3"];
    console.log("Please enter 1, 2, or 3.");
  }
}

// Hyphenated words count as one word.
const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

// Helper to wrap long strings so they fit cleanly inside console.table
function wrapText(text: string, maxLineLength = 65): string {
  const words = text.split(" ");
  let lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length > maxLineLength) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + " " + word : word;
    }
  }
  if (currentLine) {
    lines.push(currentLine.trim());
  }
  return lines.join("\n");
}

async function main() {
  const rl = createInterface({ input, output });

  // 0. Pick the form (epigram, vignette, or drabble)
  const form = await chooseForm(rl);
  const MIN_WORDS = form.min;
  const MAX_WORDS = form.max;
  const target = MIN_WORDS === MAX_WORDS ? `exactly ${MIN_WORDS}` : `${MIN_WORDS}-${MAX_WORDS}`;

  // 1. Prompt user for ANY public domain novel or author
  const rawInput = await rl.question(
    '\nEnter public domain title/author [Default: The Mysteries of Udolpho by Ann Radcliffe]: '
  );
  const bookQuery = rawInput.trim() || "The Mysteries of Udolpho by Ann Radcliffe";

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  // 2. Fetch/generate passage via Gemini
  console.log(`\nGenerating passage for "${bookQuery}"...\n`);
  const passagePrompt = `Generate a single compelling 250-300 word passage from or strictly in the authentic prose style and literary voice of "${bookQuery}". Include vivid imagery, distinct tone, and central motifs characteristic of the work. Output ONLY the literary passage text without any conversational preamble, titles, or closing commentary.`;

  const passageGen = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: passagePrompt,
  });
  const corpus = passageGen.text ? passageGen.text.trim() : "";

  console.log(`\n=== READ: ${bookQuery} ===\n`);
  console.log(corpus);

  // 3. User writes submission
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
        `Write your ${form.name} (${target} words) echoing the passage above:\n\n> `
      )
    ).trim();
    wc = countWords(piece);
  }
  rl.close();

  // 4. Gemini evaluation
  console.log("\nEvaluating your submission...\n");
  const judgePrompt = `You are a strict literary evaluator. Score this piece
against the source passage on style alignment, motif reuse, precision, concision, originality.
Score each of these 5 metrics strictly on a 0-10 integer scale.

The writer chose the "${form.name}" form, which requires ${target} words. This submission is ${wc} words.
Judge concision and precision relative to that form's length, and penalize if the word count is outside the allowed range.

ORIGINALITY means: does the piece transform its influences into something fresh,
rather than copying phrases verbatim or producing generic filler?

SOURCE PASSAGE:
${corpus}

PIECE (${form.name}):
${piece}

Respond ONLY with valid JSON — no markdown, no explanation:
{"word_count": ${wc}, "style_alignment": 0, "motif_reuse": 0, "precision": 0, "concision": 0, "originality": 0, "notes": "one sentence"}`;

  const gen = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: judgePrompt,
  });
  const raw = gen.text ?? "";
  const jsonStr = raw.replace(/```json|```/g, "").trim();
  const rawVerdict = JSON.parse(jsonStr);

  // Compute total mark out of 100 (5 metrics * 10 max each = 50 total * 2)
  const style = Number(rawVerdict.style_alignment ?? 0);
  const motif = Number(rawVerdict.motif_reuse ?? 0);
  const prec = Number(rawVerdict.precision ?? 0);
  const conc = Number(rawVerdict.concision ?? 0);
  const orig = Number(rawVerdict.originality ?? 0);

  const totalScore = (style + motif + prec + conc + orig) * 2;

  // Format table output with /10 metrics, total /100, and wrapped notes
  const verdict = {
    word_count: `${rawVerdict.word_count} words`,
    style_alignment: `${style}/10`,
    motif_reuse: `${motif}/10`,
    precision: `${prec}/10`,
    concision: `${conc}/10`,
    originality: `${orig}/10`,
    total_score: `${totalScore}/100`,
    notes: wrapText(rawVerdict.notes ?? "", 65),
  };

  console.log("\n=== JUDGMENT ===");
  console.table(verdict);

  // 5. Save session state
  const stateDir = join(root, ".state");
  await mkdir(stateDir, { recursive: true });
  const path = join(stateDir, `${USER_ID}.json`);
  let ms: any[] = [];
  try {
    ms = JSON.parse(await readFile(path, "utf8"));
  } catch {}

  const sanitizedId = bookQuery.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  ms.push({
    id: `${sanitizedId}-${Date.now()}`,
    form: form.name,
    text: piece,
    raw_scores: { style, motif, prec, conc, orig, total: totalScore },
    ...verdict,
  });
  await writeFile(path, JSON.stringify(ms, null, 2));
  console.log(`\nsaved -> ${path}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
