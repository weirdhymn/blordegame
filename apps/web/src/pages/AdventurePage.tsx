import { type ReactElement } from 'react';
import { Link } from 'react-router-dom';

/** The Adventure hub (§9) — the home for the DnD/adventuring side of the herd. Presents the two
 *  paths: real expeditions at the regions ("Venture Out") and no-stakes practice combat ("Spar in
 *  Town"). Pure landing/navigation; the flows themselves live in VenturePage / SparPage. */
export function AdventurePage(): ReactElement {
  return (
    <div className="adventure-hub">
      <h1>⚔ Adventure</h1>
      <p className="muted">
        The DnD side of the herd — send your horses out into the world, or drill the combat system
        at home. Assign each horse a <strong>class</strong> in the sparring ring; it carries
        straight into expeditions.
      </p>
      <div className="hub-paths">
        <Link to="/adventure/venture" className="card hub-card">
          <span className="hub-icon">🗺</span>
          <h2>Venture Out</h2>
          <p>
            Real expeditions at the three regions — Green Grass, Dusty Dunes, Weird Woods. Cozy
            stories, mid-adventure skirmishes, and the region bosses, with stakes, rewards, and
            loot. This is where the journey happens.
          </p>
          <span className="hub-go">Choose a region →</span>
        </Link>
        <Link to="/adventure/spar" className="card hub-card">
          <span className="hub-icon">⚔</span>
          <h2>Spar in Town</h2>
          <p>
            Practice combat in the sparring ring — <strong>safe, no stakes</strong>. Learn the
            class/approach puzzle and test party compositions before you risk a real expedition. (0
            HP just means spooked — back by supper.)
          </p>
          <span className="hub-go">Step into the ring →</span>
        </Link>
      </div>
    </div>
  );
}
