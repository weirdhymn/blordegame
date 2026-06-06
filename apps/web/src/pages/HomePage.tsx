import { type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../session.js';

export function HomePage(): ReactElement {
  const { user, herd, signOut } = useSession();
  return (
    <main className="home">
      <header className="home-head">
        <div>
          <h1>{herd?.name ?? 'Your Herd'}</h1>
          <p className="sub">Signed in as {user?.username}</p>
        </div>
        <button onClick={() => void signOut()}>Log out</button>
      </header>

      <div className="stats">
        <div className="stat">
          <span className="stat-n">{herd?.cubes ?? 0}</span>
          <span className="stat-l">Cubes</span>
        </div>
        <div className="stat">
          <span className="stat-n">{herd?.level ?? 1}</span>
          <span className="stat-l">Level</span>
        </div>
      </div>

      <div className="card placeholder">
        <p>🐴 Your Pasture is taking shape — the horse list lands in the next step.</p>
        <p className="sub">
          Meanwhile: <Link to="/render">open the renderer dev page →</Link>
        </p>
      </div>
    </main>
  );
}
