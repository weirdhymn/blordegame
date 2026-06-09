import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { colorBySlug, formatGenotype, resolve } from '@blorse/genetics';
import { buildRenderSpec } from '@blorse/render-core';
import { getFieldGuide, type FieldGuide } from '../api/social.js';
import { HorseCanvas } from '../render/HorseCanvas.js';

/** A discovered coat rendered as the actual pixel-horse sprite — the genetics engine's real output,
 *  derived client-side from the catalog's representative genotype for that colour (a fixed seed keeps
 *  the Field Guide's portrait stable). Falls back to a flat swatch if the slug isn't in the catalog. */
function CoatSprite({ slug, scale }: { slug: string; scale: number }): ReactElement {
  const spec = useMemo(() => {
    const entry = colorBySlug(slug);
    return entry ? buildRenderSpec(resolve(entry.genotype), { seed: 7, lifeStage: 'adult' }) : null;
  }, [slug]);
  if (!spec) return <div className="guide-swatch lg" />;
  return <HorseCanvas spec={spec} scale={scale} />;
}

/** The Field Guide (§9): not just a list of coat names — a visual record of every coat the herd has
 *  revealed, each the engine's actual render. Click one to study the genotype that produces it. */
export function FieldGuidePage(): ReactElement {
  const [fg, setFg] = useState<FieldGuide | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    getFieldGuide()
      .then(setFg)
      .catch(() => {
        /* ignore */
      });
  }, []);

  const entry = selected ? colorBySlug(selected) : null;
  const selectedName = selected
    ? (fg?.discovered.find((d) => d.slug === selected)?.name ?? entry?.name ?? selected)
    : null;

  return (
    <div className="guide">
      <h1>Field Guide</h1>
      {!fg && <div className="loading">Loading…</div>}
      {fg && (
        <>
          <p className="sub">
            {fg.discoveredCount} of {fg.catalogSize} coats discovered — a living record of what your
            breeding and adventuring have turned up.
          </p>
          {fg.discovered.length === 0 ? (
            <p className="sub">No coats yet — breed and adventure to reveal them.</p>
          ) : (
            <div className="guide-layout">
              <div className="guide-grid">
                {fg.discovered.map((d) => (
                  <button
                    type="button"
                    className={`guide-coat${selected === d.slug ? ' on' : ''}`}
                    key={d.slug}
                    onClick={() => setSelected(d.slug)}
                  >
                    <CoatSprite slug={d.slug} scale={1} />
                    <span className="guide-coat-name">{d.name}</span>
                  </button>
                ))}
              </div>
              {selected && entry && (
                <aside className="guide-detail card">
                  <div className="guide-detail-head">
                    <h2 className="section-h">{selectedName}</h2>
                    <button className="link-btn" onClick={() => setSelected(null)}>
                      close ✕
                    </button>
                  </div>
                  <CoatSprite slug={selected} scale={2} />
                  <div className="guide-swatch-row">
                    <span className="guide-swatch" style={{ background: entry.swatch }} />
                    <span className="muted">representative coat colour</span>
                  </div>
                  <h3 className="section-h">Genotype</h3>
                  <p className="muted">A genotype that produces this coat:</p>
                  <code>{formatGenotype(entry.genotype)}</code>
                  <p className="muted">
                    Different allele combinations can land on the same coat — this is one the engine
                    enumerates for {selectedName}.
                  </p>
                </aside>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
