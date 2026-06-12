import { useState, type ReactElement } from 'react';
import { ApiError } from '../api/client.js';
import {
  actInBattle,
  type BattleAction,
  type BattleView,
  type CombatantView,
  type HorseClass,
} from '../api/combat.js';
import { useSession } from '../session.js';
import { pretty } from '../util/format.js';

const CLASS_META: Record<HorseClass, { label: string; icon: string; attack: string }> = {
  knight: { label: 'Knight', icon: '🛡', attack: 'Cleave' },
  wizard: { label: 'Wizard', icon: '🔮', attack: 'Hex' },
  rogue: { label: 'Rogue', icon: '🗡', attack: 'Skirmish' },
  cleric: { label: 'Cleric', icon: '🌿', attack: 'Soothe' },
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

/** The battle screen — drives an in-progress battle to its end. Used by the Sparring Ring and by the
 *  adventure→boss handoff (§9.4c). `onClose` fires when the player dismisses the finished battle. */
export function BattleArena({
  initial,
  onClose,
  onCloseLabel = 'Continue',
  title = '⚔ Battle',
}: {
  initial: BattleView;
  onClose: () => void;
  onCloseLabel?: string;
  title?: string;
}): ReactElement {
  const { refresh } = useSession();
  const [battle, setBattle] = useState<BattleView>(initial);
  const [picking, setPicking] = useState<'target' | 'mend' | 'item' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: BattleAction): Promise<void> {
    setBusy(true);
    setError(null);
    setPicking(null);
    try {
      const next = (await actInBattle(battle.battleId, action)).battle;
      setBattle(next);
      // Reward Cubes only land when the battle ENDS — refreshing /me per click was a
      // round-trip storm in the hottest loop in the game (audit P2).
      if (next.status !== 'active') await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That move did not land.');
    } finally {
      setBusy(false);
    }
  }

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
        <h1>{title}</h1>
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
                ? ` + ${battle.reward.items.map((i) => `${pretty(i.id)} ×${i.qty}`).join(', ')}`
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
          <button className="primary" onClick={onClose}>
            {onCloseLabel}
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
