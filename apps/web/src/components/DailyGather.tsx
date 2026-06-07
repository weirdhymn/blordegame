import { useEffect, useState, type ReactElement } from 'react';
import { ApiError } from '../api/client.js';
import {
  getQuests,
  getRegions,
  roam,
  type QuestView,
  type RegionView,
  type RoamResult,
} from '../api/explore.js';
import { useSession } from '../session.js';
import { pretty } from '../util/format.js';

/** The daily chore (§7) — passive gathering, capped at once per (adult) horse per day. Distinct from
 *  the grindable adventuring under the Adventure hub: a bigger stable simply gathers more, once a day. */
export function DailyGather(): ReactElement {
  const { refresh } = useSession();
  const [regions, setRegions] = useState<RegionView[]>([]);
  const [regionId, setRegionId] = useState('');
  const [quests, setQuests] = useState<QuestView[]>([]);
  const [res, setRes] = useState<RoamResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadQuests = (): void => {
    getQuests()
      .then(setQuests)
      .catch(() => {
        /* ignore */
      });
  };

  useEffect(() => {
    getRegions()
      .then((rs) => {
        setRegions(rs);
        const open = rs.find((r) => r.unlocked);
        if (open) setRegionId(open.id);
      })
      .catch(() => {
        /* ignore */
      });
    loadQuests();
  }, []);

  async function gather(): Promise<void> {
    if (!regionId) return;
    setBusy(true);
    setError(null);
    try {
      setRes(await roam(regionId));
      await refresh();
      loadQuests();
    } catch (e) {
      setRes(null);
      setError(e instanceof ApiError ? e.message : 'Could not gather.');
    } finally {
      setBusy(false);
    }
  }

  const unlocked = regions.filter((r) => r.unlocked);

  return (
    <section className="daily-gather card">
      <h2 className="section-h">🧺 Daily Gather</h2>
      <p className="muted">
        Send your stable out to forage — <strong>once per horse per day</strong>. A bigger herd
        gathers more. (Grindable expeditions live under <strong>Adventure</strong>.)
      </p>
      <div className="row-actions">
        <select value={regionId} onChange={(e) => setRegionId(e.target.value)} disabled={busy}>
          {unlocked.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button className="primary" disabled={busy || !regionId} onClick={() => void gather()}>
          {busy ? 'Foraging…' : '🧺 Forage'}
        </button>
      </div>
      {error && <div className="note">{error}</div>}
      {res && (
        <div className="note">
          <strong>
            {res.horsesGathered} of {res.herdSize}
          </strong>{' '}
          foraged →{' '}
          {res.found.length
            ? res.found.map((f) => `${pretty(f.id)} ×${f.qty}`).join(', ')
            : 'nothing this time'}
          .{res.questCompletions.length > 0 && <span className="rare"> ✦ Quest complete!</span>}
        </div>
      )}
      {quests.length > 0 && (
        <>
          <h3 className="section-h">Quests</h3>
          <ul className="list">
            {quests.map((q) => (
              <li key={q.questId}>
                <span>
                  {q.status === 'completed' ? '✓ ' : ''}
                  {q.title}
                  {q.objectives.length > 0 && (
                    <span className="muted">
                      {' '}
                      — {q.objectives.map((o) => `${o.label} ${o.have}/${o.need}`).join(', ')}
                    </span>
                  )}
                </span>
                {q.reward.cubes ? <span className="muted">{q.reward.cubes} ⬡</span> : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
