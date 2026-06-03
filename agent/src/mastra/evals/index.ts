export {
  contextPrecisionScorer,
  contextRecallScorer,
  faithfulnessScorer,
  answerRelevancyScorer,
} from './ragEvals.js';

export {
  chunkTextFromRagHit,
  extractContextFromToolData,
  extractSqlFromToolData,
  normalizeEvalInput,
  parseToolResultsFromGenerate,
  mapAgentRunToRagEvalOutput,
  mapAgentRunToSqlEvalOutput,
  mergeRagContextFromToolResults,
} from './evalArtifacts.js';

export { judgeModel } from './judgeModel.js';
export { scoreCapturedBatch } from './scoreBatch.js';

export {
  executionAccuracyScorer,
  exactMatchAccuracyScorer,
} from './textToSqlEvals.js';

// Pre-assembled scorer sets for use with runEvals
import {
  contextPrecisionScorer,
  contextRecallScorer,
  faithfulnessScorer,
  answerRelevancyScorer,
} from './ragEvals.js';

import {
  executionAccuracyScorer,
  exactMatchAccuracyScorer,
} from './textToSqlEvals.js';

export const ragScorerSet = [
  contextPrecisionScorer,
  contextRecallScorer,
  faithfulnessScorer,
  answerRelevancyScorer,
];

export const textToSqlScorerSet = [
  executionAccuracyScorer,
  exactMatchAccuracyScorer,
];
