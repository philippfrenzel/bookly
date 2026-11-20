/** Route guard: renders children for signed-in users, otherwise redirects to /login. */
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useMe } from '../api/hooks';

/** Wraps protected routes. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.isPending) return <p className="muted center">Laden …</p>;
  if (!me.data) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
