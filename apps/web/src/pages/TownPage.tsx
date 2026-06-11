import { useCallback, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { browseMarket } from '../api/economy.js';
import { listTavern } from '../api/tavern.js';
import { useLoad } from '../hooks/useLoad.js';

/** The Town (§7k) — the frontier's one settlement, drawn as a row of storefronts. Every
 *  façade is a real system; the flows live in their own pages (the Adventure-hub pattern).
 *  Live touches (tavern headcount, market listings) ride a single parallel fetch. */
export function TownPage(): ReactElement {
  const counts = useLoad(
    useCallback(async () => {
      const [tavern, listings] = await Promise.all([listTavern(), browseMarket()]);
      return { tavern: tavern.length, listings: listings.length };
    }, []),
  );
  const c = counts.data;

  return (
    <div className="town">
      <h1>🏘 The Town</h1>
      <p className="sub">
        The one settlement on the frontier. Everything a herd can&apos;t do at home happens here —
        recruiting, crafting, trading, and the occasional supervised scuffle.
      </p>
      {counts.error && (
        <div className="error" role="alert">
          {counts.error}
        </div>
      )}

      <div className="town-row">
        <Link to="/town/tavern" className="bldg bldg-tavern">
          <span className="bldg-awning" aria-hidden="true" />
          <span className="bldg-sign">🍺</span>
          <h2>The Tavern</h2>
          <p>
            Wild horses that wandered in from the frontier wait here for a herd to call their own.
            Recruiting costs Cubes; rarity sets the bar tab.
          </p>
          {c && (
            <p className="bldg-live">
              {c.tavern === 0
                ? 'Quiet tonight — every stool empty.'
                : `${c.tavern} stranger${c.tavern === 1 ? '' : 's'} at the bar tonight.`}
            </p>
          )}
          <span className="hub-go">Push the door open →</span>
        </Link>

        <Link to="/town/workshop" className="bldg bldg-workshop">
          <span className="bldg-awning" aria-hidden="true" />
          <span className="bldg-sign">🔨</span>
          <h2>The Workshop</h2>
          <p>
            Timber in, books out. The bench turns gathered materials into books, games, tools, and
            structures — and, lately, into noticeably better manure.
          </p>
          <span className="hub-go">Step up to the bench →</span>
        </Link>

        <Link to="/town/market" className="bldg bldg-market">
          <span className="bldg-awning" aria-hidden="true" />
          <span className="bldg-sign">⚖</span>
          <h2>The Market</h2>
          <p>
            Horses change hands between herds — open listings or a straight swap. The auctioneer
            takes no cut, out of politeness.
          </p>
          {c && (
            <p className="bldg-live">
              {c.listings === 0
                ? 'The block stands empty today.'
                : `${c.listings} horse${c.listings === 1 ? '' : 's'} on the block.`}
            </p>
          )}
          <span className="hub-go">Browse the stalls →</span>
        </Link>

        <Link to="/adventure/spar" className="bldg bldg-ring">
          <span className="bldg-awning" aria-hidden="true" />
          <span className="bldg-sign">⚔</span>
          <h2>The Sparring Ring</h2>
          <p>
            The adventuring sort run a practice ring out back. No stakes — 0 HP just means spooked,
            home by supper.
          </p>
          <span className="hub-go">Watch a bout →</span>
        </Link>

        <div className="bldg bldg-closed">
          <span className="bldg-awning" aria-hidden="true" />
          <span className="bldg-sign">🪧</span>
          <h2>(boarded up)</h2>
          <p>
            The sign says &ldquo;opening soon.&rdquo; The sign has said that for as long as anyone
            can remember.
          </p>
        </div>
      </div>
    </div>
  );
}
