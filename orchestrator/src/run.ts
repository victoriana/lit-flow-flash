import { GoogleGenAI } from "@google/genai";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as trendsMod from "./trends.js";

// Model cascade: Primary model down to high-availability backups
const MODEL_CASCADE = [
  process.env.GEMINI_MODEL || "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest", // catches any future 2.5-lite deprecation
];

const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 25_000);
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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return promise;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout after ${(ms / 1000).toFixed(1)}s (${label})`));
    }, ms);

    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function generateResilientContent(
  ai: GoogleGenAI,
  params: Omit<Parameters<typeof ai.models.generateContent>[0], "model">,
  maxRetriesPerModel = 1
) {
  let lastError: any = null;

  for (const model of MODEL_CASCADE) {
    let attempt = 0;
    let delayMs = 1000;

    while (attempt <= maxRetriesPerModel) {
      const startedAt = Date.now();
      try {
        console.log(
          `[LLM] Calling ${model} (attempt ${attempt + 1}/${maxRetriesPerModel + 1}, timeout ${
            LLM_TIMEOUT_MS / 1000
          }s)...`
        );

        const response = await withTimeout(
          ai.models.generateContent({
            ...params,
            model,
          }),
          LLM_TIMEOUT_MS,
          model
        );

        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(`[LLM] ${model} responded in ${elapsed}s.`);
        return response;
      } catch (err: any) {
        lastError = err;
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        const status = err?.status ?? err?.error?.code ?? "unknown";
        const msg = err?.message || String(err);

        console.warn(`[LLM] ${model} failed after ${elapsed}s (status=${status}): ${msg}`);

        const is503 =
          status === 503 ||
          msg.includes("503") ||
          msg.toLowerCase().includes("unavailable");

        if (is503 && attempt < maxRetriesPerModel) {
          attempt++;
          console.warn(`[503 Busy] Retrying ${model} in ${delayMs / 1000}s...`);
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

function sliceSpan(prose: string, openFragment: string, closeFragment: string): string {
  const normalized = normalizeForMatch(prose);
  const open = normalizeForMatch(openFragment);
  const close = normalizeForMatch(closeFragment);

  const openIdx = normalized.indexOf(open);
  const closeIdx = normalized.indexOf(close);

  if (openIdx === -1 || closeIdx === -1 || openIdx >= closeIdx) {
    return "";
  }

  const rawOpenFragment = openFragment.trim().replace(/\s+/g, "\\s+");
  const rawCloseFragment = closeFragment.trim().replace(/\s+/g, "\\s+");

  const openMatch = prose.match(new RegExp(rawOpenFragment, "i"));
  const closeMatch = prose.match(new RegExp(rawCloseFragment, "i"));

  if (!openMatch || !closeMatch || openMatch.index === undefined || closeMatch.index === undefined) {
    return "";
  }

  const start = openMatch.index;
  const end = closeMatch.index + closeMatch[0].length;

  return prose.slice(start, end).replace(/\s+/g, " ").trim();
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
// TITLE & FORM SELECTION
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
// SAVE STATE & CLOSING TREND COMMENT
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

async function loadSessionsFallback(): Promise<SavedSession[]> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), ".state", `${USER_ID}.json`), "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.sessions)) return parsed.sessions;
    if (Array.isArray(parsed?.history)) return parsed.history;
    return [];
  } catch {
    return [];
  }
}

function summarizeSessionsFallback(sessions: SavedSession[]) {
  const totals = sessions.map((s) =>
    typeof s.evaluation?.total_score === "number"
      ? s.evaluation.total_score
      : (s.evaluation?.style_alignment ?? 0) +
        (s.evaluation?.motif_reuse ?? 0) +
        (s.evaluation?.precision ?? 0) +
        (s.evaluation?.concision ?? 0) +
        (s.evaluation?.originality ?? 0)
  );
  const count = totals.length;
  const latestScore = totals[count - 1];
  const prevScore = count > 1 ? totals[count - 2] : null;
  const avg = Number((totals.reduce((a, b) => a + b, 0) / count).toFixed(1));

  const metricKeys = [
    ["Style Alignment", "style_alignment"],
    ["Motif Reuse", "motif_reuse"],
    ["Precision", "precision"],
    ["Concision", "concision"],
    ["Originality", "originality"],
  ] as const;

  const metrics = metricKeys
    .map(([label, key]) => {
      const vals = sessions.map((s) => Number(s.evaluation?.[key] ?? 0));
      const mAvg = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
      return { label, avg: mAvg };
    })
    .sort((a, b) => a.avg - b.avg);

  return {
    sessionCount: count,
    latestScore,
    rollingAvg: avg,
    deltaFromPrev: prevScore !== null ? latestScore - prevScore : null,
    weakest: metrics[0],
    strongest: metrics[metrics.length - 1],
    recentFeedback: sessions
      .slice(-3)
      .map((s) => s.evaluation?.feedback)
      .filter((f): f is string => Boolean(f)),
  };
}

async function printClosingTrendComment(ai: GoogleGenAI | null, roundsThisRun: number): Promise<void> {
  const mod = trendsMod as Record<string, any>;
  const loadFn = typeof mod.loadDefaultState === "function" ? mod.loadDefaultState : mod.loadHistory;
  const trendFn = typeof mod.computeTrends === "function" ? mod.computeTrends : mod.analyzeTrends;

  const sessions: SavedSession[] =
    typeof loadFn === "function" ? await loadFn() : await loadSessionsFallback();

  if (!sessions || sessions.length === 0) {
    console.log(`\nClosing note: No sessions found in .state/${USER_ID}.json yet.`);
    return;
  }

  const rawTrends =
    typeof trendFn === "function" ? trendFn(sessions) : summarizeSessionsFallback(sessions);

  if (!rawTrends) {
    console.log(`\nClosing note: No trend data available in .state/${USER_ID}.json yet.`);
    return;
  }

  const count = rawTrends.sessionCount ?? rawTrends.totalSessions ?? sessions.length;
  const latest = rawTrends.latestScore ?? 0;
  const avg = rawTrends.rollingAvg ?? rawTrends.recentAverage ?? rawTrends.overallAverage ?? 0;
  const delta = rawTrends.deltaFromPrev ?? null;
  const strongest = rawTrends.strongest ?? rawTrends.strongestMetric;
  const weakest = rawTrends.weakest ?? rawTrends.weakestMetric;
  const recentFeedback = rawTrends.recentFeedback ?? rawTrends.recentNotes ?? [];

  const deltaText =
    typeof delta === "number"
      ? `${delta >= 0 ? "+" : ""}${delta} vs. previous session (${latest}/50)`
      : `latest ${latest}/50`;

  const fallback =
    `Across ${count} logged session(s) (${roundsThisRun} completed this run), your average is ${avg}/50 with ${deltaText}.` +
    (strongest && weakest
      ? ` Strongest: ${strongest.label ?? strongest.name} (${strongest.avg}/10); focus next on ${weakest.label ?? weakest.name} (${weakest.avg}/10).`
      : "");

  let comment = fallback;

  if (ai) {
    const prompt = `
You are delivering a concise, fact-based closing trend remark as the user exits lit-flow-flash.
Base every statement strictly on the tracking data from .state/${USER_ID}.json:
${JSON.stringify({ count, roundsThisRun, latest, avg, delta, strongest, weakest, recentFeedback }, null, 2)}

Write 2–3 direct sentences remarking on the user's trend across sessions and naming one concrete focus for next time. Do not invent numbers or use fluff.
`;

    try {
      const res = await generateResilientContent(ai, { contents: prompt }, 0);
      if (res.text?.trim()) {
        comment = res.text.trim();
      }
    } catch {
      // Keep deterministic fallback if offline or API fails on exit
    }
  }

  console.log("\n==========================================");
  console.log(` CLOSING TREND COMMENT (.state/${USER_ID}.json)`);
  console.log("==========================================");
  console.log(comment);
  console.log("==========================================");
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
// SINGLE SESSION & EXIT LOOP
// ---------------------------------------------------------------------------

function wantsExit(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "exit" || normalized === "quit" || normalized === ":q";
}

async function runSingleSession(
  ai: GoogleGenAI,
  rl: readline.Interface,
  roundNumber: number
): Promise<boolean> {
  console.log("\n==========================================");
  console.log(`      L I T - F L O W - F L A S H  (R${roundNumber})`);
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
    console.log("Cancelled round.");
    return false;
  }

  // Step 5b: Echo the sliced span between the boundaries
  const passage = sliceSpan(prose, openFragment, closeFragment);
  if (!passage || countWords(passage) < 10) {
    console.error("Could not extract a valid span from your boundaries. Widen your selection and try again.");
    return false;
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
  console.log(` SCORE: ${evaluation.total_score} / 50`);
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

  return true;
}

export async function main() {
  const isWarm = process.argv.includes("--warm");
  const rl = readline.createInterface({ input, output });
  let ai: GoogleGenAI | null = null;
  let roundsCompletedThisRun = 0;

  try {
    if (isWarm) {
      await warmCorpus();
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Error: GEMINI_API_KEY environment variable is missing.");
      process.exitCode = 1;
      return;
    }

    ai = new GoogleGenAI({ apiKey });

    while (true) {
      const completed = await runSingleSession(ai, rl, roundsCompletedThisRun + 1);
      if (completed) {
        roundsCompletedThisRun++;
      }

      const nextAction = (
        await rl.question('\nPress [Enter] for another round, or type "exit" to quit: ')
      ).trim();

      if (wantsExit(nextAction)) {
        break;
      }
    }
  } catch (error: any) {
    console.error("\nExecution failed:", error?.message || error);
  } finally {
    if (!isWarm) {
      await printClosingTrendComment(ai, roundsCompletedThisRun);
    }
    rl.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
