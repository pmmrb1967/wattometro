// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The free AI ("IA gratuita"): no key. Each request goes to the project's
 * Worker (POST /v1/ai/free, server/src/ai-free.ts), which asks Workers AI and
 * keeps nothing but the day's count of calls and Neurons. As in the
 * Faturómetro (src/ai/free.ts), with the chat added: the tools still run here,
 * in the browser, and only their results (small aggregates) go to the model.
 *
 * Messages are in the OpenAI chat format Workers AI takes. Needs an account:
 * not in the local mode nor the demonstration (their /v1 answers in the browser).
 */
import { FREE_AI_MODEL } from './models';
import {
  AiError,
  CHAT_MAX_ROUNDS,
  type AiProvider,
  type AiTask,
  type AiUsage,
  type ChatAnswer,
  type ChatRequest,
  type StructuredRequest,
  type TextRequest,
  type ToolCall,
} from './provider';

/** One request to the free AI (the body of POST /v1/ai/free). */
export interface FreeRequest {
  task: AiTask;
  messages: FreeMessage[];
  tools?: {
    type: 'function';
    function: { name: string; description: string; parameters: unknown };
  }[];
  schema?: { name: string; schema: Record<string, unknown> };
  maxTokens: number;
}

export type FreeMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | unknown[] }
  | { role: 'assistant'; content: string | null; tool_calls?: FreeToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface FreeToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface FreeAnswer {
  content: string | null;
  toolCalls: { id: string; name: string; arguments: string }[];
  finishReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

/** What the server says (src/api/ai-free.ts). */
export type FreeTransport = (request: FreeRequest) => Promise<FreeAnswer>;

/** Room for the answer when thinking is off (the server caps it too). */
const CHAT_MAX_TOKENS = 4_000;

function parseArguments(text: string): unknown {
  try {
    return JSON.parse(text || '{}');
  } catch {
    return {};
  }
}

/** The JSON in an answer, even inside a ```json fence. */
function parseJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return JSON.parse((fenced ? fenced[1]! : text).trim());
}

export class FreeProvider implements AiProvider {
  readonly model = FREE_AI_MODEL;
  private readonly transport: FreeTransport;

  constructor(transport: FreeTransport) {
    this.transport = transport;
  }

  private usage(task: AiTask, promptVersion: string, answer: FreeAnswer): AiUsage {
    return {
      task,
      model: this.model,
      promptVersion,
      inputTokens: answer.inputTokens,
      outputTokens: answer.outputTokens,
      costMicroUsd: 0,
    };
  }

  private async send(request: FreeRequest, usage: AiUsage[] = []): Promise<FreeAnswer> {
    try {
      return await this.transport(request);
    } catch (error) {
      throw new AiError(error instanceof AiError ? error.code : 'unavailable', usage);
    }
  }

  /** A tiny request: says whether the free AI answers today. */
  async testConnection(): Promise<AiUsage> {
    const answer = await this.send({
      task: 'test',
      messages: [{ role: 'user', content: 'Responde só: ok' }],
      maxTokens: 16,
    });
    return this.usage('test', 'test', answer);
  }

  async writeText(request: TextRequest): Promise<{ text: string; usage: AiUsage }> {
    const answer = await this.send({
      task: request.task,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      maxTokens: request.maxOutputTokens,
    });
    const usage = this.usage(request.task, request.promptVersion, answer);
    const text = (answer.content ?? '').trim();
    if (!text) throw new AiError('invalid_output', [usage]);
    return { text, usage };
  }

  async writeStructured<T>(request: StructuredRequest<T>): Promise<{ data: T; usage: AiUsage[] }> {
    const images = request.images ?? [];
    const body: FreeRequest = {
      task: request.task,
      messages: [
        { role: 'system', content: request.system },
        {
          role: 'user',
          content:
            images.length === 0
              ? request.user
              : [
                  ...images.map((image) => ({
                    type: 'image_url',
                    image_url: { url: `data:${image.mime};base64,${image.base64}` },
                  })),
                  { type: 'text', text: request.user },
                ],
        },
      ],
      schema: { name: request.task, schema: request.schema },
      maxTokens: request.maxOutputTokens,
    };
    const usage: AiUsage[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const answer = await this.send(body, usage);
      usage.push(this.usage(request.task, request.promptVersion, answer));
      // Cut for length: the same request would be cut again.
      if (answer.finishReason === 'length') break;
      try {
        const parsed = request.validator.safeParse(parseJson(answer.content ?? ''));
        if (parsed.success) return { data: parsed.data, usage };
      } catch {
        // Not JSON: one more attempt.
      }
    }
    throw new AiError('invalid_output', usage);
  }

  async chat(request: ChatRequest): Promise<ChatAnswer> {
    // The system prompt is sent each time; the history keeps only the conversation.
    const messages: FreeMessage[] = [
      ...(request.history as FreeMessage[]),
      { role: 'user', content: request.question },
    ];
    const tools = request.tools.map((tool) => ({
      type: 'function' as const,
      function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
    }));
    const usage: AiUsage[] = [];
    const calls: ToolCall[] = [];
    for (let round = 0; round < CHAT_MAX_ROUNDS; round++) {
      const answer = await this.send(
        {
          task: 'chat',
          messages: [{ role: 'system', content: request.system }, ...messages],
          tools,
          maxTokens: CHAT_MAX_TOKENS,
        },
        usage,
      );
      usage.push(this.usage('chat', request.promptVersion, answer));
      if (answer.finishReason === 'length') throw new AiError('invalid_output', usage);
      const uses = answer.toolCalls.map((call, i) => ({
        id: call.id || `call_${round}_${i}`,
        name: call.name,
        arguments: call.arguments,
      }));
      messages.push({
        role: 'assistant',
        content: answer.content,
        ...(uses.length > 0
          ? {
              tool_calls: uses.map((use) => ({
                id: use.id,
                type: 'function' as const,
                function: { name: use.name, arguments: use.arguments },
              })),
            }
          : {}),
      });
      if (uses.length === 0) {
        const text = (answer.content ?? '').trim();
        if (!text) throw new AiError('invalid_output', usage);
        return { text, calls, usage, history: messages };
      }
      const outcomes = await Promise.all(
        uses.map((use) => request.runTool(use.name, parseArguments(use.arguments))),
      );
      uses.forEach((use, i) => {
        const outcome = outcomes[i]!;
        calls.push({ name: use.name, input: parseArguments(use.arguments), outcome });
        messages.push({
          role: 'tool',
          tool_call_id: use.id,
          content: JSON.stringify(outcome.ok ? outcome.result : { error: outcome.error }),
        });
      });
    }
    throw new AiError('invalid_output', usage);
  }
}
