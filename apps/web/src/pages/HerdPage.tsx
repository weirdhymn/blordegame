import { useCallback, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import {
  getClubs,
  getHerdProfile,
  getJournal,
  getRelationships,
  type HerdProfile,
} from '../api/social.js';
import { listHerdHorses } from '../api/horses.js';
import { useLoad } from '../hooks/useLoad.js';
import { useSession } from '../session.js';
import { pretty } from '../util/format.js';

export function HerdPage(): ReactElement {
  const { herd } = useSession();
  const social = useLoad(
    useCallback(async () => {
      const [journal, clubs, rels, horses] = await Promise.all([
        getJournal(),
        getClubs(),
        getRelationships(),
        herd ? listHerdHorses(herd.id) : Promise.resolve([]),
      ]);
      return { journal, clubs, rels, horses };
    }, [herd]),
  );
  const journal = social.data?.journal ?? [];
  const clubs = social.data?.clubs ?? [];
  const rels = social.data?.rels ?? [];
  const nameOf = (id: string): string =>
    social.data?.horses.find((h) => h.id === id)?.name ?? 'a horse since departed';
  const [visitId, setVisitId] = useState('');
  const [profile, setProfile] = useState<HerdProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

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
                <span>
                  {r.type === 'bonded' ? '💞' : r.type === 'rival' ? '⚡' : '🤝'}{' '}
                  <strong>{nameOf(r.horseA)}</strong> &amp; <strong>{nameOf(r.horseB)}</strong>{' '}
                  <span className="muted">— {r.type ?? 'acquainted'}</span>
                </span>
                <span className="muted">affinity {r.affinity}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2 className="section-h">Messages</h2>
        <p className="muted">
          Mail lives at <Link to="/town/post">📮 the Post Office</Link> now — letters arrive with
          sender names, and the Town tab counts the unread ones.
        </p>
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
