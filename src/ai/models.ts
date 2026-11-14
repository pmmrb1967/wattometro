// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Models offered in the settings, with list prices in US dollars per million
 * tokens (checked on PRICES_CHECKED). Copied from the Faturómetro (src/ai/models.ts):
 * - Anthropic: platform.claude.com/docs/en/about-claude/pricing. Haiku 5.5 is
 *   priced for prompts up to 100 000 tokens, far above a question with its
 *   tool results.
 * - Google: ai.google.dev/gemini-api/docs/pricing (standard paid tier).
 *   Gemini 3.8 Flash has an introductory price until 2026-12-31 (0.75 / 3.75);
 *   the price from 2027-01-01 is used, so the estimate stays on the high side.
 * - The free AI (Workers AI) costs the user nothing: it spends the project's
 *   daily Neurons, counted on the server (server/src/ai-free.ts).
 */
export const PRICES_CHECKED = '2026-11-14';

/** Who answers: the user's own key (anthropic, gemini) or the project's free AI. */
export type AiVendor = 'anthropic' | 'gemini' | 'free';

export interface AiModel {
  id: string;
  vendor: AiVendor;
  label: string;
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  /** Whether the API can retry a declined request on another model (Anthropic's server-side fallback). */
  fallback: boolean;
}

/** Workers AI model of the free AI (as in the Faturómetro, Prazómetro and Validómetro). */
export const FREE_AI_MODEL = '@cf/google/gemma-4-26b-a4b-it';

export const AI_MODELS: readonly AiModel[] = [
  {
    id: 'claude-sonnet-5-5',
    vendor: 'anthropic',
    label: 'Claude Sonnet 5.5',
    inputUsdPerMTok: 2,
    outputUsdPerMTok: 10,
    fallback: true,
  },
  {
    id: 'claude-haiku-5-5',
    vendor: 'anthropic',
    label: 'Claude Haiku 5.5',
    inputUsdPerMTok: 0.1,
    outputUsdPerMTok: 0.5,
    fallback: false,
  },
  {
    id: 'claude-opus-5-5',
    vendor: 'anthropic',
    label: 'Claude Opus 5.5',
    inputUsdPerMTok: 4,
    outputUsdPerMTok: 20,
    fallback: true,
  },
  {
    id: 'gemini-3.5-flash-lite',
    vendor: 'gemini',
    label: 'Gemini 3.5 Flash-Lite',
    inputUsdPerMTok: 0.3,
    outputUsdPerMTok: 2.5,
    fallback: false,
  },
  {
    id: 'gemini-3.8-flash',
    vendor: 'gemini',
    label: 'Gemini 3.8 Flash',
    inputUsdPerMTok: 1.5,
    outputUsdPerMTok: 7.5,
    fallback: false,
  },
  {
    id: FREE_AI_MODEL,
    vendor: 'free',
    label: 'Gemma 4',
    inputUsdPerMTok: 0,
    outputUsdPerMTok: 0,
    fallback: false,
  },
];

/** The chat chains tools; Sonnet does that well at a few cents a question (planning/plan.md). */
export const DEFAULT_AI_MODEL = 'claude-sonnet-5-5';

/** The model chosen when the user switches to a vendor. */
export const DEFAULT_MODELS: Record<AiVendor, string> = {
  anthropic: DEFAULT_AI_MODEL,
  // The cheapest; the same default as the Faturómetro, Prazómetro and Validómetro.
  gemini: 'gemini-3.5-flash-lite',
  free: FREE_AI_MODEL,
};

export function findModel(id: string | undefined): AiModel {
  return AI_MODELS.find((model) => model.id === id) ?? AI_MODELS[0]!;
}

export function modelsOf(vendor: AiVendor): AiModel[] {
  return AI_MODELS.filter((model) => model.vendor === vendor);
}

export function isFreeModel(id: string): boolean {
  return findModel(id).vendor === 'free';
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
