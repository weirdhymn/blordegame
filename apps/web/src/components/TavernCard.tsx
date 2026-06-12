import { useMemo, type ReactElement } from 'react';
import { resolve } from '@blorse/genetics';
import { buildRenderSpec } from '@blorse/render-core';
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
  // Render fields ride the listing now (audit P2) — no per-card fetch, no stranded "…".
  const spec = useMemo(
    () =>
      buildRenderSpec(resolve(entry.genotype), {
        seed: entry.seed,
        glitch: entry.glitch,
        lifeStage: 'adult', // Tavern strays are always adults
      }),
    [entry.genotype, entry.seed, entry.glitch],
  );

  return (
    <div className="horse-card tavern-card">
      <HorseCanvas spec={spec} scale={2} />
      <div className="horse-name">{entry.name}</div>
      <div className="horse-coat">{spec.displayName}</div>
      <div className="fee">{entry.fee} ⬡</div>
      <button className="primary" disabled={!canAfford || busy} onClick={() => onRecruit(entry.id)}>
        {busy ? '…' : canAfford ? 'Recruit' : 'Too dear'}
      </button>
    </div>
  );
}
