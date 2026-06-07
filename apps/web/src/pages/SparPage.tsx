import { useEffect, useState, type ReactElement } from 'react';
import { ApiError } from '../api/client.js';
import { setHorseClass, startBattle, type BattleView, type HorseClass } from '../api/combat.js';
import { listHerdHorses, type Horse } from '../api/horses.js';
import { BattleArena } from '../components/BattleArena.js';
import { useSession } from '../session.js';

// A standalone "sparring ring" to practise the class/approach puzzle. The boss handoff (§9.4c) is the
// real entry; this stays as a no-stakes practice arena.
const FOES: { key: string; label: string; enemies: string[]; blurb: string }[] = [
  {
    key: 'bramble',
    label: 'A Bramble-Tangle',
    enemies: ['bramble-tangle'],
    blurb: 'Sturdy, brittle. Read its tell.',
  },
  {
    key: 'thistle',
    label: 'A Thistle-Whirl',
    enemies: ['thistle-whirl'],
    blurb: 'Quick and silly — it acts before slow horses.',
  },
  {
    key: 'gander',
    label: 'A Snappish Gander',
    enemies: ['snappish-gander'],
    blurb: 'All hiss and bluster. A job for a gentle soul.',
  },
  {
    key: 'tortoise',
    label: 'A Mossback Tortoise',
    enemies: ['mossback-tortoise'],
    blurb: 'Slow and armoured. A job for quick feet.',
  },
  {
    key: 'thistles',
    label: 'Two Thistle-Whirls',
    enemies: ['thistle-whirl', 'thistle-whirl'],
    blurb: 'A pair. Bring friends.',
  },
];

const CLASS_LIST: HorseClass[] = ['knight', 'wizard', 'rogue', 'cleric'];
const CLASS_META: Record<HorseClass, { label: string; icon: string; stat: string }> = {
  knight: { label: 'Knight', icon: '🛡', stat: 'STR' },
  wizard: { label: 'Wizard', icon: '🔮', stat: 'INT' },
  rogue: { label: 'Rogue', icon: '🗡', stat: 'DEX' },
  cleric: { label: 'Cleric', icon: '🌿', stat: 'kindness' },
};

export function SparPage(): ReactElement {
  const { herd } = useSession();
  const [horses, setHorses] = useState<Horse[]>([]);
  const [partyIds, setPartyIds] = useState<string[]>([]);
  const [foeKey, setFoeKey] = useState(FOES[0]!.key);
  const [battle, setBattle] = useState<BattleView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!herd) return;
    listHerdHorses(herd.id)
      .then((hs) => setHorses(hs.filter((h) => h.lifeStage === 'adult')))
      .catch(() => {
        /* ignore */
      });
  }, [herd]);

  const toggle = (id: string): void =>
    setPartyIds((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : p.length < 4 ? [...p, id] : p,
    );

  async function changeClass(horseId: string, cls: HorseClass | null): Promise<void> {
    try {
      await setHorseClass(horseId, cls);
      setHorses((hs) => hs.map((h) => (h.id === horseId ? { ...h, class: cls } : h)));
    } catch {
      /* ignore */
    }
  }

  async function begin(): Promise<void> {
    const foe = FOES.find((f) => f.key === foeKey);
    if (!foe || partyIds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      setBattle((await startBattle(foe.enemies, partyIds)).battle);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The sparring ring is closed.');
    } finally {
      setBusy(false);
    }
  }

  if (battle) {
    return (
      <BattleArena
        initial={battle}
        onClose={() => setBattle(null)}
        onCloseLabel="Spar again"
        title="⚔ Sparring"
      />
    );
  }

  return (
    <div className="spar">
      <h1>⚔ Sparring Ring</h1>
      <p className="muted">
        Pick a party (1–4), give each a <strong>class</strong>, and choose a foe. A class fixes a
        horse&apos;s approach — match it to the horse&apos;s strengths and to the enemy&apos;s
        weakness. Cozy rules: 0 HP just means <em>spooked</em> (fine after a nap); a wipe is a
        retreat, never a loss. (Classes you set here carry into adventures.)
      </p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <h2 className="section-h">Your party</h2>
      {horses.length === 0 ? (
        <p className="muted">You need an adult horse to spar.</p>
      ) : (
        <div className="spar-party">
          {horses.map((h) => (
            <button
              key={h.id}
              className={`spar-pick${partyIds.includes(h.id) ? ' on' : ''}`}
              onClick={() => toggle(h.id)}
            >
              <span className="spar-pick-name">
                {h.name ?? 'Unnamed'}
                {h.class ? ` ${CLASS_META[h.class].icon}` : ''}
              </span>
              <span className="spar-pick-stats">
                STR {h.stats.str ?? 10} · INT {h.stats.int ?? 10} · DEX {h.stats.dex ?? 10} · kind{' '}
                {Math.round((h.personality.a ?? 50) / 5)}
              </span>
            </button>
          ))}
        </div>
      )}

      {partyIds.length > 0 && (
        <>
          <h2 className="section-h">Assign classes</h2>
          <p className="muted">
            Each class keys off a stat — Knight/STR, Wizard/INT, Rogue/DEX, Cleric/kindness. A
            horse&apos;s stats decide how good its class is. Re-assign anytime.
          </p>
          <div className="spar-classes">
            {partyIds.map((id) => {
              const h = horses.find((x) => x.id === id);
              if (!h) return null;
              return (
                <div key={id} className="spar-class-row">
                  <span className="spar-class-name">{h.name ?? 'Unnamed'}</span>
                  <select
                    value={h.class ?? ''}
                    onChange={(e) =>
                      void changeClass(id, (e.target.value || null) as HorseClass | null)
                    }
                  >
                    <option value="">— unclassed —</option>
                    {CLASS_LIST.map((c) => (
                      <option key={c} value={c}>
                        {CLASS_META[c].icon} {CLASS_META[c].label} ({CLASS_META[c].stat})
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </>
      )}

      <h2 className="section-h">The foe</h2>
      <div className="spar-foes">
        {FOES.map((f) => (
          <label key={f.key} className={`spar-foe${foeKey === f.key ? ' on' : ''}`}>
            <input
              type="radio"
              name="foe"
              checked={foeKey === f.key}
              onChange={() => setFoeKey(f.key)}
            />
            <span className="spar-foe-name">{f.label}</span>
            <span className="muted">{f.blurb}</span>
          </label>
        ))}
      </div>

      <button
        className="primary spar-begin"
        disabled={busy || partyIds.length === 0}
        onClick={() => void begin()}
      >
        {busy ? 'Stepping in…' : `Begin sparring (${partyIds.length}/4)`}
      </button>
    </div>
  );
}
