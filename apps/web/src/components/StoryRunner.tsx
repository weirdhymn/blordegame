import { type ReactElement } from 'react';
import {
  type ChooseStoryResult,
  type SceneView,
  type StoryRunView,
  type StoryTrained,
} from '../api/explore.js';
import { pretty } from '../util/format.js';

type Ending = Extract<ChooseStoryResult, { ended: true }>;

export interface StoryLogEntry {
  text: string;
  harmony: number | null;
  success: boolean | null;
  train?: StoryTrained | null;
  bonded?: boolean;
}

const TRAIT_NAMES: Record<string, string> = {
  o: 'Openness',
  c: 'Conscientiousness',
  e: 'Extraversion',
  a: 'Agreeableness',
  n: 'Neuroticism',
};
const traitName = (t: string): string => TRAIT_NAMES[t] ?? t;

/** Presentational scene-runner for an interactive adventure (§9.3). All async lives in the parent. */
export function StoryRunner(props: {
  regionName: string;
  scene: SceneView | null;
  run: StoryRunView | null;
  log: StoryLogEntry[];
  ending: Ending | null;
  busy: boolean;
  error: string | null;
  onChoose: (choiceId: string) => void;
  onClose: () => void;
}): ReactElement {
  const { regionName, scene, run, log, ending, busy, error, onChoose, onClose } = props;

  return (
    <div className="card story">
      <h2 className="section-h">{regionName} — a story</h2>

      {run && (
        <p className="muted story-haul">
          Depth {run.stage} · Haul:{' '}
          {run.loot.length ? run.loot.map((l) => `${pretty(l.id)} ×${l.qty}`).join(', ') : '—'}
          {run.cubes > 0 ? ` · ${run.cubes} ⬡` : ''}
          {run.befriended ? ` · 🐴 ${run.befriended} joined` : ''}
        </p>
      )}

      {log.length > 0 && (
        <ul className="story-log">
          {log.map((l, i) => (
            <li key={i} className={l.success === false ? 'miss' : l.success === true ? 'hit' : ''}>
              {l.text}
              {l.harmony && l.harmony > 0 ? (
                <span className="muted">
                  {' '}
                  (harmony +{l.harmony}
                  {l.bonded ? ' 💞 they pulled together' : ''})
                </span>
              ) : null}
              {l.train ? (
                <span className="train">
                  {' '}
                  ↑ {l.train.horseName}&apos;s {pretty(l.train.skill)}{' '}
                  {l.train.leveledTo ? `rose to Lv ${l.train.leveledTo}!` : `+${l.train.xp} XP`}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {ending ? (
        <div className="story-end">
          <p className="story-scene">{ending.narration}</p>
          <h3 className="section-h">Home again</h3>
          <p>
            Banked:{' '}
            {ending.summary.loot.length
              ? ending.summary.loot.map((l) => `${pretty(l.id)} ×${l.qty}`).join(', ')
              : 'nothing this time'}
            {ending.summary.cubes > 0 ? `, ${ending.summary.cubes} ⬡` : ''}.
          </p>
          {ending.summary.befriended && (
            <p className="wild">🐴 {ending.summary.befriended} came home with you!</p>
          )}
          {ending.summary.fatigue > 0 && <p className="muted">The party returns a little tired.</p>}
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        scene && (
          <div className="story-scene-block">
            <p className="story-scene">{scene.text}</p>
            <div className="story-choices">
              {scene.choices.map((c) => (
                <button
                  key={c.id}
                  className="story-choice"
                  disabled={!c.available || busy}
                  onClick={() => onChoose(c.id)}
                  title={
                    !c.available && c.requires
                      ? `Needs a horse with ${traitName(c.requires.trait)} ≥ ${c.requires.min ?? '?'}`
                      : undefined
                  }
                >
                  <span className="story-choice-text">{c.text}</span>
                  {c.check && (
                    <span className="muted check-tag">
                      {c.check.stat.toUpperCase()}
                      {c.check.skill ? `/${pretty(c.check.skill)}` : ''} · DC {c.check.dc}
                      {c.check.harmony ? ' ✿' : ''}
                    </span>
                  )}
                  {!c.available && <span className="muted check-tag">🔒 locked</span>}
                </button>
              ))}
            </div>
          </div>
        )
      )}

      {!ending && (
        <button className="link-btn" disabled={busy} onClick={onClose}>
          Leave the adventure (lose any un-banked haul)
        </button>
      )}
    </div>
  );
}
