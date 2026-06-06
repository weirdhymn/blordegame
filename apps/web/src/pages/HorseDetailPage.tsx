import { useEffect, useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import { resolve } from '@blorse/genetics';
import { buildRenderSpec } from '@blorse/render-core';
import { ApiError } from '../api/client.js';
import { getHorse, getPedigree, type Horse, type Pedigree } from '../api/horses.js';
import { HorseCanvas } from '../render/HorseCanvas.js';

const PERSONALITY_LABELS: Record<string, string> = {
  o: 'Openness',
  c: 'Conscientiousness',
  e: 'Extraversion',
  a: 'Agreeableness',
  n: 'Neuroticism',
};

function PedigreeNode({ node }: { node: Pedigree }): ReactElement {
  return (
    <li>
      <span className="ped-name">{node.name ?? node.displayName}</span>{' '}
      <span className="ped-coat">{node.lifeStage === 'foal' ? 'foal' : node.displayName}</span>
      {node.parents.length > 0 && (
        <ul>
          {node.parents.map((p) => (
            <PedigreeNode key={p.id} node={p} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function HorseDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const [horse, setHorse] = useState<Horse | null>(null);
  const [ped, setPed] = useState<Pedigree | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setHorse(null);
    setPed(null);
    setError(null);
    getHorse(id)
      .then((h) => {
        if (!cancelled) setHorse(h);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Could not load this horse.');
      });
    getPedigree(id)
      .then((p) => {
        if (!cancelled) setPed(p);
      })
      .catch(() => {
        /* pedigree is optional */
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error)
    return (
      <div className="error" role="alert">
        {error}
      </div>
    );
  if (!horse) return <div className="loading">Loading…</div>;

  const spec = buildRenderSpec(resolve(horse.genotype), {
    seed: horse.seed,
    glitch: horse.glitch,
    lifeStage: horse.lifeStage,
  });

  return (
    <div className="detail">
      <p>
        <Link to="/">← back to the Pasture</Link>
      </p>
      <div className="detail-head">
        <HorseCanvas spec={spec} scale={3} />
        <div>
          <h1>{horse.name ?? 'Unnamed'}</h1>
          <p className="sub">
            {spec.foalWhite ? 'Foal · coat revealed at adulthood' : spec.displayName} ·{' '}
            {horse.lifeStage} · {horse.origin}
          </p>
        </div>
      </div>

      <h2 className="section-h">Stats</h2>
      <div className="kv-grid">
        {Object.entries(horse.stats).map(([k, v]) => (
          <div className="kv" key={k}>
            <span className="kv-k">{k.toUpperCase()}</span>
            <span className="kv-v">{v}</span>
          </div>
        ))}
      </div>

      <h2 className="section-h">Skills</h2>
      <div className="kv-grid">
        {Object.entries(horse.skills).map(([k, s]) => (
          <div className="kv" key={k}>
            <span className="kv-k">{k}</span>
            <span className="kv-v">Lv {s.level}</span>
          </div>
        ))}
      </div>

      <h2 className="section-h">Personality</h2>
      <div className="bars">
        {Object.entries(horse.personality).map(([k, v]) => (
          <div className="bar-row" key={k}>
            <span className="bar-l">{PERSONALITY_LABELS[k] ?? k}</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${v}%` }} />
            </span>
            <span className="bar-v">{v}</span>
          </div>
        ))}
      </div>

      {ped && ped.parents.length > 0 && (
        <>
          <h2 className="section-h">Pedigree</h2>
          <ul className="pedigree">
            {ped.parents.map((p) => (
              <PedigreeNode key={p.id} node={p} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
