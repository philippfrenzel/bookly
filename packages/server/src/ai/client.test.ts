/** Unit tests for the OpenRouter client, the fake client and AI env configuration (no network). */
import { describe, expect, test, vi } from 'vitest';
import { AiError, aiFromEnv, createOpenRouterClient } from './client.js';
import { createFakeAiClient } from './fake.js';

const req = { system: 'sys', user: 'usr', schemaName: 'character_check', schema: { type: 'object' }, timeoutMs: 1000 };

/** Builds a stub fetch resolving to the given JSON body. */
function stubFetch(body: unknown, status = 200) {
  return vi.fn(async (_url: unknown, _init?: unknown) => new Response(JSON.stringify(body), { status }));
}
const ok = (content: string) => ({ choices: [{ message: { content } }] });

describe('createOpenRouterClient', () => {
  test('sends images as data-URL parts of the user message', async () => {
    const fetch = stubFetch(ok('{"description":"x"}'));
    const client = createOpenRouterClient({ apiKey: 'k', model: 'm/x', fetch: fetch as unknown as typeof globalThis.fetch });
    await client.complete({ ...req, images: [{ mime: 'image/png', data: Buffer.from([1, 2, 3]) }] });
    const body = JSON.parse((fetch.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.messages[1]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'usr' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } },
      ],
    });
  });


  test('sends the expected request and returns parsed content', async () => {
    const fetch = stubFetch(ok('{"warnings":[]}'));
    const client = createOpenRouterClient({ apiKey: 'k', model: 'm/x', fetch: fetch as unknown as typeof globalThis.fetch });
    expect(client.model).toBe('m/x');
    await expect(client.complete(req)).resolves.toEqual({ warnings: [] });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('m/x');
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' },
    ]);
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'character_check', strict: true, schema: { type: 'object' } },
    });
  });

  test('non-2xx throws AiError', async () => {
    const client = createOpenRouterClient({ apiKey: 'k', model: 'm', fetch: stubFetch({}, 500) as unknown as typeof globalThis.fetch });
    await expect(client.complete(req)).rejects.toBeInstanceOf(AiError);
  });

  test('non-JSON content throws AiError', async () => {
    const client = createOpenRouterClient({ apiKey: 'k', model: 'm', fetch: stubFetch(ok('nope')) as unknown as typeof globalThis.fetch });
    await expect(client.complete(req)).rejects.toBeInstanceOf(AiError);
  });

  test('aborts after timeoutMs with AiError', async () => {
    const fetch = vi.fn((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(init.signal!.reason));
      }),
    );
    const client = createOpenRouterClient({ apiKey: 'k', model: 'm', fetch: fetch as unknown as typeof globalThis.fetch });
    await expect(client.complete({ ...req, timeoutMs: 20 })).rejects.toBeInstanceOf(AiError);
  });
});

describe('createFakeAiClient', () => {
  const fake = createFakeAiClient();
  const user = (marker: string) =>
    JSON.stringify({ note: marker, characters: [{ id: 'c1', name: 'A' }, { id: 'c2' }] });

  test('warns for the first character when the marker is present', async () => {
    expect(fake.model).toBe('fake');
    await expect(fake.complete({ ...req, user: user('FAKE-WIDERSPRUCH') })).resolves.toEqual({
      warnings: [{ characterId: 'c1', criterion: 'behavior_change', message: 'Fake: Verhalten weicht ab.' }],
    });
  });

  test('no warnings without the marker, or on unparsable input', async () => {
    await expect(fake.complete({ ...req, user: user('ok') })).resolves.toEqual({ warnings: [] });
    await expect(fake.complete({ ...req, user: 'FAKE-WIDERSPRUCH' })).resolves.toEqual({ warnings: [] });
  });

  test('text suggestions schema', async () => {
    await expect(fake.complete({ ...req, schemaName: 'text_suggestions' })).resolves.toEqual({
      suggestions: ['KI-Vorschlag 1', 'KI-Vorschlag 2', 'KI-Vorschlag 3'],
    });
  });
});

describe('aiFromEnv', () => {
  test('null without key', () => expect(aiFromEnv({})).toBeNull());
  test('fake with AI_FAKE=1', () => expect(aiFromEnv({ AI_FAKE: '1' })?.model).toBe('fake'));
  test('key without model throws', () =>
    expect(() => aiFromEnv({ OPENROUTER_API_KEY: 'k' })).toThrow('OPENROUTER_MODEL is required when OPENROUTER_API_KEY is set'));
  test('key and model yield a client', () =>
    expect(aiFromEnv({ OPENROUTER_API_KEY: 'k', OPENROUTER_MODEL: 'm' })?.model).toBe('m'));
});
