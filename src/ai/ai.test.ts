// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from './anthropic';
import { estimateText } from './estimate';
import { costMicroUsd, DEFAULT_AI_MODEL, formatMicroUsd } from './models';
import { fakeApi, message } from './fake-api';
import { AiError } from './provider';
import {
  EMPTY_AI_SETTINGS,
  hasAiKey,
  loadAiSettings,
  recordUsage,
  saveAiSettings,
  usageThisMonth,
} from './settings';

describe('models', () => {
  it('defaults to Sonnet and prices tokens in integer micro-dollars', () => {
    expect(DEFAULT_AI_MODEL).toBe('claude-sonnet-5-5');
    // 1000 × 2 $/MTok + 200 × 10 $/MTok = 4000 micro-dollars.
    expect(costMicroUsd('claude-sonnet-5-5', 1000, 200)).toBe(4000);
    expect(costMicroUsd('claude-haiku-5-5', 1000, 200)).toBe(200);
    expect(formatMicroUsd(4000)).toBe('0,0040 US$');
    expect(formatMicroUsd(50)).toBe('< 0,0001 US$');
  });

  it('estimates on the high side, about 3 characters a token', () => {
    const estimate = estimateText('claude-sonnet-5-5', 'x'.repeat(300), 'y'.repeat(30), 500);
    expect(estimate).toEqual({ inputTokens: 110, outputTokens: 500, costMicroUsd: 5220 });
  });
});

describe('AnthropicProvider', () => {
  it('writes a text with the fallback on Sonnet and reports the cost', async () => {
    const api = fakeApi([{ status: 200, body: message([{ type: 'text', text: ' Olá. ' }]) }]);
    const provider = new AnthropicProvider({
      apiKey: ' sk-ant-test ',
      model: 'claude-sonnet-5-5',
      fetch: api.fetch,
    });
    const result = await provider.writeText({
      task: 'explain',
      promptVersion: 'explain-1',
      system: 'S',
      user: 'U',
      maxOutputTokens: 800,
    });
    expect(result.text).toBe('Olá.');
    expect(result.usage).toMatchObject({ task: 'explain', costMicroUsd: 4000 });
    const [request] = api.requests;
    expect(request?.url).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/messages/);
    expect(request?.headers.get('x-api-key')).toBe('sk-ant-test');
    expect(request?.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(request?.body).toMatchObject({
      model: 'claude-sonnet-5-5',
      fallbacks: 'default',
      max_tokens: 800,
      system: 'S',
    });
  });

  it('sends no fallback with Haiku', async () => {
    const api = fakeApi([{ status: 200, body: message([{ type: 'text', text: 'ok' }]) }]);
    await new AnthropicProvider({
      apiKey: 'k',
      model: 'claude-haiku-5-5',
      fetch: api.fetch,
    }).testConnection();
    expect(api.requests[0]?.body.fallbacks).toBeUndefined();
  });

  it('turns API failures into codes the app can explain', async () => {
    const failing = (status: number, text: string) =>
      new AnthropicProvider({
        apiKey: 'k',
        model: 'claude-haiku-5-5',
        fetch: fakeApi([
          { status, body: { type: 'error', error: { type: 'x', message: text } } },
          { status, body: { type: 'error', error: { type: 'x', message: text } } },
        ]).fetch,
      }).testConnection();
    await expect(failing(401, 'invalid x-api-key')).rejects.toMatchObject({ code: 'invalid_key' });
    await expect(failing(400, 'Your credit balance is too low')).rejects.toMatchObject({
      code: 'no_credit',
    });
    expect(() => new AnthropicProvider({ apiKey: ' ', model: 'claude-haiku-5-5' })).toThrow(
      AiError,
    );
  });

  it('says so when the answer was declined', async () => {
    const api = fakeApi([{ status: 200, body: message([], 'refusal') }]);
    const provider = new AnthropicProvider({
      apiKey: 'k',
      model: 'claude-sonnet-5-5',
      fetch: api.fetch,
    });
    await expect(
      provider.writeText({
        task: 'explain',
        promptVersion: 'v',
        system: 'S',
        user: 'U',
        maxOutputTokens: 100,
      }),
    ).rejects.toMatchObject({ code: 'refused' });
  });
});

describe('settings', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
  });

  it('keeps each account’s key apart, trimmed', () => {
    expect(loadAiSettings('a@x.pt')).toEqual(EMPTY_AI_SETTINGS);
    saveAiSettings('a@x.pt', { apiKey: ' sk-1 ', model: 'claude-haiku-5-5', autoSend: true });
    expect(loadAiSettings('a@x.pt')).toEqual({
      apiKey: 'sk-1',
      model: 'claude-haiku-5-5',
      autoSend: true,
    });
    expect(hasAiKey(loadAiSettings('b@x.pt'))).toBe(false);
  });

  it('falls back to the default model when the stored one is gone', () => {
    localStorage.setItem(
      'wattometro.ai.a@x.pt',
      JSON.stringify({ apiKey: 'k', model: 'claude-old', autoSend: false }),
    );
    expect(loadAiSettings('a@x.pt').model).toBe(DEFAULT_AI_MODEL);
  });

  it('adds up this month’s spending', () => {
    const usage = {
      task: 'chat' as const,
      model: 'claude-sonnet-5-5',
      promptVersion: 'v',
      inputTokens: 1000,
      outputTokens: 200,
      costMicroUsd: 4000,
    };
    recordUsage('a@x.pt', [usage], new Date('2026-09-30T12:00:00Z'));
    recordUsage('a@x.pt', [usage, usage], new Date('2026-10-02T12:00:00Z'));
    expect(usageThisMonth('a@x.pt', new Date('2026-10-25T12:00:00Z'))).toEqual({
      costMicroUsd: 8000,
      requests: 2,
    });
  });
});
