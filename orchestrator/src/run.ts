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

    const authorOrWork =
      (await rl.question("\nEnter public domain work/author [Ann Radcliffe]: ")).trim() ||
      "The Mysteries of Udolpho by Ann Radcliffe";

    console.log(`\nGenerating passage in the style of "${authorOrWork}"...`);

    const passagePrompt = `Generate a 250-300 word literary excerpt in the distinct style and voice of ${authorOrWork}. Return ONLY the excerpt text with no introduction or metadata.`;
    
    const passageResponse = await generateResilientContent(ai, {
      contents: passagePrompt,
    });

    const passage = passageResponse.text?.trim() || "";

    console.log("\n--- READ & INTERNALIZE (CLOSED-BOOK) ---");
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

SOURCE PASSAGE:
"""
${passage}
"""

STUDENT SUBMISSION (${formConfig.name}, target: ${formConfig.description}):
"""
${submission}
"""

Evaluate the submission across these 5 criteria on a 0-10 scale:
1. style_alignment: Voice and cadence echo of the source author
2. motif_reuse: Subtle reinterpretation of symbols or motifs
3. precision: Exactness of word choice and phrasing
4. concision: Zero wasted filler word count
5. originality: Fresh transformation (penalize verbatim copying)

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
