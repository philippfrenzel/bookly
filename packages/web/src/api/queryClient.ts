/** QueryClient factory: retry policy and global handling of expired sessions. */
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';

/** Retries transient failures only: never 4xx, at most 3 times otherwise. */
export function defaultRetry(failureCount: number, error: unknown): boolean {
  return !(error instanceof ApiError && error.status < 500) && failureCount < 3;
}

/** Creates the app's QueryClient; a 401 from any query or mutation signs the user out locally. */
export function createQueryClient(retry: boolean | ((n: number, e: unknown) => boolean) = defaultRetry): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (e) => onApiError(client, e) }),
    mutationCache: new MutationCache({ onError: (e) => onApiError(client, e) }),
    defaultOptions: { queries: { retry } },
  });
  return client;
}

/** Marks the session as expired (RequireAuth then redirects to /login). */
function onApiError(client: QueryClient, error: unknown): void {
  if (error instanceof ApiError && error.status === 401) client.setQueryData(['me'], null);
}
