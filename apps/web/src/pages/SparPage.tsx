import { useEffect, useState, type ReactElement } from 'react';
import { ApiError } from '../api/client.js';
import {
  actInBattle,
  startBattle,
  type BattleAction,
  type BattleView,
  type CombatantView,
} from '../api/combat.js';
import { listHerdHorses, type Horse } from '../api/horses.js';
import { useSession } from '../session.js';

// v1 minimum: a standalone "sparring ring" to play the core battle loop. Real entry (a region boss
// reached from an adventure) lands with the approach/weakness layer.
const FOES: { key: string; label: string; enemies: string[]; blurb: string }[] = [
  {
    key: 'bramble',
    label: 'A Bramble-Tangle',
    enemies: ['bramble-tangle'],
    blurb: 'Sturdy. Hits back. A good first scrap.',
  },
  {
    key: 'thistle',
    label: 'A Thistle-Whirl',
    enemies: ['thistle-whirl'],
    blurb: 'Quick and silly — it acts before slow horses.',
  },
  {
    key: 'thistles',
    label: 'Two Thistle-Whirls',
    enemies: ['thistle-whirl', 'thistle-whirl'],
    blurb: 'A pair. Bring friends.',
  },
];

function HpBar({ c, actor }: { c: CombatantView; actor: boolean }): ReactElement {
  const pct = Math.max(0, Math.round((c.hp / c.maxHp) * 100));
  return (
    <div className={`combatant${c.ko ? ' ko' : ''}${actor ? ' actor' : ''}`}>
      <div className="combatant-head">
        <span className="combatant-name">
          {actor ? '▶ ' : ''}
          {c.name}
        </span>
        <span className="combatant-hp">
          {c.ko ? 'spooked 😵‍💫' : `${c.hp}/${c.maxHp}`}
          {c.defending ? ' 🛡' : ''}
        </span>
      </div>
      <div className="hp-track">
        <span className={`hp-fill ${c.side}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function SparPage(): ReactElement {
  const { herd, refresh } = useSession();
  const [horses, setHorses] = useState<Horse[]>([]);
  const [partyIds, setPartyIds] = useState<string[]>([]);
  const [foeKey, setFoeKey] = useState(FOES[0]!.key);
  const [battle, setBattle] = useState<BattleView | null>(null);
  const [picking, setPicking] = useState<'attack' | 'item' | null>(null);
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

  async function act(action: BattleAction): Promise<void> {
    if (!battle) return;
    setBusy(true);
    setError(null);
    setPicking(null);
    try {
      setBattle((await actInBattle(battle.battleId, action)).battle);
      await refresh(); // reward Cubes land in the topbar badge
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That move did not land.');
    } finally {
      setBusy(false);
    }
  }

  function reset(): void {
    setBattle(null);
    setPicking(null);
    setError(null);
  }

  // ── setup ──
  if (!battle) {
    return (
      <div className="spar">
        <h1>⚔ Sparring Ring</h1>
        <p className="muted">
          A friendly scrap to learn the ropes — pick a party (1–4) and a foe. Cozy rules: a horse at
          0 HP is just <em>spooked</em> (fine after a nap), and if everyone tires out you simply
          retreat home. No one gets hurt.
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
                <span className="spar-pick-name">{h.name ?? 'Unnamed'}</span>
                <span className="spar-pick-stats">
                  STR {h.stats.str ?? 10} · CON {h.stats.con ?? 10} · DEX {h.stats.dex ?? 10}
                </span>
              </button>
            ))}
          </div>
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

  // ── battle ──
  const foes = battle.combatants.filter((c) => c.side === 'foe');
  const party = battle.combatants.filter((c) => c.side === 'party');
  const actor = battle.combatants.find((c) => c.id === battle.turnId);
  const liveFoes = foes.filter((c) => !c.ko);
  const over = battle.status !== 'active';

  return (
    <div className="spar battle">
      <div className="battle-head">
        <h1>⚔ Sparring</h1>
        <span className="muted">Round {battle.round}</span>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <div className="battle-field">
        <div className="battle-side">
          <h2 className="section-h">Foes</h2>
          {foes.map((c) => (
            <HpBar key={c.id} c={c} actor={c.id === battle.turnId} />
          ))}
        </div>
        <div className="battle-side">
          <h2 className="section-h">Your party</h2>
          {party.map((c) => (
            <HpBar key={c.id} c={c} actor={c.id === battle.turnId} />
          ))}
        </div>
      </div>

      {!over && battle.isPartyTurn && actor && (
        <div className="battle-menu">
          {picking === null && (
            <>
              <p className="battle-turn">
                <strong>{actor.name}</strong>&apos;s move:
              </p>
              <div className="row-actions">
                <button
                  disabled={busy || liveFoes.length === 0}
                  onClick={() => setPicking('attack')}
                >
                  ⚔ Attack
                </button>
                <button disabled={busy || battle.potions === 0} onClick={() => setPicking('item')}>
                  🧪 Item ({battle.potions})
                </button>
                <button disabled={busy} onClick={() => void act({ type: 'defend' })}>
                  🛡 Defend
                </button>
                <button disabled={busy} onClick={() => void act({ type: 'flee' })}>
                  🏃 Flee
                </button>
              </div>
            </>
          )}
          {picking === 'attack' && (
            <>
              <p className="battle-turn">Strike which foe?</p>
              <div className="row-actions">
                {liveFoes.map((f) => (
                  <button
                    key={f.id}
                    disabled={busy}
                    onClick={() => void act({ type: 'attack', targetId: f.id })}
                  >
                    {f.name}
                  </button>
                ))}
                <button className="ghost" onClick={() => setPicking(null)}>
                  Back
                </button>
              </div>
            </>
          )}
          {picking === 'item' && (
            <>
              <p className="battle-turn">Use the Healing Potion on whom?</p>
              <div className="row-actions">
                {party.map((h) => (
                  <button
                    key={h.id}
                    disabled={busy}
                    onClick={() =>
                      void act({ type: 'item', itemId: 'healing-potion', targetId: h.id })
                    }
                  >
                    {h.name}
                    {h.ko ? ' (rouse)' : ` (${h.hp}/${h.maxHp})`}
                  </button>
                ))}
                <button className="ghost" onClick={() => setPicking(null)}>
                  Back
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {over && (
        <div className="battle-end">
          {battle.status === 'won' && (
            <p className="note">
              🎉 The foe huffs off — you held the field! Banked{' '}
              <strong>{battle.reward?.cubes ?? 0} ⬡</strong>
              {battle.reward && battle.reward.items.length > 0
                ? ` + ${battle.reward.items.map((i) => `${i.qty}× ${i.id}`).join(', ')}`
                : ''}
              .
            </p>
          )}
          {battle.status === 'retreated' && (
            <p className="note">
              🌙 Everyone&apos;s worn out — you retreat home to nap it off. A little something for
              the effort: <strong>{battle.reward?.cubes ?? 0} ⬡</strong>. No harm done; try again
              anytime.
            </p>
          )}
          {battle.status === 'fled' && (
            <p className="note">
              🏃 You slipped away clean. No spoils, no scrapes — come back when you&apos;re ready.
            </p>
          )}
          <button className="primary" onClick={reset}>
            Spar again
          </button>
        </div>
      )}

      <h2 className="section-h">Blow by blow</h2>
      <ul className="battle-log">
        {battle.log.map((e, i) => (
          <li key={i} className={`log-${e.kind ?? 'plain'}`}>
            {e.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
