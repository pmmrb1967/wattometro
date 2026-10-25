// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Anthropic implementation of AiProvider (adapted from the Faturómetro). Runs
 * in the browser with the user's own key: requests go straight to
 * api.anthropic.com, never through the Worker.
 *
 * On Sonnet and Opus a declined request is retried by the API on another
 * model (server-side fallback, `fallbacks: "default"`); Haiku has none.
 */
import Anthropic from '@anthropic-ai/sdk';
import { costMicroUsd, findModel } from './models';
import {
  AiError,
  type AiProvider,
  type AiTask,
  type AiUsage,
  type ChatAnswer,
  type ChatRequest,
  type TextRequest,
  type ToolCall,
} from './provider';

export type Effort = 'low' | 'medium' | 'high';

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  effort?: Effort;
  /** For tests and the evaluation script (Node). */
  fetch?: typeof fetch;
  /** The browser build sets this; Node scripts do not need it. */
  browser?: boolean;
}

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
/** Room for thinking and a few tool calls per round. */
const CHAT_MAX_TOKENS = 16_000;
/** Rounds of tool calls before giving up (a question needs one to three). */
export const CHAT_MAX_ROUNDS = 6;

export function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Anthropic.AuthenticationError) return new AiError('invalid_key');
  if (error instanceof Anthropic.PermissionDeniedError) return new AiError('invalid_key');
  if (error instanceof Anthropic.RateLimitError) return new AiError('rate_limited');
  if (error instanceof Anthropic.APIConnectionError) return new AiError('offline');
  if (error instanceof Anthropic.BadRequestError) {
    // Out of credit is reported as a 400 with this wording.
    if (/credit balance/i.test(error.message)) return new AiError('no_credit');
    if (/too long|too large|exceed/i.test(error.message)) return new AiError('too_large');
    return new AiError('invalid_output');
  }
  return new AiError('unavailable');
}

/** The text blocks of an answer, joined. */
export function answerText(content: readonly Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

export class AnthropicProvider implements AiProvider {
  readonly model: string;
  protected readonly client: Anthropic;
  protected readonly effort: Effort;

  constructor(options: AnthropicOptions) {
    if (!options.apiKey.trim()) throw new AiError('no_key');
    this.model = options.model;
    this.effort = options.effort ?? 'low';
    this.client = new Anthropic({
      apiKey: options.apiKey.trim(),
      dangerouslyAllowBrowser: options.browser ?? false,
      maxRetries: 1,
      timeout: 120_000,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  /** Model, fallback and effort, common to every request. */
  protected base(effort: Effort = this.effort) {
    return {
      model: this.model,
      output_config: { effort },
      ...(findModel(this.model).fallback
        ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const }
        : {}),
    };
  }

  protected usage(
    task: AiTask,
    promptVersion: string,
    response: Anthropic.Beta.BetaMessage,
  ): AiUsage {
    const inputTokens =
      response.usage.input_tokens +
      (response.usage.cache_creation_input_tokens ?? 0) +
      (response.usage.cache_read_input_tokens ?? 0);
    const outputTokens = response.usage.output_tokens;
    return {
      task,
      model: this.model,
      promptVersion,
      inputTokens,
      outputTokens,
      costMicroUsd: costMicroUsd(this.model, inputTokens, outputTokens),
    };
  }

  async testConnection(): Promise<AiUsage> {
    try {
      const response = await this.client.beta.messages.create({
        ...this.base('low'),
        max_tokens: 64,
        messages: [{ role: 'user', content: 'Responde só: ok' }],
      });
      return this.usage('test', 'test', response);
    } catch (error) {
      throw toAiError(error);
    }
  }

  async writeText(request: TextRequest): Promise<{ text: string; usage: AiUsage }> {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        ...this.base(),
        max_tokens: request.maxOutputTokens,
        system: request.system,
        messages: [{ role: 'user', content: request.user }],
      });
    } catch (error) {
      throw toAiError(error);
    }
    if (response.stop_reason === 'refusal') throw new AiError('refused');
    return {
      text: answerText(response.content),
      usage: this.usage(request.task, request.promptVersion, response),
    };
  }

  async chat(request: ChatRequest): Promise<ChatAnswer> {
    // Append-only: earlier turns go back exactly as they came (thinking blocks included).
    const messages = [
      ...(request.history as Anthropic.Beta.BetaMessageParam[]),
      { role: 'user' as const, content: request.question },
    ];
    const tools = request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
    }));
    const usage: AiUsage[] = [];
    const calls: ToolCall[] = [];
    for (let round = 0; round < CHAT_MAX_ROUNDS; round++) {
      let response: Anthropic.Beta.BetaMessage;
      try {
        response = await this.client.beta.messages.create({
          ...this.base('medium'),
          max_tokens: CHAT_MAX_TOKENS,
          // The tools and the prompt are the same on every request: cached.
          cache_control: { type: 'ephemeral' },
          system: request.system,
          tools,
          messages,
        });
      } catch (error) {
        const failure = toAiError(error);
        throw new AiError(failure.code, usage);
      }
      usage.push(this.usage('chat', request.promptVersion, response));
      if (response.stop_reason === 'refusal') throw new AiError('refused', usage);
      messages.push({ role: 'assistant', content: response.content });
      if (response.stop_reason === 'max_tokens') throw new AiError('invalid_output', usage);
      const uses = response.content.filter(
        (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === 'tool_use',
      );
      if (response.stop_reason !== 'tool_use' || uses.length === 0) {
        return { text: answerText(response.content), calls, usage, history: messages };
      }
      const outcomes = await Promise.all(uses.map((use) => request.runTool(use.name, use.input)));
      uses.forEach((use, i) =>
        calls.push({ name: use.name, input: use.input, outcome: outcomes[i]! }),
      );
      // Every result in one message, so the model keeps calling tools in parallel.
      messages.push({
        role: 'user',
        content: uses.map((use, i) => {
          const outcome = outcomes[i]!;
          return {
            type: 'tool_result' as const,
            tool_use_id: use.id,
            content: JSON.stringify(outcome.ok ? outcome.result : { error: outcome.error }),
            ...(outcome.ok ? {} : { is_error: true }),
          };
        }),
      });
    }
    throw new AiError('invalid_output', usage);
  }
}
