export {
  contextPrecisionScorer,
  contextRecallScorer,
  faithfulnessScorer,
  answerRelevancyScorer,
} from './ragEvals.js';

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
