import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { getInventory, type ItemStack } from '../api/explore.js';
import {
  build,
  craft,
  getItems,
  getPasture,
  getRecipes,
  type ItemDef,
  type PastureView,
  type Recipe,
} from '../api/workshop.js';
import { useSession } from '../session.js';
import { pretty } from '../util/format.js';

export function WorkshopPage(): ReactElement {
  const { refresh } = useSession();
  const [inv, setInv] = useState<ItemStack[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [itemDefs, setItemDefs] = useState<ItemDef[]>([]);
  const [pasture, setPasture] = useState<PastureView | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getInventory()
      .then(setInv)
      .catch(() => {
        /* ignore */
      });
    getPasture()
      .then(setPasture)
      .catch(() => {
        /* ignore */
      });
  }, []);

  useEffect(() => {
    getRecipes()
      .then(setRecipes)
      .catch(() => {
        /* ignore */
      });
    getItems()
      .then(setItemDefs)
      .catch(() => {
        /* ignore */
      });
    load();
  }, [load]);

  const have = (itemId: string): number => inv.find((i) => i.id === itemId)?.qty ?? 0;
  const canCraft = (r: Recipe): boolean => r.inputs.every((i) => have(i.id) >= i.qty);
  const flavorOf = (id: string): string | undefined => itemDefs.find((d) => d.id === id)?.flavor;

  async function act(fn: () => Promise<unknown>, msg: string): Promise<void> {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await fn();
      setNote(msg);
      await refresh();
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workshop">
      <Link className="back-link" to="/town">
        ← The Town
      </Link>
      <h1>Workshop</h1>
      {note && <div className="note">{note}</div>}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {/* Condensed into a dense three-panel grid (Stash | Crafting | Grounds); collapses to one
          column on narrow screens. Item flavor lives in the chip tooltip (hover the ✦). */}
      <div className="workshop-grid">
        <section className="section">
          <h2 className="section-h">Stash</h2>
          {inv.length === 0 ? (
            <p className="muted">Empty — gather in a region (Adventure) to stock up.</p>
          ) : (
            <div className="guide-grid">
              {inv.map((i) => {
                const fl = flavorOf(i.id);
                return (
                  <div className="guide-chip" key={i.id} title={fl ?? undefined}>
                    {pretty(i.id)} ×{i.qty}
                    {fl ? ' ✦' : ''}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="section">
          <h2 className="section-h">Crafting</h2>
          <ul className="list">
            {recipes.map((r) => (
              <li key={r.id}>
                <span>
                  {r.name}{' '}
                  <span className="muted">
                    — {r.inputs.map((i) => `${pretty(i.id)} ×${i.qty}`).join(', ')}
                  </span>
                </span>
                <button
                  className="primary"
                  disabled={busy || !canCraft(r)}
                  onClick={() => void act(() => craft(r.id), `Crafted a ${r.name}.`)}
                >
                  {canCraft(r) ? 'Craft' : 'Need materials'}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="section">
          <h2 className="section-h">
            Grounds{' '}
            {pasture && (
              <span className="muted">
                ({pasture.used}/{pasture.capacity} built)
              </span>
            )}
          </h2>
          {pasture && (
            <ul className="list">
              {pasture.buildable.map((b) => (
                <li key={b.type}>
                  <span>
                    {b.name}
                    {b.job && <span className="muted"> — {b.job} job</span>}
                    <br />
                    <span className="muted">
                      {b.buildCost.cubes} ⬡
                      {b.buildCost.items.length
                        ? ' + ' +
                          b.buildCost.items.map((i) => `${pretty(i.id)} ×${i.qty}`).join(', ')
                        : ''}
                    </span>
                  </span>
                  {b.built ? (
                    <span className="muted">✓ built</span>
                  ) : (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => void act(() => build(b.type), `Built the ${b.name}.`)}
                    >
                      Build
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
