// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Pergunta ao Wattómetro": a question answered by the AI with the tools
 * (src/ai/tools/), run in the browser on the app's own calculations. The
 * answer comes with the tools used and any quantity the tools did not give.
 */
import { estimateTextTokens } from './estimate';
import { costMicroUsd } from './models';
import { CHAT_PROMPT_VERSION, CHAT_SYSTEM, chatQuestion } from './prompts/chat';
import type { AiEstimate, AiProvider, ChatAnswer, ChatHistory, ToolSpec } from './provider';
import { AI_TOOLS } from './tools';
import { inputSchema, runTool, type ToolContext } from './tools/tool';
import { unconfirmedQuantities } from './verify';

/** Requests in a typical answer: the question, the tool results, the answer. */
const EXPECTED_ROUNDS = 3;
/** Output per request on the high side (thinking, tool calls, the answer). */
const OUTPUT_PER_ROUND = 1_500;

export const CHAT_TOOLS: readonly ToolSpec[] = AI_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: inputSchema(tool),
}));

export interface ChatResult extends ChatAnswer {
  /** Quantities in the answer that no tool returned. */
  unconfirmed: string[];
}

export async function askWattometro(
  provider: AiProvider,
  context: ToolContext,
  history: ChatHistory,
  question: string,
): Promise<ChatResult> {
  const answer = await provider.chat({
    promptVersion: CHAT_PROMPT_VERSION,
    system: CHAT_SYSTEM,
    history,
    question: chatQuestion(context.today, question),
    tools: CHAT_TOOLS,
    runTool: (name, input) => runTool(AI_TOOLS, name, input, context),
  });
  return { ...answer, unconfirmed: unconfirmedQuantities(answer.text, answer.calls) };
}

/**
 * Rough and on the high side: the prompt, the tools and the conversation sent
 * on each of a few requests (as if nothing were cached), plus their output.
 */
export function estimateChat(model: string, history: ChatHistory, question: string): AiEstimate {
  const fixed = estimateTextTokens(CHAT_SYSTEM) + estimateTextTokens(JSON.stringify(CHAT_TOOLS));
  const conversation = estimateTextTokens(JSON.stringify(history)) + estimateTextTokens(question);
  const inputTokens = (fixed + conversation) * EXPECTED_ROUNDS;
  const outputTokens = OUTPUT_PER_ROUND * EXPECTED_ROUNDS;
  return {
    inputTokens,
    outputTokens,
    costMicroUsd: costMicroUsd(model, inputTokens, outputTokens),
  };
}
