import { createScorer } from '@mastra/core/evals';
import { createAnswerRelevancyScorer } from '@mastra/evals/scorers/prebuilt';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

const judgeModel = google('gemini-2.5-flash');

// ─── Input / output shapes for RAG scorers ───────────────────────────────────
// input  : { query, groundTruth? }
// output : { text, context: string[] }
// groundTruth (for context-recall) is passed as run.groundTruth or run.input.groundTruth

// ─── 1. Context Precision ─────────────────────────────────────────────────────
// Retrieval metric. Measures how precisely the retrieved chunks are relevant to
// the query. Uses Mean Average Precision (MAP): rewards placing relevant chunks
// earlier in the retrieved list.
export const contextPrecisionScorer = createScorer<
  { query: string },
  { text: string; context: string[] }
>({
  id: 'context-precision',
  description:
    'Retrieval metric — MAP score over retrieved context chunks. 1 = all relevant, 0 = none relevant.',
  judge: {
    model: judgeModel,
    instructions: `You are a retrieval-quality evaluator for a RAG system.
Given a query and a numbered list of retrieved context chunks, decide for each chunk whether it is relevant and useful for answering the query.
Respond with JSON only — no markdown, no extra text:
{"verdicts":[{"index":<0-based int>,"relevant":<true|false>,"reason":"<one sentence>"}]}`,
  },
})
  .analyze({
    description: 'Rate each retrieved context chunk for relevance to the query',
    outputSchema: z.object({
      verdicts: z.array(
        z.object({
          index: z.number().int(),
          relevant: z.boolean(),
          reason: z.string(),
        })
      ),
    }),
    createPrompt: ({ run }) => {
      const chunks = (run.output as { context: string[] }).context;
      const chunksText = chunks.map((c, i) => `[${i}] ${c}`).join('\n\n');
      return `Query: ${(run.input as { query: string }).query}\n\nRetrieved Context Chunks:\n${chunksText}\n\nFor each chunk, judge whether it is relevant and useful to answer the query.`;
    },
  })
  .generateScore(({ results }) => {
    const verdicts = results.analyzeStepResult.verdicts;
    if (!verdicts || verdicts.length === 0) return 0;
    let sumPrecision = 0;
    let relevantCount = 0;
    // MAP: iterate in index order (sorted by index)
    const sorted = [...verdicts].sort((a, b) => a.index - b.index);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].relevant) {
        relevantCount++;
        sumPrecision += relevantCount / (i + 1);
      }
    }
    if (relevantCount === 0) return 0;
    return Math.round((sumPrecision / relevantCount) * 100) / 100;
  })
  .generateReason(({ score, results }) => {
    const verdicts = results.analyzeStepResult.verdicts ?? [];
    const relevant = verdicts.filter((v) => v.relevant).length;
    return `${relevant}/${verdicts.length} context chunks are relevant — MAP precision score: ${score}`;
  });

// ─── 2. Context Recall ────────────────────────────────────────────────────────
// Retrieval metric. Measures what fraction of ground-truth claims can be
// attributed to the retrieved context. Requires a ground-truth answer in
// run.groundTruth.
export const contextRecallScorer = createScorer<
  { query: string },
  { text: string; context: string[] }
>({
  id: 'context-recall',
  description:
    'Retrieval metric — proportion of ground-truth claims attributable to retrieved context. 1 = full recall, 0 = none.',
  judge: {
    model: judgeModel,
    instructions: `You are a retrieval-coverage evaluator for a RAG system.
You will receive a ground-truth answer and a set of retrieved context chunks.
Break the ground-truth answer into its individual claims/sentences.
For each claim, determine if it can be directly attributed to at least one of the retrieved context chunks.
Respond with JSON only — no markdown, no extra text:
{"claims":[{"claim":"<claim text>","found":<true|false>,"reason":"<one sentence>"}]}`,
  },
})
  .analyze({
    description: 'Check which ground-truth claims appear in the retrieved context',
    outputSchema: z.object({
      claims: z.array(
        z.object({
          claim: z.string(),
          found: z.boolean(),
          reason: z.string(),
        })
      ),
    }),
    createPrompt: ({ run }) => {
      const groundTruth = (run as unknown as { groundTruth?: string }).groundTruth
        ?? (run.input as { groundTruth?: string }).groundTruth
        ?? '';
      const chunks = (run.output as { context: string[] }).context;
      return `Ground-Truth Answer:\n${groundTruth}\n\nRetrieved Context Chunks:\n${chunks.join('\n---\n')}\n\nFor each claim in the ground-truth answer, determine if it is supported by the retrieved context.`;
    },
  })
  .generateScore(({ results }) => {
    const claims = results.analyzeStepResult.claims ?? [];
    if (claims.length === 0) return 0;
    const found = claims.filter((c) => c.found).length;
    return Math.round((found / claims.length) * 100) / 100;
  })
  .generateReason(({ score, results }) => {
    const claims = results.analyzeStepResult.claims ?? [];
    const found = claims.filter((c) => c.found).length;
    return `${found}/${claims.length} ground-truth claims found in retrieved context — recall score: ${score}`;
  });

// ─── 3. Faithfulness ──────────────────────────────────────────────────────────
// Generation metric. Measures what fraction of the generated answer's claims
// are grounded in the retrieved context (not hallucinated).
export const faithfulnessScorer = createScorer<
  { query: string },
  { text: string; context: string[] }
>({
  id: 'faithfulness',
  description:
    'Generation metric — fraction of answer claims supported by retrieved context. 1 = fully grounded, 0 = all hallucinated.',
  judge: {
    model: judgeModel,
    instructions: `You are a factual-grounding evaluator for a RAG system.
You will receive a generated answer and a set of retrieved context chunks.
Step 1 — Extract each distinct factual claim from the generated answer.
Step 2 — For each claim, decide if it is supported by the retrieved context, contradicted by it, or not mentioned.
Verdict values: "yes" (supported), "no" (contradicted), "unsure" (not mentioned / unverifiable).
Respond with JSON only — no markdown, no extra text:
{"claims":[{"claim":"<claim text>","verdict":"yes|no|unsure","reason":"<one sentence>"}]}`,
  },
})
  .analyze({
    description: 'Extract answer claims and verify each against retrieved context',
    outputSchema: z.object({
      claims: z.array(
        z.object({
          claim: z.string(),
          verdict: z.enum(['yes', 'no', 'unsure']),
          reason: z.string(),
        })
      ),
    }),
    createPrompt: ({ run }) => {
      const answer = (run.output as { text: string }).text;
      const chunks = (run.output as { context: string[] }).context;
      return `Generated Answer:\n${answer}\n\nRetrieved Context Chunks:\n${chunks.join('\n---\n')}\n\nExtract all factual claims from the answer and verify each against the context.`;
    },
  })
  .generateScore(({ results }) => {
    const claims = results.analyzeStepResult.claims ?? [];
    if (claims.length === 0) return 0;
    const supported = claims.filter((c) => c.verdict === 'yes').length;
    return Math.round((supported / claims.length) * 100) / 100;
  })
  .generateReason(({ score, results }) => {
    const claims = results.analyzeStepResult.claims ?? [];
    const supported = claims.filter((c) => c.verdict === 'yes').length;
    const contradicted = claims.filter((c) => c.verdict === 'no').length;
    const unsure = claims.filter((c) => c.verdict === 'unsure').length;
    return `${supported} supported, ${contradicted} contradicted, ${unsure} unverifiable out of ${claims.length} claims — faithfulness score: ${score}`;
  });

// ─── 4. Answer Relevancy ──────────────────────────────────────────────────────
// Generation metric. Measures whether the generated answer actually addresses
// the query. Does NOT check factual correctness — use faithfulness for that.
// Uses the prebuilt Mastra scorer; works with string input/output shapes.
export const answerRelevancyScorer = createAnswerRelevancyScorer({
  model: judgeModel,
  options: { uncertaintyWeight: 0.3, scale: 1 },
});
