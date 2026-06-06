import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { ApiError } from '../api/client.js';
import {
  acceptTrade,
  browseMarket,
  buyListing,
  cancelListing,
  cancelTrade,
  createTrade,
  declineTrade,
  listHorse,
  listTrades,
  type Listing,
  type Trade,
} from '../api/economy.js';
import { listHerdHorses, type Horse } from '../api/horses.js';
import { useSession } from '../session.js';

export function MarketPage(): ReactElement {
  const { herd, refresh } = useSession();
  const [listings, setListings] = useState<Listing[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [myHorses, setMyHorses] = useState<Horse[]>([]);
  const [sellHorse, setSellHorse] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [toHerd, setToHerd] = useState('');
  const [offerHorse, setOfferHorse] = useState('');
  const [reqCubes, setReqCubes] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    browseMarket()
      .then(setListings)
      .catch(() => {
        /* ignore */
      });
    listTrades()
      .then(setTrades)
      .catch(() => {
        /* ignore */
      });
    if (herd)
      listHerdHorses(herd.id)
        .then(setMyHorses)
        .catch(() => {
          /* ignore */
        });
  }, [herd]);

  useEffect(() => load(), [load]);

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

  const cubes = herd?.cubes ?? 0;
  const myId = herd?.id;

  return (
    <div className="market">
      <h1>Market</h1>
      {note && <div className="note">{note}</div>}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <section className="section">
        <h2 className="section-h">For sale</h2>
        {listings.length === 0 ? (
          <p className="muted">Nothing listed right now.</p>
        ) : (
          <ul className="list">
            {listings.map((l) => (
              <li key={l.id}>
                <span>
                  {l.name ?? 'A horse'} <span className="muted">— {l.displayName ?? '…'}</span>
                </span>
                <span className="row-actions">
                  <span className="fee">{l.price} ⬡</span>
                  {l.sellerId === myId ? (
                    <button
                      disabled={busy}
                      onClick={() => void act(() => cancelListing(l.id), 'Listing cancelled.')}
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      className="primary"
                      disabled={busy || cubes < l.price}
                      onClick={() =>
                        void act(() => buyListing(l.id), 'Bought — it is in your Pasture!')
                      }
                    >
                      {cubes < l.price ? 'Too dear' : 'Buy'}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2 className="section-h">List a horse</h2>
        <div className="row-actions">
          <select value={sellHorse} onChange={(e) => setSellHorse(e.target.value)}>
            <option value="">— your horse —</option>
            {myHorses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name ?? h.id.slice(0, 8)}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="price"
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
            className="num"
          />
          <button
            className="primary"
            disabled={busy || !sellHorse || !sellPrice}
            onClick={() =>
              void act(() => listHorse(sellHorse, Number(sellPrice)), 'Listed for sale.')
            }
          >
            List
          </button>
        </div>
      </section>

      <section className="section">
        <h2 className="section-h">Trades</h2>
        {trades.length === 0 ? (
          <p className="muted">No pending trades.</p>
        ) : (
          <ul className="list">
            {trades.map((t) => {
              const incoming = t.toHerd === myId;
              return (
                <li key={t.id}>
                  <span className="muted">
                    {incoming ? 'Incoming' : 'Outgoing'}: {t.offerHorses.length} horse(s) +{' '}
                    {t.offerCubes} ⬡ for {t.requestHorses.length} horse(s) + {t.requestCubes} ⬡
                  </span>
                  <span className="row-actions">
                    {incoming ? (
                      <>
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => void act(() => acceptTrade(t.id), 'Trade accepted.')}
                        >
                          Accept
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => void act(() => declineTrade(t.id), 'Declined.')}
                        >
                          Decline
                        </button>
                      </>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() => void act(() => cancelTrade(t.id), 'Cancelled.')}
                      >
                        Cancel
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <h3 className="section-h">Propose a trade</h3>
        <div className="picker">
          <label className="field">
            <span>To herd (id)</span>
            <input value={toHerd} onChange={(e) => setToHerd(e.target.value)} />
          </label>
          <label className="field">
            <span>Offer a horse</span>
            <select value={offerHorse} onChange={(e) => setOfferHorse(e.target.value)}>
              <option value="">— none —</option>
              {myHorses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name ?? h.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Request Cubes</span>
            <input type="number" value={reqCubes} onChange={(e) => setReqCubes(e.target.value)} />
          </label>
        </div>
        <button
          className="primary"
          disabled={busy || !toHerd || (!offerHorse && !reqCubes)}
          onClick={() =>
            void act(
              () =>
                createTrade({
                  toHerd,
                  offerHorses: offerHorse ? [offerHorse] : [],
                  requestCubes: Number(reqCubes) || 0,
                }),
              'Trade proposed.',
            )
          }
        >
          Propose
        </button>
      </section>
    </div>
  );
}
