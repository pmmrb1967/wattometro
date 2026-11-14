// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { memorySql } from '../test/sqlite';
import { FREE_NEURONS_CAP, neuronsFor, toAnswer, type WorkersAi } from './ai-free';
import { createApp } from './app';
import type { Sql } from './db';
import { hashPassword } from './password';
import { createHousehold } from './repo/households';
import { addFreeAiUsage, freeAiOn, freeAiSince, purgeRowsRead } from './repo/usage';
import { createUser } from './repo/users';

const ORIGIN = 'https://app.example';
const PASSWORD = 'uma password comprida';
const NOW = Date.parse('2026-11-14T10:00:00Z') / 1000;
const TODAY = '2026-11-14';

let sql: Sql;
let runs: { model: string; input: Record<string, unknown> }[];
let output: unknown;
let failure: Error | null;

const ai: WorkersAi = {
  run(model, input) {
    runs.push({ model, input: input as Record<string, unknown> });
    return failure ? Promise.reject(failure) : Promise.resolve(output);
  },
};

const makeApp = (withAi = true) =>
  createApp({
    sql,
    sessionSecret: 's'.repeat(32),
    allowedOrigins: [],
    now: () => NOW,
    adminEmails: ['admin@example.pt'],
    ...(withAi ? { ai } : {}),
  });

beforeEach(async () => {
  sql = memorySql().sql;
  runs = [];
  failure = null;
  output = {
    choices: [{ message: { content: 'Olá' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 3000, completion_tokens: 1000 },
  };
  const id = (await createHousehold(sql, 'Casa', 0)).id;
  for (const email of ['admin@example.pt', 'ana@example.pt']) {
    await createUser(
      sql,
      { householdId: id, email, passwordHash: await hashPassword(PASSWORD, 1000) },
      0,
    );
  }
});

async function session(app: ReturnType<typeof makeApp>, email = 'ana@example.pt') {
  const response = await app.request(`${ORIGIN}/v1/auth/login`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const value = /__Host-wm_session=([^;]+)/.exec(response.headers.get('Set-Cookie') ?? '')?.[1];
  const cookie = `__Host-wm_session=${value}`;
  return (method: string, path: string, body?: unknown) =>
    app.request(`${ORIGIN}${path}`, {
      method,
      headers: { Origin: ORIGIN, Cookie: cookie, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
}

const QUESTION = {
  task: 'chat',
  messages: [
    { role: 'system', content: 'És o Wattómetro.' },
    { role: 'user', content: 'Quanto gastei?' },
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'get_baseload',
        description: 'Consumo base',
        parameters: { type: 'object' },
      },
    },
  ],
  maxTokens: 4000,
};

describe('neuronsFor', () => {
  it('prices the tokens as Workers AI does (USD 0.011 per 1000 Neurons)', () => {
    // 3000 × 0.1 + 1000 × 0.3 = 600 micro-dollars = 0.0006 USD → 54.5… Neurons, rounded up.
    expect(neuronsFor(3000, 1000)).toBe(55);
    expect(neuronsFor(0, 0)).toBe(0);
  });
});

describe('toAnswer', () => {
  it('reads tool calls in the OpenAI shape and in the older one', () => {
    expect(
      toAnswer({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [{ id: 'c1', function: { name: 'get_baseload', arguments: '{}' } }],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
    ).toEqual({
      content: null,
      toolCalls: [{ id: 'c1', name: 'get_baseload', arguments: '{}' }],
      finishReason: 'tool_calls',
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(
      toAnswer({ response: null, tool_calls: [{ name: 'get_anomalies', arguments: { days: 7 } }] })
        .toolCalls,
    ).toEqual([{ id: 'call_0', name: 'get_anomalies', arguments: '{"days":7}' }]);
  });
});

describe('/v1/ai/free', () => {
  it('forwards the messages and tools, and counts the call and its Neurons for the day', async () => {
    const ana = await session(makeApp());
    const response = await ana('POST', '/v1/ai/free', QUESTION);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      content: 'Olá',
      toolCalls: [],
      finishReason: 'stop',
      inputTokens: 3000,
      outputTokens: 1000,
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]!.model).toBe('@cf/google/gemma-4-26b-a4b-it');
    expect(runs[0]!.input).toMatchObject({
      messages: QUESTION.messages,
      tools: QUESTION.tools,
      max_completion_tokens: 4000,
      chat_template_kwargs: { enable_thinking: false },
    });
    expect(await freeAiOn(sql, TODAY)).toEqual({ day: TODAY, calls: 1, neurons: 55 });

    const status = await (await ana('GET', '/v1/ai/free/status')).json();
    expect(status).toEqual({ available: true, neuronsToday: 55, neuronsLimit: 10_000 });
  });

  it('counts the Neurons Workers AI reports, rounded up, when it reports them', async () => {
    output = {
      choices: [{ message: { content: 'Olá' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 97, completion_tokens: 10, neurons: 1.15 },
    };
    const ana = await session(makeApp());
    await ana('POST', '/v1/ai/free', QUESTION);
    expect(await freeAiOn(sql, TODAY)).toEqual({ day: TODAY, calls: 1, neurons: 2 });
  });

  it('asks for JSON when given a schema', async () => {
    const ana = await session(makeApp());
    await ana('POST', '/v1/ai/free', {
      task: 'explain',
      messages: [{ role: 'user', content: 'Explica' }],
      schema: { name: 'explain', schema: { type: 'object' } },
      maxTokens: 800,
    });
    expect(runs[0]!.input).toMatchObject({
      response_format: { type: 'json_schema', json_schema: { name: 'explain' } },
      temperature: 0,
    });
  });

  it('stops once today’s Neurons reach the cap, without asking Workers AI', async () => {
    await addFreeAiUsage(sql, TODAY, FREE_NEURONS_CAP);
    const ana = await session(makeApp());
    const response = await ana('POST', '/v1/ai/free', QUESTION);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'free_quota' });
    expect(runs).toHaveLength(0);
    expect((await (await ana('GET', '/v1/ai/free/status')).json()).available).toBe(false);
  });

  it('maps Workers AI failures without echoing them', async () => {
    const ana = await session(makeApp());
    failure = new Error('4006: you have used up your daily free allocation of 10,000 neurons');
    expect(await (await ana('POST', '/v1/ai/free', QUESTION)).json()).toEqual({
      error: 'free_quota',
    });
    failure = new Error('internal');
    const response = await ana('POST', '/v1/ai/free', QUESTION);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'ai_failed' });
    expect(await freeAiOn(sql, TODAY)).toEqual({ day: TODAY, calls: 0, neurons: 0 });
  });

  it('needs a session, a valid request and the binding', async () => {
    const app = makeApp();
    expect((await app.request(`${ORIGIN}/v1/ai/free/status`)).status).toBe(401);
    const ana = await session(app);
    expect((await ana('POST', '/v1/ai/free', { task: 'chat', messages: [] })).status).toBe(400);
    expect((await ana('POST', '/v1/ai/free', { ...QUESTION, maxTokens: 100_000 })).status).toBe(
      400,
    );
    const without = await session(makeApp(false));
    const response = await without('POST', '/v1/ai/free', QUESTION);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'not_configured' });
  });
});

describe('the administrator’s panel', () => {
  it('shows the free AI’s Neurons per UTC day against the free allocation', async () => {
    await addFreeAiUsage(sql, '2026-11-13', 400);
    await addFreeAiUsage(sql, TODAY, 120);
    await addFreeAiUsage(sql, TODAY, 30);
    const admin = await session(makeApp(), 'admin@example.pt');
    const stats = await (await admin('GET', '/v1/admin/stats')).json();
    expect(stats.limits.aiNeurons).toBe(10_000);
    expect(stats.freeAi).toEqual([
      { day: '2026-11-13', calls: 1, neurons: 400 },
      { day: TODAY, calls: 2, neurons: 150 },
    ]);
    const withoutAi = await session(makeApp(false), 'admin@example.pt');
    expect((await (await withoutAi('GET', '/v1/admin/stats')).json()).freeAi).toBeNull();
  });

  it('forgets the old days with the rows read', async () => {
    await addFreeAiUsage(sql, '2026-11-01', 10);
    await addFreeAiUsage(sql, TODAY, 10);
    await purgeRowsRead(sql, '2026-11-07');
    expect(await freeAiSince(sql, '2026-10-01')).toEqual([{ day: TODAY, calls: 1, neurons: 10 }]);
  });
});
