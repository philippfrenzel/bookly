/** AI client interface, OpenRouter implementation and environment-based configuration. */
import { createFakeAiClient } from './fake.js';

/** A single structured-output completion request. */
export interface AiRequest {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  timeoutMs: number;
}

/** Minimal AI client: resolves to the parsed JSON content of the model reply. */
export interface AiClient {
  model: string;
  complete(req: AiRequest): Promise<unknown>;
}

/** Error raised for any AI failure; the message is short and safe to store. */
export class AiError extends Error {
  constructor(message: string) {
    super(message.slice(0, 200));
    this.name = 'AiError';
  }
}

/** Creates a client that talks to the OpenRouter chat completions API. */
export function createOpenRouterClient(opts: { apiKey: string; model: string; fetch?: typeof fetch }): AiClient {
  const doFetch = opts.fetch ?? fetch;
  return {
    model: opts.model,
    async complete(req) {
      let res: Response;
      try {
        res = await doFetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: opts.model,
            messages: [
              { role: 'system', content: req.system },
              { role: 'user', content: req.user },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: { name: req.schemaName, strict: true, schema: req.schema },
            },
          }),
          signal: AbortSignal.timeout(req.timeoutMs),
        });
      } catch (err) {
        const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
        throw new AiError(timedOut ? 'AI request timed out' : 'AI request failed');
      }
      if (!res.ok) throw new AiError(`AI request failed with status ${res.status}`);
      try {
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        return JSON.parse(data.choices?.[0]?.message?.content ?? '');
      } catch {
        throw new AiError('AI response was not valid JSON');
      }
    },
  };
}

/** Builds the AI client from the environment: fake, OpenRouter, or null (AI off). */
export function aiFromEnv(env: NodeJS.ProcessEnv): AiClient | null {
  if (env.AI_FAKE === '1') return createFakeAiClient();
  if (!env.OPENROUTER_API_KEY) return null;
  if (!env.OPENROUTER_MODEL) throw new Error('OPENROUTER_MODEL is required when OPENROUTER_API_KEY is set');
  return createOpenRouterClient({ apiKey: env.OPENROUTER_API_KEY, model: env.OPENROUTER_MODEL });
}
