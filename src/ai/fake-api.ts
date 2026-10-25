// SPDX-License-Identifier: AGPL-3.0-or-later
/** For tests: a fake api.anthropic.com and its messages. */

/** A fake api.anthropic.com: answers in order and records the requests. */
export function fakeApi(responses: { status: number; body: unknown }[]) {
  const requests: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push({
      url: request.url,
      body: JSON.parse(await request.text()) as Record<string, unknown>,
      headers: request.headers,
    });
    const next = responses.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
  return { fetch, requests };
}

export function message(
  content: unknown[],
  stopReason = 'end_turn',
  usage = { input_tokens: 1000, output_tokens: 200 },
) {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage,
  };
}
