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
const PG_MIRROR = process.env.PG_MIRROR || "https://www.gutenberg.org";

type CanonId = "goth" | "glam";

interface CanonWork {
  title: string;
  author: string;
  year: number;
  gutenbergId: number;
}

/** Closed canon: ONLY these six works may ever be sampled. All PD in the US. */
const CANON: Record<CanonId, { label: string; works: CanonWork[] }> = {
  goth: {
    label: "Goth Lit — Ann Radcliffe",
    works: [
      { title: "A Sicilian Romance",        author: "Ann Radcliffe",       year: 1790, gutenbergId: 7371 },
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
  openingSentence: string;
  closingSentence: string;
  userSubmission: string;
  wordCount: number;
  evaluation: EvaluationScore;
  sourceMode: "verbatim-canon";
  gutenbergId?: number;
}

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
          delayMs *= 2;
        } else {
          break;
        }
      }
    }
  }

  throw new Error(`All fallback models failed. Last error: ${lastError?.message || lastError}`);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function fetchWithTimeout(url: string, ms = 30_000): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(ms),
    headers: { "User-Agent": "lit-flow-flash/0.1 (educational exercise)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function cleanProse(raw: string): string {
  let t = raw;
  t = t.split(/\*\*\*\s*END OF THE PROJECT GUTENBERG/i)[0];
  t = t.split(/\*\*\*\s*END OF THIS PROJECT GUTENBERG/i)[0];

  if (/<html[\s>]/i.test(t)) {
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
    const start = t.search(/\*\*\*\s*START OF THE PROJECT GUTENBERG/i);
    if (start !== -1) t = t.slice(start);
    t = t.replace(/^\s*\*\*\*[^\n]*\*\*\*\s*$/gm, " ");
  }

  t = t.replace(/(\w)-\r?\n(\w)/g, "$1$2");
  t = t.replace(/\s*\r?\n\s*/g, (m) => (/\n\s*\n/.test(m) ? "\n\n" : " "));
  t = t.replace(/([a-z])\d{1,3}\b/g, "$1");
  t = t.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

async function fetchRawText(work: CanonWork): Promise<string> {
  const id = work.gutenbergId;
  try {
    return await fetchWithTimeout(`${PG_MIRROR}/cache/epub/${id}/pg${id}.txt.utf-8`);
  } catch {
    return fetchWithTimeout(`${PG_MIRROR}/ebooks/${id}.txt.utf-8`);
  }
}

async function loadCorpus(work: CanonWork): Promise<string> {
  const dir = path.join(CORPUS_DIR, "cache");
  const rawFile   = path.join(dir, `${slug(work.title)}.raw.txt`);
  const cleanFile = path.join(dir, `${slug(work.title)}.clean.txt`);

  try {
    const cached = await fs.readFile(cleanFile, "utf-8");
    if (cached.trim().length > 5000) return cached;
  } catch { /* fall through */ }

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
  if (countWords(cleaned) < 5000) {
    throw new Error(`Corpus too small for "${work.title}" — check PG id ${work.gutenbergId}.`);
  }

  await fs.writeFile(cleanFile, cleaned, "utf-8");
  return cleaned;
}

/** Split text into sentences for slicing. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])["'"]?\s+(?=["'"]?[A-Z—])/g)
    .map((s) => s.trim())
    .filter((s) => countWords(s) >= 4);
}

/**
 * Slice the passage between two boundary fragments.
 * Returns the text between the sentence containing the opening fragment
 * and the sentence containing the closing fragment.
 */
function sliceSpan(prose: string, openFragment: string, closeFragment: string): string {
  const normalized = normalizeForMatch(prose);
  const open = normalizeForMatch(openFragment);
  const close = normalizeForMatch(closeFragment);

  const openIdx = normalized.indexOf(open);
  const closeIdx = normalized.indexOf(close);

  if (openIdx === -1 || closeIdx === -1 || openIdx >= closeIdx) {
    return ""; // Should not happen, validated earlier
  }

  // Find sentence boundaries
  const sentences = splitSentences(prose);
  let sentenceIdx = 0;
  let currentPos = 0;

  // Find which sentence contains the opening
  for (let i = 0; i < sentences.length; i++) {
    const sentNorm = normalizeForMatch(sentences[i]);
    if (normalized.indexOf(open) >= currentPos && normalized.indexOf(open) < currentPos + sentNorm.length) {
      sentenceIdx = i;
      break;
    }
    currentPos += sentNorm.length + 1; // +1 for space
  }

  // Find which sentence contains the closing
  let endIdx = sentenceIdx;
  currentPos = 0;
  for (let i = 0; i < sentences.length; i++) {
    const sentNorm = normalizeForMatch(sentences[i]);
    if (normalized.indexOf(close) >= currentPos && normalized.indexOf(close) < currentPos + sentNorm.length) {
      endIdx = i;
      break;
    }
    currentPos += sentNorm.length + 1;
  }

  // Join sentences between start and end
  const sliced = sentences.slice(sentenceIdx, endIdx + 1).join(" ");
  return sliced.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// UNIQUE PATTERN MATCHING
// ---------------------------------------------------------------------------

function normalizeForMatch(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function uniqueMatch(text: string, fragment: string): { index: number; count: number } {
  const normalized = normalizeForMatch(text);
  const frag = normalizeForMatch(fragment);
  if (!frag) return { index: -2, count: 0 };
  const escaped = frag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...normalized.matchAll(new RegExp(escaped, "g"))];
  return { index: matches.length === 1 ? matches[0].index! : -1, count: matches.length };
}

async function promptUniqueFragment(
  rl: readline.Interface,
  passage: string,
  label: string,
  afterIndex?: number
): Promise<string> {
  while (true) {
    const fragment = (
      await rl.question(`\nPaste ${label} (a few words that appear exactly once): `)
    ).trim();

    if (!fragment) {
      console.log("Empty input. Try again.");
      continue;
    }

    const result = uniqueMatch(passage, fragment);

    if (result.index === -2) {
      console.log("Empty input. Try again.");
      continue;
    }

    if (result.count === 0) {
      console.log(`"${fragment}" not found in the passage. Try a different fragment.`);
    } else if (result.count > 1) {
      console.log(`"${fragment}" matched ${result.count} times — not unique. Add more words.`);
    } else if (afterIndex !== undefined && result.index <= afterIndex) {
      console.log("That appears before your opening sentence. Pick a later fragment.");
    } else {
      return fragment;
    }
  }
}

// ---------------------------------------------------------------------------
// TITLE SELECTION
// ---------------------------------------------------------------------------

async function promptTitleSelection(rl: readline.Interface): Promise<CanonWork> {
  const allWorks = [...CANON.goth.works, ...CANON.glam.works];

  console.log("\nAll six works:");
  allWorks.forEach((w, i) => {
    console.log(`  ${i + 1}) "${w.title}" (${w.year}) — ${w.author}`);
  });

  while (true) {
    const answer = (await rl.question("\nSelect exact title: ")).trim();

    const byNumber = Number(answer);
    if (Number.isInteger(byNumber) && byNumber >= 1 && byNumber <= allWorks.length) {
      return allWorks[byNumber - 1];
    }

    const found = allWorks.find(
      (w) => w.title.toLowerCase() === answer.toLowerCase()
    );
    if (found) return found;

    console.log("Title not found. Type the exact title as shown above.");
  }
}

// ---------------------------------------------------------------------------
// FORM SELECTION
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// SAVE STATE
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// WARM CORPUS
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

export async function main() {
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

    // Step 2: Select exact title
    const work = await promptTitleSelection(rl);

    // Step 1: Load corpus (no text displayed)
    console.log(`\nLoading "${work.title}" (${work.year})...`);
    const prose = await loadCorpus(work);
        console.log(`✓ Corpus loaded (${countWords(prose).toLocaleString()} words). No text will be displayed.`);

    // Steps 3 & 4: Boundary fragments — unique pattern match against full book
    const openFragment = await promptUniqueFragment(rl, prose, "opening sentence of the section you read");
    const openResult = uniqueMatch(prose, openFragment);
    const closeFragment = await promptUniqueFragment(
      rl,
      prose,
      "closing sentence of the section you read",
      openResult.index
    );

    // Step 5: Echo back both boundary fragments to confirm
    console.log("\n--- BOUNDARY CONFIRMATION ---");
    console.log(`Opening: "${openFragment}"`);
    console.log(`Closing: "${closeFragment}"`);
    console.log("-----------------------------");
    const confirmed = (await rl.question("Confirm these boundaries? [Y/n]: "))
      .trim()
      .toLowerCase();
    if (confirmed === "n" || confirmed === "no") {
      console.log("Cancelled. Re-run to start over.");
      return;
    }

    // Step 5b: Echo the sliced span between the boundaries
    const passage = sliceSpan(prose, openFragment, closeFragment);
    if (!passage || countWords(passage) < 10) {
      console.error("Could not extract a valid span from your boundaries. Re-run and widen your selection.");
      return;
    }

    console.log(`\n--- YOUR SECTION (${countWords(passage)} words) ---`);
    console.log(passage);
    console.log("--------------------------------------\n");

    // Step 6: Select form
    const formType = await promptFormChoice(rl);
    const formConfig = FORMS[formType];
    console.log(`\nForm selected: ${formConfig.name} (${formConfig.description})`);

    // Step 7: Write your piece (book may stay open)
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

    // Step 8: Evaluate
    console.log("\nEvaluating submission...");

    const judgePrompt = `
You are an uncompromising literary critic evaluating a student's flash-writing exercise.

SOURCE PASSAGE (VERBATIM PUBLIC-DOMAIN TEXT — the exact section the student read on paper):
"""
${passage}
"""

BOUNDARY SENTENCES IDENTIFIED BY STUDENT:
Opening: "${openFragment}"
Closing: "${closeFragment}"

STUDENT SUBMISSION (${formConfig.name}, target: ${formConfig.description}):
"""
${submission}
"""

Evaluate the submission across these 5 criteria on a 0-10 scale:
1. style_alignment: Voice and cadence echo of the source author (real PD text)
2. motif_reuse: Subtle reinterpretation of symbols or motifs from the source passage
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
  "total_score": number,
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
      authorOrWork: `"${work.title}" (${work.year}) — ${work.author} · VERBATIM`,
      passage,
      openingSentence: openFragment,
      closingSentence: closeFragment,
      userSubmission: submission,
      wordCount,
      evaluation,
      sourceMode: "verbatim-canon",
      gutenbergId: work.gutenbergId,
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
