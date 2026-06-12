import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { resolve } from '@blorse/genetics';
import { buildRenderSpec } from '@blorse/render-core';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import {
  getClubs,
  getContacts,
  getHerdProfile,
  getJournal,
  getRelationships,
  type HerdProfile,
  type ProfileHighlight,
} from '../api/social.js';
import { listHerdHorses } from '../api/horses.js';
import { fileReport } from '../api/moderation.js';
import { useLoad } from '../hooks/useLoad.js';
import { HorseCanvas } from '../render/HorseCanvas.js';
import { useSession } from '../session.js';
import { pretty } from '../util/format.js';

/** A visited horse's sprite (§7q). Adults arrive with render fields; foals arrive WITHOUT
 *  genotype (the reveal stays hidden, §4.2) — any stock genotype paints the same white. */
function VisitSprite({ h }: { h: ProfileHighlight }): ReactElement {
  const spec = useMemo(
    () =>
      buildRenderSpec(resolve(h.genotype ?? { E: 'ee' }), {
        seed: h.seed ?? 1,
        glitch: h.glitch ?? null,
        lifeStage: h.lifeStage === 'foal' ? 'foal' : 'adult',
      }),
    [h.genotype, h.seed, h.glitch, h.lifeStage],
  );
  return (
    <figure className="visit-sprite">
      <HorseCanvas spec={spec} scale={1} />
      <figcaption>
        <strong>{h.name ?? 'A horse'}</strong>
        <span className="muted"> — {h.displayName}</span>
      </figcaption>
    </figure>
  );
}

export function HerdPage(): ReactElement {
  const { herd } = useSession();
  const social = useLoad(
    useCallback(async () => {
      const [journal, clubs, rels, horses, contacts] = await Promise.all([
        getJournal(),
        getClubs(),
        getRelationships(),
        herd ? listHerdHorses(herd.id) : Promise.resolve([]),
        getContacts(),
      ]);
      return { journal, clubs, rels, horses, contacts };
    }, [herd]),
  );
  const journal = social.data?.journal ?? [];
  const clubs = social.data?.clubs ?? [];
  const rels = social.data?.rels ?? [];
  const contacts = social.data?.contacts ?? [];
  const nameOf = (id: string): string =>
    social.data?.horses.find((h) => h.id === id)?.name ?? 'a horse since departed';
  const [visitId, setVisitId] = useState('');
  const [profile, setProfile] = useState<HerdProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function visitHerd(id: string): Promise<void> {
    setError(null);
    setProfile(null);
    try {
      setProfile(await getHerdProfile(id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No such herd.');
    }
  }

  async function reportHerd(id: string): Promise<void> {
    const reason = window.prompt('Report this herd to the moderators — what happened?');
    if (!reason?.trim()) return;
    setError(null);
    try {
      await fileReport('herd', id, reason.trim());
      setError(null);
      window.alert('Reported. A moderator will read it — thank you.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The report did not go through.');
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
        {contacts.length > 0 && (
          <div className="card-row">
            {contacts.map((c) => (
              <button
                key={c.herdId}
                className="calling-card"
                onClick={() => {
                  setVisitId(c.herdId);
                  void visitHerd(c.herdId);
                }}
                title={`met by ${c.via}`}
              >
                {c.via === 'mail' ? '✉' : c.via === 'trade' ? '⚖' : '🛤'} {c.name}
              </button>
            ))}
          </div>
        )}
        <div className="row-actions">
          <label className="field">
            <span>Herd id</span>
            <input value={visitId} onChange={(e) => setVisitId(e.target.value)} />
          </label>
          <button disabled={!visitId} onClick={() => void visitHerd(visitId)}>
            Visit
          </button>
        </div>
        {profile && (
          <div className="card">
            <p>
              <strong>{profile.name}</strong>{' '}
              <span className="muted">
                · {profile.horseCount} horses · level {profile.level}
              </span>{' '}
              <button className="link-btn" onClick={() => void reportHerd(profile.id)}>
                ⚑ report
              </button>
            </p>
            <div className="visit-grid">
              {profile.highlights.map((h) => (
                <VisitSprite key={h.id} h={h} />
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
