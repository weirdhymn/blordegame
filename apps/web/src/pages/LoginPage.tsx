import { useState, type FormEvent, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import { useSession } from '../session.js';

export function LoginPage(): ReactElement {
  const { setSession } = useSession();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await login(username.trim(), password);
      setSession(res.user, res.herd);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <h1>blorsegame</h1>
      <p className="sub">Welcome back to the herd.</p>
      <form className="card" onSubmit={(e) => void onSubmit(e)}>
        <label className="field">
          <span>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="sub">
        No herd yet? <Link to="/register">Create one</Link>.
      </p>
    </main>
  );
}
