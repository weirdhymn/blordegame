import { useMemo, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { resolve } from '@blorse/genetics';
import { buildRenderSpec } from '@blorse/render-core';
import type { Horse } from '../api/horses.js';
import { HorseCanvas } from '../render/HorseCanvas.js';

export function HorseCard({ horse }: { horse: Horse }): ReactElement {
  // Preview render only (golden rule): the look is derived client-side from the stored
  // (genotype, seed, glitch, lifeStage) — pixel-identical to the server's /spec.
  const spec = useMemo(
    () =>
      buildRenderSpec(resolve(horse.genotype), {
        seed: horse.seed,
        glitch: horse.glitch,
        lifeStage: horse.lifeStage,
      }),
    [horse.genotype, horse.seed, horse.glitch, horse.lifeStage],
  );

  return (
    <Link to={`/horses/${horse.id}`} className="horse-card">
      <HorseCanvas spec={spec} scale={2} />
      <div className="horse-name">{horse.name ?? 'Unnamed'}</div>
      <div className="horse-coat">{spec.foalWhite ? 'Foal · coat hidden' : spec.displayName}</div>
    </Link>
  );
}
