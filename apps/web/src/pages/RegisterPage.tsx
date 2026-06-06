import { useState, type FormEvent, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import { useSession } from '../session.js';

export function RegisterPage(): ReactElement {
  const { setSession } = useSession();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await register(username.trim(), password, inviteCode.trim() || undefined);
      setSession(res.user, res.herd);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create a herd.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <h1>blorsegame</h1>
      <p className="sub">Start a new herd. You begin with two horses and a few Cubes.</p>
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
            autoComplete="new-password"
          />
        </label>
        <label className="field">
          <span>Invite code</span>
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            autoComplete="off"
          />
        </label>
        <p className="hint">Username 3–24 characters · password 8+ · invite code required.</p>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create herd'}
        </button>
      </form>
      <p className="sub">
        Already have a herd? <Link to="/login">Log in</Link>.
      </p>
    </main>
  );
}
