import { GoogleGenAI } from "@google/genai";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// Model cascade: Primary model down to high-availability backups
const MODEL_CASCADE = [
  process.env.GEMINI_MODEL || "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

const USER_ID = process.env.USER_ID || "default";

// ---------------------------------------------------------------------------
// REAL EXCERPT ENGINE — verbatim public-domain text, sliced locally (no LLM)
// ---------------------------------------------------------------------------

const CORPUS_DIR = process.env.CORPUS_DIR || path.join(process.cwd(), ".corpus");
const EXCERPT_WORDS = Number(process.env.EXCERPT_WORDS || 500);
const PG_MIRROR = process.env.PG_MIRROR || "https://www.gutenberg.org";

type CanonId = "goth" | "glam";

interface CanonWork {
  title: string;
  author: string;
  year: number;
  gutenbergId: number; // Project Gutenberg US ebook number
}

/** Closed canon: ONLY these six works may ever be sampled. All PD in the US. */
const CANON: Record<CanonId, { label: string; works: CanonWork[] }> = {
  goth: {
    label: "Goth Lit — Ann Radcliffe",
    works: [
      { title: "A Sicilian Romance",        author: "Ann Radcliffe",       year: 1790, gutenbergId: 2542 },
      { title: "The Romance of the Forest", author: "Ann Radcliffe",       year: 1791, gutenbergId: 64701 },
      { title: "The Mysteries of Udolpho",  author: "Ann Radcliffe",       year: 1794, gutenbergId: 3268 },
    ],
  },
  glam: {
    label: "Glam Lit — F. Scott Fitzgerald",
    works: [
      { title: "This Side of Paradise", author: "F. Scott Fitzgerald", year: 1920, gutenbergId: 805 },
      { title: "The Beautiful and Damned",  author: "F. Scott Fitzgerald", year: 1922, gutenbergId: 9830 },
      { title: "The Great Gatsby",          author: "F. Scott Fitzgerald", year: 1925, gutenbergId: 64317 },
    ],
  },
};

type FormType = "epigram" | "vignette" | "drabble";

interface FormConfig {
  name: string;
  minWords: number;
  maxWords: number;
  description: string;
}

const FORMS: Record<FormType, FormConfig> = {
  epigram: {
    name: "Epigram",
    minWords: 15,
    maxWords: 25,
    description: "15–25 words (single focused observation)",
  },
  vignette: {
    name: "Vignette",
    minWords: 30,
    maxWords: 50,
    description: "30–50 words (short atmospheric scene)",
  },
  drabble: {
    name: "Drabble",
    minWords: 100,
    maxWords: 100,
    description: "Exactly 100 words (complete miniature story)",
  },
};

interface EvaluationScore {
  style_alignment: number;
  motif_reuse: number;
  precision: number;
  concision: number;
  originality: number;
  total_score: number;
  feedback: string;
}

interface SavedSession {
  timestamp: string;
  userId: string;
  form: FormType;
  authorOrWork: string;
  passage: string;
  userSubmission: string;
  wordCount: number;
  evaluation: EvaluationScore;
  sourceMode: "verbatim-canon" | "ai-style";
  gutenbergId?: number;
}

/**
 * Executes a API call with exponential backoff retries and model cascade fallback.
 */
async function generateResilientContent(
  ai: GoogleGenAI,
  params: Omit<Parameters<typeof ai.models.generateContent>[0], "model">,
  maxRetriesPerModel = 2
) {
  let lastError: any = null;

  for (const model of MODEL_CASCADE) {
    let attempt = 0;
    let delayMs = 1000;

    while (attempt <= maxRetriesPerModel) {
      try {
        if (attempt > 0 || model !== MODEL_CASCADE[0]) {
          console.warn(`\n[System] Using model: ${model} (Attempt ${attempt + 1})`);
        }

        const response = await ai.models.generateContent({
          ...params,
          model,
        });

        return response;
      } catch (err: any) {
        lastError = err;
        const is503 =
          err?.status === 503 ||
          err?.error?.code === 503 ||
          err?.message?.includes("503");

        if (is503 && attempt < maxRetriesPerModel) {
          attempt++;
          console.warn(
            `\n[503 Busy] ${model} unavailable. Retrying in ${delayMs / 1000}s...`
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          delayMs *= 2; // Exponential backoff
        } else {
          // Cascade to next model in list
          break;
        }
      }
    }
  }

  throw new Error(`All fallback models failed. Last error: ${lastError?.message || lastError}`);
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Cryptographically-strong pick — true randomness, no Math.random drift. */
function securePick<T>(arr: readonly T[]): T {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return arr[buf[0] % arr.length];
}

async function fetchWithTimeout(url: string, ms = 30_000): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(ms),
    headers: { "User-Agent": "lit-flow-flash/0.1 (educational exercise)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** Strip PG boilerplate, HTML tags/entities, hard-wrapped lines, footnote markers. */
function cleanProse(raw: string): string {
  let t = raw;

  // Drop anything after the license footer.
  t = t.split(/\*\*\*\s*END OF THE PROJECT GUTENBERG/i)[0];
  t = t.split(/\*\*\*\s*END OF THIS PROJECT GUTENBERG/i)[0];

  if (/<html[\s>]/i.test(t)) {
    // HTML source: keep <body>, kill scripts/styles/tags/entities.
    t = t.slice(t.search(/<body[\s>]/i));
    t = t.replace(/<script[\s\S]*?<\/script>/gi, " ");
    t = t.replace(/<style[\s\S]*?<\/style>/gi, " ");
    t = t.replace(/<(?:h\d|p|br|div|li)[^>]*>/gi, "\n\n");
    t = t.replace(/<[^>]+>/g, " ");
    t = t
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#8217;|&rsquo;/g, "'")
      .replace(/&#8216;|&lsquo;/g, "'").replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
      .replace(/&#8212;|&mdash;/g, "—").replace(/&#8230;|&hellip;/g, "…")
      .replace(/&nbsp;/g, " ").replace(/&#\d+;/g, " ");
  } else {
    // Plain text: start at the START marker to skip front matter/preface.
    const start = t.search(/\*\*\*\s*START OF THE PROJECT GUTENBERG/i);
    if (start !== -1) t = t.slice(start);
    t = t.replace(/^\s*\*\*\*[^\n]*\*\*\*\s*$/gm, " ");
  }

  // De-hyphenate line-break splits, then unwrap hard wraps into paragraphs.
  t = t.replace(/(\w)-\r?\n(\w)/g, "$1$2");
  t = t.replace(/\s*\r?\n\s*/g, (m) => (/\n\s*\n/.test(m) ? "\n\n" : " "));

  // Drop footnote digits glued to words, collapse whitespace.
  t = t.replace(/([a-z])\d{1,3}\b/g, "$1");
  t = t.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

async function fetchRawText(work: CanonWork): Promise<string> {
  const id = work.gutenbergId;
  // Prefer the stable cache path; fall back to the canonical redirect.
  try {
    return await fetchWithTimeout(`${PG_MIRROR}/cache/epub/${id}/pg${id}.txt.utf-8`);
  } catch {
    return fetchWithTimeout(`${PG_MIRROR}/ebooks/${id}.txt.utf-8`);
  }
}

/** Download once, cache cleaned prose forever under .corpus/cache/. */
async function loadCorpus(work: CanonWork): Promise<string> {
  const dir = path.join(CORPUS_DIR, "cache");
  const rawFile   = path.join(dir, `${slug(work.title)}.raw.txt`);
  const cleanFile = path.join(dir, `${slug(work.title)}.clean.txt`);

  // Fast path: already cleaned.
  try {
    const cached = await fs.readFile(cleanFile, "utf-8");
    if (cached.trim().length > 5000) return cached;
  } catch { /* fall through */ }

  // Keep raw bytes forever so cleaning can be re-run offline.
  let raw: string;
  try {
    raw = await fs.readFile(rawFile, "utf-8");
    console.log(`\n[corpus] Re-cleaning "${work.title}" from cached raw…`);
  } catch {
    console.log(`\n[corpus] Fetching "${work.title}" (${work.year})…`);
    raw = await fetchRawText(work);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(rawFile, raw, "utf-8");
  }

  const cleaned = cleanProse(raw);
  if (countWords(cleaned) < EXCERPT_WORDS * 3) {
    throw new Error(`Corpus too small for "${work.title}" — check PG id ${work.gutenbergId}.`);
  }

  await fs.writeFile(cleanFile, cleaned, "utf-8");
  return cleaned;
}

/** Split into sentences without shredding abbreviations/quotes. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])["'"]?\s+(?=["'"]?[A-Z—])/g)
    .map((s) => s.trim())
    .filter((s) => countWords(s) >= 4);
}

/**
 * Verbatim window of ~targetWords, snapped to sentence boundaries.
 * Start offset chosen with CSPRNG, biased away from front/back matter.
 */
function sampleExcerpt(prose: string, targetWords: number): string {
  const sentences = splitSentences(prose);
  if (!sentences.length) throw new Error("No sentences parsed from corpus.");

  const lo = Math.floor(sentences.length * 0.08);
  const hi = Math.max(lo + 1, Math.floor(sentences.length * 0.92));
  let idx = lo + securePick(Array.from({ length: hi - lo }, (_, i) => i));

  const out: string[] = [];
  let words = 0;
  while (idx < sentences.length && words < targetWords) {
    out.push(sentences[idx]);
    words += countWords(sentences[idx]);
    idx++;
    if (words >= targetWords * 0.85 && /[.!?…]["'"]?$/.test(out[out.length - 1])) break;
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

/** Random draw from one canon set. */
async function drawRealExcerpt(canonId: CanonId): Promise<{ work: CanonWork; excerpt: string }> {
  const pool = CANON[canonId].works;
  const work = securePick(pool);
  const prose = await loadCorpus(work);
  return { work, excerpt: sampleExcerpt(prose, EXCERPT_WORDS) };
}

/** Same as drawRealExcerpt, but accepts a specific work (user-selected or list-displayed). */
async function drawRealExcerptFrom(work: CanonWork): Promise<{ work: CanonWork; excerpt: string }> {
  const prose = await loadCorpus(work);
  return { work, excerpt: sampleExcerpt(prose, EXCERPT_WORDS) };
}

/** Pre-download + clean every work in both canons. Idempotent. */
async function warmCorpus(): Promise<void> {
  const all = [...CANON.goth.works, ...CANON.glam.works];
  console.log(`Warming ${all.length} works into ${CORPUS_DIR}/cache …\n`);

  let ok = 0;
  for (const work of all) {
    try {
      const prose = await loadCorpus(work);
      console.log(`  ✓ ${work.title} (${countWords(prose).toLocaleString()} words)`);
      ok++;
    } catch (err: any) {
      console.error(`  ✗ ${work.title}: ${err?.message || err}`);
    }
  }

  console.log(`\nDone: ${ok}/${all.length} cached.`);
  if (ok < all.length) process.exitCode = 1;
}

async function promptFormChoice(rl: readline.Interface): Promise<FormType> {
  const envForm = process.env.FORM?.toLowerCase() as FormType;
  if (envForm && FORMS[envForm]) {
    console.log(`Using form from environment: ${FORMS[envForm].name}`);
    return envForm;
  }

  console.log("\nChoose your writing form:");
  console.log("  1) Epigram  - 15–25 words (single focused observation)");
  console.log("  2) Vignette - 30–50 words (short atmospheric scene)");
  console.log("  3) Drabble  - Exactly 100 words (complete miniature story)");

  while (true) {
    const answer = (await rl.question("\nSelect [1-3] (default: 2): ")).trim();
    if (answer === "1" || answer.toLowerCase() === "epigram") return "epigram";
    if (answer === "" || answer === "2" || answer.toLowerCase() === "vignette") return "vignette";
    if (answer === "3" || answer.toLowerCase() === "drabble") return "drabble";
    console.log("Invalid choice. Please select 1, 2, or 3.");
  }
}

async function saveState(session: SavedSession): Promise<void> {
  const stateDir = path.join(process.cwd(), ".state");
  const filePath = path.join(stateDir, `${session.userId}.json`);

  await fs.mkdir(stateDir, { recursive: true });

  let existing: SavedSession[] = [];
  try {
    const data = await fs.readFile(filePath, "utf-8");
    existing = JSON.parse(data);
  } catch {
    existing = [];
  }

  existing.push(session);
  await fs.writeFile(filePath, JSON.stringify(existing, null, 2), "utf-8");
  console.log(`\nSession saved to .state/${session.userId}.json`);
}

export async function main() {
    // `npm run warm` / `node run.ts --warm` → fetch whole canon, then exit.
  if (process.argv.includes("--warm")) {
    await warmCorpus();
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY environment variable is missing.");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });
  const rl = readline.createInterface({ input, output });

  try {
    console.log("==========================================");
    console.log("         L I T - F L O W - F L A S H     ");
    console.log("==========================================");

    const formType = await promptFormChoice(rl);
    const formConfig = FORMS[formType];

    // --- Mode selection -----------------------------------------------------
    const modeAnswer = (
      await rl.question(
        "\nPassage source — [1] REAL verbatim canon excerpt (default) / [2] AI 'in the style of': "
      )
    ).trim();
    const useReal = modeAnswer !== "2";

    let passage: string;
    let authorOrWork: string;
    let drawnWork: CanonWork | undefined;

    if (useReal) {
      // --- Choose canon ---
      const canonAnswer = (
        await rl.question("Canon — [g] Goth Lit (Radcliffe) / [l] Glam Lit (Fitzgerald) [default g]: ")
      ).trim().toLowerCase();
      const canonId: CanonId = canonAnswer.startsWith("l") ? "glam" : "goth";

      // --- Show the 3 titles from that canon (for reference) ---
      const pool = CANON[canonId].works;
      console.log(`\n${CANON[canonId].label}:`);
      pool.forEach((w, i) => console.log(`  ${i + 1}) "${w.title}" (${w.year})`));
      console.log();

      // --- CSPRNG picks one behind the scenes ---
      const work = securePick(pool);
      drawnWork = work;
      console.log(`Drawing a real ${EXCERPT_WORDS}-word excerpt from: "${work.title}" (${work.year})`);

      const draw = await drawRealExcerptFrom(work);
      passage = draw.excerpt;
      authorOrWork = `"${draw.work.title}" (${draw.work.year}) — ${draw.work.author} · VERBATIM`;
    } else {
      const legacy =
        (await rl.question("\nEnter public domain work/author [Ann Radcliffe]: ")).trim() ||
        "The Mysteries of Udolpho by Ann Radcliffe";
      authorOrWork = `${legacy} (AI STYLE SIMULATION)`;
      console.log(`\nGenerating passage in the style of "${legacy}"...`);

      const passageResponse = await generateResilientContent(ai, {
        contents: `Generate a 250-300 word literary excerpt in the distinct style and voice of ${legacy}. Return ONLY the excerpt text with no introduction or metadata.`,
      });
      passage = passageResponse.text?.trim() || "";
    }

    console.log(`\nSOURCE: ${authorOrWork}`);
    console.log(`EXCERPT WORDS: ${countWords(passage)}\n`);
    console.log("--- READ & INTERNALIZE (CLOSED-BOOK) ---");
    console.log(passage);
    console.log("----------------------------------------\n");

    console.log(`Form selected: ${formConfig.name} (${formConfig.description})`);

    let submission = "";
    let wordCount = 0;

    while (true) {
      submission = (await rl.question(`\nDraft your ${formConfig.name}:\n> `)).trim();
      wordCount = countWords(submission);

      if (formConfig.minWords === formConfig.maxWords) {
        if (wordCount === formConfig.minWords) break;
        console.log(`Word count error: Must be exactly ${formConfig.minWords} words (you wrote ${wordCount}). Try again.`);
      } else {
        if (wordCount >= formConfig.minWords && wordCount <= formConfig.maxWords) break;
        console.log(`Word count error: Must be between ${formConfig.minWords} and ${formConfig.maxWords} words (you wrote ${wordCount}). Try again.`);
      }
    }

    console.log("\nEvaluating submission...");

    const judgePrompt = `
You are an uncompromising literary critic evaluating a student's flash-writing exercise.

SOURCE PASSAGE${useReal ? " (VERBATIM PUBLIC-DOMAIN TEXT)" : ""}:
"""
${passage}
"""

STUDENT SUBMISSION (${formConfig.name}, target: ${formConfig.description}):
"""
${submission}
"""

Evaluate the submission across these 5 criteria on a 0-10 scale:
1. style_alignment: Voice and cadence echo of the source author${useReal ? " (real PD text, not a simulation)" : ""}
2. motif_reuse: Subtle reinterpretation of symbols or motifs
3. precision: Exactness of word choice and phrasing
4. concision: Zero wasted filler word count
5. originality: Fresh transformation (penalize verbatim copying from the source)

Return ONLY a JSON object matching this exact schema:
{
  "style_alignment": number,
  "motif_reuse": number,
  "precision": number,
  "concision": number,
  "originality": number,
  "total_score": number, // Sum of 5 metrics * 2 (Out of 100)
  "feedback": "Concise line-wrapped notes detailing strengths and specific fixes"
}
`;

    const evalResponse = await generateResilientContent(ai, {
      contents: judgePrompt,
      config: { responseMimeType: "application/json" },
    });

    const evalText = evalResponse.text?.trim() || "{}";
    const evaluation: EvaluationScore = JSON.parse(evalText);

    console.log("\n==========================================");
    console.log(` SCORE: ${evaluation.total_score} / 100`);
    console.log("==========================================");
    console.log(`Style Alignment: ${evaluation.style_alignment}/10`);
    console.log(`Motif Reuse:     ${evaluation.motif_reuse}/10`);
    console.log(`Precision:       ${evaluation.precision}/10`);
    console.log(`Concision:       ${evaluation.concision}/10`);
    console.log(`Originality:     ${evaluation.originality}/10`);
    console.log("\nFEEDBACK:");
    console.log(evaluation.feedback);
    console.log("==========================================");

    await saveState({
      timestamp: new Date().toISOString(),
      userId: USER_ID,
      form: formType,
      authorOrWork,
      passage,
      userSubmission: submission,
      wordCount,
      evaluation,
      sourceMode: useReal ? "verbatim-canon" : "ai-style",
      gutenbergId: drawnWork?.gutenbergId,
    });
  } catch (error: any) {
    console.error("\nExecution failed:", error?.message || error);
  } finally {
    rl.close();
  }
}

import { fileURLToPath } from "node:url";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
