import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { ApiError } from '../api/client.js';
import {
  adventure,
  getQuests,
  getRegions,
  roam,
  type AdventureResult,
  type QuestView,
  type RegionView,
  type RoamResult,
} from '../api/explore.js';
import { listHerdHorses, type Horse } from '../api/horses.js';
import { useSession } from '../session.js';
import { pretty } from '../util/format.js';

export function ExplorePage(): ReactElement {
  const { herd, refresh } = useSession();
  const [regions, setRegions] = useState<RegionView[]>([]);
  const [horses, setHorses] = useState<Horse[]>([]);
  const [quests, setQuests] = useState<QuestView[]>([]);
  const [regionId, setRegionId] = useState('');
  const [party, setParty] = useState<string[]>([]);
  const [adv, setAdv] = useState<AdventureResult | null>(null);
  const [roamRes, setRoamRes] = useState<RoamResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadQuests = useCallback(() => {
    getQuests()
      .then(setQuests)
      .catch(() => {
        /* ignore */
      });
  }, []);

  useEffect(() => {
    if (!herd) return;
    getRegions()
      .then((rs) => {
        setRegions(rs);
        const open = rs.find((r) => r.unlocked);
        if (open) setRegionId(open.id);
      })
      .catch(() => {
        /* ignore */
      });
    listHerdHorses(herd.id)
      .then((hs) => setHorses(hs.filter((h) => h.lifeStage === 'adult')))
      .catch(() => {
        /* ignore */
      });
    loadQuests();
  }, [herd, loadQuests]);

  function toggle(id: string): void {
    setParty((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 4 ? [...p, id] : p));
  }

  async function go(fn: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    setAdv(null);
    setRoamRes(null);
    try {
      await fn();
      await refresh();
      loadQuests();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not head out.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="explore">
      <h1>Explore</h1>
      <label className="field">
        <span>Region</span>
        <select value={regionId} onChange={(e) => setRegionId(e.target.value)}>
          {regions.map((r) => (
            <option key={r.id} value={r.id} disabled={!r.unlocked}>
              {r.name} · T{r.tier}
              {r.unlocked ? '' : ' (locked)'}
            </option>
          ))}
        </select>
      </label>

      <div className="row-actions">
        <button
          disabled={!regionId || busy}
          onClick={() => void go(async () => setRoamRes(await roam(regionId)))}
        >
          🧺 Roam (gather)
        </button>
      </div>
      {roamRes && (
        <div className="card">
          <p>
            Gathered:{' '}
            {roamRes.found.length
              ? roamRes.found.map((f) => `${pretty(f.id)} ×${f.qty}`).join(', ')
              : 'nothing this time'}
            .
          </p>
          {roamRes.questCompletions.length > 0 && <p className="rare">✦ Completed a quest!</p>}
        </div>
      )}

      <h2 className="section-h">Adventure — party ({party.length}/4)</h2>
      <div className="party-pick">
        {horses.map((h) => (
          <button
            key={h.id}
            className={party.includes(h.id) ? 'chip on' : 'chip'}
            onClick={() => toggle(h.id)}
          >
            {h.name ?? h.id.slice(0, 8)}
          </button>
        ))}
      </div>
      <button
        className="primary"
        disabled={!regionId || party.length === 0 || busy}
        onClick={() => void go(async () => setAdv(await adventure(regionId, party)))}
      >
        {busy ? 'Heading out…' : 'Set out'}
      </button>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {adv && (
        <div className="card adv-result">
          <h2 className="section-h">
            {adv.successes} / {adv.encounters.length} encounters won
          </h2>
          <div className="dice">
            {adv.encounters.map((e, i) => (
              <span key={i} className={e.success ? 'die win' : 'die'}>
                {e.crit ? '★' : e.d20} {e.success ? '✓' : '✗'}
              </span>
            ))}
          </div>
          {adv.loot.length > 0 && (
            <p>Loot: {adv.loot.map((l) => `${pretty(l.id)} ×${l.qty}`).join(', ')}</p>
          )}
          {adv.rareFound > 0 && <p className="rare">✦ Found a rare item!</p>}
          {adv.wild && (
            <p className="wild">
              A wild {adv.wild.name} appeared
              {adv.wild.toTavern ? ' — it fled to the Tavern.' : ' and vanished.'}
            </p>
          )}
        </div>
      )}

      <h2 className="section-h">Quests</h2>
      {quests.length === 0 ? (
        <p className="muted">No quests yet.</p>
      ) : (
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
      )}
    </div>
  );
}
