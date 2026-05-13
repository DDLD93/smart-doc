import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { PostgresStore } from '@mastra/pg';
import { qaAgent } from './agents/qaAgent';
import { clinicalQueryWorkflow } from './workflows/clinicalQueryWorkflow';
import { ragSearchWorkflow } from './workflows/ragSearchWorkflow';
import { sqlPipelineWorkflow } from './workflows/sqlPipelineWorkflow';
import {
  contextPrecisionScorer,
  contextRecallScorer,
  faithfulnessScorer,
  answerRelevancyScorer,
  executionAccuracyScorer,
  exactMatchAccuracyScorer,
} from './evals/index';

const connectionString = process.env.POSTGRES_CONNECTION_STRING ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('Set POSTGRES_CONNECTION_STRING (or DATABASE_URL) to use Postgres storage.');
}

export const mastra = new Mastra({
  workflows: { clinicalQueryWorkflow, ragSearchWorkflow, sqlPipelineWorkflow },
  agents: { qaAgent },
  storage: new PostgresStore({
    id: "mastra-db",
    connectionString,
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  scorers: {
    contextPrecision: contextPrecisionScorer,
    contextRecall: contextRecallScorer,
    faithfulness: faithfulnessScorer,
    answerRelevancy: answerRelevancyScorer,
    sqlExecutionAccuracy: executionAccuracyScorer,
    sqlExactMatch: exactMatchAccuracyScorer,
  },
});
