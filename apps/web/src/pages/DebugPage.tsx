import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { ApiError } from '../api/client.js';
import {
  advanceDays,
  grant,
  inspectHorse,
  inspectRuns,
  matureHorse,
  mintHorse,
  reset,
  tick,
} from '../api/debug.js';
import { listHerdHorses, type Horse } from '../api/horses.js';
import { useSession } from '../session.js';
import { pretty } from '../util/format.js';

const OCEAN = [
  { key: 'o', label: 'Openness' },
  { key: 'c', label: 'Conscientiousness' },
  { key: 'e', label: 'Extraversion' },
  { key: 'a', label: 'Agreeableness' },
  { key: 'n', label: 'Neuroticism' },
];
const STAT_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const GENOTYPES: Record<string, Record<string, string>> = {
  Bay: { E: 'Ee', A: 'Aa' },
  Black: { E: 'Ee', A: 'aa' },
  Chestnut: { E: 'ee' },
  Gray: { G: 'Gg', E: 'Ee', A: 'Aa' },
};
const ITEM_IDS = [
  'marsh-sage',
  'healing-potion',
  'plant-fiber',
  'timber',
  'clay',
  'ore',
  'plank',
  'brick',
  'paper',
  'ingot',
  'book',
  'board-game',
  'tool',
  'rare-gem',
];

export function DebugPage(): ReactElement {
  const { user, herd, refresh } = useSession();
  const [horses, setHorses] = useState<Horse[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);

  const [grantCubes, setGrantCubes] = useState(100);
  const [grantItem, setGrantItem] = useState('marsh-sage');
  const [grantQty, setGrantQty] = useState(5);

  const [pers, setPers] = useState<Record<string, number>>({ o: 50, c: 50, e: 50, a: 50, n: 50 });
  const [stats, setStats] = useState<Record<string, number>>({
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
  });
  const [luck, setLuck] = useState(10);
  const [lifeStage, setLifeStage] = useState<'adult' | 'foal'>('adult');
  const [geno, setGeno] = useState('Bay');
  const [mintName, setMintName] = useState('');

  const [days, setDays] = useState(6);
  const [sel, setSel] = useState('');

  const loadHorses = useCallback(() => {
    if (herd)
      listHerdHorses(herd.id)
        .then(setHorses)
        .catch(() => {
          /* ignore */
        });
  }, [herd]);
  useEffect(() => {
    loadHorses();
  }, [loadHorses]);

  async function act(fn: () => Promise<unknown>, msg: string): Promise<void> {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await fn();
      await refresh();
      loadHorses();
      setNote(msg);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }
  async function dump(fn: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      setOut(JSON.stringify(await fn(), null, 2));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  if (user?.role !== 'admin') {
    return (
      <div className="debug">
        <h1>Debug</h1>
        <p className="muted">Admin only. This toolkit is for the tester account.</p>
      </div>
    );
  }

  const setP = (k: string, v: number): void => setPers((p) => ({ ...p, [k]: v }));
  const setS = (k: string, v: number): void => setStats((s) => ({ ...s, [k]: v }));
  const foals = horses.filter((h) => h.lifeStage === 'foal');

  return (
    <div className="debug">
      <h1>Debug toolkit</h1>
      <p className="muted">Admin-only shortcuts to existing game logic. Dev instances only.</p>
      {note && <div className="note">{note}</div>}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <section className="card">
        <h2 className="section-h">Grant</h2>
        <div className="row-actions">
          <label className="field">
            <span>Cubes</span>
            <input
              className="num"
              type="number"
              value={grantCubes}
              onChange={(e) => setGrantCubes(Number(e.target.value))}
            />
          </label>
          <button
            disabled={busy}
            onClick={() => void act(() => grant(grantCubes, []), `Granted ${grantCubes} ⬡.`)}
          >
            Grant Cubes
          </button>
        </div>
        <div className="row-actions">
          <label className="field">
            <span>Item</span>
            <select value={grantItem} onChange={(e) => setGrantItem(e.target.value)}>
              {ITEM_IDS.map((id) => (
                <option key={id} value={id}>
                  {pretty(id)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Qty</span>
            <input
              className="num"
              type="number"
              value={grantQty}
              onChange={(e) => setGrantQty(Number(e.target.value))}
            />
          </label>
          <button
            disabled={busy}
            onClick={() =>
              void act(
                () => grant(0, [{ id: grantItem, qty: grantQty }]),
                `Granted ${grantQty}× ${pretty(grantItem)}.`,
              )
            }
          >
            Grant item
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="section-h">Mint a custom horse</h2>
        <div className="row-actions">
          <button
            disabled={busy}
            onClick={() =>
              void act(
                () => mintHorse({ personality: { c: 60 }, lifeStage: 'adult', name: 'C60 Tester' }),
                'Minted a Conscientiousness-60 adult — it unlocks the herb-hunt sneak option.',
              )
            }
          >
            ⚡ Mint C-60 horse (sneak-gate)
          </button>
        </div>
        <div className="debug-grid">
          {OCEAN.map((t) => (
            <label className="field" key={t.key}>
              <span>{t.label}</span>
              <input
                className="num"
                type="number"
                min={0}
                max={100}
                value={pers[t.key] ?? 50}
                onChange={(e) => setP(t.key, Number(e.target.value))}
              />
            </label>
          ))}
        </div>
        <div className="debug-grid">
          {STAT_KEYS.map((s) => (
            <label className="field" key={s}>
              <span>{s.toUpperCase()}</span>
              <input
                className="num"
                type="number"
                min={1}
                max={20}
                value={stats[s] ?? 10}
                onChange={(e) => setS(s, Number(e.target.value))}
              />
            </label>
          ))}
          <label className="field">
            <span>Luck</span>
            <input
              className="num"
              type="number"
              min={1}
              max={20}
              value={luck}
              onChange={(e) => setLuck(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="row-actions">
          <label className="field">
            <span>Coat</span>
            <select value={geno} onChange={(e) => setGeno(e.target.value)}>
              {Object.keys(GENOTYPES).map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Life stage</span>
            <select
              value={lifeStage}
              onChange={(e) => setLifeStage(e.target.value as 'adult' | 'foal')}
            >
              <option value="adult">adult</option>
              <option value="foal">foal</option>
            </select>
          </label>
          <label className="field">
            <span>Name</span>
            <input
              value={mintName}
              onChange={(e) => setMintName(e.target.value)}
              placeholder="(random)"
            />
          </label>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void act(
                () =>
                  mintHorse({
                    genotype: GENOTYPES[geno],
                    personality: pers,
                    stats,
                    luck,
                    lifeStage,
                    name: mintName || undefined,
                  }),
                'Minted a custom horse.',
              )
            }
          >
            Mint
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="section-h">Time control</h2>
        <div className="row-actions">
          <button
            disabled={busy}
            onClick={() => void act(() => tick(), 'Advanced one daily tick.')}
          >
            ⏭ +1 tick
          </button>
          <label className="field">
            <span>Days</span>
            <input
              className="num"
              type="number"
              min={1}
              max={60}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </label>
          <button
            disabled={busy}
            onClick={() => void act(() => advanceDays(days), `Advanced ${days} days.`)}
          >
            ⏩ +{days} days
          </button>
        </div>
        <div className="row-actions">
          <label className="field">
            <span>Foal</span>
            <select value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="">— pick a horse —</option>
              {foals.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name ?? h.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={busy || !sel}
            onClick={() =>
              void act(() => matureHorse(sel), 'Matured the foal → adult (coat revealed).')
            }
          >
            Mature foal to adult
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="section-h">Inspect</h2>
        <div className="row-actions">
          <label className="field">
            <span>Horse</span>
            <select value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="">— pick a horse —</option>
              {horses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name ?? h.id.slice(0, 8)} ({h.lifeStage})
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy || !sel} onClick={() => void dump(() => inspectHorse(sel))}>
            Dump horse (full truth)
          </button>
          <button disabled={busy} onClick={() => void dump(() => inspectRuns())}>
            Dump adventure runs
          </button>
        </div>
        {out && <pre className="debug-out">{out}</pre>}
      </section>

      <section className="card">
        <h2 className="section-h">Reset</h2>
        <p className="muted">
          Wipes this herd&apos;s horses, stash, structures, quests, journal, and runs — then
          re-grants the two founder starters and the cold-start Cubes.
        </p>
        <button
          className="danger"
          disabled={busy}
          onClick={() => {
            if (window.confirm('Reset this herd to a clean starter state?'))
              void act(() => reset(), 'Herd reset to starter state.');
          }}
        >
          Reset herd
        </button>
      </section>
    </div>
  );
}
