import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { PostgresStore } from '@mastra/pg';
import { qaAgent } from './agents/qaAgent';
import { clinicalQueryWorkflow } from './workflows/clinicalQueryWorkflow';

const connectionString = process.env.POSTGRES_CONNECTION_STRING ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('Set POSTGRES_CONNECTION_STRING (or DATABASE_URL) to use Postgres storage.');
}

export const mastra = new Mastra({
  workflows: { clinicalQueryWorkflow },
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
