import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { getInventory } from '../api/explore.js';
import { fileReport } from '../api/moderation.js';
import { getContacts, getInbox, readAllMail, sendMessage } from '../api/social.js';
import { useLoad } from '../hooks/useLoad.js';
import { useSession } from '../session.js';
import { pretty } from '../util/format.js';

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
      const [letters, contacts, inv] = await Promise.all([
        getInbox(),
        getContacts(),
        getInventory(),
      ]);
      return { letters, contacts, inv };
    }, []),
  );
  const letters = inbox.data?.letters ?? [];
  const contacts = inbox.data?.contacts ?? [];
  const inv = inbox.data?.inv ?? [];

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
  // The parcel under assembly (§7s) — up to 5 stacks ride the letter.
  const [parcel, setParcel] = useState<{ id: string; qty: number }[]>([]);
  const [packItem, setPackItem] = useState('');
  const [packQty, setPackQty] = useState(1);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const heldQty = (itemId: string): number => inv.find((s) => s.id === itemId)?.qty ?? 0;
  const packedQty = (itemId: string): number => parcel.find((s) => s.id === itemId)?.qty ?? 0;

  function addToParcel(): void {
    if (!packItem || packQty < 1) return;
    const qty = Math.min(packQty, 20, heldQty(packItem) - packedQty(packItem));
    if (qty < 1 || parcel.length >= 5) return;
    setParcel((p) => {
      const existing = p.find((s) => s.id === packItem);
      return existing
        ? p.map((s) => (s.id === packItem ? { ...s, qty: Math.min(20, s.qty + qty) } : s))
        : [...p, { id: packItem, qty }];
    });
    setPackQty(1);
  }

  async function send(recipient: string, text: string): Promise<void> {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await sendMessage(recipient, text, parcel);
      setNote(
        parcel.length > 0
          ? 'Posted, parcel and all. The string held.'
          : 'Posted. The Post Office thanks you for writing legibly.',
      );
      setBody('');
      setParcel([]);
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
            {/* A Parcel, With String (§7s): tie up to five small stacks to the letter. */}
            <div className="parcel-pack">
              <span className="muted">📦 Tie on a parcel (optional):</span>
              <div className="row-actions">
                <select
                  value={packItem}
                  onChange={(e) => setPackItem(e.target.value)}
                  aria-label="Item to add to the parcel"
                >
                  <option value="">— from your stores —</option>
                  {inv
                    .filter((s) => s.qty - packedQty(s.id) > 0)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {pretty(s.id)} · have {s.qty - packedQty(s.id)}
                      </option>
                    ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={packQty}
                  onChange={(e) => setPackQty(Math.max(1, Number(e.target.value) || 1))}
                  aria-label="Quantity to add"
                  className="parcel-qty"
                />
                <button disabled={busy || !packItem || parcel.length >= 5} onClick={addToParcel}>
                  + Add
                </button>
              </div>
              {parcel.length > 0 && (
                <div className="card-row">
                  {parcel.map((s) => (
                    <button
                      key={s.id}
                      className="calling-card"
                      title="remove from parcel"
                      onClick={() => setParcel((p) => p.filter((x) => x.id !== s.id))}
                    >
                      {pretty(s.id)} ×{s.qty} ✕
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="row-actions">
              <button
                className="primary"
                disabled={busy || !toHerd.trim() || !body.trim()}
                onClick={() => void send(toHerd.trim(), body.trim())}
              >
                {parcel.length > 0 ? '📦 Post it, parcel and all' : '📮 Post it'}
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
                    {l.parcel && l.parcel.length > 0 && (
                      <p className="parcel-tag">
                        📦 Came with: {l.parcel.map((s) => `${pretty(s.id)} ×${s.qty}`).join(', ')}{' '}
                        — already in your stores.
                      </p>
                    )}
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
