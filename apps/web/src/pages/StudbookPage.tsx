import { useCallback, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { getStudbook, type StudbookGoalView } from '../api/studbook.js';
import { useLoad } from '../hooks/useLoad.js';

const PAGE_NAME: Record<1 | 2 | 3, string> = { 1: 'Novice', 2: 'Journeyman', 3: 'Master' };

function GoalCard({ goal }: { goal: StudbookGoalView }): ReactElement {
  return (
    <div className={`goal-card${goal.done ? ' goal-done' : ''}`}>
      <div className="goal-head">
        <strong>{goal.title}</strong>
        <span className="goal-reward">{goal.done ? '✓' : `${goal.cubes} ⬡`}</span>
      </div>
      <p className="goal-flavor">{goal.flavor}</p>
      {goal.done && (
        <p className="goal-stamp">
          Fulfilled by <strong>{goal.done.horse ?? 'a horse since departed'}</strong> —{' '}
          {goal.done.coat}. Entered in good ink.
        </p>
      )}
    </div>
  );
}

/** The Studbook (§7m) — the Registrar's standing goals (a fixed ladder, no timers) and the
 *  registry of every line your herd has founded. Goals complete on their own at the coat
 *  reveal; the Morning Post brings the news. This page is just the book, open. */
export function StudbookPage(): ReactElement {
  const book = useLoad(useCallback(() => getStudbook(), []));
  const goals = book.data?.goals ?? [];
  const registry = book.data?.registry ?? [];
  const doneCount = goals.filter((g) => g.done).length;

  return (
    <div className="studbook">
      <Link className="back-link" to="/town">
        ← The Town
      </Link>
      <h1>📖 The Studbook</h1>
      <p className="sub">
        The Registrar keeps a list of coats the book still lacks — standing requests, no deadlines,
        no rotation. Breed one, raise it to its reveal, and the entry writes itself.{' '}
        {goals.length > 0 && (
          <strong>
            {doneCount} of {goals.length} fulfilled.
          </strong>
        )}
      </p>
      {book.error && (
        <div className="error" role="alert">
          {book.error}
        </div>
      )}
      {book.loading && <div className="loading">Loading…</div>}

      {book.data && (
        <>
          {([1, 2, 3] as const).map((tier) => (
            <section key={tier}>
              <h2 className="section-h">
                Page {tier}: {PAGE_NAME[tier]}
              </h2>
              <div className="goal-grid">
                {goals
                  .filter((g) => g.tier === tier)
                  .map((g) => (
                    <GoalCard key={g.id} goal={g} />
                  ))}
              </div>
            </section>
          ))}

          <section>
            <h2 className="section-h">Lines founded in your name</h2>
            {registry.length === 0 ? (
              <div className="card placeholder">
                <p>
                  No lines yet — the page waits. Breed a foal and raise it to its reveal; the
                  Registrar will take it from there.
                </p>
              </div>
            ) : (
              <table className="registry-table">
                <thead>
                  <tr>
                    <th>Coat</th>
                    <th>Bred</th>
                    <th>Line founded by</th>
                  </tr>
                </thead>
                <tbody>
                  {registry.map((l) => (
                    <tr key={l.coat}>
                      <td>{l.coat}</td>
                      <td>×{l.count}</td>
                      <td>
                        <Link to={`/horses/${l.firstId}`}>{l.firstName ?? 'Unnamed'}</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
