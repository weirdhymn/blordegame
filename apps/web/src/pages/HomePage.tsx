import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { checkIn, simulate, type DailyResult } from '../api/daily.js';
import { listHerdHorses, type Horse } from '../api/horses.js';
import { HorseCard } from '../components/HorseCard.js';
import { useSession } from '../session.js';

function describe(r: DailyResult): string {
  if (r.daysAdvanced === 0) return 'All caught up — nothing new today.';
  const bits = [
    `+${r.daysAdvanced} day${r.daysAdvanced > 1 ? 's' : ''}`,
    `+${r.cubesGained} Cubes`,
  ];
  if (r.jobCubes > 0) bits.push(`+${r.jobCubes} from jobs`);
  if (r.matured.length > 0)
    bits.push(`${r.matured.length} foal${r.matured.length > 1 ? 's' : ''} grew up`);
  return bits.join(' · ');
}

export function HomePage(): ReactElement {
  const { herd, refresh } = useSession();
  const [horses, setHorses] = useState<Horse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
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

  async function run(fn: () => Promise<DailyResult>): Promise<void> {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      setNote(describe(await fn()));
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
      <h1>The Pasture</h1>
      <div className="row-actions">
        <button className="primary" disabled={busy} onClick={() => void run(checkIn)}>
          Daily check-in
        </button>
        <Link to="/breed" className="btn-link">
          Breed →
        </Link>
        <button
          className="dev"
          disabled={busy}
          title="dev only — fast-forward the clock 6 days"
          onClick={() => void run(() => simulate(6))}
        >
          ⏩ +6 days (dev)
        </button>
      </div>
      {note && <div className="note">{note}</div>}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {horses === null && <div className="loading">Loading your herd…</div>}
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
