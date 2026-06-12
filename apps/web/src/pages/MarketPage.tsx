import { useCallback, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
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
} from '../api/economy.js';
import { listHerdHorses } from '../api/horses.js';
import { useLoad } from '../hooks/useLoad.js';
import { useSession } from '../session.js';

export function MarketPage(): ReactElement {
  const { herd, refresh } = useSession();
  const market = useLoad(
    useCallback(async () => {
      const [listings, trades, myHorses] = await Promise.all([
        browseMarket(),
        listTrades(),
        herd ? listHerdHorses(herd.id) : Promise.resolve([]),
      ]);
      return { listings, trades, myHorses };
    }, [herd]),
  );
  const listings = market.data?.listings ?? [];
  const trades = market.data?.trades ?? [];
  const myHorses = market.data?.myHorses ?? [];
  const [sellHorse, setSellHorse] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [toHerd, setToHerd] = useState('');
  const [offerHorse, setOfferHorse] = useState('');
  const [reqCubes, setReqCubes] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>, msg: string): Promise<void> {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await fn();
      setNote(msg);
      await refresh();
      market.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  /** Destructive actions get a confirm (audit §11) — no accidental cancel/decline. */
  function confirmAct(question: string, fn: () => Promise<unknown>, msg: string): void {
    if (window.confirm(question)) void act(fn, msg);
  }

  const cubes = herd?.cubes ?? 0;
  const myId = herd?.id;

  return (
    <div className="market">
      <Link className="back-link" to="/town">
        ← The Town
      </Link>
      <h1>Market</h1>
      {note && <div className="note">{note}</div>}
      {(error ?? market.error) && (
        <div className="error" role="alert">
          {error ?? market.error}
        </div>
      )}
      {market.loading && <div className="loading">Loading…</div>}

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
                      onClick={() =>
                        confirmAct(
                          'Cancel this listing?',
                          () => cancelListing(l.id),
                          'Listing cancelled.',
                        )
                      }
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
          <label className="field">
            <span>Your horse</span>
            <select value={sellHorse} onChange={(e) => setSellHorse(e.target.value)}>
              <option value="">— choose —</option>
              {myHorses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name ?? h.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Price (⬡)</span>
            <input
              type="number"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              className="num"
            />
          </label>
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
                          onClick={() =>
                            confirmAct(
                              'Accept this trade? Horses change hands for good.',
                              () => acceptTrade(t.id),
                              'Trade accepted.',
                            )
                          }
                        >
                          Accept
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            confirmAct('Decline this trade?', () => declineTrade(t.id), 'Declined.')
                          }
                        >
                          Decline
                        </button>
                      </>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() =>
                          confirmAct('Cancel this trade?', () => cancelTrade(t.id), 'Cancelled.')
                        }
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
