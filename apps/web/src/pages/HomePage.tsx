import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { listHerdHorses, type Horse } from '../api/horses.js';
import { HorseCard } from '../components/HorseCard.js';
import { useSession } from '../session.js';

export function HomePage(): ReactElement {
  const { user, herd, signOut } = useSession();
  const [horses, setHorses] = useState<Horse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!herd) return;
    let cancelled = false;
    setHorses(null);
    setError(null);
    listHerdHorses(herd.id)
      .then((hs) => {
        if (!cancelled) setHorses(hs);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Could not load your herd.');
      });
    return () => {
      cancelled = true;
    };
  }, [herd]);

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
        <div className="stat">
          <span className="stat-n">{horses?.length ?? '—'}</span>
          <span className="stat-l">Horses</span>
        </div>
      </div>

      <h2 className="section-h">The Pasture</h2>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {!error && horses === null && <div className="loading">Loading your herd…</div>}
      {horses && horses.length === 0 && (
        <div className="card placeholder">
          <p>No horses yet — odd for a new herd. Try the Tavern or an adventure.</p>
        </div>
      )}
      {horses && horses.length > 0 && (
        <div className="horse-grid">
          {horses.map((h) => (
            <HorseCard key={h.id} horse={h} />
          ))}
        </div>
      )}

      <p className="sub footer-link">
        <Link to="/render">open the renderer dev page →</Link>
      </p>
    </main>
  );
}
