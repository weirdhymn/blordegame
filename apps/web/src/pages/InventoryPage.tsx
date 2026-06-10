import { useCallback, useState, type ReactElement } from 'react';
import { ApiError } from '../api/client.js';
import { getInventory } from '../api/explore.js';
import { sellItem } from '../api/inventory.js';
import { getItems, type ItemDef } from '../api/workshop.js';
import { useLoad } from '../hooks/useLoad.js';
import { useSession } from '../session.js';
import { pretty } from '../util/format.js';

/** A dedicated view of the herd's materials + finds, with a quick-sell-for-Cubes dump for surplus.
 *  Prices are modest (a convenience, not an income strategy); valuables ask for a confirm first. */
export function InventoryPage(): ReactElement {
  const { refresh } = useSession();
  const stash = useLoad(
    useCallback(async () => {
      const [items, defs] = await Promise.all([getInventory(), getItems()]);
      return { items, defs };
    }, []),
  );
  const inv = stash.data?.items ?? [];
  const defs = stash.data?.defs ?? [];
  const [confirming, setConfirming] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const defOf = (id: string): ItemDef | undefined => defs.find((d) => d.id === id);

  async function doSell(itemId: string, qty: number): Promise<void> {
    setBusy(true);
    setNote(null);
    setConfirming(null);
    try {
      const r = await sellItem(itemId, qty);
      setNote(`Sold ${pretty(itemId)} ×${r.sold} for +${r.gained} ⬡.`);
      await refresh();
      stash.reload();
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : 'Could not sell that.');
    } finally {
      setBusy(false);
    }
  }

  const sellable = inv.filter((i) => defOf(i.id)?.sellValue != null);
  const kept = inv.filter((i) => defOf(i.id)?.sellValue == null);

  return (
    <div className="inventory">
      <h1>Inventory</h1>
      <p className="sub">
        Your materials and finds. Quick-sell surplus for a few Cubes — modest prices, just a
        convenience dump (gathering and adventuring are the real economy).
      </p>
      {note && <div className="note">{note}</div>}
      {stash.error && (
        <div className="error" role="alert">
          {stash.error}
        </div>
      )}
      {stash.loading && <div className="loading">Loading…</div>}
      {!stash.loading && inv.length === 0 && (
        <p className="muted">Empty — gather in a region (Adventure) to stock up.</p>
      )}

      {sellable.length > 0 && (
        <section className="section">
          <h2 className="section-h">Sellable surplus</h2>
          <div className="inv-grid">
            {sellable.map((i) => {
              const d = defOf(i.id)!;
              const total = (d.sellValue ?? 0) * i.qty;
              return (
                <div className="card inv-item" key={i.id} title={d.flavor ?? undefined}>
                  <div className="inv-name">
                    {d.name} <span className="muted">×{i.qty}</span>
                  </div>
                  <div className="muted inv-kind">
                    {d.kind} · {d.sellValue} ⬡ each
                  </div>
                  {confirming === i.id ? (
                    <div className="row-actions">
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() => void doSell(i.id, i.qty)}
                      >
                        Sell all for {total} ⬡
                      </button>
                      <button disabled={busy} onClick={() => setConfirming(null)}>
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => {
                        if (d.sellConfirm) setConfirming(i.id);
                        else void doSell(i.id, i.qty);
                      }}
                    >
                      Sell ×{i.qty} → {total} ⬡{d.sellConfirm ? ' …' : ''}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {kept.length > 0 && (
        <section className="section">
          <h2 className="section-h">Kept</h2>
          <p className="muted">
            Not for quick-sale — grains feed the morning cook, and rare or reserved finds stay put.
          </p>
          <div className="inv-grid">
            {kept.map((i) => {
              const d = defOf(i.id);
              return (
                <div className="card inv-item kept" key={i.id} title={d?.flavor ?? undefined}>
                  <div className="inv-name">
                    {d?.name ?? pretty(i.id)} <span className="muted">×{i.qty}</span>
                  </div>
                  <div className="muted inv-kind">
                    {d?.kind ?? 'item'}
                    {d?.flavor ? ' ✦' : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
