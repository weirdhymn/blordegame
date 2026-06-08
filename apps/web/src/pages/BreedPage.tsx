import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { resolve } from '@blorse/genetics';
import { buildRenderSpec } from '@blorse/render-core';
import { breed, getBreedOdds, type BreedOdds, type BreedSuccess } from '../api/breeding.js';
import { ApiError } from '../api/client.js';
import { listHerdHorses, type Horse } from '../api/horses.js';
import { HorseCanvas } from '../render/HorseCanvas.js';
import { useSession } from '../session.js';

export function BreedPage(): ReactElement {
  const { herd, refresh } = useSession();
  const [horses, setHorses] = useState<Horse[]>([]);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [odds, setOdds] = useState<BreedOdds | null>(null);
  const [result, setResult] = useState<BreedSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false); // herd_full → link to the progression screen
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!herd) return;
    listHerdHorses(herd.id)
      .then((hs) => setHorses(hs.filter((h) => h.lifeStage === 'adult')))
      .catch(() => {
        /* ignore */
      });
  }, [herd]);

  useEffect(() => {
    setResult(null);
    if (a && b && a !== b) {
      getBreedOdds(a, b)
        .then(setOdds)
        .catch(() => setOdds(null));
    } else {
      setOdds(null);
    }
  }, [a, b]);

  async function onBreed(): Promise<void> {
    if (!a || !b) return;
    setBusy(true);
    setError(null);
    setBlocked(false);
    setResult(null);
    try {
      const r = await breed(a, b);
      setResult(r);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Breeding failed.');
      setBlocked(e instanceof ApiError && e.code === 'herd_full');
    } finally {
      setBusy(false);
    }
  }

  const foalSpec =
    result && result.viable
      ? buildRenderSpec(resolve(result.foal.genotype), {
          seed: result.foal.seed,
          glitch: result.foal.glitch,
          lifeStage: result.foal.lifeStage,
        })
      : null;

  const option = (h: Horse, other: string): ReactElement => (
    <option key={h.id} value={h.id} disabled={h.id === other}>
      {h.name ?? h.id.slice(0, 8)}
    </option>
  );

  return (
    <div className="breed">
      <h1>Breed</h1>
      <p className="sub">Pick two adults. Closely related horses can&apos;t breed.</p>
      <div className="picker">
        <label className="field">
          <span>Parent A</span>
          <select value={a} onChange={(e) => setA(e.target.value)}>
            <option value="">— choose —</option>
            {horses.map((h) => option(h, b))}
          </select>
        </label>
        <label className="field">
          <span>Parent B</span>
          <select value={b} onChange={(e) => setB(e.target.value)}>
            <option value="">— choose —</option>
            {horses.map((h) => option(h, a))}
          </select>
        </label>
      </div>

      {odds && (
        <div className="card odds">
          <h2 className="section-h">
            Foal odds {odds.related && <span className="warn">· related — can&apos;t breed</span>}
          </h2>
          <div className="swatches">
            {odds.distribution.map((c) => (
              <div className="swatch-row" key={c.name}>
                <span className="swatch" style={{ background: c.swatch }} />
                <span className="swatch-name">{c.name}</span>
                <span className="swatch-p">{Math.round(c.pLive * 100)}%</span>
              </div>
            ))}
          </div>
          {odds.lethalFraction > 0 && (
            <p className="hint">
              {Math.round(odds.lethalFraction * 100)}% of crosses don&apos;t take.
            </p>
          )}
          {odds.bond && (
            <p className="wild">
              💞 These two are {odds.bond.type === 'bonded' ? 'inseparable' : 'close'} — their foal
              would start <strong>+{odds.bond.statBonus} in every stat</strong>.
            </p>
          )}
        </div>
      )}

      <button
        className="primary"
        disabled={!a || !b || a === b || busy || (odds?.related ?? false)}
        onClick={() => void onBreed()}
      >
        {busy ? 'Breeding…' : 'Breed'}
      </button>

      {error && (
        <div className="error" role="alert">
          {error}
          {blocked && (
            <>
              {' '}
              <Link to="/">→ Grow your Herd Tier</Link>
            </>
          )}
        </div>
      )}
      {result && result.viable && foalSpec && (
        <div className="card foal-result">
          <h2 className="section-h">A new foal!</h2>
          <HorseCanvas spec={foalSpec} scale={3} />
          <p className="horse-name">{result.foal.name ?? 'Unnamed'}</p>
          <p className="sub">It renders white until it grows up.</p>
          {result.bond && (
            <p className="wild">
              💞 Born of a bond — it starts life <strong>+{result.bond.bonus} in every stat</strong>
              .
            </p>
          )}
        </div>
      )}
      {result && !result.viable && (
        <div className="card">
          <p>{result.message}</p>
        </div>
      )}
    </div>
  );
}
