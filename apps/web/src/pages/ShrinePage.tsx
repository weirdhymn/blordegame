import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { resolve } from '@blorse/genetics';
import { buildRenderSpec, GLITCH_KINDS, type GlitchKind } from '@blorse/render-core';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { getInventory } from '../api/explore.js';
import { listHerdHorses, type Horse } from '../api/horses.js';
import { fileBugReport, offerAtShrine } from '../api/shrine.js';
import { useLoad } from '../hooks/useLoad.js';
import { HorseCanvas } from '../render/HorseCanvas.js';
import { useSession } from '../session.js';
import { pretty } from '../util/format.js';

/** One rendered look — the current coat, or what a given glitch would do to it. Client render
 *  is PREVIEW ONLY (golden rule): the shrine's actual pick happens server-side. */
function Look(props: { horse: Horse; glitch: GlitchKind | null; label: string }): ReactElement {
  const { horse, glitch, label } = props;
  const spec = useMemo(
    () =>
      buildRenderSpec(resolve(horse.genotype), {
        seed: horse.seed,
        glitch,
        lifeStage: horse.lifeStage,
      }),
    [horse.genotype, horse.seed, glitch, horse.lifeStage],
  );
  const active = horse.glitch === glitch;
  return (
    <figure className={`shrine-look${active ? ' active' : ''}`}>
      <HorseCanvas spec={spec} scale={1} />
      <figcaption>
        {label}
        {active && ' · now'}
      </figcaption>
    </figure>
  );
}

/** The Debug Shrine (§7l) — deliberate access to the glitch system. The monks accept one
 *  fairy dust per bug; the KIND is the shrine's choice. A bug report (50 ⬡) closes the ticket. */
export function ShrinePage(): ReactElement {
  const { herd, refresh } = useSession();
  const load = useLoad(
    useCallback(async () => {
      const [horses, inv] = await Promise.all([
        herd ? listHerdHorses(herd.id) : Promise.resolve([]),
        getInventory(),
      ]);
      return { horses, inv };
    }, [herd]),
  );
  const adults = useMemo(
    () => (load.data?.horses ?? []).filter((h) => h.lifeStage === 'adult'),
    [load.data],
  );
  const dust = load.data?.inv.find((s) => s.id === 'fairy-dust')?.qty ?? 0;
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked = adults.find((h) => h.id === pickedId) ?? adults[0];
  const [note, setNote] = useState<string | null>(null);
  const [actError, setActError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<string>): Promise<void> {
    setBusy(true);
    setNote(null);
    setActError(null);
    try {
      setNote(await fn());
      await refresh();
      load.reload();
    } catch (e) {
      // Failures wear the error coat, not the success-green note (audit P2 a11y).
      setActError(e instanceof ApiError ? e.message : 'The shrine hums, unmoved.');
    } finally {
      setBusy(false);
    }
  }

  function onOffer(horse: Horse): void {
    if (
      !window.confirm(
        'Offer 1 fairy dust? The shrine chooses which glitch. No refunds. There is no complaints department.',
      )
    )
      return;
    void act(async () => {
      const r = await offerAtShrine(horse.id);
      const who = r.name ?? 'The horse';
      return r.prior === r.glitch
        ? `The monks mark the ticket as a duplicate. ${who} remains ${r.glitch}.`
        : `The shrine hums approvingly. ${who} is now ${r.glitch}.`;
    });
  }

  function onPatch(horse: Horse): void {
    if (!window.confirm('File a bug report for 50 ⬡? The horse becomes, regrettably, normal.'))
      return;
    void act(async () => {
      const r = await fileBugReport(horse.id);
      return `Ticket closed as RESOLVED (was: ${r.cleared}). ${r.name ?? 'The horse'} is, regrettably, normal again.`;
    });
  }

  return (
    <div className="shrine">
      <Link className="back-link" to="/town">
        ← The Town
      </Link>
      <h1>⛩ The Debug Shrine</h1>
      <p className="sub">
        A small building that hums at exactly 60Hz. The monks keep the world&apos;s error logs and
        accept offerings of <strong>fairy dust</strong> — each buys a horse exactly one bug, of the
        shrine&apos;s choosing. Glitches never pass to foals; filing a <strong>bug report</strong>{' '}
        (50 ⬡) closes the ticket. You have <strong>{dust} 🧚</strong>.
      </p>
      {(actError ?? load.error) && (
        <div className="error" role="alert">
          {actError ?? load.error}
        </div>
      )}
      {note && <div className="note">{note}</div>}
      {load.loading && <div className="loading">Loading…</div>}

      {load.data && adults.length === 0 && (
        <div className="card placeholder">
          <p>
            The monks look up expectantly, but only adults may be debugged — foals have no bugs yet.
            Come back when one grows up.
          </p>
        </div>
      )}

      {picked && (
        <div className="card shrine-court">
          <div className="row-actions">
            <select
              value={picked.id}
              onChange={(e) => setPickedId(e.target.value)}
              aria-label="Choose a horse to present at the shrine"
            >
              {adults.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name ?? 'Unnamed'}
                  {h.glitch ? ` · ${h.glitch}` : ''}
                </option>
              ))}
            </select>
            <button className="primary" disabled={busy || dust < 1} onClick={() => onOffer(picked)}>
              🧚 Offer fairy dust
            </button>
            <button disabled={busy || !picked.glitch} onClick={() => onPatch(picked)}>
              🧾 File a bug report — 50 ⬡
            </button>
          </div>
          {dust < 1 && (
            <p className="muted">
              No fairy dust on hand — the region Keepers carry it. They should not.
            </p>
          )}

          <h2 className="section-h">What the shrine might bestow</h2>
          <div className="shrine-previews">
            <Look horse={picked} glitch={null} label="as-is" />
            {GLITCH_KINDS.map((g) => (
              <Look key={g} horse={picked} glitch={g} label={pretty(g)} />
            ))}
          </div>
          <p className="muted">
            Previews only — the shrine picks one of the three, and it does not take requests.
          </p>
        </div>
      )}
    </div>
  );
}
