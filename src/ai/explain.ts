// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Explicar": facts the app computed, told in plain words by the AI
 * (src/ai/prompts/explain.ts). Like the chat's answers, any quantity in the
 * explanation that is not among the facts is flagged.
 */
import { estimateText } from './estimate';
import {
  EXPLAIN_MAX_TOKENS,
  EXPLAIN_PROMPT_VERSION,
  EXPLAIN_SCHEMA,
  EXPLAIN_SYSTEM,
  explainUser,
  explanationSchema,
  type ExplainSubject,
  type Explanation,
} from './prompts/explain';
import type { AiEstimate, AiProvider, AiUsage } from './provider';
import { unconfirmedQuantities } from './verify';

export interface ExplainResult {
  explanation: Explanation;
  usage: AiUsage[];
  unconfirmed: string[];
}

export async function explainFacts(
  provider: AiProvider,
  subject: ExplainSubject,
  facts: unknown,
): Promise<ExplainResult> {
  const { data, usage } = await provider.writeStructured({
    task: 'explain',
    promptVersion: EXPLAIN_PROMPT_VERSION,
    system: EXPLAIN_SYSTEM,
    user: explainUser(subject, facts),
    maxOutputTokens: EXPLAIN_MAX_TOKENS,
    schema: EXPLAIN_SCHEMA,
    validator: explanationSchema,
  });
  const text = [data.headline, ...data.points, ...data.actions].join('\n');
  const unconfirmed = unconfirmedQuantities(text, [
    { name: subject, input: {}, outcome: { ok: true, result: facts } },
  ]);
  return { explanation: data, usage, unconfirmed };
}

/** On the high side: the whole answer budget counted as output. */
export function estimateExplain(
  model: string,
  subject: ExplainSubject,
  facts: unknown,
): AiEstimate {
  return estimateText(model, EXPLAIN_SYSTEM, explainUser(subject, facts), EXPLAIN_MAX_TOKENS);
}
