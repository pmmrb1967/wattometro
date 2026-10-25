// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * AI abstraction (CLAUDE.md, "IA"; pattern from the Faturómetro). The app
 * never calls an SDK directly: it goes through an AiProvider, so tests can
 * use a fake one and another provider could be added later. The AI only
 * explains numbers the app has already computed.
 */

export type AiErrorCode =
  | 'no_key'
  | 'invalid_key'
  | 'no_credit'
  | 'rate_limited'
  | 'unavailable'
  | 'offline'
  | 'invalid_output'
  | 'refused'
  | 'too_large';

export class AiError extends Error {
  readonly code: AiErrorCode;
  /** What was spent before it failed (to record it anyway). */
  readonly usage: AiUsage[];
  constructor(code: AiErrorCode, usage: AiUsage[] = []) {
    super(code);
    this.name = 'AiError';
    this.code = code;
    this.usage = usage;
  }
}

export type AiTask = 'chat' | 'explain' | 'test';

export interface AiUsage {
  task: AiTask;
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
}

export interface AiEstimate {
  inputTokens: number;
  /** Upper bound used for the cost: the answer's length is not known in advance. */
  outputTokens: number;
  costMicroUsd: number;
}

export interface TextRequest {
  task: 'explain';
  promptVersion: string;
  system: string;
  user: string;
  maxOutputTokens: number;
}

/** A text answered in a JSON schema and checked with zod; one retry at most. */
export interface StructuredRequest<T> extends TextRequest {
  schema: Record<string, unknown>;
  validator: { safeParse(value: unknown): { success: true; data: T } | { success: false } };
}

/** A tool as the model sees it (src/ai/tools/). */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type ToolCallOutcome = { ok: true; result: unknown } | { ok: false; error: string };

export interface ToolCall {
  name: string;
  input: unknown;
  outcome: ToolCallOutcome;
}

/** The conversation so far, in the provider's own format: passed back as it came. */
export type ChatHistory = readonly unknown[];

export interface ChatRequest {
  promptVersion: string;
  system: string;
  history: ChatHistory;
  question: string;
  tools: readonly ToolSpec[];
  runTool: (name: string, input: unknown) => Promise<ToolCallOutcome>;
}

export interface ChatAnswer {
  text: string;
  /** Every tool the model called, with what it got back. */
  calls: ToolCall[];
  usage: AiUsage[];
  history: ChatHistory;
}

export interface AiProvider {
  readonly model: string;
  /** A tiny request to check the key and the model. */
  testConnection(): Promise<AiUsage>;
  /** A short text from facts already computed (no tools). */
  writeText(request: TextRequest): Promise<{ text: string; usage: AiUsage }>;
  /** The same, as validated JSON. */
  writeStructured<T>(request: StructuredRequest<T>): Promise<{ data: T; usage: AiUsage[] }>;
  /** A question answered with the tools, run in the browser. */
  chat(request: ChatRequest): Promise<ChatAnswer>;
}
