import { useEffect, useState, type ReactElement } from 'react';
import { ApiError } from '../api/client.js';
import { adventure, getRegions, type AdventureResult, type RegionView } from '../api/explore.js';
import { listHerdHorses, type Horse } from '../api/horses.js';
import { useSession } from '../session.js';

export function ExplorePage(): ReactElement {
  const { herd, refresh } = useSession();
  const [regions, setRegions] = useState<RegionView[]>([]);
  const [horses, setHorses] = useState<Horse[]>([]);
  const [regionId, setRegionId] = useState('');
  const [party, setParty] = useState<string[]>([]);
  const [result, setResult] = useState<AdventureResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  }, [herd]);

  function toggle(id: string): void {
    setParty((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 4 ? [...p, id] : p));
  }

  async function onGo(): Promise<void> {
    if (!regionId || party.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await adventure(regionId, party);
      setResult(r);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The adventure could not start.');
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

      <h2 className="section-h">Party ({party.length}/4)</h2>
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
        onClick={() => void onGo()}
      >
        {busy ? 'Adventuring…' : 'Set out'}
      </button>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {result && (
        <div className="card adv-result">
          <h2 className="section-h">
            {result.successes} / {result.encounters.length} encounters won
          </h2>
          <div className="dice">
            {result.encounters.map((e, i) => (
              <span key={i} className={e.success ? 'die win' : 'die'}>
                {e.crit ? '★' : e.d20} {e.success ? '✓' : '✗'}
              </span>
            ))}
          </div>
          {result.loot.length > 0 && (
            <p>Loot: {result.loot.map((l) => `${l.id} ×${l.qty}`).join(', ')}</p>
          )}
          {result.rareFound > 0 && (
            <p className="rare">
              ✦ Found {result.rareFound} rare item{result.rareFound > 1 ? 's' : ''}!
            </p>
          )}
          {result.wild && (
            <p className="wild">
              A wild {result.wild.name} appeared
              {result.wild.toTavern ? ' — it fled to the Tavern.' : ' and vanished.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
