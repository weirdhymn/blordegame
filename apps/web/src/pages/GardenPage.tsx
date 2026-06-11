import { useCallback, useState, type ReactElement } from 'react';
import { ApiError } from '../api/client.js';
import { getInventory } from '../api/explore.js';
import {
  buySprinkler,
  fertilize,
  getGarden,
  harvestPlot,
  plantCrop,
  waterPlot,
  type CropDef,
  type PlotView,
} from '../api/garden.js';
import { useLoad } from '../hooks/useLoad.js';
import { useSession } from '../session.js';
import { pretty } from '../util/format.js';

const TIER_HOURS: Record<number, number> = { 1: 12, 2: 24, 3: 48, 4: 72, 5: 96 };
const FERTILIZERS = ['fertilizer', 'rich-fertilizer', 'magic-fertilizer'];

function fmtMs(ms: number): string {
  const h = Math.ceil(ms / 3_600_000);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

const STAGE_LABEL: Record<string, string> = {
  empty: '· empty',
  growing: '🌱 growing',
  ripe: '✅ ripe',
  drying: '⏳ drying out',
  withered: '🍂 withered',
};

/** The Garden (§7j) — optional enrichment. Every plot wears its whole runway on its face:
 *  water bar → drying countdown → grace countdown — the forgiveness is visible. */
export function GardenPage(): ReactElement {
  const { refresh } = useSession();
  const garden = useLoad(
    useCallback(async () => {
      const [view, inv] = await Promise.all([getGarden(), getInventory()]);
      return { view, inv };
    }, []),
  );
  const view = garden.data?.view;
  const qtyOf = (id: string): number => garden.data?.inv.find((s) => s.id === id)?.qty ?? 0;
  const [pickCrop, setPickCrop] = useState<Record<number, string>>({});
  const [pickFert, setPickFert] = useState<Record<number, string>>({});
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>, msg: string): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      setNote(msg);
      await refresh();
      garden.reload();
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : 'The garden declined, politely.');
    } finally {
      setBusy(false);
    }
  }

  const cropLabel = (c: CropDef): string =>
    `${pretty(c.crop.replace('grain-', ''))} · T${c.tier} (${TIER_HOURS[c.tier]}h) → ×${c.baseYield}${c.second ? ` + ${pretty(c.second.id)}` : ''} · have ${qtyOf(c.crop)}`;

  function renderPlot(p: PlotView): ReactElement {
    return (
      <div className={`plot plot-${p.stage}`} key={p.slot}>
        <div className="plot-head">
          <strong>Plot {p.slot}</strong>
          <span className="plot-stage">{STAGE_LABEL[p.stage]}</span>
        </div>
        {p.crop && (
          <p className="plot-crop">
            {pretty(p.crop.replace('grain-', ''))}
            {p.fertilizer && <span className="muted"> · 💩 {pretty(p.fertilizer)}</span>}
          </p>
        )}
        {!p.crop && p.fertilizer && (
          <p className="plot-crop muted">💩 {pretty(p.fertilizer)} worked in — ready to plant.</p>
        )}

        {p.crop && (
          <>
            <div className="meter" title={`water ${Math.round(p.water * 100)}%`}>
              <span className="meter-l">💧</span>
              <span className="bar-track">
                <span className="bar-fill water" style={{ width: `${p.water * 100}%` }} />
              </span>
            </div>
            <div className="meter" title={`growth ${Math.round(p.growth * 100)}%`}>
              <span className="meter-l">🌱</span>
              <span className="bar-track">
                <span className="bar-fill grow" style={{ width: `${p.growth * 100}%` }} />
              </span>
            </div>
            {p.stage === 'growing' && p.ripeInMs !== null && (
              <p className="muted">ripe in ~{fmtMs(p.ripeInMs)}</p>
            )}
            {p.stage === 'ripe' && p.dryInMs !== null && (
              <p className="muted">happy to wait — tank dry in {fmtMs(p.dryInMs)}</p>
            )}
            {p.stage === 'drying' && p.graceLeftMs !== null && (
              <p className="plot-grace">
                🍂 thirsty — withers (and returns the crop) in {fmtMs(p.graceLeftMs)}. Any water
                resets it.
              </p>
            )}
          </>
        )}

        <div className="row-actions plot-actions">
          {!p.crop && (
            <>
              <select
                value={pickCrop[p.slot] ?? ''}
                onChange={(e) => setPickCrop((m) => ({ ...m, [p.slot]: e.target.value }))}
              >
                <option value="">— plant a crop —</option>
                {(view?.crops ?? []).map((c) => (
                  <option key={c.crop} value={c.crop} disabled={qtyOf(c.crop) < 1}>
                    {cropLabel(c)}
                  </option>
                ))}
              </select>
              <button
                className="primary"
                disabled={busy || !pickCrop[p.slot]}
                onClick={() => void act(() => plantCrop(p.slot, pickCrop[p.slot]!), 'Planted.')}
              >
                Plant
              </button>
              {!p.fertilizer && (
                <>
                  <select
                    value={pickFert[p.slot] ?? ''}
                    onChange={(e) => setPickFert((m) => ({ ...m, [p.slot]: e.target.value }))}
                  >
                    <option value="">— fertilizer (optional) —</option>
                    {FERTILIZERS.map((f) => (
                      <option key={f} value={f} disabled={qtyOf(f) < 1}>
                        {pretty(f)} · have {qtyOf(f)}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={busy || !pickFert[p.slot]}
                    onClick={() =>
                      void act(() => fertilize(p.slot, pickFert[p.slot]!), 'Worked in. Deeply.')
                    }
                  >
                    💩 Fertilize
                  </button>
                </>
              )}
            </>
          )}
          {p.crop && (
            <>
              <button
                disabled={busy || p.water >= 0.8}
                onClick={() => void act(() => waterPlot(p.slot), 'Watered.')}
              >
                💧 Water
              </button>
              {p.growth >= 1 && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void act(() => harvestPlot(p.slot), 'Harvested!')}
                >
                  🧺 Harvest
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="garden">
      <h1>🌱 The Garden</h1>
      <p className="sub">
        Optional enrichment, never a chore: plant the crop itself (no seeds), come back in hours or
        days, harvest more than you planted. A neglected plant just gives the crop back.
      </p>
      {garden.error && (
        <div className="error" role="alert">
          {garden.error}
        </div>
      )}
      {note && <div className="note">{note}</div>}
      {(view?.returned.length ?? 0) > 0 && (
        <div className="note">
          🍂 While you were away:{' '}
          {view!.returned
            .map((r) => `plot ${r.slot}'s ${pretty(r.crop.replace('grain-', ''))} came home`)
            .join(', ')}
          . Nothing lost.
        </div>
      )}
      {garden.loading && <div className="loading">Loading…</div>}

      {view && (
        <>
          <section className="card sprinkler-card">
            <h2 className="section-h">🚿 Sprinkler</h2>
            {view.sprinkler.active && view.sprinkler.until ? (
              <p className="note">
                Running — every tank stays full (and growth hums along a little quicker) for{' '}
                {fmtMs(view.sprinkler.until - Date.now())}.
              </p>
            ) : (
              <p className="muted">
                Idle. Pay Cubes to keep every plot watered for days — a convenience, never a ransom.
              </p>
            )}
            <div className="row-actions">
              <button
                disabled={busy}
                onClick={() => void act(() => buySprinkler(3), 'Set for 3 days.')}
              >
                Run 3 days — 45 ⬡
              </button>
              <button
                disabled={busy}
                onClick={() => void act(() => buySprinkler(7), 'Set for a week.')}
              >
                Run 7 days — 105 ⬡
              </button>
            </div>
          </section>

          <div className="garden-grid">{view.plots.map(renderPlot)}</div>
        </>
      )}
    </div>
  );
}
