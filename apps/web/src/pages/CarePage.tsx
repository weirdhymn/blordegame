import { useCallback, useState, type ReactElement } from 'react';
import { cookMeal, getCare, groomHerd } from '../api/care.js';
import { ApiError } from '../api/client.js';
import { useLoad } from '../hooks/useLoad.js';
import { pretty } from '../util/format.js';
import { useSession } from '../session.js';

const STAT_LABEL: Record<string, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
};

function describeBuff(buffs: Record<string, number>): string {
  const parts = Object.entries(buffs)
    .filter(([, v]) => v > 0)
    .map(([stat, v]) => `+${v} ${STAT_LABEL[stat] ?? stat.toUpperCase()}`);
  return parts.length ? parts.join(' · ') : 'no buff';
}

/** The daily Care hub (§7) — the cozy heartbeat: cook a stat buff in the morning, groom at night.
 *  Rewarding to do, gentle to skip — nothing is gated behind either ritual. */
export function CarePage(): ReactElement {
  const { refresh } = useSession();
  const careLoad = useLoad(useCallback(() => getCare(), []));
  const care = careLoad.data;
  const [pick, setPick] = useState<Record<string, number>>({});
  const [rares, setRares] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const picked = Object.values(pick).reduce((a, b) => a + b, 0) + rares;
  const slots = care?.slots ?? 0;
  const room = slots - picked;

  const bump = (id: string, delta: number, max: number): void =>
    setPick((p) => ({ ...p, [id]: Math.max(0, Math.min((p[id] ?? 0) + delta, max)) }));

  async function doCook(): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      const r = await cookMeal(pick, rares);
      setMsg(
        `🍲 The pot's on! Today's meal: ${describeBuff(r.mealBuffs)} — for the whole herd, all day.`,
      );
      setPick({});
      setRares(0);
      await refresh();
      careLoad.reload();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'The pot tipped over.');
    } finally {
      setBusy(false);
    }
  }

  async function doGroom(): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      const r = await groomHerd();
      setMsg(
        `🛏 Tucked in${r.soothed > 0 ? ` — ${r.soothed} soothed back to content` : ''}. A small ${r.pendingCubes} ⬡ thank-you waits at the next sunrise.`,
      );
      await refresh();
      careLoad.reload();
    } catch {
      setMsg('Could not groom just now.');
    } finally {
      setBusy(false);
    }
  }

  if (!care) {
    return (
      <div className="care">
        <h1>🐴 Care Hub</h1>
        {careLoad.error ? (
          <div className="error" role="alert">
            {careLoad.error}
          </div>
        ) : (
          <p className="muted">Loading…</p>
        )}
      </div>
    );
  }

  return (
    <div className="care">
      <h1>🐴 Care Hub</h1>
      <p className="muted">
        The herd&apos;s daily rhythm: <strong>cook</strong> a stat buff to open the day,{' '}
        <strong>groom</strong> to close it. Both are gentle — skip either, guilt-free; do them and
        the day goes a little better.
      </p>

      {msg && <div className="note">{msg}</div>}

      {/* Two bookend rituals, side-by-side on desktop; stacks to one column on narrow. */}
      <div className="care-grid">
        {/* ── Morning: the communal pot ── */}
        <section className="card care-cook">
          <h2 className="section-h">🍳 Morning — the Communal Pot</h2>
          {care.cookedToday ? (
            <p className="note">
              ✅ Today&apos;s meal is cooked: <strong>{describeBuff(care.mealBuffs)}</strong>. The
              whole herd carries it on every adventure, job, and boss today.
            </p>
          ) : (
            <p className="muted">
              One slot per horse (<strong>{slots}</strong> today — a bigger herd cooks a bigger
              meal). Each grain buffs its stat; mix for today&apos;s loadout. A Saffron Bloom
              amplifies the whole dish.
            </p>
          )}
          <p className="muted">
            Pot: <strong className={room < 0 ? 'cap full' : ''}>{picked}</strong> / {slots}{' '}
            ingredients
          </p>
          <div className="cook-grains">
            {care.grains.map((g) => (
              <div key={g.id} className="cook-grain">
                <span className="cook-grain-name">
                  {pretty(g.id.replace('grain-', ''))}{' '}
                  <span className="muted">→ {STAT_LABEL[g.stat] ?? g.stat}</span>
                </span>
                <span className="muted">have {g.qty}</span>
                <div className="stepper">
                  <button
                    disabled={busy || (pick[g.id] ?? 0) <= 0}
                    onClick={() => bump(g.id, -1, g.qty)}
                  >
                    −
                  </button>
                  <span className="stepper-val">{pick[g.id] ?? 0}</span>
                  <button
                    disabled={busy || (pick[g.id] ?? 0) >= g.qty || room <= 0}
                    onClick={() => bump(g.id, +1, g.qty)}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
            <div className="cook-grain rare">
              <span className="cook-grain-name">
                ✨ Saffron Bloom{' '}
                <span className="muted">→ ×{(1 + 0.5 * rares).toFixed(1)} dish</span>
              </span>
              <span className="muted">have {care.rares}</span>
              <div className="stepper">
                <button
                  disabled={busy || rares <= 0}
                  onClick={() => setRares((r) => Math.max(0, r - 1))}
                >
                  −
                </button>
                <span className="stepper-val">{rares}</span>
                <button
                  disabled={busy || rares >= care.rares || room <= 0}
                  onClick={() => setRares((r) => r + 1)}
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <button
            className="primary"
            disabled={busy || picked <= 0 || room < 0}
            onClick={() => void doCook()}
          >
            {picked <= 0 ? 'Add grain to the pot' : `🍲 Cook (${picked} in the pot)`}
          </button>
        </section>

        {/* ── Evening: tuck the herd in ── */}
        <section className="card care-groom">
          <h2 className="section-h">🌙 Evening — Tuck the Herd In</h2>
          <p className="muted">
            Groom the whole herd: lift any rough moods and leave a small{' '}
            <strong>{care.groomCubes} ⬡</strong> thank-you for the morning. Purely a nicety — never
            a penalty for skipping.
          </p>
          {care.rattled > 0 && (
            <p className="note">
              😟 {care.rattled} horse{care.rattled > 1 ? 's' : ''} had a rough day.
            </p>
          )}
          {care.groomed && <p className="note">🛏 Already tucked in — a bonus waits at sunrise.</p>}
          <button className="primary" disabled={busy} onClick={() => void doGroom()}>
            🧽 Groom the herd
          </button>
        </section>
      </div>
    </div>
  );
}
