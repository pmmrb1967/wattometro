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
  constructor(code: AiErrorCode) {
    super(code);
    this.name = 'AiError';
    this.code = code;
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

export interface AiProvider {
  readonly model: string;
  /** A tiny request to check the key and the model. */
  testConnection(): Promise<AiUsage>;
  /** A short text from facts already computed (no tools). */
  writeText(request: TextRequest): Promise<{ text: string; usage: AiUsage }>;
}
