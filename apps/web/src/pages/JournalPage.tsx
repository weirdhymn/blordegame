import { useEffect, useState, type ReactElement } from 'react';
import { getJournal, type JournalEvent } from '../api/social.js';

export function JournalPage(): ReactElement {
  const [events, setEvents] = useState<JournalEvent[] | null>(null);

  useEffect(() => {
    getJournal()
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);

  return (
    <div className="journal">
      <h1>Journal</h1>
      {events === null && <div className="loading">Loading…</div>}
      {events && events.length === 0 && (
        <p className="sub">Quiet so far. Your herd&apos;s story fills in as the days pass.</p>
      )}
      {events && events.length > 0 && (
        <ul className="journal-list">
          {events.map((ev) => (
            <li key={ev.id}>
              <span className="glyph">{ev.glyph ?? '•'}</span> {ev.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
