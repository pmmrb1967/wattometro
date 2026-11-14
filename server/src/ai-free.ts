// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The free AI (docs/ai.md): Workers AI with no key, for signed-in users, as in
 * the Faturómetro (server/src/ai-free.ts) and the Validómetro. The browser
 * sends the messages already built (src/ai/free.ts) and runs the chat's tools
 * itself; the Worker only forwards one request at a time (waiting on Workers
 * AI costs no CPU) and counts it.
 *
 * Nothing of the request or the answer is stored or logged: only, per UTC day,
 * the number of calls and the estimated Neurons (repo/usage.ts), which the
 * administrator's panel shows against the free daily allocation.
 *
 * Unlike the Faturómetro's (open to anyone with the app), it needs an account,
 * and accounts are created by script: so it takes the app's messages as they
 * come, checked only for shape and size.
 */
import { z } from 'zod';
import { FREE_AI_MODEL } from '../../src/ai/models';

/** The Workers AI free allocation, per account and per UTC day (no card needed). */
export const FREE_NEURONS_PER_DAY = 10_000;
/** Left aside for the end of the day: a question started should not fail halfway. */
export const NEURON_RESERVE = 1_000;
/** The free AI stops at this (the daily allocation minus the reserve). */
export const FREE_NEURONS_CAP = FREE_NEURONS_PER_DAY - NEURON_RESERVE;
/** Whole request body, in bytes: a few photos made small (src/lib/image.ts) and the text. */
export const MAX_BODY_BYTES = 4_000_000;
const MAX_OUTPUT_TOKENS = 4_000;

/**
 * Neurons from tokens, when Workers AI does not say them itself, with the model's catalogue prices (USD per million
 * tokens, developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it,
 * checked 2026-11-14) and the Neuron's price (USD 0.011 per 1000), as in the
 * Validómetro (src/ai/providers/workers-ai.ts). An estimate: Cloudflare's own
 * count is in its dashboard.
 */
const PRICE_IN = 0.1;
const PRICE_OUT = 0.3;
const USD_PER_NEURON = 0.011 / 1000;

export function neuronsFor(inputTokens: number, outputTokens: number): number {
  const usd = (inputTokens * PRICE_IN + outputTokens * PRICE_OUT) / 1_000_000;
  return Math.ceil(usd / USD_PER_NEURON);
}

/** The subset of the Workers AI binding used here. */
export interface WorkersAi {
  run(model: string, input: unknown): Promise<unknown>;
}

const text = z.string().max(200_000);
const Message = z.union([
  z.object({ role: z.literal('system'), content: text }),
  z.object({
    role: z.literal('user'),
    content: z.union([
      text,
      z
        .array(
          z.union([
            z.object({ type: z.literal('text'), text }),
            z.object({
              type: z.literal('image_url'),
              image_url: z.object({
                url: z
                  .string()
                  .max(3_000_000)
                  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
              }),
            }),
          ]),
        )
        .max(6),
    ]),
  }),
  z.object({
    role: z.literal('assistant'),
    content: text.nullable(),
    tool_calls: z
      .array(
        z.object({
          id: z.string().max(100),
          type: z.literal('function'),
          function: z.object({ name: z.string().max(100), arguments: text }),
        }),
      )
      .max(20)
      .optional(),
  }),
  z.object({ role: z.literal('tool'), tool_call_id: z.string().max(100), content: text }),
]);

export const FreeRequest = z.object({
  task: z.enum(['chat', 'explain', 'read_equipment', 'test']),
  messages: z.array(Message).min(1).max(80),
  tools: z
    .array(
      z.object({
        type: z.literal('function'),
        function: z.object({
          name: z.string().regex(/^[a-z_]{1,64}$/),
          description: z.string().max(4_000),
          parameters: z.record(z.string(), z.unknown()),
        }),
      }),
    )
    .max(20)
    .optional(),
  schema: z
    .object({ name: z.string().max(64), schema: z.record(z.string(), z.unknown()) })
    .optional(),
  maxTokens: z.number().int().min(1).max(MAX_OUTPUT_TOKENS),
});
export type FreeRequest = z.infer<typeof FreeRequest>;

export interface FreeAnswer {
  content: string | null;
  toolCalls: { id: string; name: string; arguments: string }[];
  finishReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

/** The answer, and the Neurons it spent: Workers AI's own count, or estimated from the tokens. */
export interface FreeResult {
  answer: FreeAnswer;
  neurons: number;
}

export class FreeAiError extends Error {
  readonly status: 413 | 429 | 502 | 503;
  constructor(status: 413 | 429 | 502 | 503, code: string) {
    super(code);
    this.status = status;
  }
}

/** Workers AI's answer: the OpenAI shape, or the older one (`response`, `tool_calls` at the top). */
interface WorkersAiOutput {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: { id?: string; function?: { name?: string; arguments?: unknown } }[];
    };
    finish_reason?: string | null;
  }[];
  response?: unknown;
  tool_calls?: { name?: string; arguments?: unknown }[];
  /** Workers AI also says the Neurons the call spent (seen on 2026-11-14). */
  usage?: { prompt_tokens?: number; completion_tokens?: number; neurons?: number };
}

const asArguments = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value ?? {});

/** The answer as the browser takes it (src/api/ai-free.ts). */
export function toAnswer(output: WorkersAiOutput): FreeAnswer {
  const choice = output.choices?.[0];
  const calls =
    choice?.message?.tool_calls?.map((call, i) => ({
      id: call.id ?? `call_${i}`,
      name: call.function?.name ?? '',
      arguments: asArguments(call.function?.arguments),
    })) ??
    output.tool_calls?.map((call, i) => ({
      id: `call_${i}`,
      name: call.name ?? '',
      arguments: asArguments(call.arguments),
    })) ??
    [];
  const content = choice ? (choice.message?.content ?? null) : output.response;
  return {
    content:
      content === null || content === undefined
        ? null
        : typeof content === 'string'
          ? content
          : JSON.stringify(content),
    toolCalls: calls.filter((call) => call.name !== ''),
    finishReason: choice?.finish_reason ?? null,
    inputTokens: output.usage?.prompt_tokens ?? 0,
    outputTokens: output.usage?.completion_tokens ?? 0,
  };
}

/** One request to Workers AI; only the kind of a failure comes back, never the request. */
export async function runFreeAi(ai: WorkersAi, request: FreeRequest): Promise<FreeResult> {
  let output: WorkersAiOutput;
  try {
    output = (await ai.run(FREE_AI_MODEL, {
      messages: request.messages,
      ...(request.tools ? { tools: request.tools } : {}),
      ...(request.schema
        ? {
            response_format: {
              type: 'json_schema',
              json_schema: { name: request.schema.name, schema: request.schema.schema },
            },
          }
        : {}),
      max_completion_tokens: request.maxTokens,
      temperature: request.schema ? 0 : 0.3,
      // Thinking would spend Neurons; the app's prompts and tools do the reasoning.
      chat_template_kwargs: { enable_thinking: false },
    })) as WorkersAiOutput;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/4006|daily free allocation|neurons/i.test(message)) {
      throw new FreeAiError(503, 'free_quota');
    }
    if (/too large|payload|413|context/i.test(message)) throw new FreeAiError(413, 'too_large');
    if (/429|rate/i.test(message)) throw new FreeAiError(429, 'rate_limited');
    throw new FreeAiError(502, 'ai_failed');
  }
  const answer = toAnswer(output);
  const reported = output.usage?.neurons;
  return {
    answer,
    neurons:
      typeof reported === 'number' && Number.isFinite(reported) && reported >= 0
        ? reported
        : neuronsFor(answer.inputTokens, answer.outputTokens),
  };
}
