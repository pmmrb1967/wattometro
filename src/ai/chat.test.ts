// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { AnthropicProvider } from './anthropic';
import { askWattometro, CHAT_TOOLS, estimateChat } from './chat';
import { fakeApi, message } from './fake-api';
import { CHAT_PROMPT_VERSION } from './prompts/chat';
import type { ToolCall } from './provider';
import type { ToolContext } from './tools/tool';
import { canonicalNumbers, unconfirmedQuantities } from './verify';

const context: ToolContext = {
  today: '2026-10-25',
  quarters: [],
  yearFrom: 0,
  tariffs: null,
  daily: null,
  offers: async () => null,
  power: async () => null,
  quality: async () => null,
};

const toolUse = (id: string, name: string, input: unknown) => ({
  type: 'tool_use',
  id,
  name,
  input,
});

describe('askWattometro', () => {
  it('runs the tools the model asks for and sends every result back in one message', async () => {
    const api = fakeApi([
      {
        status: 200,
        body: message(
          [
            toolUse('t1', 'get_cost_breakdown', { month: '2026-09' }),
            toolUse('t2', 'get_baseload', {}),
          ],
          'tool_use',
        ),
      },
      { status: 200, body: message([{ type: 'text', text: 'Não há dados de setembro.' }]) },
    ]);
    const provider = new AnthropicProvider({
      apiKey: 'k',
      model: 'claude-sonnet-5-5',
      fetch: api.fetch,
    });
    const result = await askWattometro(provider, context, [], 'Quanto gastei em setembro?');

    expect(result.text).toBe('Não há dados de setembro.');
    expect(result.calls.map((call) => call.name)).toEqual(['get_cost_breakdown', 'get_baseload']);
    expect(result.calls[0]?.outcome).toEqual({
      ok: true,
      result: { month: '2026-09', note: 'No data in this month.' },
    });
    expect(result.usage).toHaveLength(2);
    expect(result.usage[0]).toMatchObject({ task: 'chat', promptVersion: CHAT_PROMPT_VERSION });

    const [first, second] = api.requests;
    expect(first?.body).toMatchObject({
      model: 'claude-sonnet-5-5',
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
    });
    expect((first?.body.tools as unknown[]).length).toBe(8);
    const messages = second?.body.messages as { role: string; content: unknown }[];
    expect(messages.map((item) => item.role)).toEqual(['user', 'assistant', 'user']);
    expect(String(messages[0]?.content)).toContain('Hoje é 2026-10-25');
    expect(messages[2]?.content).toEqual([
      expect.objectContaining({ type: 'tool_result', tool_use_id: 't1' }),
      expect.objectContaining({ type: 'tool_result', tool_use_id: 't2' }),
    ]);
    // The history goes back as it was, for a follow-up question.
    expect(result.history).toHaveLength(4);
  });

  it('marks a failed tool as an error and lets the model go on', async () => {
    const api = fakeApi([
      {
        status: 200,
        body: message([toolUse('t1', 'get_cost_breakdown', { month: 'set' })], 'tool_use'),
      },
      { status: 200, body: message([{ type: 'text', text: 'Indica o mês.' }]) },
    ]);
    const provider = new AnthropicProvider({
      apiKey: 'k',
      model: 'claude-haiku-5-5',
      fetch: api.fetch,
    });
    const result = await askWattometro(provider, context, [], 'Quanto gastei?');
    expect(result.calls[0]?.outcome.ok).toBe(false);
    const messages = api.requests[1]?.body.messages as { content: unknown }[];
    expect(messages[2]?.content).toEqual([expect.objectContaining({ is_error: true })]);
  });

  it('gives up after a few rounds of tools, keeping what was spent', async () => {
    const loop = { status: 200, body: message([toolUse('t', 'get_baseload', {})], 'tool_use') };
    const api = fakeApi(Array.from({ length: 10 }, () => loop));
    const provider = new AnthropicProvider({
      apiKey: 'k',
      model: 'claude-haiku-5-5',
      fetch: api.fetch,
    });
    await expect(askWattometro(provider, context, [], 'Olá')).rejects.toMatchObject({
      code: 'invalid_output',
      usage: expect.arrayContaining([expect.objectContaining({ task: 'chat' })]),
    });
    expect(api.requests.length).toBe(6);
  });

  it('estimates the cost on the high side, before sending', () => {
    const estimate = estimateChat('claude-sonnet-5-5', [], 'Compensa-me o bi-horário?');
    expect(estimate.inputTokens).toBeGreaterThan(3 * 1000);
    expect(estimate.costMicroUsd).toBeGreaterThan(0);
    expect(CHAT_TOOLS.map((tool) => tool.name)).toContain('simulate_tariffs');
  });
});

describe('unconfirmedQuantities', () => {
  const calls: ToolCall[] = [
    {
      name: 'get_cost_breakdown',
      input: {},
      outcome: {
        ok: true,
        result: {
          cost: { total: '62,15 €', energy: '1234,50 €' },
          energy: '12 345,0 kWh',
          vsPreviousMonthPerDayPct: -12,
        },
      },
    },
  ];

  it('accepts the tools’ own numbers, however they are spaced', () => {
    expect(
      unconfirmedQuantities(
        'Gastaste 62,15 € (1234,5 € de energia), 12 345 kWh, 12 % menos por dia.',
        calls,
      ),
    ).toEqual([]);
  });

  it('flags a number the AI made up or computed', () => {
    expect(unconfirmedQuantities('Cerca de 2,07 € por dia, 62 € no total.', calls)).toEqual([
      '2,07 €',
      '62 €',
    ]);
  });

  it('writes numbers the same way however they are spaced', () => {
    expect(canonicalNumbers('12 345,50 € e -3 kWh, 0,40')).toEqual(['12345,5', '3', '0,4']);
  });

  it('ignores numbers without a unit (dates, hours, days)', () => {
    expect(unconfirmedQuantities('Em 30 dias de setembro, às 19 h.', calls)).toEqual([]);
  });
});
