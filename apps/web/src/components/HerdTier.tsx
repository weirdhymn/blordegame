import { useEffect, useState, type ReactElement } from 'react';
import { ApiError } from '../api/client.js';
import { getProgression, upgradeProgression, type ProgressionView } from '../api/progression.js';
import { useSession } from '../session.js';

/** The Herd-Tier progression spine (§7) — the home base's one legible ladder: current tier, the next
 *  upgrade (cost + accomplishment gates + what it unlocks), and the Cubes-sink Upgrade button. */
export function HerdTier(): ReactElement {
  const { refresh } = useSession();
  const [prog, setProg] = useState<ProgressionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = (): void => {
    getProgression()
      .then(setProg)
      .catch(() => {
        /* ignore */
      });
  };
  useEffect(load, []);

  async function upgrade(): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      const r = await upgradeProgression();
      setMsg(`🎉 Upgraded to Tier ${r.tier} — ${r.tierName}!`);
      await refresh();
      load();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Upgrade failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!prog) {
    return (
      <section className="card herd-tier">
        <h2 className="section-h">🏅 Herd Tier</h2>
        <p className="muted">Loading…</p>
      </section>
    );
  }

  const n = prog.next;
  return (
    <section className="card herd-tier">
      <h2 className="section-h">
        🏅 Herd Tier {prog.tier} — {prog.tierName}
      </h2>
      <div className="tier-caps">
        <span className={prog.herdSize >= prog.herdCap ? 'cap full' : 'cap'}>
          🐴 Horses{' '}
          <strong>
            {prog.herdSize}/{prog.herdCap}
          </strong>
        </span>
        <span className="cap">🏠 Structures up to {prog.structureSlots}</span>
        <span className="cap">🛠 Workers up to {prog.jobSlots}</span>
      </div>

      {n ? (
        <div className="tier-next">
          <h3 className="section-h">
            Next: Tier {n.tier} — {n.name} · <strong>{n.cost} ⬡</strong>
          </h3>
          <p className="muted">
            Unlocks {n.unlocks.herdCap} horses · {n.unlocks.structureSlots} structures ·{' '}
            {n.unlocks.jobSlots} workers.
          </p>
          {n.gates.length > 0 && (
            <ul className="tier-gates">
              {n.gates.map((g, i) => (
                <li key={i} className={g.met ? 'met' : 'unmet'}>
                  {g.met ? '✓' : '○'} {g.label}
                </li>
              ))}
            </ul>
          )}
          <button
            className="primary"
            disabled={busy || !n.gatesMet || !n.canAfford}
            onClick={() => void upgrade()}
          >
            {!n.gatesMet
              ? 'Complete the requirements above'
              : !n.canAfford
                ? `Save up — needs ${n.cost} ⬡ (you have ${prog.cubes})`
                : `Upgrade to ${n.name} — ${n.cost} ⬡`}
          </button>
        </div>
      ) : (
        <p className="note">
          🎉 Your herd is a Dynasty — the top tier. Nowhere to climb but legend.
        </p>
      )}
      {msg && <div className="note">{msg}</div>}
    </section>
  );
}
