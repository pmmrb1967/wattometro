// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The user's AI settings and spending, kept only in this browser
 * (localStorage, per account): the key is personal and never goes to the
 * Worker. Clearing the site's data forgets it.
 */
import { z } from 'zod';
import { AnthropicProvider } from './anthropic';
import { AI_MODELS, DEFAULT_AI_MODEL } from './models';
import type { AiProvider, AiUsage } from './provider';

const MODEL_IDS = AI_MODELS.map((model) => model.id) as [string, ...string[]];

const AiSettingsSchema = z.object({
  apiKey: z.string(),
  model: z.enum(MODEL_IDS).catch(DEFAULT_AI_MODEL),
  /** Send without showing the estimated cost first. */
  autoSend: z.boolean().catch(false),
});
export type AiSettings = z.infer<typeof AiSettingsSchema>;

const UsageEntry = z.object({
  at: z.string(),
  task: z.enum(['chat', 'explain', 'test']),
  model: z.string(),
  promptVersion: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  costMicroUsd: z.number().int(),
});
type UsageEntry = z.infer<typeof UsageEntry>;

/** Entries kept in the log (oldest dropped first). */
const MAX_USAGE_ENTRIES = 500;

export const EMPTY_AI_SETTINGS: AiSettings = {
  apiKey: '',
  model: DEFAULT_AI_MODEL,
  autoSend: false,
};

const settingsKey = (email: string) => `wattometro.ai.${email}`;
const usageKey = (email: string) => `wattometro.ai-usage.${email}`;

function read<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export function loadAiSettings(email: string): AiSettings {
  return read(settingsKey(email), AiSettingsSchema, EMPTY_AI_SETTINGS);
}

export function saveAiSettings(email: string, settings: AiSettings): void {
  localStorage.setItem(
    settingsKey(email),
    JSON.stringify({ ...settings, apiKey: settings.apiKey.trim() }),
  );
}

export function forgetAiSettings(email: string): void {
  localStorage.removeItem(settingsKey(email));
}

export function hasAiKey(settings: AiSettings): boolean {
  return settings.apiKey.trim() !== '';
}

export function providerFromSettings(settings: AiSettings): AiProvider | undefined {
  if (!hasAiKey(settings)) return undefined;
  return new AnthropicProvider({ apiKey: settings.apiKey, model: settings.model, browser: true });
}

function loadUsage(email: string): UsageEntry[] {
  return read(usageKey(email), z.array(UsageEntry), []);
}

export function recordUsage(email: string, usage: readonly AiUsage[], now = new Date()): void {
  const entries = [
    ...loadUsage(email),
    ...usage.map((entry) => ({ ...entry, at: now.toISOString() })),
  ];
  try {
    localStorage.setItem(usageKey(email), JSON.stringify(entries.slice(-MAX_USAGE_ENTRIES)));
  } catch {
    // Storage full or blocked: the log is only informative.
  }
}

/** What was spent this calendar month (UTC), in micro-dollars, and in how many requests. */
export function usageThisMonth(
  email: string,
  now = new Date(),
): { costMicroUsd: number; requests: number } {
  const month = now.toISOString().slice(0, 7);
  const entries = loadUsage(email).filter((entry) => entry.at.startsWith(month));
  return {
    costMicroUsd: entries.reduce((sum, entry) => sum + entry.costMicroUsd, 0),
    requests: entries.length,
  };
}
