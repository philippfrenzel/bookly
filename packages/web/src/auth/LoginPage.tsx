/** Login page. */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLogin } from '../api/hooks';

/** Email/password sign-in form. */
export function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate('/') });
  };

  return (
    <main className="auth-page">
      <form className="card" onSubmit={submit}>
        <h1>Anmelden</h1>
        <label>
          E-Mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Passwort
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        {login.isError && (
          <p className="error" role="alert">
            {login.error.status === 401 ? 'E-Mail oder Passwort ist falsch.' : 'Anmeldung fehlgeschlagen.'}
          </p>
        )}
        <button type="submit" className="primary" disabled={login.isPending}>
          Anmelden
        </button>
        <p className="muted">
          Noch kein Konto? <Link to="/register">Registrieren</Link>
        </p>
      </form>
    </main>
  );
}
