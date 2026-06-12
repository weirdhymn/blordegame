import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { resolve } from '@blorse/genetics';
import { buildRenderSpec } from '@blorse/render-core';
import { breed, getBreedOdds, type BreedOdds, type BreedSuccess } from '../api/breeding.js';
import { ApiError } from '../api/client.js';
import { listHerdHorses, type Horse } from '../api/horses.js';
import { getStudbook } from '../api/studbook.js';
import { useLoad } from '../hooks/useLoad.js';
import { HorseCanvas } from '../render/HorseCanvas.js';
import { useSession } from '../session.js';

export function BreedPage(): ReactElement {
  const { herd, refresh } = useSession();
  const herdLoad = useLoad(
    useCallback(
      async () =>
        herd ? (await listHerdHorses(herd.id)).filter((h) => h.lifeStage === 'adult') : [],
      [herd],
    ),
  );
  const horses = herdLoad.data ?? [];
  // The Registrar's open requests (§7m) — direction for the pairing, never an obligation.
  const book = useLoad(useCallback(() => getStudbook(), []));
  const seeking = (book.data?.goals ?? []).filter((g) => !g.done).slice(0, 3);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [odds, setOdds] = useState<BreedOdds | null>(null);
  const [result, setResult] = useState<BreedSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false); // herd_full → link to the progression screen
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setResult(null);
    // Stale-response guard (audit P1): only the CURRENT pair's odds may land — a slower
    // earlier response must not overwrite them (it gates the Breed button via `related`).
    let live = true;
    if (a && b && a !== b) {
      getBreedOdds(a, b)
        .then((o) => {
          if (live) setOdds(o);
        })
        .catch(() => {
          if (live) setOdds(null);
        });
    } else {
      setOdds(null);
    }
    return () => {
      live = false;
    };
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
      {seeking.length > 0 && (
        <p className="muted">
          📖 The Registrar currently seeks: {seeking.map((s) => s.title).join(' · ')} —{' '}
          <Link to="/town/studbook">the Studbook</Link> pays in Cubes and good ink.
        </p>
      )}
      {/* Breeding station: controls on the left, the live foal-odds + result on the right.
          Stacks to one column on narrow screens. */}
      <div className="breed-grid">
        <div className="breed-controls">
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

          <button
            className="primary"
            disabled={!a || !b || a === b || busy || (odds?.related ?? false)}
            onClick={() => void onBreed()}
          >
            {busy ? 'Breeding…' : 'Breed'}
          </button>

          {(error ?? herdLoad.error) && (
            <div className="error" role="alert">
              {error ?? herdLoad.error}
              {blocked && (
                <>
                  {' '}
                  <Link to="/">→ Grow your Herd Tier</Link>
                </>
              )}
            </div>
          )}
        </div>

        <div className="breed-outcome">
          {odds && (
            <div className="card odds">
              <h2 className="section-h">
                Foal odds{' '}
                {odds.related && <span className="warn">· related — can&apos;t breed</span>}
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
              {odds.carriers.length > 0 && (
                <p className="muted carrier-whisper">
                  🧐 The Registrar squints: carried quietly —{' '}
                  {odds.carriers
                    .map((c) => `${c.label} (${Math.round(c.pLive * 100)}%)`)
                    .join(' · ')}
                  . What hides in the parents may surface in the foal.
                </p>
              )}
              {odds.bond && (
                <p className="wild">
                  💞 These two are {odds.bond.type === 'bonded' ? 'inseparable' : 'close'} — their
                  foal would start <strong>+{odds.bond.statBonus} in every stat</strong>.
                </p>
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
                  💞 Born of a bond — it starts life{' '}
                  <strong>+{result.bond.bonus} in every stat</strong>.
                </p>
              )}
            </div>
          )}
          {result && !result.viable && (
            <div className="card">
              <p>{result.message}</p>
            </div>
          )}
          {!odds && !result && (
            <p className="muted">Pick two parents to preview the foal&apos;s odds.</p>
          )}
        </div>
      </div>
    </div>
  );
}
