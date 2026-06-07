import { useEffect, useState, type ReactElement } from 'react';
import { ApiError } from '../api/client.js';
import {
  actInBattle,
  setHorseClass,
  startBattle,
  type Approach,
  type BattleAction,
  type BattleView,
  type CombatantView,
  type HorseClass,
} from '../api/combat.js';
import { listHerdHorses, type Horse } from '../api/horses.js';
import { useSession } from '../session.js';

// A standalone "sparring ring" to play the class/approach puzzle. The real entry (a region boss
// reached from an adventure) lands with the run→battle handoff.
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
const CLASS_META: Record<
  HorseClass,
  { label: string; icon: string; approach: Approach; stat: string; attack: string }
> = {
  knight: { label: 'Knight', icon: '🛡', approach: 'confront', stat: 'STR', attack: 'Cleave' },
  wizard: { label: 'Wizard', icon: '🔮', approach: 'outwit', stat: 'INT', attack: 'Hex' },
  rogue: { label: 'Rogue', icon: '🗡', approach: 'skirmish', stat: 'DEX', attack: 'Skirmish' },
  cleric: { label: 'Cleric', icon: '🌿', approach: 'soothe', stat: 'kindness', attack: 'Soothe' },
};

function HpBar({ c, actor }: { c: CombatantView; actor: boolean }): ReactElement {
  const pct = Math.max(0, Math.round((c.hp / c.maxHp) * 100));
  return (
    <div className={`combatant${c.ko ? ' ko' : ''}${actor ? ' actor' : ''}`}>
      <div className="combatant-head">
        <span className="combatant-name">
          {actor ? '▶ ' : ''}
          {c.name}
          {c.class ? <span className="combatant-class"> · {CLASS_META[c.class].label}</span> : ''}
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
  const [picking, setPicking] = useState<'target' | 'mend' | 'item' | null>(null);
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
          Pick a party (1–4), give each a <strong>class</strong>, and choose a foe. A class fixes a
          horse&apos;s approach — match it to the horse&apos;s strengths and to the enemy&apos;s
          weakness. Cozy rules: 0 HP just means <em>spooked</em> (fine after a nap); a wipe is a
          retreat, never a loss.
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

  // ── battle ──
  const foes = battle.combatants.filter((c) => c.side === 'foe');
  const party = battle.combatants.filter((c) => c.side === 'party');
  const actor = battle.combatants.find((c) => c.id === battle.turnId);
  const liveFoes = foes.filter((c) => !c.ko);
  const over = battle.status !== 'active';

  const doAttack = (): void => {
    if (liveFoes.length === 1) void act({ type: 'attack', targetId: liveFoes[0]!.id });
    else setPicking('target');
  };

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
            <div key={c.id}>
              <HpBar c={c} actor={c.id === battle.turnId} />
              {c.tell && !c.ko && <p className="foe-tell">“{c.tell}”</p>}
            </div>
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
                <strong>
                  {actor.name}
                  {actor.class ? ` the ${CLASS_META[actor.class].label}` : ''}
                </strong>
                &apos;s move:
              </p>
              <div className="row-actions">
                <button disabled={busy || liveFoes.length === 0} onClick={doAttack}>
                  {actor.class
                    ? `${CLASS_META[actor.class].icon} ${CLASS_META[actor.class].attack}`
                    : '⚔ Attack'}
                </button>
                {actor.class === 'cleric' && (
                  <button disabled={busy} onClick={() => setPicking('mend')}>
                    ✨ Mend
                  </button>
                )}
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
          {picking === 'target' && (
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
          {picking === 'mend' && (
            <>
              <p className="battle-turn">Mend which ally?</p>
              <div className="row-actions">
                {party.map((h) => (
                  <button
                    key={h.id}
                    disabled={busy}
                    onClick={() => void act({ type: 'mend', targetId: h.id })}
                  >
                    {h.name}
                    {h.ko ? ' (revive)' : ` (${h.hp}/${h.maxHp})`}
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
              🎉 Victory! The foe yields the field. Banked{' '}
              <strong>{battle.reward?.cubes ?? 0} ⬡</strong>
              {battle.reward && battle.reward.items.length > 0
                ? ` + ${battle.reward.items.map((i) => `${i.qty}× ${i.id}`).join(', ')}`
                : ''}
              .
            </p>
          )}
          {battle.status === 'retreated' && (
            <p className="note">
              🌙 The party&apos;s worn out — a tactical retreat home to nap it off. A little
              something for the effort: <strong>{battle.reward?.cubes ?? 0} ⬡</strong>. No harm
              done; try again anytime.
            </p>
          )}
          {battle.status === 'fled' && (
            <p className="note">
              🏃 A clean getaway. No spoils, no scrapes — come back when you&apos;re ready.
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
