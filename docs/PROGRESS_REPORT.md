# BLORSE — Development Report

**State: feature-complete for beta** (per `BLORSE_PLAN.md` §11's own definition).
Window: 2026-06-05 → 2026-06-12 · 88 commits · all four workspaces green.
(Supersedes the 06-05 report, which predated the client wiring and §7j–§7v.)

A cozy, asynchronous multiplayer life-sim of pixel horses in a literal digital world:
real-genetics breeding, exploration, a DnD-style stats-and-dice RPG layer, an autonomous
Living Herd, and an async social layer — full-stack TypeScript, one repository.

---

## 1. By the numbers

| Surface | Count |
|---|---|
| Code | ~33,500 lines (server 11,975 · server tests 4,967 · web 8,752 · genetics pkg 3,431 · render-core 3,825 · balance 512) |
| API | 84 endpoints across 19 route files, 35 services |
| Web | 24 pages (one lazy authed chunk; /login ships 170KB without the genetics engine) |
| Database | 23 tables, 24 migrations (0000–0023), PGlite **and** node-postgres via one driver-agnostic `DB` type |
| Tests | **903 checks**: 523 server (e2e on real migrations) · 340 vendored engine · 11 facade · 13 render-core · 16 web |
| Balance | 132 named constants in one package (the §14 single-source rule held) |
| Content | 4 regions · 20 adventure scripts (16 pool + 4 Keepers) · 10 enemies · 20 omens · 5 quests · 32 items · 10 recipes · 7 structures · 8 crops · 14 studbook goals · 72-coat catalog · 21 genetic loci · 3 glitches |

## 2. Architecture — the rules and whether they held

- **Vendored genetics engine, sacred.** `packages/genetics/vendor/` wrapped by a typed ESM
  facade. Held through the entire build *including the first live gene drop* (§7u): the
  Mushroom locus is a pure data entry; its look/naming live in the facade (`mushroomize`);
  the single engine-side change ever made is one row in the static `OFF` baseline table,
  flagged in the commit and codified in the runbook's field notes.
- **Server authoritative, seeded determinism.** Every state change runs server-side through
  `mulberry32`; the client renders previews only. Omens, autonomy beats, adventure draws,
  battle rolls, glitch birth-rolls, and garden randomness all derive from seeds — a
  twin-herd test pins Living-Herd determinism outright.
- **Phenotype derived, never stored.** Only `(genotype, seed, glitch)` persists. The same
  discipline generalized everywhere: garden plot stages derive from timestamps at read,
  calling cards derive from interaction history, studbook founded-lines derive from owned
  horses, wither finalizes lazily and returns the crop.
- **The atomic economy kernel.** `spendCubes` (conditional `UPDATE … WHERE cubes >= n`),
  `creditCubes`, `consumeItems` (conditional decrements in a tx, savepoint-safe). Every
  value flow rides it — craft, cook, recruit, upload, build, garden, shrine, parcel gifts,
  market, trades. The audit's one P0 (two legacy flows bypassing it) and a family of
  unconditional-claim races (daily, expedition bank, combat reward, gather cap) were
  refitted onto the same conditional-claim idiom.
- **Reveal protection as an invariant class.** Foals render solid white until adulthood;
  the audit and three later features (visits, pedigree, public horse API) each found and
  closed a leak of the same class — foal `genotype`/`seed`/coat-name never leave the server.
- **Balance in one place / show-don't-tell / cozy-first.** No fail states anywhere: worst
  outcomes are meager hauls, "…but nothing happened," spooked-not-dead, withered crops that
  refund themselves, and a Keeper you may politely bow out of.

## 3. Systems inventory

### Core loop
- **Breeding** — real Mendelian inheritance over 21 loci; no-shared-ancestor gate via a
  materialized lineage closure; cooldowns, herd-cap, bond bonuses; punnett odds + carrier
  whispers on the Breed page; foal-white reveal at adulthood (the Morning Post headline).
- **Rendering** — grayscale layer manifest + palette adapter; per-individual seeded color
  jitter; 3 glitch transforms (inverted/screen/shade); integer-scale pixel discipline
  enforced in CSS (`flex-shrink: 0` on every sprite).
- **Daily rhythm** — midnight-EST rollover (UTC−5 fixed arithmetic, DST-immune); login
  catch-up replays missed days deterministically; the **Morning Post** digests it all
  (stipend, jobs, groom thank-you, fertilizer, coat reveals, quest + studbook completions,
  Living-Herd beats).
- **Care hub** — communal cook (stat meal buffs from grains/crops, saffron amplifier) +
  evening groom (soothes `rattled`, next-morning bonus). Optional by design; skipping never
  punishes (fed-day fertilizer is a bonus, not a tax).
- **The Garden (§7j)** — plant the crop itself (no seeds); 8 crops over 5 tiers
  (12h–96h) with dual yields; value-per-hour ~0.50→0.58 ⬡/h; three fertilizers (care-gated
  basic ×0.8 time, rich +1–2 crops, magic +1 random); 48h water drain + tier-scaled grace
  (7–10 day runways); withering returns the planted crop — zero net loss; sprinkler as a
  convenience sink (15 ⬡/day).

### Adventure & RPG
- **Regions** — Green Grass, Dusty Dunes, Weird Woods, **The Tundra** (§7v), each with
  genetic frequency weather (Tundra leans relatively gray), loot tables, 5 daily omens
  (buff-only), and a quest-gated unlock chain.
- **Expeditions (§9.3)** — 16 pool scripts drawn randomly per region (seeded), branch-graph
  validated, voice-bar enforced (sensory-first, one dry line, push/bank fork, personality
  gates); banking on end; wild-horse encounters that recruit narratively or walk to the
  Tavern.
- **Combat (§9.4)** — turn-based, party of 4, class/approach puzzle (Knight/Wizard/Rogue/
  Cleric ↔ confront/outwit/skirmish/soothe), weakness/resist with readable tells, Mend,
  potions, retreat; 0 HP = spooked. **Four Keepers complete the class square** (GG soothe ·
  DD confront · WW outwit · TN skirmish), each an earned, separate challenge that gates the
  tier ladder (the standalone battle route refuses keeper ids).
- **Progression** — one spine: 5 herd tiers (Smallholding → Dynasty), Cube costs +
  milestone gates (bosses, quests, rare coats); jobs (structure-bound, daily dice, skill
  XP + accomplishments); per-horse daily gather cap as the economy's source throttle.

### The Living Herd (§8)
- Daily autonomy tick: personality-compatibility drift over a relationship graph
  (friend/rival/bonded), club formation (reading circle, game club), journal beats with
  the day's vignette on the Pasture.
- **Night Reading (§7o)** — the craft→autonomy loop closed: Books are consumed for reading
  XP (accomplishments included), Board Games host Meeting-Hall game nights (affinity
  nudges, occasional wear-out) — crafted goods finally *do* something.

### Town & social (§10)
- **The Town (§7k)** — seven pixel-façade buildings: Tavern (recruitment with live
  headcount), Workshop (crafting/structures), Market (listings + escrowed trades), Sparring
  Ring, **Registrar** (Studbook), **Debug Shrine** (glitches for fairy dust; bug reports to
  clear), **Post Office** (§7p — the boarded façade's payoff).
- **Mail** — sender names, read state, one-stamp read-all, unread badge on the nav; system
  letters (the §10 "your stranger found a home" recruit notice, delivered at last);
  **parcels (§7s)** — up to 5×20 items move atomically with the letter ("the string
  snapped" on shortfall).
- **Calling Cards (§7q)** — the derived address book (mail/trade/road ties), pickers in
  compose + visit; visits render real sprites (adults only).
- **Moderation (§7r)** — /mod desk (queue with resolve/dismiss, stats, admin freeze) +
  player ⚑ report affordances; central freeze guard; tight rate limits on report/mail.

### Collection & goals
- **Field Guide** — 72-coat catalog with sprites + genotype detail; **Naturalist's Purse**
  milestones (10/25/40/55/72 → 3,200 ⬡ lifetime) paid automatically at discovery.
- **The Studbook (§7m)** — 14 standing breeding goals over 3 pages (~4,650 ⬡ lifetime),
  fulfilled once each at the coat reveal of your own breeding; allele-predicate based
  (a Dunalino is not "a chestnut"); founded-lines registry; ✒ stamps on the pedigree.
- **Pedigree (§7t)** — depth-3 portrait tree with linked sprite cards and the dashed
  generation spine; the no-shared-ancestor rule made visible.

### Live service
- **Gene drops (§7u)** — the runbook exercised end-to-end once: Mushroom shipped dark,
  dialed up in the Weird Woods only; field notes captured the seven lessons (what is data,
  what belongs in the facade, the OFF row, the test pins, the catalog ripple).
- **Glitches (§7l)** — natural 1-in-1,000 birth roll (seed-derived) + the deliberate
  Shrine path; foals reveal glitches only at adulthood; never heritable.

## 4. Economy map

**Faucets** (all audited): daily stipend + job income (capped by slots), gather (capped
per horse/day), expedition banks + battle rewards (effort-priced), quick-sell, upload
parting gifts, quest/studbook/guide one-times (~7,850 ⬡ lifetime across the three
ladders). **Sinks:** tier ladder (650→3,600 ⬡ per rung), Tavern fees (rarity-scaled),
structures, sprinkler, shrine patches, market/trade circulation. **Scarcity currencies:**
saffron bloom + fairy dust (Keeper-only; dust has two competing sinks — magic fertilizer
vs. shrine glitches), bones (regional), rare gems (confirm-gated sells). Measured economy
(3-day sim): ~20 raw materials/day, ~138 ⬡/day early → days-to-tier ≈ 4/6/8/11.

## 5. Hardening history (the audit arc)

A four-agent audit (server, web, tests/CI/deploy, plan-gap) found and the following turns
fixed: **P0** market/trade debits bypassing the kernel (negative balances possible);
**P1** the unconditional-claim race family (daily/bank/reward/gather), keeper-gate bypass,
foal genotype leaks, production logging off, four misleading web states, CI gaps
(migration drift, untested HTTP skins, prod-serving, real Postgres); **P2** ~25 items
(N+1s, indexes, faucet audit logs, abuse rate limits, case-insensitive usernames, 22P02
mapping, a11y batch, AA contrast, code splitting, test de-flaking, engines floor). All
closed; every fix carries a pinned regression check.

## 6. Test & CI posture

903 checks. Server: end-to-end on real migrations over PGlite — auth/invites/freeze,
breeding integrity, every economy flow, route HTTP skins (status mapping + auth guards),
prod-serving mode, cookie security flags, day-boundary-immune clock tests, determinism
twins, content integrity (loot/scripts/keepers/omens), and a §-section per feature. CI:
verify (typecheck/lint/format/tests + migration-drift gate), a **real Postgres service
job**, Docker build + boot + healthcheck. Engines pinned ≥22.18 (type-stripping floor);
graceful shutdown (SIGTERM → app close → pg pool drain).

## 7. Deployment readiness & honest limits

Ready: Dockerfile (non-root, healthcheck), fly.toml, DEPLOY.md (env table verified
accurate), volume-backed PGlite path live-equivalent, postgres:// path CI-tested.
Required at cut-over: DEPLOY.md §9's persistence canary against the managed instance.
Known v1 limits, all documented in-plan: punnett odds don't enumerate dropped loci
(carriers still breed true); studbook honors bought-young foals (deliberate market hook);
Post Office compose still accepts raw ids as the fallback; the trait-chip calculator UI is
engine-vendored and unused by the game.

## 8. Deliberately deferred (post-beta, per §9.5/§13)

White-spotting/leopard loci (await art) · NPC shops (a façade slot remains in fiction) ·
large/strategic parties, deeper job trees, civil-society offices · seasons beyond omens ·
combat status effects (typed, unwritten) · personality-altering items · further regions.
