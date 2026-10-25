// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Cost estimate shown before anything is sent (from the Faturómetro).
 * Computed locally on purpose: the API's exact count would itself send the
 * data first. Rough and on the high side: about 3 characters per token in
 * Portuguese.
 */
import { costMicroUsd } from './models';
import type { AiEstimate } from './provider';

const CHARS_PER_TOKEN = 3;

export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateText(
  model: string,
  system: string,
  user: string,
  maxOutputTokens: number,
): AiEstimate {
  const inputTokens = estimateTextTokens(system) + estimateTextTokens(user);
  return {
    inputTokens,
    outputTokens: maxOutputTokens,
    costMicroUsd: costMicroUsd(model, inputTokens, maxOutputTokens),
  };
}
