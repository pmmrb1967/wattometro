// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Google Gemini implementation of AiProvider, with the user's own key
 * (adapted from the Faturómetro, src/ai/gemini.ts, with the chat's function
 * calling added). Runs in the browser: requests go straight to
 * generativelanguage.googleapis.com, never through the Worker. Plain REST (no
 * SDK); the key travels in a header, never in the URL.
 *
 * In the EEA the Gemini API terms (in force since 2026-03-23,
 * aistudio.google.com/docs/terms) allow only Paid Services in apps offered to
 * users, so the key must belong to a Google Cloud project with billing turned
 * on; the settings screen says so (as in the Faturómetro).
 */
import { costMicroUsd } from './models';
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

export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
/** Room for thinking and a few tool calls per round (only what is used is billed). */
const CHAT_MAX_TOKENS = 16_000;
/** Gemini counts thinking in the output limit: room for it on top of the answer. */
const THINKING_ROOM = 6_000;

export interface GeminiOptions {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
  functionCall?: { id?: string; name: string; args?: unknown };
  [key: string]: unknown;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: { content?: GeminiContent; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
}

async function failure(response: Response): Promise<AiError> {
  let reason = '';
  try {
    const body = (await response.json()) as { error?: { status?: string; message?: string } };
    reason = `${body.error?.status ?? ''} ${body.error?.message ?? ''}`;
  } catch {
    // No body: the status says enough.
  }
  if (response.status === 400 && /API_KEY_INVALID|API key not valid/i.test(reason)) {
    return new AiError('invalid_key');
  }
  if (response.status === 401 || response.status === 403) return new AiError('invalid_key');
  if (response.status === 400 && /billing|FAILED_PRECONDITION/i.test(reason)) {
    return new AiError('no_credit');
  }
  if (response.status === 413 || /too large|exceeds/i.test(reason)) {
    return new AiError('too_large');
  }
  if (response.status === 429) return new AiError('rate_limited');
  if (response.status === 400) return new AiError('invalid_output');
  return new AiError('unavailable');
}

/** The answer's text, without the thought summaries. */
function textOf(answer: GeminiResponse): string {
  return (answer.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? '')
    .join('')
    .trim();
}

export class GeminiProvider implements AiProvider {
  readonly model: string;
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(options: GeminiOptions) {
    if (!options.apiKey.trim()) throw new AiError('no_key');
    if (!/^[a-z0-9.-]+$/.test(options.model)) throw new AiError('unavailable');
    this.model = options.model;
    this.apiKey = options.apiKey.trim();
    // Bound: a bare `fetch` reference loses `window` in some browsers.
    this.fetcher = options.fetch ?? ((input, init) => fetch(input, init));
  }

  private async call(body: unknown, usage: AiUsage[] = []): Promise<GeminiResponse> {
    let response: Response;
    try {
      response = await this.fetcher(`${GEMINI_ENDPOINT}/${this.model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(body),
      });
    } catch {
      throw new AiError('offline', usage);
    }
    if (!response.ok) throw new AiError((await failure(response)).code, usage);
    const answer = (await response.json()) as GeminiResponse;
    if (answer.promptFeedback?.blockReason) throw new AiError('refused', usage);
    return answer;
  }

  private usage(task: AiTask, promptVersion: string, answer: GeminiResponse): AiUsage {
    const meta = answer.usageMetadata;
    const inputTokens = meta?.promptTokenCount ?? 0;
    // Thinking is billed as output.
    const outputTokens = (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0);
    return {
      task,
      model: this.model,
      promptVersion,
      inputTokens,
      outputTokens,
      costMicroUsd: costMicroUsd(this.model, inputTokens, outputTokens),
    };
  }

  /** Checks the key and the model without generating anything (costs nothing). */
  async testConnection(): Promise<AiUsage> {
    let response: Response;
    try {
      response = await this.fetcher(`${GEMINI_ENDPOINT}/${this.model}`, {
        headers: { 'x-goog-api-key': this.apiKey },
      });
    } catch {
      throw new AiError('offline');
    }
    if (!response.ok) throw await failure(response);
    return {
      task: 'test',
      model: this.model,
      promptVersion: 'test',
      inputTokens: 0,
      outputTokens: 0,
      costMicroUsd: 0,
    };
  }

  async writeText(request: TextRequest): Promise<{ text: string; usage: AiUsage }> {
    const answer = await this.call({
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: 'user', parts: [{ text: request.user }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: request.maxOutputTokens + THINKING_ROOM,
      },
    });
    const usage = this.usage(request.task, request.promptVersion, answer);
    if (answer.candidates?.[0]?.finishReason === 'SAFETY') throw new AiError('refused', [usage]);
    const text = textOf(answer);
    if (!text) throw new AiError('invalid_output', [usage]);
    return { text, usage };
  }

  async writeStructured<T>(request: StructuredRequest<T>): Promise<{ data: T; usage: AiUsage[] }> {
    const body = {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [
        {
          role: 'user',
          parts: [
            ...(request.images ?? []).map((image) => ({
              inline_data: { mime_type: image.mime, data: image.base64 },
            })),
            { text: request.user },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: request.maxOutputTokens + THINKING_ROOM,
        responseMimeType: 'application/json',
        responseJsonSchema: request.schema,
      },
    };
    const usage: AiUsage[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const answer = await this.call(body, usage);
      usage.push(this.usage(request.task, request.promptVersion, answer));
      const finish = answer.candidates?.[0]?.finishReason;
      if (finish === 'SAFETY') throw new AiError('refused', usage);
      // Cut for length: the same request would be cut again, and paid twice.
      if (finish === 'MAX_TOKENS') break;
      try {
        const parsed = request.validator.safeParse(JSON.parse(textOf(answer)));
        if (parsed.success) return { data: parsed.data, usage };
      } catch {
        // Not JSON: one more attempt.
      }
    }
    throw new AiError('invalid_output', usage);
  }

  async chat(request: ChatRequest): Promise<ChatAnswer> {
    // Append-only: earlier turns go back exactly as they came (thought signatures included).
    const contents: GeminiContent[] = [
      ...(request.history as GeminiContent[]),
      { role: 'user', parts: [{ text: request.question }] },
    ];
    const tools = [
      {
        functionDeclarations: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parametersJsonSchema: tool.inputSchema,
        })),
      },
    ];
    const usage: AiUsage[] = [];
    const calls: ToolCall[] = [];
    for (let round = 0; round < CHAT_MAX_ROUNDS; round++) {
      const answer = await this.call(
        {
          systemInstruction: { parts: [{ text: request.system }] },
          contents,
          tools,
          generationConfig: { maxOutputTokens: CHAT_MAX_TOKENS },
        },
        usage,
      );
      usage.push(this.usage('chat', request.promptVersion, answer));
      const candidate = answer.candidates?.[0];
      if (candidate?.finishReason === 'SAFETY') throw new AiError('refused', usage);
      if (candidate?.finishReason === 'MAX_TOKENS') throw new AiError('invalid_output', usage);
      const content: GeminiContent = { role: 'model', parts: candidate?.content?.parts ?? [] };
      contents.push(content);
      const uses = content.parts.flatMap((part) => (part.functionCall ? [part.functionCall] : []));
      if (uses.length === 0) {
        const text = textOf(answer);
        if (!text) throw new AiError('invalid_output', usage);
        return { text, calls, usage, history: contents };
      }
      const outcomes = await Promise.all(
        uses.map((use) => request.runTool(use.name, use.args ?? {})),
      );
      uses.forEach((use, i) =>
        calls.push({ name: use.name, input: use.args ?? {}, outcome: outcomes[i]! }),
      );
      // Every result in one turn, in the order of the calls.
      contents.push({
        role: 'user',
        parts: uses.map((use, i) => {
          const outcome = outcomes[i]!;
          return {
            functionResponse: {
              ...(use.id ? { id: use.id } : {}),
              name: use.name,
              response: outcome.ok ? { result: outcome.result } : { error: outcome.error },
            },
          };
        }),
      });
    }
    throw new AiError('invalid_output', usage);
  }
}
