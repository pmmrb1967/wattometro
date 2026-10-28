// SPDX-License-Identifier: AGPL-3.0-or-later
/** The contracted power tier "Início" recommends (src/app/HomeActions.tsx), reused for a while. */
import { DEFAULT_MARGIN_PCT, recommendTier, SINGLE_PHASE } from '../domain/contracted-power';
import { loadPower } from './ai-context';

/**
 * 90 days of peaks barely move in half an hour: the tier is reused for that
 * long instead of being read again (~20 000 rows) on every visit to "Início".
 */
const REUSE_TIER_MS = 30 * 60_000;
let reusedTier: { at: number; recommendedVa: number | null } | null = null;

/** Forgets the reused tier (signing out). */
export function clearPowerActionCache(): void {
  reusedTier = null;
}

/** The lowest tier that would not have cut in 90 days (Shelly only); null without one. */
export async function recommendedTier(): Promise<number | null> {
  if (reusedTier && Date.now() - reusedTier.at < REUSE_TIER_MS) return reusedTier.recommendedVa;
  const facts = await loadPower(Math.floor(Date.now() / 1000));
  // Not reused when the server could not answer.
  if (!facts) return null;
  const recommendedVa =
    facts.kind === 'shelly'
      ? (
          await recommendTier({
            peak: facts.peak,
            marginPct: DEFAULT_MARGIN_PCT,
            curve: SINGLE_PHASE,
            fetchPeaks: facts.fetchPeaks,
          })
        ).recommendedVa
      : null;
  reusedTier = { at: Date.now(), recommendedVa };
  return recommendedVa;
}
