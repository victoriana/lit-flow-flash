export interface DrabbleRecord {
  id: string;
  text: string;
  expected_score: number;
}

export interface ScoredRecord extends DrabbleRecord {
  token_count: number;
  within_token_constraint: boolean;
  style_alignment: number;
}

export function tokenCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function styleAlignment(
  text: string,
  reference: { mean_sentence_len: number },
): number {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0) return 0;
  const lens = sentences.map((s) => tokenCount(s));
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const ratio =
    Math.min(mean, reference.mean_sentence_len) /
    Math.max(mean, reference.mean_sentence_len);
  return Number(ratio.toFixed(4));
}

export function score(
  record: DrabbleRecord,
  ref: { mean_sentence_len: number },
): ScoredRecord {
  const tokens = tokenCount(record.text);
  return {
    ...record,
    token_count: tokens,
    within_token_constraint: tokens <= 100,
    style_alignment: styleAlignment(record.text, ref),
  };
}
