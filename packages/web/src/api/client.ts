/** Typed fetch wrapper for the bookly API (cookie session, JSON bodies). */

/** Error thrown for any non-2xx API response; carries status and parsed JSON body. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API error ${status}`);
    this.name = 'ApiError';
  }
}

/** Calls the API and returns the parsed JSON (undefined for 204). Throws ApiError on failure. */
export async function api<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = res.status === 204 ? '' : await res.text();
  let parsed: unknown;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) throw new ApiError(res.status, parsed);
  return parsed as T;
}

/** Sends a file as the raw request body (its own Content-Type) and returns the parsed JSON. Throws ApiError on failure. */
export async function uploadFile<T>(method: 'PUT' | 'POST', path: string, file: Blob): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: { 'content-type': file.type },
    body: file,
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }
  if (!res.ok) throw new ApiError(res.status, parsed);
  return parsed as T;
}
