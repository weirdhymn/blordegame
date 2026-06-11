import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { checkIn, hasNews, type DailyResult } from '../api/daily.js';
import { listHerdHorses, type Horse } from '../api/horses.js';
import { getRelationships } from '../api/social.js';
import { DailyGather } from '../components/DailyGather.js';
import { HerdTier } from '../components/HerdTier.js';
import { HorseCard } from '../components/HorseCard.js';
import { MorningPost } from '../components/MorningPost.js';
import { useLoad } from '../hooks/useLoad.js';
import { bondBadge, dailyVignette } from '../util/herdmates.js';
import { useSession } from '../session.js';

export function HomePage(): ReactElement {
  const { herd, refresh, consumeDaily } = useSession();
  const [horses, setHorses] = useState<Horse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [post, setPost] = useState<DailyResult | null>(null);
  const [busy, setBusy] = useState(false);

  const loadHorses = useCallback(() => {
    if (!herd) return;
    listHerdHorses(herd.id)
      .then(setHorses)
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : 'Could not load horses.'),
      );
  }, [herd]);

  useEffect(() => {
    setHorses(null);
    loadHorses();
  }, [loadHorses]);

  // Login carried the overnight digest here (§8.2) — deliver the Morning Post on arrival.
  useEffect(() => {
    const daily = consumeDaily();
    if (daily && hasNews(daily)) setPost(daily);
  }, [consumeDaily]);

  // The Living Herd's ties (§8) — bond badges on the cards + the day's little pasture scene.
  const relsLoad = useLoad(useCallback(() => getRelationships(), []));
  const rels = relsLoad.data ?? [];
  const nameOf = useCallback(
    (id: string): string => horses?.find((h) => h.id === id)?.name ?? 'a herdmate',
    [horses],
  );
  // Day-grained seed: the vignette is the day's scene, not a per-render slot machine.
  const vignette =
    horses && horses.length > 0
      ? dailyVignette(rels, nameOf, Math.floor(Date.now() / 86_400_000))
      : null;

  async function run(fn: () => Promise<DailyResult>): Promise<void> {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const r = await fn();
      if (hasNews(r)) setPost(r);
      else setNote('All caught up — nothing new today.');
      await refresh();
      loadHorses();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Check-in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pasture">
      {post && <MorningPost daily={post} horses={horses ?? []} onClose={() => setPost(null)} />}
      <h1>The Pasture</h1>
      {note && <div className="note">{note}</div>}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {/* Desktop dashboard: the herd is the centre-stage panel; actions + progression + the
          daily chore live in a side rail. Presentational wrappers only — collapses to one
          column on narrow screens (see .pasture-grid). */}
      <div className="pasture-grid">
        <aside className="pasture-side">
          <div className="row-actions">
            <button className="primary" disabled={busy} onClick={() => void run(checkIn)}>
              Daily check-in
            </button>
            <Link to="/breed" className="btn-link">
              Breed →
            </Link>
          </div>
          <HerdTier />
          <DailyGather />
        </aside>
        <div className="pasture-main">
          <h2 className="section-h">Your herd</h2>
          {vignette && <p className="vignette">{vignette}</p>}
          {horses === null && <div className="loading">Loading your herd…</div>}
          {horses && horses.length === 0 && (
            <div className="card placeholder">
              <p>No horses yet — try the Tavern or an adventure.</p>
            </div>
          )}
          {horses && horses.length > 0 && (
            <div className="horse-grid">
              {horses.map((h) => (
                <HorseCard key={h.id} horse={h} bond={bondBadge(h.id, rels)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
