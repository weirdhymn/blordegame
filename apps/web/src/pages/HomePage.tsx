import { useEffect, useState, type ReactElement } from 'react';
import { ApiError } from '../api/client.js';
import { listHerdHorses, type Horse } from '../api/horses.js';
import { HorseCard } from '../components/HorseCard.js';
import { useSession } from '../session.js';

export function HomePage(): ReactElement {
  const { herd } = useSession();
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
    <div className="pasture">
      <h1>The Pasture</h1>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {!error && horses === null && <div className="loading">Loading your herd…</div>}
      {horses && horses.length === 0 && (
        <div className="card placeholder">
          <p>No horses yet — try the Tavern or an adventure.</p>
        </div>
      )}
      {horses && horses.length > 0 && (
        <div className="horse-grid">
          {horses.map((h) => (
            <HorseCard key={h.id} horse={h} />
          ))}
        </div>
      )}
    </div>
  );
}
