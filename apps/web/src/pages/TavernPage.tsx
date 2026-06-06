import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { ApiError } from '../api/client.js';
import { listTavern, recruit, type TavernHorse } from '../api/tavern.js';
import { TavernCard } from '../components/TavernCard.js';
import { useSession } from '../session.js';

export function TavernPage(): ReactElement {
  const { herd, refresh } = useSession();
  const [list, setList] = useState<TavernHorse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    listTavern()
      .then(setList)
      .catch(() => setList([]));
  }, []);
  useEffect(() => load(), [load]);

  async function onRecruit(id: string): Promise<void> {
    setBusyId(id);
    setError(null);
    setNote(null);
    try {
      await recruit(id);
      setNote('Recruited! It is grazing in your Pasture now.');
      await refresh();
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not recruit that horse.');
    } finally {
      setBusyId(null);
    }
  }

  const cubes = herd?.cubes ?? 0;
  return (
    <div className="tavern">
      <h1>The Tavern</h1>
      <p className="sub">
        Wild horses that wandered in from the frontier. Recruit one with Cubes — you have {cubes} ⬡.
      </p>
      {note && <div className="note">{note}</div>}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {list === null && <div className="loading">Loading…</div>}
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
