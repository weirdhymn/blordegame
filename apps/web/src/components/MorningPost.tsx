import { useMemo, type ReactElement } from 'react';
import { resolve } from '@blorse/genetics';
import { Link } from 'react-router-dom';
import { buildRenderSpec } from '@blorse/render-core';
import type { DailyResult } from '../api/daily.js';
import type { Horse } from '../api/horses.js';
import { HorseCanvas } from '../render/HorseCanvas.js';

const MAX_BEATS = 8;

/** A revealed coat, rendered if the horse is already in the loaded herd list (it usually is —
 *  the Pasture loads the herd in parallel); otherwise the headline text carries the moment. */
function RevealSprite({ horse }: { horse: Horse }): ReactElement {
  const spec = useMemo(
    () =>
      buildRenderSpec(resolve(horse.genotype), {
        seed: horse.seed,
        glitch: horse.glitch,
        lifeStage: horse.lifeStage,
      }),
    [horse.genotype, horse.seed, horse.glitch, horse.lifeStage],
  );
  return <HorseCanvas spec={spec} scale={1} />;
}

/**
 * The Morning Post (§8.2) — one cozy digest for everything that happened overnight: the Cube
 * ledger, coat reveals (the headline), and the Living Herd's news column. Pure recomposition of
 * the daily catch-up result; closing it simply begins the day.
 */
export function MorningPost(props: {
  daily: DailyResult;
  horses: Horse[];
  onClose: () => void;
}): ReactElement {
  const { daily, horses, onClose } = props;
  const stipend = daily.cubesGained - daily.groomCubes;
  const beats = daily.journal.slice(0, MAX_BEATS);
  const moreBeats = daily.journal.length - beats.length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal morning-post" onClick={(e) => e.stopPropagation()}>
        <h2 className="post-masthead">📯 The Morning Post</h2>
        <p className="post-dateline">
          Day {daily.day} in the Pasture
          {daily.daysAdvanced > 1 ? ` · ${daily.daysAdvanced} days passed while you were away` : ''}
        </p>

        {daily.matured.length > 0 && (
          <section className="post-section">
            <h3 className="section-h">🎨 Grown up overnight</h3>
            {daily.matured.map((m) => {
              const horse = horses.find((h) => h.id === m.id);
              return (
                <div className="post-reveal" key={m.id}>
                  {horse && <RevealSprite horse={horse} />}
                  <p>
                    <strong>{m.name ?? 'A foal'}</strong> shed its foal-white in the night —{' '}
                    <strong>{m.coat}</strong>! The Field Guide has made a note.
                  </p>
                </div>
              );
            })}
          </section>
        )}

        <section className="post-section">
          <h3 className="section-h">💰 The ledger</h3>
          <ul className="post-ledger">
            {stipend > 0 && (
              <li>
                🌅 The morning stipend: <strong>+{stipend} ⬡</strong>
              </li>
            )}
            {daily.jobCubes > 0 && (
              <li>
                💼 The workers brought home: <strong>+{daily.jobCubes} ⬡</strong>
              </li>
            )}
            {daily.groomCubes > 0 && (
              <li>
                🛏 A thank-you for tucking them in: <strong>+{daily.groomCubes} ⬡</strong>
              </li>
            )}
            {daily.fertilizer > 0 && (
              <li>
                💩 The well-fed herd produced <strong>{daily.fertilizer} fertilizer</strong>{' '}
                overnight. Astonishingly local.
              </li>
            )}
            {stipend <= 0 && daily.jobCubes <= 0 && daily.groomCubes <= 0 && (
              <li className="muted">Nothing in the till — the day is young.</li>
            )}
          </ul>
        </section>

        {daily.studbook.length > 0 && (
          <section className="post-section">
            <h3 className="section-h">📖 The Studbook</h3>
            <ul className="post-ledger">
              {daily.studbook.map((b) => (
                <li key={b.goalId}>
                  ✒ <strong>{b.horse ?? 'A foal'}</strong> fulfills “{b.title}” ({b.coat})
                  {b.cubes > 0 && (
                    <>
                      {' '}
                      — <strong>+{b.cubes} ⬡</strong>
                    </>
                  )}
                  . The Registrar adds a line in good ink.
                </li>
              ))}
            </ul>
          </section>
        )}

        {daily.questCompletions.length > 0 && (
          <section className="post-section">
            <h3 className="section-h">🎓 Quests complete</h3>
            <ul className="post-ledger">
              {daily.questCompletions.map((q) => (
                <li key={q.questId}>
                  ✓ <strong>{q.title}</strong>
                  {q.cubes > 0 && (
                    <>
                      {' '}
                      — <strong>+{q.cubes} ⬡</strong>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {beats.length > 0 && (
          <section className="post-section">
            <h3 className="section-h">📰 While you were away</h3>
            <ul className="journal-list">
              {beats.map((b, i) => (
                <li key={i}>
                  <span className="glyph">{b.glyph ?? '•'}</span> {b.text}
                </li>
              ))}
            </ul>
            {moreBeats > 0 && (
              <p className="muted">
                …and {moreBeats} more in <Link to="/journal">the Journal</Link>.
              </p>
            )}
          </section>
        )}

        <div className="row-actions post-actions">
          <button className="primary" onClick={onClose}>
            ☀ Begin the day
          </button>
        </div>
      </div>
    </div>
  );
}
