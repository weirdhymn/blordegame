import { useCallback, type ReactElement } from 'react';
import { getJournal } from '../api/social.js';
import { useLoad } from '../hooks/useLoad.js';

export function JournalPage(): ReactElement {
  const journal = useLoad(useCallback(() => getJournal(), []));
  const events = journal.data;

  return (
    <div className="journal">
      <h1>Journal</h1>
      {journal.error && (
        <div className="error" role="alert">
          {journal.error}
        </div>
      )}
      {journal.loading && <div className="loading">Loading…</div>}
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
