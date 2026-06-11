import { useCallback, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { listTavern, recruit } from '../api/tavern.js';
import { TavernCard } from '../components/TavernCard.js';
import { useLoad } from '../hooks/useLoad.js';
import { useSession } from '../session.js';

export function TavernPage(): ReactElement {
  const { herd, refresh } = useSession();
  const tavern = useLoad(useCallback(() => listTavern(), []));
  const list = tavern.data;
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false); // herd_full → link to the progression screen
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onRecruit(id: string): Promise<void> {
    setBusyId(id);
    setError(null);
    setBlocked(false);
    setNote(null);
    try {
      await recruit(id);
      setNote('Recruited! It is grazing in your Pasture now.');
      await refresh();
      tavern.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not recruit that horse.');
      setBlocked(e instanceof ApiError && e.code === 'herd_full');
    } finally {
      setBusyId(null);
    }
  }

  const cubes = herd?.cubes ?? 0;
  return (
    <div className="tavern">
      <Link className="back-link" to="/town">
        ← The Town
      </Link>
      <h1>The Tavern</h1>
      <p className="sub">
        Wild horses that wandered in from the frontier. Recruit one with Cubes — you have {cubes} ⬡.
      </p>
      {note && <div className="note">{note}</div>}
      {(error ?? tavern.error) && (
        <div className="error" role="alert">
          {error ?? tavern.error}
          {blocked && (
            <>
              {' '}
              <Link to="/">→ Grow your Herd Tier</Link>
            </>
          )}
        </div>
      )}
      {tavern.loading && <div className="loading">Loading…</div>}
      {list && list.length === 0 && (
        <div className="card placeholder">
          <p>The Tavern is empty. Send a party adventuring — wild horses sometimes flee here.</p>
        </div>
      )}
      {list && list.length > 0 && (
        <div className="horse-grid">
          {list.map((t) => (
            <TavernCard
              key={t.id}
              entry={t}
              canAfford={cubes >= t.fee}
              busy={busyId === t.id}
              onRecruit={(id) => void onRecruit(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
