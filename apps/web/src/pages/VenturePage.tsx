import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import type { BattleView } from '../api/combat.js';
import {
  adventure,
  chooseStory,
  getKeeper,
  getRegions,
  startStory,
  type AdventureResult,
  type ChooseStoryResult,
  type KeeperChallenge,
  type RegionView,
  type SceneView,
  type StoryRunView,
} from '../api/explore.js';
import { listHerdHorses, type Horse } from '../api/horses.js';
import { BattleArena } from '../components/BattleArena.js';
import { StoryRunner, type StoryLogEntry } from '../components/StoryRunner.js';
import { useSession } from '../session.js';
import { pretty } from '../util/format.js';

type StoryEnding = Extract<ChooseStoryResult, { ended: true }>;

/** Venture Out (§9.3/§9.4) — the real expeditions: pick a region + party and set out into a RANDOM
 *  expedition (no picker — each day is a surprise), or take on the region's earned Keeper challenge
 *  (the boss). One of the two Adventure-hub paths; the other is the no-stakes Sparring Ring. */
export function VenturePage(): ReactElement {
  const { herd, refresh } = useSession();
  const [regions, setRegions] = useState<RegionView[]>([]);
  const [horses, setHorses] = useState<Horse[]>([]);
  const [regionId, setRegionId] = useState('');
  const [party, setParty] = useState<string[]>([]);
  const [adv, setAdv] = useState<AdventureResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Interactive "story" run (§9.3) — present only while one is in progress.
  const [storyRunId, setStoryRunId] = useState<string | null>(null);
  const [storyRegion, setStoryRegion] = useState('');
  const [scene, setScene] = useState<SceneView | null>(null);
  const [run, setRun] = useState<StoryRunView | null>(null);
  const [storyLog, setStoryLog] = useState<StoryLogEntry[]>([]);
  const [ending, setEnding] = useState<StoryEnding | null>(null);
  // The deliberate Keeper challenge (the boss) + its handoff (§9.4c). Regular expeditions are random.
  const [keeper, setKeeper] = useState<KeeperChallenge | null>(null);
  const [bossBattle, setBossBattle] = useState<BattleView | null>(null);

  const loadHorses = useCallback(() => {
    if (!herd) return;
    listHerdHorses(herd.id)
      .then((hs) => setHorses(hs.filter((h) => h.lifeStage === 'adult')))
      .catch(() => {
        /* ignore */
      });
  }, [herd]);

  useEffect(() => {
    if (!herd) return;
    getRegions()
      .then((rs) => {
        setRegions(rs);
        const open = rs.find((r) => r.unlocked);
        if (open) setRegionId(open.id);
      })
      .catch(() => {
        /* ignore */
      });
    loadHorses();
  }, [herd, loadHorses]);

  // The region's deliberate Keeper challenge (the boss) — its own earned option, never a random pull.
  const loadKeeper = useCallback(() => {
    const r = regions.find((x) => x.id === regionId);
    if (r?.interactive && r.unlocked) {
      getKeeper(regionId)
        .then(setKeeper)
        .catch(() => setKeeper(null));
    } else {
      setKeeper(null);
    }
  }, [regionId, regions]);
  useEffect(loadKeeper, [loadKeeper]);

  function toggle(id: string): void {
    setParty((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 4 ? [...p, id] : p));
  }

  const selected = regions.find((r) => r.id === regionId);
  const storyActive = storyRunId !== null || ending !== null;

  async function setOut(scriptId?: string): Promise<void> {
    setBusy(true);
    setError(null);
    setAdv(null);
    try {
      if (selected?.interactive) {
        const r = await startStory(regionId, party, scriptId);
        setStoryRunId(r.runId);
        setStoryRegion(selected.name);
        setScene(r.scene);
        setRun(r.run);
        setStoryLog([]);
        setEnding(null);
      } else {
        setAdv(await adventure(regionId, party));
        await refresh();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not set out.');
    } finally {
      setBusy(false);
    }
  }

  async function choose(choiceId: string): Promise<void> {
    if (!storyRunId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await chooseStory(storyRunId, choiceId);
      const line: StoryLogEntry = {
        text: res.befriended
          ? `${res.narration} ${res.befriended.name} joined you!`
          : res.narration,
        harmony: res.roll?.harmony ?? null,
        success: res.roll ? res.roll.success : null,
        train: res.trained ?? null,
        bonded: res.bonded,
      };
      setStoryLog((l) => [...l, line]);
      if (res.ended) {
        setScene(null);
        setRun(null);
        if (res.battle)
          setBossBattle(res.battle.view); // the deepest push → the boss fight
        else setEnding(res);
        await refresh();
      } else {
        setScene(res.scene);
        setRun(res.run);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went sideways.');
    } finally {
      setBusy(false);
    }
  }

  function closeStory(): void {
    setStoryRunId(null);
    setStoryRegion('');
    setScene(null);
    setRun(null);
    setStoryLog([]);
    setEnding(null);
    setError(null);
    void refresh();
    loadKeeper(); // a finished expedition may have just unlocked the Keeper
  }

  if (bossBattle) {
    const foe = bossBattle.combatants.find((c) => c.side === 'foe');
    return (
      <div className="explore">
        <BattleArena
          initial={bossBattle}
          onClose={() => {
            setBossBattle(null);
            closeStory();
          }}
          onCloseLabel="Back to Venturing"
          title={`⚔ ${foe?.name ?? 'Boss'}`}
        />
      </div>
    );
  }

  return (
    <div className="explore">
      <Link to="/adventure" className="back-link">
        ← Adventure
      </Link>
      <h1>🗺 Venture Out</h1>
      <p className="muted">
        Head to the three regions for real expeditions — cozy stories, skirmishes, and the region
        bosses, with stakes and rewards. Grind these as much as you like; the daily gather (your raw
        materials) lives back on the Pasture.
      </p>
      <label className="field">
        <span>Region</span>
        <select
          value={regionId}
          onChange={(e) => setRegionId(e.target.value)}
          disabled={storyActive}
        >
          {regions.map((r) => (
            <option key={r.id} value={r.id} disabled={!r.unlocked}>
              {r.name} · T{r.tier}
              {r.unlocked ? '' : ' (locked)'}
              {r.interactive ? ' ✦' : ''}
            </option>
          ))}
        </select>
      </label>

      {selected?.interactive && !storyActive && (
        <p className="hint">
          Each expedition is a surprise drawn from {selected.name}&apos;s pool — set out and see
          where the day takes you.
        </p>
      )}

      {storyActive ? (
        <StoryRunner
          regionName={storyRegion}
          scene={scene}
          run={run}
          log={storyLog}
          ending={ending}
          busy={busy}
          error={error}
          onChoose={(id) => void choose(id)}
          onClose={closeStory}
        />
      ) : (
        <>
          <h2 className="section-h">Party ({party.length}/4)</h2>
          <div className="party-pick">
            {horses.map((h) => (
              <button
                key={h.id}
                className={party.includes(h.id) ? 'chip on' : 'chip'}
                onClick={() => toggle(h.id)}
              >
                {h.name ?? h.id.slice(0, 8)}
              </button>
            ))}
          </div>
          <button
            className="primary"
            disabled={!regionId || party.length === 0 || busy}
            onClick={() => void setOut()}
          >
            {busy
              ? 'Heading out…'
              : selected?.interactive
                ? 'Set out (a story awaits ✦)'
                : 'Set out'}
          </button>

          {keeper?.keeper && (
            <section className="card keeper-card">
              <h2 className="section-h">⚔ Challenge the Keeper</h2>
              <p className="muted">
                The region&apos;s boss — a deliberate milestone you take on, not a random pull. Beat
                it to advance your Herd Tier.
              </p>
              {keeper.available ? (
                <button
                  className="primary"
                  disabled={party.length === 0 || busy}
                  onClick={() => keeper.keeper && void setOut(keeper.keeper.id)}
                >
                  Face {keeper.keeper.name}
                </button>
              ) : (
                <p className="muted">
                  🔒 Run {Math.max(0, keeper.needed - keeper.completed)} more expedition
                  {keeper.needed - keeper.completed === 1 ? '' : 's'} in {selected?.name} to earn a
                  challenge against {keeper.keeper.name} ({keeper.completed}/{keeper.needed}).
                </p>
              )}
            </section>
          )}

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {adv && (
            <div className="card adv-result">
              <h2 className="section-h">
                {adv.successes} / {adv.encounters.length} encounters won
              </h2>
              <div className="dice">
                {adv.encounters.map((e, i) => (
                  <span key={i} className={e.success ? 'die win' : 'die'}>
                    {e.crit ? '★' : e.d20} {e.success ? '✓' : '✗'}
                  </span>
                ))}
              </div>
              {adv.loot.length > 0 && (
                <p>Loot: {adv.loot.map((l) => `${pretty(l.id)} ×${l.qty}`).join(', ')}</p>
              )}
              {adv.rareFound > 0 && <p className="rare">✦ Found a rare item!</p>}
              {adv.wild && (
                <p className="wild">
                  A wild {adv.wild.name} appeared
                  {adv.wild.toTavern ? ' — it fled to the Tavern.' : ' and vanished.'}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
