import type { MastraScorer } from '@mastra/core/evals';

export type CapturedEvalItem = {
  input: unknown;
  output: unknown;
  groundTruth?: unknown;
};

export type ScorerRunResult = { score: number; reason?: string; [key: string]: unknown };

/**
 * Score pre-captured input/output pairs without re-invoking the agent.
 * Mastra runEvals always calls agent.generate(); this is for offline datasets.
 */
export async function scoreCapturedBatch(config: {
  scorers: MastraScorer<string, string, unknown, unknown>[];
  data: CapturedEvalItem[];
  onItemComplete?: (params: {
    item: CapturedEvalItem;
    scorerResults: Record<string, ScorerRunResult>;
  }) => void | Promise<void>;
}): Promise<{ scores: Record<string, number>; summary: { totalItems: number } }> {
  const { scorers, data, onItemComplete } = config;
  const totals: Record<string, number[]> = {};

  for (const item of data) {
    const scorerResults: Record<string, ScorerRunResult> = {};
    for (const scorer of scorers) {
      const result = (await scorer.run({
        input: item.input,
        output: item.output,
        groundTruth: item.groundTruth,
        scoreSource: 'experiment',
        targetScope: 'span',
      })) as ScorerRunResult;
      scorerResults[scorer.id] = result;
      if (!totals[scorer.id]) totals[scorer.id] = [];
      totals[scorer.id].push(result.score);
    }
    if (onItemComplete) {
      await onItemComplete({ item, scorerResults });
    }
  }

  const scores: Record<string, number> = {};
  for (const [id, values] of Object.entries(totals)) {
    scores[id] =
      values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  return { scores, summary: { totalItems: data.length } };
}
