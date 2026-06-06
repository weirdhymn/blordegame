import { useEffect, useState, type ReactElement } from 'react';
import { getFieldGuide, type FieldGuide } from '../api/social.js';

export function FieldGuidePage(): ReactElement {
  const [fg, setFg] = useState<FieldGuide | null>(null);

  useEffect(() => {
    getFieldGuide()
      .then(setFg)
      .catch(() => {
        /* ignore */
      });
  }, []);

  return (
    <div className="guide">
      <h1>Field Guide</h1>
      {!fg && <div className="loading">Loading…</div>}
      {fg && (
        <>
          <p className="sub">
            {fg.discoveredCount} of {fg.catalogSize} coats discovered.
          </p>
          {fg.discovered.length === 0 ? (
            <p className="sub">No coats yet — breed and adventure to reveal them.</p>
          ) : (
            <div className="guide-grid">
              {fg.discovered.map((d) => (
                <div className="guide-chip" key={d.slug}>
                  {d.name}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
