import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { fileReport } from '../api/moderation.js';
import { getContacts, getInbox, readAllMail, sendMessage } from '../api/social.js';
import { useLoad } from '../hooks/useLoad.js';
import { useSession } from '../session.js';

function postmark(ms: number): string {
  const d = new Date(ms);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

/** The Post Office (§7p) — the boarded-up façade, open at last. Player mail with real sender
 *  names, replies, and the Post Office's own letters (the §10 recruit notice among them).
 *  Opening the page reads everything — one stamp, no per-letter ceremony. */
export function PostOfficePage(): ReactElement {
  const { herd, refresh, unreadMail } = useSession();
  const inbox = useLoad(
    useCallback(async () => {
      const [letters, contacts] = await Promise.all([getInbox(), getContacts()]);
      return { letters, contacts };
    }, []),
  );
  const letters = inbox.data?.letters ?? [];
  const contacts = inbox.data?.contacts ?? [];

  // Walking in reads the mail: stamp once per visit (a ref survives StrictMode's
  // double-mount), then refresh the session so the Town tab's number clears.
  const stamped = useRef(false);
  useEffect(() => {
    if (stamped.current || unreadMail === 0) return;
    stamped.current = true;
    void readAllMail().then(() => refresh());
  }, [unreadMail, refresh]);

  const [toHerd, setToHerd] = useState('');
  const [body, setBody] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(recipient: string, text: string): Promise<void> {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await sendMessage(recipient, text);
      setNote('Posted. The Post Office thanks you for writing legibly.');
      setBody('');
      inbox.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The letter came back, stampless.');
    } finally {
      setBusy(false);
    }
  }

  // A report needs a reason in the player's words (§7r) — prompt keeps it one gesture.
  async function reportSender(senderHerd: string): Promise<void> {
    const reason = window.prompt('Report this sender to the moderators — what happened?');
    if (!reason?.trim()) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await fileReport('herd', senderHerd, reason.trim());
      setNote('Reported. A moderator will read it — thank you.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The report did not go through.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="post-office">
      <Link className="back-link" to="/town">
        ← The Town
      </Link>
      <h1>📮 The Post Office</h1>
      <p className="sub">
        Open at last — the sign finally meant it. Letters from other herds arrive here, and the Post
        Office writes a few of its own. Walking in counts as reading everything.
      </p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {note && <div className="note">{note}</div>}
      {inbox.error && (
        <div className="error" role="alert">
          {inbox.error}
        </div>
      )}
      {inbox.loading && <div className="loading">Loading…</div>}

      {inbox.data && (
        <>
          <section className="card compose-card">
            <h2 className="section-h">✒ Write a letter</h2>
            {contacts.length > 0 ? (
              <div className="row-actions">
                <select
                  value={contacts.some((c) => c.herdId === toHerd) ? toHerd : ''}
                  onChange={(e) => setToHerd(e.target.value)}
                  aria-label="Recipient from your calling cards"
                >
                  <option value="">— your calling cards —</option>
                  {contacts.map((c) => (
                    <option key={c.herdId} value={c.herdId}>
                      {c.name} · met by {c.via}
                    </option>
                  ))}
                </select>
                <span className="muted">or paste an id:</span>
                <input
                  value={toHerd}
                  onChange={(e) => setToHerd(e.target.value)}
                  placeholder="herd id"
                  aria-label="Recipient herd id"
                />
              </div>
            ) : (
              <div className="row-actions">
                <input
                  value={toHerd}
                  onChange={(e) => setToHerd(e.target.value)}
                  placeholder="recipient herd id"
                  aria-label="Recipient herd id"
                />
                <span className="muted">
                  Write someone once and they join your calling cards — no more ids.
                </span>
              </div>
            )}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Dear neighbor…"
              aria-label="Letter body"
            />
            <div className="row-actions">
              <button
                className="primary"
                disabled={busy || !toHerd.trim() || !body.trim()}
                onClick={() => void send(toHerd.trim(), body.trim())}
              >
                📮 Post it
              </button>
            </div>
          </section>

          <section>
            <h2 className="section-h">Your letters</h2>
            {letters.length === 0 ? (
              <div className="card placeholder">
                <p>
                  The pigeonhole with your name on it is empty. The clerk assures you this is not
                  personal.
                </p>
              </div>
            ) : (
              <ul className="letter-list">
                {letters.map((l) => (
                  <li key={l.id} className={`letter${l.read ? '' : ' letter-unread'}`}>
                    <div className="letter-head">
                      <strong>
                        {l.fromName === null ? '📯 The Post Office' : `✉ ${l.fromName}`}
                      </strong>
                      <span className="muted">{postmark(l.createdAt)}</span>
                    </div>
                    <p className="letter-body">{l.body}</p>
                    {l.fromHerd && herd && l.fromHerd !== herd.id && (
                      <div className="row-actions">
                        <button
                          disabled={busy}
                          onClick={() => {
                            setToHerd(l.fromHerd!);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        >
                          ↩ Reply
                        </button>
                        <button
                          className="link-btn"
                          disabled={busy}
                          onClick={() => void reportSender(l.fromHerd!)}
                        >
                          ⚑ report
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
