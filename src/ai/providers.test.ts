// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fakeApi } from './fake-api';
import { FreeProvider, type FreeAnswer, type FreeRequest } from './free';
import { GeminiProvider } from './gemini';
import { FREE_AI_MODEL, costMicroUsd, findModel, modelsOf } from './models';
import { AiError, type ChatRequest, type ToolCallOutcome } from './provider';
import { EMPTY_AI_SETTINGS, providerFromSettings } from './settings';

const TOOLS = [
  { name: 'get_baseload', description: 'Consumo base', inputSchema: { type: 'object' } },
];

function chatRequest(results: Record<string, unknown>, ran: string[]): ChatRequest {
  return {
    promptVersion: 'chat-test',
    system: 'És o Wattómetro.',
    history: [],
    question: 'Quanto me custa o consumo fantasma?',
    tools: TOOLS,
    runTool: (name): Promise<ToolCallOutcome> => {
      ran.push(name);
      return Promise.resolve({ ok: true, result: results[name] });
    },
  };
}

const geminiAnswer = (parts: unknown[], finishReason = 'STOP') => ({
  candidates: [{ content: { role: 'model', parts }, finishReason }],
  usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 50 },
});

describe('models', () => {
  it('lists each vendor’s models; the free one costs nothing', () => {
    expect(modelsOf('gemini').map((model) => model.id)).toEqual([
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
    ]);
    expect(findModel(FREE_AI_MODEL).vendor).toBe('free');
    expect(costMicroUsd(FREE_AI_MODEL, 100_000, 10_000)).toBe(0);
    // 1000 × 0.3 + 150 × 2.5 = 675 micro-dollars.
    expect(costMicroUsd('gemini-3.5-flash-lite', 1000, 150)).toBe(675);
  });
});

describe('providerFromSettings', () => {
  const transport = () => Promise.reject(new Error('not used'));

  it('picks the provider of the chosen model, with its own key', () => {
    expect(providerFromSettings(EMPTY_AI_SETTINGS)).toBeUndefined();
    const gemini = { ...EMPTY_AI_SETTINGS, geminiKey: 'AIza', model: 'gemini-3.8-flash' };
    expect(providerFromSettings(gemini)).toBeInstanceOf(GeminiProvider);
    // An Anthropic key does not make a Gemini model work.
    expect(
      providerFromSettings({ ...EMPTY_AI_SETTINGS, apiKey: 'sk', model: 'gemini-3.8-flash' }),
    ).toBeUndefined();
  });

  it('the free AI needs no key, only a way to the server', () => {
    const free = { ...EMPTY_AI_SETTINGS, model: FREE_AI_MODEL };
    expect(providerFromSettings(free)).toBeUndefined();
    expect(providerFromSettings(free, transport)).toBeInstanceOf(FreeProvider);
  });
});

describe('GeminiProvider', () => {
  it('answers with the tools, sending back the model’s turn as it came', async () => {
    const api = fakeApi([
      {
        status: 200,
        body: geminiAnswer([
          { functionCall: { id: 'f1', name: 'get_baseload', args: {} }, thoughtSignature: 'sig' },
        ]),
      },
      { status: 200, body: geminiAnswer([{ text: 'Custa cerca de 120 € por ano.' }]) },
    ]);
    const provider = new GeminiProvider({
      apiKey: 'AIza-sintetica',
      model: 'gemini-3.5-flash-lite',
      fetch: api.fetch,
    });
    const ran: string[] = [];
    const answer = await provider.chat(chatRequest({ get_baseload: { yearlyEuros: 120 } }, ran));

    expect(answer.text).toBe('Custa cerca de 120 € por ano.');
    expect(ran).toEqual(['get_baseload']);
    expect(answer.usage).toHaveLength(2);
    expect(answer.usage[0]!.outputTokens).toBe(150);
    expect(api.requests[0]!.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    );
    expect(api.requests[0]!.headers.get('x-goog-api-key')).toBe('AIza-sintetica');
    expect(api.requests[0]!.body.tools).toEqual([
      {
        functionDeclarations: [
          {
            name: 'get_baseload',
            description: 'Consumo base',
            parametersJsonSchema: { type: 'object' },
          },
        ],
      },
    ]);
    const second = api.requests[1]!.body.contents as { role: string; parts: unknown[] }[];
    expect(second[1]!.parts[0]).toEqual({
      functionCall: { id: 'f1', name: 'get_baseload', args: {} },
      thoughtSignature: 'sig',
    });
    expect(second[2]).toEqual({
      role: 'user',
      parts: [
        {
          functionResponse: {
            id: 'f1',
            name: 'get_baseload',
            response: { result: { yearlyEuros: 120 } },
          },
        },
      ],
    });
  });

  it('reads JSON with a schema, and retries once', async () => {
    const api = fakeApi([
      { status: 200, body: geminiAnswer([{ text: 'não é json' }]) },
      { status: 200, body: geminiAnswer([{ text: '{"headline":"Ok"}' }]) },
    ]);
    const provider = new GeminiProvider({
      apiKey: 'k',
      model: 'gemini-3.8-flash',
      fetch: api.fetch,
    });
    const { data, usage } = await provider.writeStructured({
      task: 'explain',
      promptVersion: 'v',
      system: 's',
      user: 'u',
      maxOutputTokens: 500,
      schema: { type: 'object' },
      validator: z.object({ headline: z.string() }),
    });
    expect(data).toEqual({ headline: 'Ok' });
    expect(usage).toHaveLength(2);
    expect(api.requests[0]!.body.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      responseJsonSchema: { type: 'object' },
    });
  });

  it('says what went wrong with the key or the billing', async () => {
    const invalid = fakeApi([
      {
        status: 400,
        body: { error: { status: 'INVALID_ARGUMENT', message: 'API key not valid' } },
      },
    ]);
    await expect(
      new GeminiProvider({
        apiKey: 'k',
        model: 'gemini-3.8-flash',
        fetch: invalid.fetch,
      }).writeText({
        task: 'explain',
        promptVersion: 'v',
        system: 's',
        user: 'u',
        maxOutputTokens: 10,
      }),
    ).rejects.toMatchObject({ code: 'invalid_key' });
    const billing = fakeApi([
      { status: 400, body: { error: { status: 'FAILED_PRECONDITION', message: 'billing' } } },
    ]);
    await expect(
      new GeminiProvider({
        apiKey: 'k',
        model: 'gemini-3.8-flash',
        fetch: billing.fetch,
      }).writeText({
        task: 'explain',
        promptVersion: 'v',
        system: 's',
        user: 'u',
        maxOutputTokens: 10,
      }),
    ).rejects.toMatchObject({ code: 'no_credit' });
  });
});

describe('FreeProvider', () => {
  function transport(answers: Partial<FreeAnswer>[]) {
    const sent: FreeRequest[] = [];
    const send = (request: FreeRequest) => {
      sent.push(structuredClone(request));
      const next = answers.shift();
      if (!next) return Promise.reject(new AiError('free_quota'));
      return Promise.resolve({
        content: null,
        toolCalls: [],
        finishReason: 'stop',
        inputTokens: 2000,
        outputTokens: 300,
        ...next,
      });
    };
    return { send, sent };
  }

  it('runs the tools here and sends their results in the OpenAI format, at no cost', async () => {
    const free = transport([
      {
        toolCalls: [{ id: 'c1', name: 'get_baseload', arguments: '{}' }],
        finishReason: 'tool_calls',
      },
      { content: 'Cerca de 120 € por ano.' },
    ]);
    const ran: string[] = [];
    const answer = await new FreeProvider(free.send).chat(
      chatRequest({ get_baseload: { yearlyEuros: 120 } }, ran),
    );
    expect(answer.text).toBe('Cerca de 120 € por ano.');
    expect(ran).toEqual(['get_baseload']);
    expect(answer.usage.map((usage) => usage.costMicroUsd)).toEqual([0, 0]);
    expect(free.sent[0]!.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'get_baseload',
          description: 'Consumo base',
          parameters: { type: 'object' },
        },
      },
    ]);
    expect(free.sent[1]!.messages.slice(-2)).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'get_baseload', arguments: '{}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'c1', content: '{"yearlyEuros":120}' },
    ]);
    // The history keeps the conversation without the system prompt (sent on every request).
    expect((answer.history as { role: string }[]).map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
    ]);
  });

  it('reads JSON even inside a fence, and passes images as data URLs', async () => {
    const free = transport([{ content: '```json\n{"headline":"Ok"}\n```' }]);
    const { data } = await new FreeProvider(free.send).writeStructured({
      task: 'read_equipment',
      promptVersion: 'v',
      system: 's',
      user: 'Lê a chapa.',
      images: [{ mime: 'image/jpeg', base64: 'AAAA' }],
      maxOutputTokens: 500,
      schema: { type: 'object' },
      validator: z.object({ headline: z.string() }),
    });
    expect(data).toEqual({ headline: 'Ok' });
    expect(free.sent[0]!.schema).toEqual({ name: 'read_equipment', schema: { type: 'object' } });
    expect(free.sent[0]!.messages[1]).toEqual({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
        { type: 'text', text: 'Lê a chapa.' },
      ],
    });
  });

  it('keeps what was spent when today’s quota runs out halfway', async () => {
    const free = transport([
      {
        toolCalls: [{ id: 'c1', name: 'get_baseload', arguments: '{}' }],
        finishReason: 'tool_calls',
      },
    ]);
    const failure = await new FreeProvider(free.send)
      .chat(chatRequest({ get_baseload: {} }, []))
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AiError);
    expect(failure).toMatchObject({ code: 'free_quota' });
    expect((failure as AiError).usage).toHaveLength(1);
  });
});
