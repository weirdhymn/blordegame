import { useCallback, useState, type ReactElement } from 'react';
import { ApiError } from '../api/client.js';
import {
  closeReport,
  freezeUser,
  getModReports,
  getModStats,
  type ModReport,
} from '../api/moderation.js';
import { useLoad } from '../hooks/useLoad.js';
import { useSession } from '../session.js';

/** The Mod Desk (§7r) — the queue, the numbers, and the heavy hammer. Role-gated: the
 *  server 403s everyone else; the nav only shows it to mods/admins. Cozy game, boring desk —
 *  exactly as a mod desk should be. */
export function ModDeskPage(): ReactElement {
  const { user } = useSession();
  const desk = useLoad(
    useCallback(async () => {
      const [reports, stats] = await Promise.all([getModReports(), getModStats()]);
      return { reports, stats };
    }, []),
  );
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [freezeId, setFreezeId] = useState('');

  async function act(fn: () => Promise<unknown>, msg: string): Promise<void> {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await fn();
      setNote(msg);
      desk.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The desk declined.');
    } finally {
      setBusy(false);
    }
  }

  const close = (r: ModReport, status: 'resolved' | 'dismissed'): void =>
    void act(() => closeReport(r.id, status), `Report ${status}. The queue thanks you.`);

  return (
    <div className="mod-desk">
      <h1>🛡 The Mod Desk</h1>
      <p className="sub">
        The unglamorous chair. Reports drain here; the numbers keep honest; the freeze button is for
        emergencies and regrets.
      </p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {note && <div className="note">{note}</div>}
      {desk.error && (
        <div className="error" role="alert">
          {desk.error}
        </div>
      )}
      {desk.loading && <div className="loading">Loading…</div>}

      {desk.data && (
        <>
          <div className="stats">
            <div className="stat">
              <span className="stat-n">{desk.data.stats.users}</span>
              <span className="stat-l">users</span>
            </div>
            <div className="stat">
              <span className="stat-n">{desk.data.stats.herds}</span>
              <span className="stat-l">herds</span>
            </div>
            <div className="stat">
              <span className="stat-n">{desk.data.stats.horses}</span>
              <span className="stat-l">horses</span>
            </div>
            <div className="stat">
              <span className="stat-n">{desk.data.stats.openReports}</span>
              <span className="stat-l">open reports</span>
            </div>
          </div>

          <section>
            <h2 className="section-h">The queue</h2>
            {desk.data.reports.length === 0 ? (
              <div className="card placeholder">
                <p>Empty. Somewhere, a kettle is on. Enjoy it while it lasts.</p>
              </div>
            ) : (
              <ul className="letter-list">
                {desk.data.reports.map((r) => (
                  <li key={r.id} className="letter">
                    <div className="letter-head">
                      <strong>
                        {r.targetType}: <code>{r.targetId}</code>
                      </strong>
                      <span className="muted">{new Date(r.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="letter-body">{r.reason}</p>
                    <p className="muted">
                      reported by <code>{r.reporterHerd ?? 'unknown'}</code>
                    </p>
                    <div className="row-actions">
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => close(r, 'resolved')}
                      >
                        ✓ Resolved
                      </button>
                      <button disabled={busy} onClick={() => close(r, 'dismissed')}>
                        ✕ Dismiss
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {user?.role === 'admin' && (
            <section className="card compose-card">
              <h2 className="section-h">❄ Freeze (admin)</h2>
              <p className="muted">
                A frozen account can read but not act. Use the USER id (the audit log and report
                rows carry it). Unfreeze undoes it completely — no harm lingers.
              </p>
              <div className="row-actions">
                <input
                  value={freezeId}
                  onChange={(e) => setFreezeId(e.target.value)}
                  placeholder="user id"
                  aria-label="User id to freeze or unfreeze"
                />
                <button
                  disabled={busy || !freezeId.trim()}
                  onClick={() =>
                    window.confirm('Freeze this account? They keep read access only.') &&
                    void act(() => freezeUser(freezeId.trim(), true), 'Frozen.')
                  }
                >
                  ❄ Freeze
                </button>
                <button
                  disabled={busy || !freezeId.trim()}
                  onClick={() => void act(() => freezeUser(freezeId.trim(), false), 'Thawed.')}
                >
                  ☀ Unfreeze
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
