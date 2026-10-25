// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { AnthropicProvider } from './anthropic';
import { estimateExplain, explainFacts } from './explain';
import { fakeApi, message } from './fake-api';
import { EXPLAIN_PROMPT_VERSION } from './prompts/explain';

const facts = {
  date: '2026-10-20',
  kind: 'workday',
  used: '18,4 kWh',
  usual: '9,2 kWh',
  changePct: 100,
  mostlyBetween: '19 h–23 h (7,1 kWh)',
  cost: '1,52 €',
};

const json = (value: unknown) => message([{ type: 'text', text: JSON.stringify(value) }]);

const good = {
  headline: 'A 2026-10-20 gastaste 18,4 kWh, o dobro do costume (9,2 kWh).',
  points: ['A maior parte foi entre as 19 h e as 23 h (7,1 kWh).'],
  actions: ['Pode ter sido um aquecedor: verifica o que esteve ligado nessa noite.'],
};

describe('explainFacts', () => {
  it('asks for JSON in the schema and returns it checked', async () => {
    const api = fakeApi([{ status: 200, body: json(good) }]);
    const provider = new AnthropicProvider({
      apiKey: 'k',
      model: 'claude-sonnet-5-5',
      fetch: api.fetch,
    });
    const result = await explainFacts(provider, 'unusualDay', facts);

    expect(result.explanation).toEqual(good);
    expect(result.unconfirmed).toEqual([]);
    expect(result.usage).toHaveLength(1);
    expect(result.usage[0]).toMatchObject({
      task: 'explain',
      promptVersion: EXPLAIN_PROMPT_VERSION,
    });
    const body = api.requests[0]?.body as {
      output_config: { format: { type: string; schema: { required: string[] } } };
      messages: { content: string }[];
    };
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.output_config.format.schema.required).toEqual(['headline', 'points', 'actions']);
    // Length limits are not accepted by the API: zod checks them instead.
    expect(JSON.stringify(body.output_config.format.schema)).not.toMatch(/maxLength|maxItems/);
    expect(body.messages[0]?.content).toContain('18,4 kWh');
  });

  it('tries once more when the answer is not valid, then gives up keeping what was spent', async () => {
    const bad = { status: 200, body: json({ headline: 'Olá' }) };
    const retried = fakeApi([bad, { status: 200, body: json(good) }]);
    const provider = new AnthropicProvider({
      apiKey: 'k',
      model: 'claude-haiku-5-5',
      fetch: retried.fetch,
    });
    const result = await explainFacts(provider, 'unusualDay', facts);
    expect(result.usage).toHaveLength(2);

    const failing = fakeApi([
      bad,
      { status: 200, body: message([{ type: 'text', text: 'não é JSON' }]) },
    ]);
    const other = new AnthropicProvider({
      apiKey: 'k',
      model: 'claude-haiku-5-5',
      fetch: failing.fetch,
    });
    await expect(explainFacts(other, 'unusualDay', facts)).rejects.toMatchObject({
      code: 'invalid_output',
      usage: [expect.anything(), expect.anything()],
    });
    expect(failing.requests).toHaveLength(2);
  });

  it('flags a quantity that is not among the facts', async () => {
    const api = fakeApi([
      {
        status: 200,
        body: json({ ...good, points: ['São mais 9,2 kWh, cerca de 0,76 € a mais.'] }),
      },
    ]);
    const provider = new AnthropicProvider({
      apiKey: 'k',
      model: 'claude-sonnet-5-5',
      fetch: api.fetch,
    });
    const result = await explainFacts(provider, 'unusualDay', facts);
    expect(result.unconfirmed).toEqual(['0,76 €']);
  });

  it('estimates the cost before sending', () => {
    expect(estimateExplain('claude-sonnet-5-5', 'month', facts).costMicroUsd).toBeGreaterThan(0);
  });
});
