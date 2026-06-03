import { createOpenAI } from '@ai-sdk/openai';
import { loadAgentEnv } from './loadEnv.js';

loadAgentEnv();

const JUDGE_MODEL_ID = process.env.EVAL_JUDGE_MODEL ?? 'google/gemini-2.5-flash';

function requireOpenRouterKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key?.trim()) {
    throw new Error(
      'OPENROUTER_API_KEY is required for eval judges. Set it in agent/.env before running eval scripts.'
    );
  }
  return key;
}

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: requireOpenRouterKey(),
});

/** Shared LLM judge for all RAG and SQL eval scorers (OpenRouter). */
export const judgeModel = openrouter(JUDGE_MODEL_ID);
