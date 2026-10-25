// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Models offered in the settings, with list prices in US dollars per million
 * tokens, as published on platform.claude.com/docs/en/about-claude/pricing
 * (checked on PRICES_CHECKED). Copied from the Faturómetro (src/ai/models.ts).
 * Haiku 5.5 is priced for prompts up to 100 000 tokens, far above a question
 * with its tool results.
 */
export const PRICES_CHECKED = '2026-10-13';

export interface AiModel {
  id: string;
  label: string;
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  /** Whether the API can retry a declined request on another model (server-side fallback). */
  fallback: boolean;
}

export const AI_MODELS: readonly AiModel[] = [
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    inputUsdPerMTok: 2,
    outputUsdPerMTok: 10,
    fallback: true,
  },
  {
    id: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    inputUsdPerMTok: 0.1,
    outputUsdPerMTok: 0.5,
    fallback: false,
  },
  {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    inputUsdPerMTok: 4,
    outputUsdPerMTok: 20,
    fallback: true,
  },
];

/** The chat chains tools; Sonnet does that well at a few cents a question (planning/plan.md). */
export const DEFAULT_AI_MODEL = 'claude-sonnet-5-5';

export function findModel(id: string | undefined): AiModel {
  return AI_MODELS.find((model) => model.id === id) ?? AI_MODELS[0]!;
}

/**
 * Cost in millionths of a US dollar, as an integer (tokens × $/MTok is
 * exactly micro-dollars). An estimate: prices may change; we never charge.
 */
export function costMicroUsd(modelId: string, inputTokens: number, outputTokens: number): number {
  const model = findModel(modelId);
  return Math.round(inputTokens * model.inputUsdPerMTok + outputTokens * model.outputUsdPerMTok);
}

/** E.g. "0,0123 US$" (four decimals: a question costs fractions of a cent to a few cents). */
export function formatMicroUsd(micro: number): string {
  if (micro > 0 && micro < 100) return '< 0,0001 US$';
  const usd = (micro / 1_000_000).toLocaleString('pt-PT', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
  return `${usd} US$`;
}
