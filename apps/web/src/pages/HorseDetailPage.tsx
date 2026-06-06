import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import { resolve } from '@blorse/genetics';
import { buildRenderSpec } from '@blorse/render-core';
import { ApiError } from '../api/client.js';
import { care, getHorse, getPedigree, type Horse, type Pedigree } from '../api/horses.js';
import { assignJob, getJob, unassignJob, type JobAssignment } from '../api/jobs.js';
import { getPasture, type Buildable } from '../api/workshop.js';
import { HorseCanvas } from '../render/HorseCanvas.js';
import { pretty } from '../util/format.js';

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
  const [careNote, setCareNote] = useState<string | null>(null);
  const [careBusy, setCareBusy] = useState(false);
  const [job, setJob] = useState<JobAssignment | null>(null);
  const [jobStructures, setJobStructures] = useState<Buildable[]>([]);
  const [pick, setPick] = useState('');
  const [jobBusy, setJobBusy] = useState(false);

  const loadJob = useCallback(() => {
    if (!id) return;
    getJob(id)
      .then((r) => setJob(r.job))
      .catch(() => {
        /* ignore */
      });
  }, [id]);

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
        /* optional */
      });
    getJob(id)
      .then((r) => {
        if (!cancelled) setJob(r.job);
      })
      .catch(() => {
        /* ignore */
      });
    getPasture()
      .then((p) => {
        if (!cancelled) setJobStructures(p.buildable.filter((b) => b.built && b.job));
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function doCare(action: 'feed' | 'groom'): Promise<void> {
    if (!id) return;
    setCareBusy(true);
    setCareNote(null);
    try {
      setCareNote((await care(id, action)).message);
    } catch (e) {
      setCareNote(e instanceof ApiError ? e.message : 'Could not care for it.');
    } finally {
      setCareBusy(false);
    }
  }

  async function assign(): Promise<void> {
    if (!id || !pick) return;
    setJobBusy(true);
    try {
      await assignJob(id, pick);
      setPick('');
      loadJob();
    } catch {
      /* ignore */
    } finally {
      setJobBusy(false);
    }
  }

  async function unassign(): Promise<void> {
    if (!id) return;
    setJobBusy(true);
    try {
      await unassignJob(id);
      loadJob();
    } catch {
      /* ignore */
    } finally {
      setJobBusy(false);
    }
  }

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

      <h2 className="section-h">Care</h2>
      <div className="row-actions">
        <button disabled={careBusy} onClick={() => void doCare('feed')}>
          🍎 Feed
        </button>
        <button disabled={careBusy} onClick={() => void doCare('groom')}>
          🧽 Groom
        </button>
        {careNote && <span className="muted">{careNote}</span>}
      </div>

      {horse.lifeStage === 'adult' && (
        <>
          <h2 className="section-h">Job</h2>
          {job ? (
            <div className="row-actions">
              <span>
                Working the {pretty(job.structureType)} ({job.skill}) — earns Cubes each day.
              </span>
              <button disabled={jobBusy} onClick={() => void unassign()}>
                Unassign
              </button>
            </div>
          ) : jobStructures.length === 0 ? (
            <p className="muted">Build a Workshop structure with a job first.</p>
          ) : (
            <div className="row-actions">
              <select value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">— assign to a structure —</option>
                {jobStructures.map((s) => (
                  <option key={s.type} value={s.type}>
                    {s.name} ({s.skill})
                  </option>
                ))}
              </select>
              <button className="primary" disabled={!pick || jobBusy} onClick={() => void assign()}>
                Assign
              </button>
            </div>
          )}
        </>
      )}

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
