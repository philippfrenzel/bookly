/** Registration page. */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRegister } from '../api/hooks';

/** Account creation form. */
export function RegisterPage() {
  const navigate = useNavigate();
  const register = useRegister();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    register.mutate({ email, password, displayName }, { onSuccess: () => navigate('/') });
  };

  const message = register.isError
    ? register.error.status === 409
      ? 'Diese E-Mail ist bereits registriert.'
      : 'Registrierung fehlgeschlagen. Das Passwort braucht mindestens 8 Zeichen.'
    : null;

  return (
    <main className="auth-page">
      <form className="card" onSubmit={submit}>
        <h1>Registrieren</h1>
        <label>
          Anzeigename
          <input value={displayName} maxLength={200} onChange={(e) => setDisplayName(e.target.value)} required autoComplete="name" />
        </label>
        <label>
          E-Mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Passwort
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        </label>
        {message && (
          <p className="error" role="alert">
            {message}
          </p>
        )}
        <button type="submit" className="primary" disabled={register.isPending}>
          Registrieren
        </button>
        <p className="muted">
          Schon ein Konto? <Link to="/login">Anmelden</Link>
        </p>
      </form>
    </main>
  );
}
