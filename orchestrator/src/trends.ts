// orchestrator/src/trends.ts
export interface SessionRecord {
  timestamp: string;
  bookTitle: string;
  author: string;
  form: 'epigram' | 'vignette' | 'drabble';
  wordCount: number;
  scores: {
    styleEcho: number;      // /10
    motifRecall: number;    // /10
    reinterpretation: number; // /10
    concision: number;      // /10
    precision: number;      // /10
    total: number;          // /50
  };
  coachNote: string;
}

export interface TrendSummary {
  totalSessions: number;
  recentAverage: number;
  overallAverage: number;
  weakestMetric: { name: string; avg: number };
  strongestMetric: { name: string; avg: number };
  underutilizedForms: string[];
  bookDistribution: Record<string, number>;
  recentNotes: string[];
}

export function analyzeTrends(history: SessionRecord[]): TrendSummary | null {
  if (history.length === 0) return null;

  const recent = history.slice(-5);
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const metricKeys = [
    'styleEcho',
    'motifRecall',
    'reinterpretation',
    'concision',
    'precision',
  ] as const;

  const metricAverages = metricKeys.map((key) => ({
    name: key,
    avg: Number(avg(recent.map((s) => s.scores[key])).toFixed(2)),
  }));

  metricAverages.sort((a, b) => a.avg - b.avg);

  const formCounts = { epigram: 0, vignette: 0, drabble: 0 };
  const bookDistribution: Record<string, number> = {};

  for (const s of history) {
    formCounts[s.form]++;
    bookDistribution[s.bookTitle] = (bookDistribution[s.bookTitle] || 0) + 1;
  }

  const underutilizedForms = Object.entries(formCounts)
    .filter(([, count]) => count === 0 || count < history.length / 4)
    .map(([form]) => form);

  return {
    totalSessions: history.length,
    recentAverage: Number(avg(recent.map((s) => s.scores.total)).toFixed(1)),
    overallAverage: Number(avg(history.map((s) => s.scores.total)).toFixed(1)),
    weakestMetric: metricAverages[0],
    strongestMetric: metricAverages[metricAverages.length - 1],
    underutilizedForms,
    bookDistribution,
    recentNotes: recent.slice(-3).map((s) => `[${s.form} | ${s.bookTitle}]: ${s.coachNote}`),
  };
}
