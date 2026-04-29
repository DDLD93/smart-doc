
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { PostgresStore } from '@mastra/pg';
import { ragWorkflow } from './workflows/ragWorkFlow';
import { textToSqlWorkflow } from './workflows/textToSqlTool';
import { qaAgent } from './agents/qaAgent';

const connectionString = process.env.POSTGRES_CONNECTION_STRING ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('Set POSTGRES_CONNECTION_STRING (or DATABASE_URL) to use Postgres storage.');
}

export const mastra = new Mastra({
  workflows: {
    ragWorkflow,
    textToSqlWorkflow,
  },
  agents: { qaAgent },
  storage: new PostgresStore({
    id: "mastra-db",
    connectionString,
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
});
