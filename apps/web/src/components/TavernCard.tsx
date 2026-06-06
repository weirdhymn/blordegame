import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { resolve } from '@blorse/genetics';
import { buildRenderSpec } from '@blorse/render-core';
import { getHorse, type Horse } from '../api/horses.js';
import type { TavernHorse } from '../api/tavern.js';
import { HorseCanvas } from '../render/HorseCanvas.js';

export function TavernCard({
  entry,
  canAfford,
  busy,
  onRecruit,
}: {
  entry: TavernHorse;
  canAfford: boolean;
  busy: boolean;
  onRecruit: (id: string) => void;
}): ReactElement {
  const [horse, setHorse] = useState<Horse | null>(null);
  useEffect(() => {
    let cancelled = false;
    getHorse(entry.id)
      .then((h) => {
        if (!cancelled) setHorse(h);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [entry.id]);

  const spec = useMemo(
    () =>
      horse
        ? buildRenderSpec(resolve(horse.genotype), {
            seed: horse.seed,
            glitch: horse.glitch,
            lifeStage: horse.lifeStage,
          })
        : null,
    [horse],
  );

  return (
    <div className="horse-card tavern-card">
      {spec ? <HorseCanvas spec={spec} scale={2} /> : <div className="canvas-ph" />}
      <div className="horse-name">{entry.name}</div>
      <div className="horse-coat">{spec ? spec.displayName : '…'}</div>
      <div className="fee">{entry.fee} ⬡</div>
      <button className="primary" disabled={!canAfford || busy} onClick={() => onRecruit(entry.id)}>
        {busy ? '…' : canAfford ? 'Recruit' : 'Too dear'}
      </button>
    </div>
  );
}
