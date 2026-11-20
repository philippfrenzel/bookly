/** TanStack Query hooks for auth, book list and the book aggregate. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookResponse, BookSummary, Id, SessionUser as User } from '@bookly/shared';
import { ApiError, api } from './client';

/** Current user, or null when not signed in (401 is not an error). */
export function useMe() {
  return useQuery<User | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api<{ user: User }>('GET', '/api/auth/me')).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
  });
}

/** Logs in; on success caches the user. */
export function useLogin() {
  const qc = useQueryClient();
  return useMutation<User, ApiError, { email: string; password: string }>({
    mutationFn: async (vars) => (await api<{ user: User }>('POST', '/api/auth/login', vars)).user,
    onSuccess: (user) => qc.setQueryData(['me'], user),
  });
}

/** Registers a new account; on success caches the user. */
export function useRegister() {
  const qc = useQueryClient();
  return useMutation<User, ApiError, { email: string; password: string; displayName: string }>({
    mutationFn: async (vars) => (await api<{ user: User }>('POST', '/api/auth/register', vars)).user,
    onSuccess: (user) => qc.setQueryData(['me'], user),
  });
}

/** Logs out and clears all cached data. */
export function useLogout() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, void>({
    mutationFn: () => api<void>('POST', '/api/auth/logout'),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(['me'], null);
    },
  });
}

/** The signed-in user's books. */
export function useBooks() {
  return useQuery({ queryKey: ['books'], queryFn: () => api<BookSummary[]>('GET', '/api/books') });
}

/** Creates a book and seeds the book cache with the response. */
export function useCreateBook() {
  const qc = useQueryClient();
  return useMutation<BookResponse, ApiError, { title: string }>({
    mutationFn: (vars) => api<BookResponse>('POST', '/api/books', vars),
    onSuccess: (res) => {
      qc.setQueryData(['book', res.book.id], res);
      return qc.invalidateQueries({ queryKey: ['books'] });
    },
  });
}

/** One book aggregate with hints. */
export function useBook(bookId: Id) {
  return useQuery({ queryKey: ['book', bookId], queryFn: () => api<BookResponse>('GET', `/api/books/${bookId}`) });
}

/** Generic book mutation; the BookResponse replaces the cached aggregate on success. */
export function useBookMutation<V>(
  bookId: Id,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: (vars: V) => string,
  body?: (vars: V) => unknown,
) {
  const qc = useQueryClient();
  return useMutation<BookResponse, ApiError, V>({
    mutationFn: (vars) => api<BookResponse>(method, path(vars), body?.(vars)),
    onSuccess: (res) => qc.setQueryData(['book', bookId], res),
  });
}

/** Renames a book (PATCH) and refreshes the list and the cached aggregate. */
export function useRenameBook() {
  const qc = useQueryClient();
  return useMutation<BookResponse, ApiError, { id: Id; title: string }>({
    mutationFn: (v) => api<BookResponse>('PATCH', `/api/books/${v.id}`, { title: v.title }),
    onSuccess: (res) => {
      qc.setQueryData(['book', res.book.id], res);
      return qc.invalidateQueries({ queryKey: ['books'] });
    },
  });
}

/** Deletes a book with all its storylines; drops it from the caches. */
export function useDeleteBook() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { id: Id }>({
    mutationFn: (v) => api<void>('DELETE', `/api/books/${v.id}`),
    onSuccess: (_res, v) => {
      qc.removeQueries({ queryKey: ['book', v.id] });
      return qc.invalidateQueries({ queryKey: ['books'] });
    },
  });
}
