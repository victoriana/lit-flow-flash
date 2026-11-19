import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface EvaluationData {
  style_alignment?: number;
  motif_reuse?: number;
  precision?: number;
  concision?: number;
  originality?: number;
  total_score?: number;
  feedback?: string;
}

export interface SessionRecord {
  timestamp?: string;
  userId?: string;
  form?: string;
  authorOrWork?: string;
  bookTitle?: string;
  wordCount?: number;
  evaluation?: EvaluationData;
  scores?: Record<string, number | undefined>;
  feedback?: string;
}

export interface TrendSummary {
  totalSessions: number;
  recentAverage: number;
  overallAverage: number;
  latestScore: number;
  deltaFromPrev: number | null;
  weakestMetric: { name: string; avg: number };
  strongestMetric: { name: string; avg: number };
  recentNotes: string[];
}

const STATE_PATH = path.resolve(process.cwd(), ".state/default.json");

export async function loadDefaultState(): Promise<SessionRecord[]> {
  try {
    const raw = await fs.readFile(STATE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.sessions)) return parsed.sessions;
    if (Array.isArray(parsed?.history)) return parsed.history;
    return [];
  } catch {
    return [];
  }
}

function readCriterion(s: SessionRecord, snakeKey: string, camelKey: string): number {
  const evalObj = (s.evaluation ?? {}) as Record<string, unknown>;
  const scoreObj = (s.scores ?? {}) as Record<string, unknown>;

  const raw = evalObj[snakeKey] ?? scoreObj[camelKey] ?? scoreObj[snakeKey];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

function getSessionTotal(s: SessionRecord): number {
  if (typeof s.evaluation?.total_score === "number" && Number.isFinite(s.evaluation.total_score)) {
    return s.evaluation.total_score;
  }
  return (
    readCriterion(s, "style_alignment", "styleAlignment") +
    readCriterion(s, "motif_reuse", "motifReuse") +
    readCriterion(s, "precision", "precision") +
    readCriterion(s, "concision", "concision") +
    readCriterion(s, "originality", "originality")
  );
}

export function analyzeTrends(history: SessionRecord[]): TrendSummary | null {
  if (!Array.isArray(history) || history.length === 0) return null;

  const recent = history.slice(-5);
  const avg = (nums: number[]) =>
    nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;

  const totals = history.map(getSessionTotal);
  const recentTotals = recent.map(getSessionTotal);

  const latestScore = totals[totals.length - 1];
  const prevScore = totals.length > 1 ? totals[totals.length - 2] : null;

  const metricDefs = [
    { name: "Style Alignment", snake: "style_alignment", camel: "styleAlignment" },
    { name: "Motif Reuse", snake: "motif_reuse", camel: "motifReuse" },
    { name: "Precision", snake: "precision", camel: "precision" },
    { name: "Concision", snake: "concision", camel: "concision" },
    { name: "Originality", snake: "originality", camel: "originality" },
  ];

  const metricAverages = metricDefs.map((m) => ({
    name: m.name,
    avg: Number(avg(recent.map((s) => readCriterion(s, m.snake, m.camel))).toFixed(2)),
  }));

  metricAverages.sort((a, b) => a.avg - b.avg);

  const recentNotes = recent
    .slice(-3)
    .map((s) => {
      const note = s.evaluation?.feedback ?? s.feedback;
      if (!note) return null;
      const formLabel = s.form ?? "piece";
      const scoreLabel = getSessionTotal(s);
      return `[${formLabel} | ${scoreLabel}/50]: ${note}`;
    })
    .filter((n): n is string => Boolean(n));

  return {
    totalSessions: history.length,
    recentAverage: Number(avg(recentTotals).toFixed(1)),
    overallAverage: Number(avg(totals).toFixed(1)),
    latestScore,
    deltaFromPrev: prevScore !== null ? Number((latestScore - prevScore).toFixed(1)) : null,
    weakestMetric: metricAverages[0],
    strongestMetric: metricAverages[metricAverages.length - 1],
    recentNotes,
  };
}
