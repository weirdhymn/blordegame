import { useCallback, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import {
  getClubs,
  getHerdProfile,
  getInbox,
  getJournal,
  getRelationships,
  sendMessage,
  type HerdProfile,
} from '../api/social.js';
import { useLoad } from '../hooks/useLoad.js';
import { useSession } from '../session.js';
import { pretty } from '../util/format.js';

export function HerdPage(): ReactElement {
  const { herd } = useSession();
  const social = useLoad(
    useCallback(async () => {
      const [journal, clubs, rels, inbox] = await Promise.all([
        getJournal(),
        getClubs(),
        getRelationships(),
        getInbox(),
      ]);
      return { journal, clubs, rels, inbox };
    }, []),
  );
  const journal = social.data?.journal ?? [];
  const clubs = social.data?.clubs ?? [];
  const rels = social.data?.rels ?? [];
  const inbox = social.data?.inbox ?? [];
  const [visitId, setVisitId] = useState('');
  const [profile, setProfile] = useState<HerdProfile | null>(null);
  const [msgTo, setMsgTo] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(): Promise<void> {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await sendMessage(msgTo, msgBody);
      setNote('Message sent.');
      setMsgBody('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send.');
    } finally {
      setBusy(false);
    }
  }

  async function visit(): Promise<void> {
    setError(null);
    setProfile(null);
    try {
      setProfile(await getHerdProfile(visitId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No such herd.');
    }
  }

  return (
    <div className="herd">
      <h1>Your Herd</h1>
      <p className="muted">
        Your herd id: <code>{herd?.id}</code> — share it so others can visit, trade, or message you.
        The herd&apos;s full history lives in <Link to="/journal">📜 the Journal</Link>.
      </p>
      {note && <div className="note">{note}</div>}
      {(error ?? social.error) && (
        <div className="error" role="alert">
          {error ?? social.error}
        </div>
      )}
      {social.loading && <div className="loading">Loading…</div>}

      <section className="section">
        <h2 className="section-h">Journal</h2>
        {journal.length === 0 ? (
          <p className="muted">
            Quiet so far — the story fills in as days pass (use the daily check-in on the Pasture,
            or the time controls in the admin Debug panel).
          </p>
        ) : (
          <ul className="journal-list">
            {journal.map((ev) => (
              <li key={ev.id}>
                <span className="glyph">{ev.glyph ?? '•'}</span> {ev.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2 className="section-h">Clubs</h2>
        {clubs.length === 0 ? (
          <p className="muted">None yet — build a Library/Meeting Hall and let the days pass.</p>
        ) : (
          <div className="guide-grid">
            {clubs.map((c) => (
              <div className="guide-chip" key={c.id}>
                {pretty(c.type)} ({c.members.length})
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="section-h">Relationships</h2>
        {rels.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <ul className="list">
            {rels.map((r) => (
              <li key={r.id}>
                <span>{r.type ?? 'acquainted'}</span>
                <span className="muted">affinity {r.affinity}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2 className="section-h">Messages</h2>
        {inbox.length === 0 ? (
          <p className="muted">Inbox empty.</p>
        ) : (
          <ul className="list">
            {inbox.map((m) => (
              <li key={m.id}>
                <span>{m.body}</span>
              </li>
            ))}
          </ul>
        )}
        <h3 className="section-h">Send a message</h3>
        <div className="row-actions">
          <label className="field">
            <span>To herd (id)</span>
            <input value={msgTo} onChange={(e) => setMsgTo(e.target.value)} />
          </label>
          <label className="field">
            <span>Message</span>
            <input value={msgBody} onChange={(e) => setMsgBody(e.target.value)} maxLength={500} />
          </label>
          <button
            className="primary"
            disabled={busy || !msgTo || !msgBody}
            onClick={() => void send()}
          >
            Send
          </button>
        </div>
      </section>

      <section className="section">
        <h2 className="section-h">Visit another herd</h2>
        <div className="row-actions">
          <label className="field">
            <span>Herd id</span>
            <input value={visitId} onChange={(e) => setVisitId(e.target.value)} />
          </label>
          <button disabled={!visitId} onClick={() => void visit()}>
            Visit
          </button>
        </div>
        {profile && (
          <div className="card">
            <p>
              <strong>{profile.name}</strong>{' '}
              <span className="muted">
                · {profile.horseCount} horses · level {profile.level}
              </span>
            </p>
            <div className="guide-grid">
              {profile.highlights.map((h) => (
                <div className="guide-chip" key={h.id}>
                  {h.name ?? 'A horse'} — {h.displayName}
                </div>
              ))}
            </div>
            {profile.recentJournal.length > 0 && (
              <ul className="journal-list">
                {profile.recentJournal.map((j, i) => (
                  <li key={i}>
                    <span className="glyph">{j.glyph ?? '•'}</span> {j.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
