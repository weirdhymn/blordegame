import { useEffect, useMemo, useRef, useState } from 'react';
import { formatGenotype, randomGenotype, resolve, type FreqOverride } from '@blorse/genetics';
import { buildRenderSpec, type GlitchKind } from '@blorse/render-core';
import { loadLayerImages, type LayerImages } from './render/images.js';
import { compositeHorse, exportHorsePNG } from './render/compositor.js';
import { decodeState, encodeState, type HorseState } from './render/url-state.js';

const SCALE = 4;
const W = 150;
const H = 126;

// Beta render scope (§4.5, §14.7): keep deferred white-spotting & leopard loci off
// their dominant alleles, so rolled horses stay within what the renderer supports.
const BETA_FREQ: FreqOverride = {
  T: { T: 0, n: 1 },
  Sb: { Sb: 0, n: 1 },
  O: { O: 0, n: 1 },
  SW1: { SW1: 0, n: 1 },
  Lp: { Lp: 0, lp: 1 },
  PATN1: { PATN1: 0, patn1: 1 },
  PATN2: { PATN2: 0, patn2: 1 },
};

function initialState(): HorseState {
  return (
    decodeState(window.location.hash) ?? {
      genotype: randomGenotype(BETA_FREQ),
      seed: 1,
      glitch: null,
      lifeStage: 'adult',
    }
  );
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [images, setImages] = useState<LayerImages | null>(null);
  const [st, setSt] = useState<HorseState>(initialState);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadLayerImages()
      .then(setImages)
      .catch((e: unknown) => console.error('layer load failed', e));
  }, []);

  const resolved = useMemo(() => resolve(st.genotype), [st.genotype]);
  const spec = useMemo(
    () => buildRenderSpec(resolved, { seed: st.seed, glitch: st.glitch, lifeStage: st.lifeStage }),
    [resolved, st.seed, st.glitch, st.lifeStage],
  );

  useEffect(() => {
    window.history.replaceState(null, '', `#${encodeState(st)}`);
    const cv = canvasRef.current;
    if (!images || !cv) return;
    const ctx = cv.getContext('2d');
    if (ctx) compositeHorse(ctx, spec, images, SCALE);
  }, [images, spec, st]);

  const update = (patch: Partial<HorseState>) => {
    setSt((s) => ({ ...s, ...patch }));
    setCopied(false);
  };

  return (
    <main>
      <h1>blorsegame · renderer</h1>
      <p className="sub">
        Phase 2 dev page — genotype → horse. Roll, resample, glitch, save, share.
      </p>

      <div className="stage">
        <canvas
          ref={canvasRef}
          width={W * SCALE}
          height={H * SCALE}
          aria-label={spec.displayName}
        />
        <div className="name">
          {spec.foalWhite ? 'Foal — coat revealed at adulthood' : spec.displayName}
        </div>
        <div className="hex">
          {spec.foalWhite ? '#fbfbf7' : spec.coat}
          {spec.glitch ? ` · glitch: ${spec.glitch}` : ''}
        </div>
      </div>

      <div className="controls">
        <button
          className="primary"
          onClick={() => update({ genotype: randomGenotype(BETA_FREQ), seed: st.seed + 1 })}
        >
          🎲 Roll a horse
        </button>
        <button onClick={() => update({ seed: st.seed + 1 })}>↻ Resample</button>
        <label>
          Stage
          <select
            value={st.lifeStage}
            onChange={(e) => update({ lifeStage: e.target.value === 'foal' ? 'foal' : 'adult' })}
          >
            <option value="adult">adult</option>
            <option value="foal">foal</option>
          </select>
        </label>
        <label>
          Glitch
          <select
            value={st.glitch ?? ''}
            onChange={(e) =>
              update({ glitch: e.target.value ? (e.target.value as GlitchKind) : null })
            }
          >
            <option value="">none</option>
            <option value="inverted">inverted</option>
            <option value="screen">screen</option>
            <option value="shade">shade</option>
          </select>
        </label>
        <button onClick={() => images && exportHorsePNG(spec, images)}>⬇ Save PNG</button>
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(window.location.href);
            setCopied(true);
          }}
        >
          {copied ? '✓ Copied' : '🔗 Copy link'}
        </button>
      </div>

      <input
        className="geno"
        value={formatGenotype(st.genotype)}
        readOnly
        onFocus={(e) => e.target.select()}
        aria-label="genotype string"
      />
    </main>
  );
}
