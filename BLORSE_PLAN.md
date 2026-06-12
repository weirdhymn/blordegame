# blorsegame — Development Plan

Working name: **blorsegame** (codebase shorthand: BLORSE). A cozy, asynchronous multiplayer life-sim about a herd of pixel horses in a digital world. Players guide their herd — breeding genetically-generated horses, exploring, developing their Pasture, sending horses to jobs and adventures — while the horses also live autonomously, forming friendships, clubs, and a small civil society on their own. Stardew Valley's warmth, PokéFarm/Pixel Cat's End breeding \+ DnD-style RPG depth, Tomodachi Life's emergent relationships. Visuals carry the game; text stays minimal. The genetics roster grows continuously as a live service.

This document is the source of truth for building blorsegame in Claude Code. It is organized so each phase can be executed as a discrete, testable milestone. Keep it in the repo root and update it as decisions land.

---

## 1\. Vision & Pillars

BLORSE is a **cozy life-sim with a genetics engine at its heart**, in the spirit of Stardew Valley: slow-burn, forgiving, no fail states, rewarding mastery, daily rhythms, and relationships that deepen over time. Onto Stardew's warmth it grafts the breeding-sim depth of PokéFarm Q / Pixel Cat's End and the autonomous-relationship charm of Tomodachi Life.

**The conceit:** these are *pixel* horses literally living in a digital world — a digital frontier that simply *is*. No one knows why it came into being; we're here, so let's have fun. Being digital, the horses do things real horses can't: read books, play games, make art, and organize a civil society (clubs, roles, libraries, gatherings) — a cheerful given, never explained. The world itself is a **nebulous sandbox**: there is no fixed map. Horses and environments appear and disappear as needed because they exist in digital space, so "regions" are summoned places rather than points on a persistent geography.

**The player is the herd's guiding spirit** — an unseen, unnamed force; effectively the spirit of the Herd itself (the Herd ≈ the account). You guide the herd — make decisions, send horses on adventures, run dailies, develop your home — but **the horses also act on their own.** Once conditions are met (compatible personalities, shared interests, time together), they form friendships, rivalries, clubs, and projects *without direct input*, à la Tomodachi Life miis. You return to a journal of what your herd did while you were away. This autonomy is the signature feature.

**Tone & fiction.** Cozy at the core, with gentle conflict/mystery reserved for *adventures* — herd life is warm and unbothered without player intervention. The voice of the (sparse) text — journal beats, item flavor, quest cards — is **whimsical, quirky, and blunt, with subtle dark humor**. (This is why a failed breeding reads as a deadpan "…but nothing happened," not a sad event — see §5.)

Core pillars, in priority order (drives scope tradeoffs when features compete):

1. **Breeding & genetics** — the heart. Engine \+ genotype-driven renderer are highest-value/highest-risk and built first.  
2. **Exploration & RPG quests** — page-based regions to roam; encounters surface wild horses; quests gate progression and reward.  
3. **Multiplayer social & trade** — asynchronous: marketplace, direct trades, inter-herd visits, messaging. No real-time at launch.  
4. **Collecting & completion** — a **Field Guide** of phenotypes and rare genotypes discovered; the long-tail loop.

The **living-herd autonomy**, the **DnD-style RPG progression** (horses level skills, work jobs, and go on adventures — §9), and the **cozy life-sim loop** are the connective tissue running through all four — the reason a player opens the game daily even when not actively breeding.

**Live-service genetics (a core engagement driver).** The roster of coloration is never "done," and it comes in **two distinct kinds**: **genes** — heritable additions (including whimsical, *unnatural* colors impossible in real horses) that roll out and slowly integrate into the gene pool — and **glitches** — ultra-rare, *non-heritable* one-off mutations applied at render time (the first being "inverted"). A horse can carry both. New genes are added like the existing ones (data \+ optional overlay layers); glitches are render transforms (§4.3b, §5.7). This continuously refreshes the Field Guide, gives traders new chase items, and rewards active participation. The architecture already supports both cleanly.

Two constraints that override convenience:

- **Show, don't tell.** Horses, regions, items, outcomes speak through generated imagery and icons. Text is for names, numbers, and short flavor — never for describing what a thing looks like.  
- **Cozy-first.** No punishment, no loss, no time pressure that creates anxiety. Absence is rewarded with a warm "here's what happened," never penalized.

---

## 2\. Locked Decisions

These came out of planning and should not be re-litigated without a strong reason.

- **Interaction model:** asynchronous, page-based. Social happens through trades, marketplace, herds, and messages. Light real-time touches (presence, chat) are a *post-launch* option, not a launch feature.  
- **Stack:** full-stack TypeScript.  
  - Frontend: React \+ Vite \+ TypeScript.  
  - Rendering: **PixiJS** (GPU compositing \+ trivial per-sprite tinting \+ PNG export).  
  - Backend: Node \+ TypeScript, **Fastify**.  
  - DB: **PostgreSQL**, accessed via **Drizzle ORM** (typed, migration-friendly).  
  - Shared **`genetics` package** (TS) imported by both client and server so the same engine runs client-side for instant preview and server-side as the authority.  
- **Renderer model:** every layer is a **grayscale** PNG. Genotype (a) **selects** which layer variants are included and (b) assigns each layer a **hex color**. Compositor tints each grayscale layer by its assigned hex and stacks them. No pre-colored art.  
- **Foals are white:** **all foals render as solid white** regardless of genotype; the true coat is **revealed at adulthood** (the only lifecycle visual — there is no gradual aging/graying animation). Dominant-white horses stay white into adulthood, so for them nothing visibly changes.  
- **Lifecycle:** horses **age foal → adult through life stages but never die.** The only appearance change is the foal-white → adult-coat reveal; aging gates eligibility (e.g., breeding is adult-only), not survival. No death-cleanup logic needed.  
- **Scope:** small public beta with real users. This means real accounts, basic moderation/anti-abuse, rate limiting, and a real deploy — but not payment processing or heavy compliance at launch.  
- **Player model:** **Herd \= the player's game entity** (owned by a User auth identity). Horses, resources, the Pasture, and progression all hang off the Herd. Most game systems attach to Herd, not User.  
- **Autonomy:** horses act on their own via a **server-authoritative simulation** that advances on login-catchup \+ a periodic global tick (§8). Players never *need* to micromanage; autonomy produces a journal of emergent events.  
- **Clock:** **1 in-game day \= 1 real day**, advancing at a single fixed server **rollover at midnight EST \= fixed UTC−5 year-round (no DST shift)**, so client countdowns always match the server. The daily tick refreshes dailies, resolves autonomy, and cycles the Tavern/adventures. Despite the synchronous daily clock, within-day play (adventures, crafting, breeding, trading, decorating, dice-based jobs) must be deep enough to sustain long single sessions — the rollover gates *passive/refresh* systems, not *active* play.  
- **Autonomy steering:** the simulation **biases toward player intent more than emergence** (§8.3) — responsive and steerable first, surprising second.  
- **No sex/gender:** pixel horses have **no sex or gender** and all use **it/its** pronouns. **Any horse can breed with any other, on one condition: they share *no* common ancestor whatsoever** (fully disjoint lineage). This replaces sex-based pairing, makes inbreeding impossible by construction, and — as bred lines accumulate ancestry — naturally pushes players toward trading and Tavern recruitment for fresh bloodlines (feeding pillars 1 & 3). Parents are "parent A / parent B," not sire/dam.  
- **Glitches (non-heritable):** separate from heritable genes, **glitches** are ultra-rare one-off mutations applied as **render-time color transforms** and **never passed to offspring**. First glitch: **inverted** (the resolved coat color is inverted before rendering). Planned: **Screen** (albinism-like lightening) and **Shade** (melanism-like darkening). A horse can have both a gene-based coat and a glitch (§5.7, §4.3b).  
- **Pacing & currency:** **no energy cap.** The limiter is player time and investment. **One soft currency, "Cubes"** — literal 1×1 pixels in **copper / silver / gold** denominations (gold \> silver \> copper). **No premium currency** (the ethos is play-rewards, not pay).  
- **Wild horses & recruitment:** wild horses are encountered **on adventures** (§9.3). The player may recruit one **into their party** (free, if there's room and the horse accepts — personality/Charisma influence acceptance). Otherwise the horse walks to the **Tavern** (in The Town), a shared pool where *any* player can recruit it for a **Cube fee that scales with rarity, skills, and personality**. Main soft-currency sink; the herd that first found it is notified when it's recruited.  
- **Rarity:** **White (`W`) and Gray (`G`) are the rarest** colors (engine roll frequencies already make them rare: `G≈0.05`, `W≈0.012`); regional bias tunes the rest.  
- **Procedural shading:** Roan, Sooty, and Pangaré/Mealy are **generated in the renderer as gradient effects** (not separate art layers), as the engine already treats pangaré/sooty as swatch effects. Gray renders as its **static adult swatch** (no age progression, per the foal-white/no-aging rule). Glitches are a separate render transform (§4.3b).  
- **Live-service genetics:** the gene roster expands continuously; new genes are content (data \+ optional overlay layers), not engine rewrites (§5.6).  
- **Aesthetic:** cozy-first pixel art à la Stardew — warm, hand-feel, the muted sage palette already in the mockup, gentle motion and juicy feedback. The "digital world" conceit is expressed lightly (pixel-native framing, subtle scanline/CRT accents, "data" flavor) and never at the expense of coziness; glitch effects are rare and special, not ambient. Unnatural live-service coats are the main place whimsy/digital-strangeness gets loud.

---

## 3\. Architecture Overview

blorse/

├─ packages/

│  ├─ genetics/        \# vendored engine (genetics.js \+ data.js) \+ typed TS facade \+ tests

│  └─ render-core/     \# layer manifest types \+ palette adapter (resolve() → per-layer hexes)

├─ apps/

│  ├─ web/             \# React \+ Vite \+ PixiJS client

│  └─ server/          \# Fastify API \+ Drizzle \+ auth \+ game logic \+ autonomy sim engine

├─ assets/

│  └─ layers/          \# grayscale layer PNGs \+ layer manifest \+ palette-map.ts

└─ BLORSE\_PLAN.md

Monorepo (pnpm workspaces). The `genetics` package has **no runtime dependencies** and is tested in isolation. The server is the authority for all randomness and state changes — including the **autonomy simulation** (§8), which is deterministic per-herd and never trusts the client. The client may run genetics/renderer locally only for *preview* (e.g., the resample button), never to mint real horses or advance the sim.

---

## 4\. The Renderer (centerpiece)

The asset set in hand: `line-art`, `muzzle`, `face`, `legs_{bay|seal-bay|dun}`, `mane_tail`, `hooves`, `coat`. Build the renderer as data-driven from a manifest, not hardcoded to these filenames.

### 4.1 Layer manifest

Confirmed from the prototype, the runtime asset set is **9 layers, all 150×126 px** (uniform canvas — they just stack), served from `assets/horse/`: `coat`, `mane-tail`, `legs-bay`, `legs-dun`, `legs-seal`, `hooves`, `face`, `muzzle`, `line-art`. (The earlier `blorse_000N_…` filenames were export-order labels, not runtime names.)

A single config (`assets/layers/manifest.json`) defines, for each layer:

- `id` (e.g. `coat`, `legs`, `mane_tail`, `muzzle`, `face`, `hooves`, `line_art`)  
- `z` (explicit z-index — define deliberately, e.g. coat at the bottom, line-art on top; don't infer from any filename ordering)  
- `variants` (map of variant key → PNG path; single-variant layers have one entry)  
- `colorRole` (which palette role tints this layer — see 4.3), or `none` for layers that aren't tinted (e.g. line-art stays black)  
- `selector` (which genotype-derived value picks the variant, e.g. `legs` picks among `bay / seal / dun`)

**Uniform dimensions** (150×126) is an invariant worth enforcing in the manifest loader — it makes compositing a plain stack and lets the foal-white silhouette reuse the existing shapes. **Prototype note:** `horse-art-data.js` embeds these PNGs as base64 data-URIs purely to dodge `file://` canvas-tainting during export — **BLORSE does not need this**; served over http(s), PixiJS loads the PNGs normally and exports to PNG natively. Drop the base64 workaround.

### 4.2 Render pipeline

horse (genotype, seed, lifeStage, glitch)

  → if lifeStage \== "foal" AND not dominant-white: render SOLID WHITE silhouette, done.

  → phenotype resolver (in genetics package)

      → { layerSelections: {legs: "seal-bay", ...}, palette: {coat:"\#5A2E18", points:"\#1a120b", ...}, flags }

  → palette adapter → per-layer hex palette

  → if glitch: apply glitch transform to the palette (§4.3b)   // inverted / screen / shade

  → compositor (PixiJS)

      → for each manifest layer in z-order:

          load selected grayscale variant sprite

          if colorRole: sprite.tint \= palette\[colorRole\]

          add to stage

      → procedural shading passes (§4.3a)

      → render to texture → export PNG

**Foal rule:** foals always render as a solid white silhouette regardless of genotype; the adult coat is revealed at maturity. Dominant-white horses are white at both stages (no visible change). The genotype is fixed at birth and stored — only the *rendered coat* is gated by life stage.

### 4.3 Palette adapter (the genetics→art bridge)

This is **new BLORSE code**, not part of the ported engine, because of a key fact about `resolve()`: it returns exactly **one body hex** (`swatch`) plus **descriptive strings** for the other regions (`traits.maneTail = "black" | "matches body" | "flaxen/cream" | …`, `traits.points = "black" | "rusty/ivory" | null`, `traits.hooves = "dark" | "chocolate" | "light"`). The renderer needs a hex per tinted layer, so the adapter maps `resolve()` output → a per-layer hex palette:

| Layer role | Source | Derivation |
| :---- | :---- | :---- |
| `coat` | `resolve().swatch` | tinted directly; per-individual jitter via `varySwatch(r, seed)` |
| `mane_tail` | `traits.maneTail` | token→hex map: `"black"`→near-black, `"matches body"`→coat hex, `"flaxen/cream/white"`→pale hexes, `"flaxen-white w/ dark roots"`→pale |
| `points` (legs) | `traits.points` | `"black"`→near-black, `null`/`"matches body"`→coat hex, diluted variants→derived |
| `hooves` | `traits.hooves` | `"dark"`/`"chocolate"`/`"light"`/`"striped"`→hex |
| `muzzle` | Pangaré (`Pg`) | mealy lightening; engine already swaps `swatch` for mealy/sooty/flaxen via `DATA.shadingSwatches` |

The token→hex maps live in a small `assets/palette-map.ts` so artists/designers can tune them without touching genetics. The adapter is pure and deterministic: `(genotype, seed) → palette` is identical every time, which is what makes "Copy link" and shareable horses work. **Store the `seed` on every Horse** so its exact rendered shade is reproducible forever.

### 4.3a Procedural shading stage (gradients, not layers)

Several modifiers are **rendered procedurally** rather than as separate PNGs — the same philosophy the engine already uses for pangaré/sooty (it swaps in a tuned swatch). In the compositor these become shader/gradient passes applied to the relevant layers, driven by `resolve()` flags/modifiers:

- **Pangaré/Mealy** — lighten muzzle/soft areas via a soft gradient mask on coat/muzzle.  
- **Sooty** — darken the topline/back via a downward gradient on the coat.  
- **Roan** (`flags.hasRoan`) — intermix white via a noise/gradient pass, sparing head and legs (per the trait).  
- **Gray** (`flags.isGray`) — renders as its **static adult gray swatch**; *no* age-driven progression (per the foal-white / no-aging-visual rule).  
- **Dun** body dilution \+ dorsal stripe — dilution via tint; dorsal stripe is the one piece that still wants a thin overlay (see 4.5).

This keeps the art set tiny while supporting a large share of the catalog, and it's the natural extension point: future modifiers prefer a gradient pass over new art whenever possible.

### 4.3b Glitch transforms (non-heritable, render-time)

A horse's optional `glitch` attribute (§5.7) is a **color transform applied to the resolved palette** before compositing — it touches no genotype data and is never inherited. Transforms operate per palette hex so they compose with everything (genes, shading):

- **inverted** (shipping first) — invert each palette hex (`#RRGGBB → #(255−R)(255−G)(255−B)`); the would-be coat is rendered as its inverse.  
- **Screen** (planned) — albinism-like: push palette hexes toward white (a screen/lighten blend), washing the coat pale.  
- **Shade** (planned) — melanism-like: push palette hexes toward black (a multiply/darken blend).

Glitches are deterministic given the horse and ultra-rare. A foal still renders white; the glitch shows once the adult coat is revealed (a glitched foal that "turns out" inverted at adulthood is a great reveal beat). New glitches are added as new transform functions — no schema change beyond an enum value.

### 4.4 Layer selection (which grayscale variant)

The engine's `resolve().baseKey` (`chestnut | bay | seal_brown | black`) plus the Dun axis drives which leg art loads, matching the confirmed assets:

- Dun present → `legs-dun` (carries primitive leg barring)  
- `seal_brown` base → `legs-seal`  
- `bay` base → `legs-bay`  
- `chestnut`/`black` → need a no-black-points leg variant (see coverage gap in 4.5)

### 4.5 Art coverage vs. genetics coverage (scope decision)

The engine is **far richer than the current art** (20 loci, \~71 catalogued looks) — but because the renderer is tint-only, **most of that richness is free**: every dilution (palomino, buckskin, cremello, dun, champagne, pearl, smoky…) is the *same shapes* with a different `swatch` hex, so the existing layers already cover them. What still needs **new art layers**:

| Genetic feature | Engine support | Art status |
| :---- | :---- | :---- |
| All base \+ dilution colors | full | ✅ covered by tinting existing layers |
| Sooty / Mealy / Flaxen shading | full | ✅ procedural gradient pass (§4.3a) |
| Roan / Rabicano | full | ✅ procedural white-intermix pass (§4.3a) — **no art layer** |
| Gray | full | ✅ static adult gray swatch (no progression) — **no art layer** |
| Dun dilution | full | ✅ tint |
| Dun dorsal stripe | full | ⚠️ needs a thin **dorsal-stripe overlay** |
| Chestnut/black no-point legs | full | ⚠️ needs a **plain-leg variant** |
| Foal (any genotype) | n/a | ✅ solid-white silhouette, reuses the line-art/coat shapes |
| Glitches (inverted; Screen/Shade planned) | n/a (non-genetic) | ✅ palette transforms (§4.3b) — **no art layer** |
| White spotting (Tobiano, Sabino, Overo, Splash) | full | ❌ deferred — needs pattern overlay layers |
| Leopard complex (Lp \+ PATN1/2) | full | ❌ deferred — needs appaloosa overlay set |

**Beta art scope (APPROVED):** bases \+ all dilutions \+ shadings \+ dun \+ roan \+ gray \+ foal-white \+ glitches. White-spotting and leopard are **deferred** (gate them down in `randomGenotype` frequency so they don't appear before art exists). **New art needed for beta is just two items: a dun dorsal-stripe overlay and a plain (no-black-point) chestnut/black leg variant** — everything else is tint, gradient, or transform. The cheapest possible path to dozens of colors.

### 4.6 Acceptance checks

- Re-rendering the same `(genotype, seed)` is pixel-identical.  
- Changing a single allele changes only the expected role(s).  
- Every catalogued color the art *claims* to support renders without a missing/placeholder layer.  
- PNG export matches the on-screen composite (this powers "Save PNG").

---

## 5\. Genetics Engine (ported, not rebuilt)

The engine already exists, is pure/DOM-free, and **already runs headless in Node** (340 passing tests via `node test/run-tests.js`). So it is *vendored, not rewritten*: it becomes the shared package consumed identically by the Vite client (preview) and the Fastify server (authority).

### 5.1 Integration approach

- Copy `genetics.js` \+ `data.js` into `packages/genetics/vendor/` **essentially untouched**, along with the existing test suite (keep it green — it's the safety net).  
- Add a thin typed ESM facade `packages/genetics/src/index.ts` that loads them and re-exports a typed API. The engine currently attaches to `window.HorseGenetics` / `window.HORSE_DATA` and avoids `import/export` only because the old project ran under `file://`. BLORSE has a real build step, so the facade shims the globals (assign to a module-scoped object) and exports typed functions. **Do not** scatter refactors through the engine — wrap it.  
- Result: one import, fully typed, same code client and server. The server is authoritative; the client may call `resolve`/`randomGenotype`/`breedFoal` only for *preview* (the resample button), never to mint real horses.

### 5.2 Real model (confirmed from the source)

- **20 loci**, canonical order: `W · G · E · A · C · Ch · D · Z · F · Pg · Sty · Rn · Rb · T · Sb · O · SW1 · Lp · PATN1 · PATN2`.  
- A **genotype** is a plain object of two-allele strings: `{ E:"Ee", A:"Aa", C:"CCr", D:"Dd", … }`. `withDefaults` fills omitted loci from the all-recessive `OFF` baseline, so partial genotypes are valid everywhere. **This object is what BLORSE stores per horse** (JSONB).  
- **Cream \+ Pearl share the C locus**; Agouti is strict `A > Aᵗ > a`; Silver (`Z`) acts on black pigment only; coat genetics are autosomal — and since **pixel horses have no sex at all** (§5.4a), there's no sex chromosome to model, which fits the engine perfectly.  
- Two embryonic lethals: `WW`, `OO` (OLWS). The engine names them, then flags non-viable. In-game these surface as a cozy, deadpan **"…but nothing happened."** — no death beat (matches the tone, §1).

### 5.3 Public API BLORSE depends on

Keep these stable; everything else is internal.

resolve(genotype)            → phenotype object (see 5.4)

breedFoal(parentA, parentB, rand?)  → { genotype, resolved, viable, lethalReason }  // ONE foal; inject rand for determinism; ancestry gate enforced in BLORSE first (§5.4a)

punnett(parentA, parentB, opts) → full offspring distribution \+ carrier summary  // power the "breeding odds" preview UI (beta)

randomGenotype(freqOverride?)→ rarity-weighted genotype  // wild encounters; freqOverride \= REGIONAL BIAS

crossLocus(ga, gb, key)      → per-locus Mendelian distribution

analyze / healthFlags / carriedAlleles → genetic-health notes \+ hidden carriers

enumerateColors / colorBySlug / reverseLookup → the 71-entry color catalog (drives the Field Guide / collection pillar)

varySwatch(r, seed) / paletteSwatches(r,n) / gradientColorAt(r,t) → deterministic per-individual color variation

parseGenotype / formatGenotype / cleanGenotype / writtenGenotype → genotype string I/O (round-trips losslessly)

### 5.4 `resolve()` output (what the renderer/UI read)

{ displayName, underlyingName, baseKey, baseName,

  swatch, underlyingSwatch,            // hex — body color (single) \+ the color under any gray/white mask

  layers\[\],                            // audit trail of each gene's name transform ("show your work")

  patterns\[{name,kind,glyph,desc}\], modifiers\[\], notes\[\],

  traits{ eyes, skin, hooves, sclera, maneTail, points, primitiveMarkings },  // DESCRIPTIVE strings

  flags{ isLethal, lethalReason, isGray, isGraying, isWhiteMasked, isLeopard, hasRoan, sabinoWhite },

  genotype, written }

Note: `underlyingSwatch` preserves the born color under Gray — used for the Field Guide / naming ("show your work"), **not** for an aging animation (gray renders static, §4.3a). `flags` map onto renderer gates (e.g. `isWhiteMasked` → white; `hasRoan` → roan pass).

### 5.4a Breeding rule (no sex, disjoint ancestry)

Pixel horses have **no sex/gender** — any two can breed — **but only if they share no common ancestor whatsoever.** Before calling `breedFoal`, BLORSE checks `ancestors(A) ∩ ancestors(B) = ∅` (and `A ≠ B`). Consequences:

- **Inbreeding is impossible by construction** — no need for inbreeding-penalty systems.  
- **Bred lines "use up" compatible partners** over generations, so players seek **fresh bloodlines via trade and the Tavern** — a deliberate driver for pillars 1 & 3\. Wild/Tavern horses have empty ancestry, so they breed freely (except with their own descendants).  
- **Implementation:** maintain a per-horse **ancestor set** (union of both parents' ancestor sets \+ the parents themselves) — the lineage **closure table** flagged in §6 is the efficient backing for this check, since lineages never shrink (no death).  
- The engine's `breedFoal(parentA, parentB, rand?)` is unchanged; the ancestry gate lives in BLORSE's breeding service, and the foal **does not inherit any glitch** (§5.7).

### 5.5 Where BLORSE adds code (not in the engine)

1. **Palette adapter \+ procedural shading** (§4.3, §4.3a) — `resolve()` traits/flags → per-layer hexes \+ gradient passes.  
2. **TS facade \+ types** (§5.1).  
3. **Regional frequency tables** — `freqOverride` maps per region (exploration × genetics). The engine already accepts this; BLORSE authors the tables. White/Gray stay rarest.  
4. **Seed management** — generate/store a per-horse seed; feed `varySwatch` for reproducible individual shading.

### 5.6 Live-service genetics expansion

New genes ship continuously as **content, not code** — this is a first-class product loop, not an afterthought, and the engine is already built for it (it iterates over `HORSE_DATA` rather than hard-coding gene names).

- **Adding a gene \= a data entry** in `data.js` (locus, alleles, dominance, genotypes, naming, swatches/effects, roll frequency) plus, only when the look needs it, **overlay art layers** registered in the manifest. New overlays stack exactly like the existing bay leg/muzzle patterns — same compositor, same selection-by-genotype, same tint/gradient rules. Prefer a procedural gradient pass (§4.3a) over new art whenever the effect allows.  
- **Backward compatibility is automatic.** Because `withDefaults`/`OFF` fills any omitted locus with the recessive/absent baseline, **every existing horse stays valid** the instant a new locus ships — they simply don't carry the new allele. No migration of stored genotypes required.  
- **Whimsy / unnatural genes** (heritable) — colors impossible in real horses, the digital-world payoff and among the rarest, most prestigious chase items. They use the same overlay/tint/gradient machinery; "unnatural" is an art+frequency choice, not a special code path. (Distinct from *glitches*, which are non-heritable — §5.7.)  
- **Cadence & authoring** — drops are **infrequent and unannounced**: new genes simply start appearing, and players discover them in the wild (a recurring "wait, what *is* that?" delight). **You author the art** (same pipeline as the base/line-art layers); **Claude Code assists the integration** — the `data.js` entry, manifest registration, frequency, and any procedural-effect wiring. A drop is a content PR (data \+ assets \+ frequency), runnable without touching the engine core or renderer. Tag each gene with an introduced-version \+ rarity for analytics and so the **Field Guide** can reveal "undiscovered" slots after the fact — without pre-announcing them.  
- **Guardrails** — keep the test suite green across drops (the engine's differential/ratio tests catch a malformed locus); gate brand-new genes to low/zero wild frequency until their art and balance land, then turn them on.

### 5.7 Glitches (non-heritable, one-off mutations)

A second, parallel rarity layer — and a different mechanism from genes:

- **Not genetic, not inherited.** A glitch is a per-horse attribute (`glitch: null | "inverted" | "screen" | "shade" | …`), stored on the Horse, **outside** the genotype. `breedFoal` never copies it; it can only arise via a rare **one-off mutation roll** at birth/capture. A horse may carry both an unnatural *gene* and a *glitch* at once.  
- **Realized at render time** as a palette color transform (§4.3b): **inverted** ships first; **Screen** (albinism-like) and **Shade** (melanism-like) follow.  
- **Ultra-rare & prestigious.** Because they can't be bred for, glitched horses are pure lottery — the rarest things in the game and strong Tavern/market value drivers.  
- **Extensible like genes:** a new glitch \= a new enum value \+ a transform function (§4.3b); no schema migration.  
- **Rarity dial** lives in `balance.ts` (§14): a small per-birth/per-encounter glitch chance, independent of coat genetics.

---

## 6\. Data Model (PostgreSQL / Drizzle)

Core entities for beta. **Herd is the hub** most things hang off.

Identity & creatures:

- **User** — auth identity only: login, role (player/mod/admin), account settings.  
- **Herd** — the player's game entity (1:1 with User at beta). Holds **Cube balances** (copper/silver/gold), progression/level, **Pasture** reference, time cursor, and the `simSeed` \+ `lastSimTick` used by the autonomy engine. **Cold-start grant (standing rule):** on signup, every Herd is seeded with a viable starting position — `STARTER_HORSE_COUNT` (2) unrelated **founder** adults (parentless, so they share no ancestor and can breed immediately, §5.4a) plus `STARTING_CUBES` starting Cubes (§14.8). Idempotent: re-running onboarding never double-grants.  
- **Horse** — `herd` (FK, **null \= in the Tavern pool / unrecruited**), `genotype` (JSONB, the engine's `{E:"Ee", A:"Aa", …}` object), `seed` (for `varySwatch`), **`glitch`** (null | `inverted` | … — non-heritable, §5.7), `lifeStage` (foal/adult — gates the white→color reveal and breeding eligibility), birth timestamp, **`name`** (optional, cosmetic; identity is the row ID, surfaced in the horse's URL), `parentA`/`parentB` FKs (no sire/dam — no sex), origin (wild/bred). Life-sim: **`personality`** (Big Five OCEAN, §8.1). RPG (§9): **`stats`** (Str/Dex/Con/Int/Wis/Cha \+ hidden `luck`), **`skills`**, **`accomplishments`**. **No sex/gender field; all horses are it/its.** Phenotype is **derived via `resolve()` \+ palette adapter (+ glitch transform) and cached, never stored.**  
- **Lineage (ancestor closure table)** — **required, not optional**: the breeding rule (§5.4a) needs fast "do these two share any ancestor?" checks. Store each horse's ancestor set (or a closure table) so disjoint-ancestry breeding and pedigree views are O(1)-ish. Lineages never shrink (no death), so materialize at birth.

Living-herd state (§8):

- **Relationship** — directed/undirected edge between two horses: type (friend/rival/bonded/mentor), affinity score, history. The graph the autonomy engine reads and writes.  
- **Club / Project** — emergent groups horses self-organize (a reading circle, a game club, a "civil society" role); membership \+ status.  
- **JournalEvent** — append-only log of autonomous happenings ("Plum and Pepper became friends", "the reading club met"), with actors, glyph/icon, timestamp. This is the player's primary window into autonomy.

Life-sim world (§7):

- **Pasture (HomeGrounds)** — the herd's developable space; placed **Structures** (library, playground, meeting hall, workshops — which unlock/boost activities, jobs, and clubs) and decor.  
- **Item / Inventory** — Materials, Books (and games), craftables, care items, rare items (adventure rewards), cosmetics. Economy uses **Cubes** (copper/silver/gold), one soft currency.  
- **Region** — *summoned* sandbox spaces (no persistent map, §1); each carries a `freqOverride` for genetics bias (White/Gray rarest) and hosts adventure **encounter tables**; some gated by quests.  
- **Quest / QuestProgress** — chains, prerequisites, rewards.  
- **FieldGuide** — per-herd record of phenotypes/genotypes discovered, tagged by gene-drop version; reveals "undiscovered" slots after a drop (collection pillar).

RPG progression (§9):

- **JobAssignment** — a horse posted to a job (blacksmith, baker, …) at a structure; produces goods/currency over time via stat+skill dice checks; levels skills/stats.  
- **Adventure / Expedition** — a horse or **Party** sent to gather materials/rare items; resolves through stat+dice checks against a region encounter table; yields rewards \+ growth \+ accomplishments \+ possible wild-horse encounters.  
- **Party** — a small ordered group of a herd's horses assembled for an adventure; open slots can be filled by recruited wild horses.  
- **TavernHorse** — a wild horse that reached the Tavern: its genotype/glitch/stats/skills/personality \+ a computed **Cube recruitment fee** \+ the `firstEncounteredBy` herd (for the recruit notification); recruitable atomically by any herd (§10).  
- **SkillTrack / Accomplishment** — per-horse leveling and milestone records feeding prestige, the journal, and recruitment/trade value.

Social & safety:

- **MarketListing / Trade / Message / Thread** — async economy \+ comms (§9).  
- **AuditLog** — every state-changing action (anti-abuse \+ moderation).

Store `genotype` \+ `seed` per Horse so its image is reproducible forever; render on demand and cache. Store `simSeed` \+ `lastSimTick` per Herd so autonomy is reproducible and catch-up is deterministic.

---

## 7\. Gameplay Systems (the cozy loop)

The Stardew-style daily rhythm is the frame everything sits in: you check in, see what your herd did (§8), run a few warm actions, and leave the world to keep living.

- **Time & rhythm** — **1 in-game day \= 1 real day**, with the fixed **midnight-EST rollover** that refreshes dailies, resolves autonomy (§8), and cycles the Tavern/adventures. There's **no energy cap**: active play (adventures, crafting, breeding, trading, decorating) runs continuously, limited only by time and resources, so long sessions stay rewarding under the synchronous clock. Missed days are caught up at next login.  
- **Breeding** — pick any two adult horses the herd owns **that share no ancestor** (§5.4a — no sex; the UI greys out related candidates); server runs `breedFoal()` with a seeded rng, minting a foal (inheriting personality \+ stats per §8/§9; never a glitch). A non-viable cross (`WW`/`OO`) resolves as the deadpan **"…but nothing happened."** **`punnett()` shows foal-color odds before breeding (beta).** The foal **renders solid white until adulthood**, when its real coat is revealed.  
- **Exploration & quests** — pick a region (a summoned space), a paced "roam" action surfaces Materials and quest beats. (Wild *horses* are met on adventures — see below.)  
- **Jobs & adventures (§9)** — the RPG layer of daily play: post horses to jobs at your structures, or send a horse/party on adventures for Materials and rare items. Adventures also surface **wild horses** you can recruit into your party; ones you don't take walk to the **Tavern** for anyone to recruit at a scaling Cube fee (§9.3/§10). Adventures are the deepest within-day activity and a primary rare-item \+ new-horse source.  
- **The Pasture** — the herd's Stardew-farm analogue: a developable space where you place **Structures** that unlock and boost activities, jobs, and clubs (a Library raises reading \+ enables a librarian role; a Forge enables the blacksmith job; a Meeting Hall enables clubs). Home of the digital-civil-society flavor.  
- **Gathering & crafting** — exploration and adventures yield Materials; crafting turns them into the **Books, games, tools, and building materials** that *feed activities and autonomy*. The loop closes: craft a Book → a horse reads it → gains a skill → that shifts who it befriends and what it excels at (§8/§9).  
  - **TODO (Phase 8–9 sink):** building materials (planks/bricks) are consumed by Structures, but **Books / Board-games / Tools / the Healing Potion are craftable with no consuming sink yet**. Books/games/tools → wire as job/club fuel (a horse "reads" a Book, etc.). The **Healing Potion** is a *deliberate* terminal item — provisioning for **future combat** (post-beta); its item flavor + the herb hunt's end screen frame it in-world ("tuck it away; rougher roads ahead") so it doesn't read as broken. Data/chain is in place; only the consumption hooks are missing.  
- **Care & the color reveal** — foal → adult over real time; light care (feed, groom) gives small bonuses, never fail-states. The single lifecycle visual is the **white foal → colored adult reveal** (no progressive graying; dominant-white horses stay white). Naming: foals get a random **fruit/vegetable** name from a pool; players can reroll or set their own (names are cosmetic — horses are tracked by ID/URL).  
- **Collection** — the **Field Guide** tracks phenotypes/notable genotypes discovered or bred, including each live-service gene drop; milestones grant prestige rewards.  
- **The Town & NPCs** — **The Town** hosts shops, NPC characters, and the Tavern, giving the world a Stardew sense of place and anchoring quests and the economy.

Everything here is **cozy-first**: forgiving, unpunishing, and legible at a glance through icons and imagery.

---

## 8\. The Living Herd (autonomous simulation) — signature system

Horses act on their own. This is the Tomodachi-Life heart of BLORSE and its biggest differentiator, so it gets first-class design and a deterministic, server-authoritative implementation.

### 8.1 What drives autonomy

- **Personality — the Big Five (OCEAN).** Each horse has five trait values: **Openness** (creativity, curiosity, new ideas), **Conscientiousness** (self-control, diligence, detail), **Extraversion** (boldness, energy, sociability), **Agreeableness** (kindness, helpfulness, cooperation), **Neuroticism** (irritability, anxiety-proneness). This is *temperament*, separate from coat genetics and from RPG stats.  
  - **Heritability: partially inherited, mostly random, only rarely altered.** A foal's traits are a fresh roll with a light parental nudge (parents shift the distribution slightly, they don't determine it), so personality stays surprising and can't be hard-bred. Once set it's near-immutable — only rare events/items can shift a trait. Treat personality as *who a horse innately is*.  
  - Traits shape autonomy directly: Extraversion/Agreeableness drive friendship formation, Neuroticism feeds rivalry/anxiety beats, Openness/Conscientiousness bias which skills a horse enjoys growing.  
- **Stats & skills (RPG, §9)** — separate axis: personality says *who a horse is*; stats say *how capable it is*. Unlike personality, stats are **mostly inherited and trainable** — the thing you selectively breed and improve.  
- **Compatibility** — a pure function of two horses' OCEAN proximity (with Agreeableness/Extraversion weighted for friendship, Neuroticism for friction) \+ shared activities \+ time co-located → an affinity delta applied each daily tick.

### 8.2 How it runs (the daily rollover)

- **Server-authoritative simulation** with a per-herd `simSeed`; every tick is reproducible and uncheatable.  
- **One tick per day at midnight rollover** — the global scheduled job advances every herd (online or not), so news is always waiting. If a player misses days, **login-catchup** deterministically replays the missed daily ticks from `lastSimTick`.  
- **Bounded per tick:** cap events/horse/day so the journal stays readable; summarize overflow ("a quiet week") rather than dumping a wall of events after a long absence.  
- The daily tick governs **passive** evolution (relationships, autonomous pursuits). It does **not** gate **active** play — jobs, adventures, breeding, crafting, and trading resolve in real time during a session (§2 clock decision).

### 8.3 What autonomy produces (criteria-gated, like Tomodachi)

- Affinity crossing thresholds fires **events**: two horses become friends, a rivalry sparks, a bonded pair forms, a mentor takes on a foal.  
- Enough friends with a shared interest \+ the right structure → they **self-organize a club** (reading circle, game club) and take on **civil-society roles** that map onto the RPG layer (a librarian, an organizer, a guild lead — §9 jobs/roles).  
- Autonomy and the RPG layer interlock: a horse may **pursue a job or short adventure on its own** between player-directed ones, generating journal beats and modest rewards — the herd visibly *does things* whether or not you direct it.  
- Each event appends to the **JournalEvent** log — the player's warm "here's what happened while you were away" feed, told in icons \+ short flavor.  
- **Player intent is weighted heavily.** Crafting items, building structures, assigning jobs, and pairing horses *strongly* bias the simulation toward the outcomes the player is steering for; pure emergence fills the gaps and adds surprise, but it doesn't override clear intent. The herd should feel **responsive and steerable**, not chaotic — emergence is seasoning, not the main course.

### 8.4 Beta scope

Ship: personality \+ compatibility \+ friend/rival/bonded relationships \+ a journal \+ one or two club types gated by structures. Defer: deep civil-society roles, elections, multi-step horse "projects" — design the event system so these slot in later as new event types without schema changes.

### 8.5 Why this is built mid-roadmap, not first

It depends on horses, herds, persistence, and items existing. But it's the retention engine, so it lands right after the core sim is real (see phases) and well before beta polish.

---

## 9\. RPG Progression — Stats, Skills, Jobs & Adventures (DnD-inspired)

Directly inspired by Pixel Cat's End (itself DnD-rooted): horses are little adventurers who **level skills, hold jobs, and go on expeditions** resolved with **stats \+ dice**. This is the within-day depth that keeps long sessions engaging under the synchronous daily clock, and the main faucet for materials and rare items — scaled by engagement, not gated by energy.

### 9.1 Stats & skills

- **Core stats — the classic six:** **Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma**, plus a **hidden Luck** stat that nudges rolls behind the scenes (never shown; a source of pleasant surprises and "lucky" lineages).  
- **Heritability: mostly inherited, partially random, and often improvable.** Stats lean heavily on parents (so selective breeding for capable lines genuinely works — the deliberate contrast with personality), with some random spread, and they can be **trained up** through jobs, adventures, and items over a horse's life. Stats are the grind-and-breed axis; personality is the innate one.  
- **Skills** are specializations leveled by *doing* (Reading, Smithing, Baking, Foraging, Athletics, Performance…). Skill check \= `d20 + ability modifier + skill level (+ hidden Luck)` vs. a difficulty class, DnD-style. Personality (§8.1) biases which skills a horse gravitates toward.  
- **Leveling & accomplishments** — successful checks grant skill XP and can train the underlying stat; milestones become **Accomplishments** (badges/titles) shown in the journal and Field Guide — prestige that raises a horse's trade and recruitment value (§10).

### 9.2 Jobs (steady, passive-leaning)

- A horse is **posted to a job** at an unlocked Structure (blacksmith→workshop, baker→kitchen, librarian→library, …). Each rollover it performs job checks producing goods/currency and skill XP, scaled by its stats/skills.  
- Jobs are low-risk and cozy: a poor roll means a smaller yield, never a loss. They reward consistency and give every horse a role.

### 9.3 Adventures / expeditions (active, higher-variance)

- Player sends a horse or small **party** into a region on an expedition. It resolves as a short **dice-driven encounter chain** (skill checks against an encounter table), yielding **materials and rare items** for the herd, skill/stat growth, and accomplishments.  
- **Wild-horse encounters.** Adventures can surface a **wild horse**. The player may **recruit it into the party** — free, if there's an open slot and the horse accepts (acceptance influenced by its personality and the party's Charisma). If the party is full, the horse declines, or the player passes, it **walks to the Tavern** (§10), where any player can later recruit it for a scaling fee. This is the primary new-horse faucet alongside breeding.  
- Higher difficulty → better loot tables (incl. rare cosmetics and crafting inputs for whimsical gene-drop items). Variance keeps it exciting while staying unpunishing (worst case: meager haul, a little fatigue — never death).  
- Adventuring together feeds §8 relationships (party-mates bond).

**Interactive "story" adventures (v1 slice — implemented).** Adventures can deepen from the flat encounter-chain above into authored **branching scenes**, reusing the same spine (seeded dice, OCEAN personality, harmony, parties). This is **content-feature-flagged**: a region with an authored scene library (`content/adventures.ts`) runs the interactive flow; regions without one keep the flat `adventure()` (so nothing breaks). Contract:
- **Data model.** An `AdventureScript = { id, regionId, start, scenes }`; each `Scene = { id, stage, text, choices[] }`; each `Choice = { id, text, requires?, check?, success, failure? }`. `requires` = personality gate; `check = { stat, skill?, dc, harmony? }` (a `harmony` check gets a DC reduction from the party's **rapport** — see _Bonds power adventures_ below — **buff-only**, cap `ADVENTURE_HARMONY_MAX`); `Outcome = { text, items?, cubes?, fatigue?, wild?, next }` where `next` is a scene id or `'end'`. Authoring more regions/scenes = pure data.
- **Run flow.** `POST /api/adventure/start {regionId, party}` → `{ runId, scene, run }`; `POST /api/adventure/:runId/choose {choiceId}` → next scene or a banked end summary. The best party member rolls each check; loot/cubes **accrue and bank only on `end`** (the *push-deeper vs. bank-and-retreat* tension). A `wild` outcome mints a stranger **straight into the herd** — recruitment as narrative (no Tavern fee). `GET /api/regions` now carries an `interactive` flag.
- **Cozy worst case.** A failed check → a soft `failure` (less/no loot here, a tired party, sometimes an early retreat); you keep whatever you'd banked. The only loss is *un-banked* haul if you abandon mid-run.
- **Run persistence.** Run state lives in the `adventure_runs` table (regionId, scriptId, sceneId, step, seed + the accrued, not-yet-banked haul), so an in-flight run survives a restart / redeploy / multiple instances; resolution stays pure + seeded. Ended runs are kept as history. Fatigue is still flavor-only (no hard cooldown yet).
- **Script pools.** Each region holds a **pool** of scripts (`ADVENTURE_POOLS`); a run draws one uniformly at random, **seeded** (a `PICK_SALT` distinct from the dice salts), and stores the chosen `scriptId` on the run so it stays put across a redeploy even if the pool changes. `interactive = pool.length > 0`; `ADVENTURE_BY_ID` resolves a run's script. Green Grass ships **two**: *The Sunny Hollow* (befriend a stranger) and *The Marsh-Sage Brew* (the herb hunt — distinct stat checks, a Conscientiousness gate, a harmony-buffed brew, and **feed-forward**: the sage quality won in the fen sets the final brew's difficulty). Its reward, the **Healing Potion**, is a deliberate terminal item (future-combat provisioning, §7); **marsh-sage** has a real source (Green Grass loot) and sink (the *Brew Healing Potion* recipe).
- **Adventures train horses.** Each interactive **skill check** grants the horse that stepped up a little XP toward that **specific** skill — `ADVENTURE_SKILL_XP_ATTEMPT`, more on success (`ADVENTURE_SKILL_XP_SUCCESS`) — reusing the existing `grantSkillXp` / level / governing-stat path (so adventuring visibly improves the skill it exercises, unlike the flat path which trains only the lead's best skill). The `choose` response surfaces the gain (`trained: { horseName, skill, xp, leveledTo }`) so the player watches it rise. Completing a run bumps each party horse's `adventures` count; at `ADVENTURE_MARK_THRESHOLD` the horse wears a **"Seasoned Adventurer"** mark on its detail page (`experienced` on the horse view) — cosmetic at first, but it now also **eases the horse's day job** (see _Seasoned adventurers work better_ below).
- **Bonds power adventures.** The harmony buff now reads the **stored relationship graph** (§8), not just innate temperament. Each party pair's **rapport** (0..1) is its real **bond** if one exists (`affinity ÷ BONDED_THRESHOLD`, capped at 1) — else a *dimmer* personality-compatibility proxy (`ADVENTURE_HARMONY_FRESH_*`, capped below a true bond). Avg pairwise rapport × `ADVENTURE_HARMONY_MAX` → the DC reduction. So a party that has **genuinely bonded over time** out-harmonizes strangers who merely share a temperament (a *bonded* pair reaches the max); a **rival** pair just contributes nothing (cozy — no penalty). `resolveChoice` stays pure (bonds are passed in by `chooseInRun` via `getRelationships`); the `choose` response flags `bonded`, so the story log shows **"💞 they pulled together"** when a real friendship helped a check.
- **Care matters.** The feed/groom action (`§7`, once per game-day) was an inert counter; now a horse **tended today** (`gameDay(lastCaredAt) === gameDay(now)`) sets out in good fettle — a small DC reduction (`CARE_CHECK_BONUS`) on the adventure checks it attempts, applied to the **horse that steps up**, stacking with harmony (buff-only, cozy). `resolveChoice` takes `now` (passed by `chooseInRun` as `Date.now()`) and reports the bonus as `roll.care`, so the story log shows **"🍎 well-tended +N"**. Lifetime care drives a cosmetic **"Beloved"** mark at `CARE_BELOVED_THRESHOLD`; `publicHorse` exposes `careCount`, `beloved`, and `caredToday` (the detail page shows the mark + whether the buff is live).
- **Bonds shape breeding.** Breeding was an inheritance island — a foal's stats came from its parents' stats + roll, but the parents' **relationship** played no part. Now a foal born to a close pair starts life a little stronger: each stat gets up to `BONDED_BREED_STAT_BONUS` points (§14.2), graded by the parents' stored **affinity** (`÷ BONDED_THRESHOLD`, capped at 1 — the *same* rapport reading the adventure harmony buff uses), applied on top of inheritance and clamped to `STAT_MAX`. Strangers and rivals add nothing (cozy, buff-only — no penalty for an un-bonded cross); this is the **sanctioned breeding-path boost** past the training soft-cap toward 19–20 (`STAT_TRAIN_SOFTCAP`). `breedHorses` reads the graph via `getRelationships` (order-independent pair lookup) and applies the bonus post-mint, surfacing it as `bond: { bonus, affinity, type }` on the viable result; the **odds preview** (`GET /api/breed/odds`) carries a matching `bond: { affinity, type, statBonus }` so the player sees the payoff *before* committing. The Breed page shows **"💞 Born of a bond — +N in every stat"** in both the odds card and the foal result. So the relationship graph now reaches a **second** system (breeding), not just adventures.
- **Seasoned adventurers work better.** The last silo: jobs and adventures both trained skills but never reinforced each other across the divide. Now a horse that's earned the **Seasoned** mark (`adventures ≥ ADVENTURE_MARK_THRESHOLD`) brings that worldly experience to its day job — its daily job check rolls against a DC eased by `JOB_SEASONED_DC_BONUS` (so it succeeds and crits a little more, earning more Cubes + skill XP). Pure `jobDc(adventures)` in `services/jobs.ts` (buff-only — a homebody just uses the base `JOB_DC`); the detail page's Job section notes it when a Seasoned horse is working. This is the **first real mechanical payoff** for the Seasoned mark (previously cosmetic) and closes the loop: adventuring now makes a horse a better worker, completing the jobs ↔ adventures interconnection. *(The interconnection arc — adventures train horses, bonds → adventures, care → adventures, bonds → breeding, adventures → jobs — is now whole; relationships, care, and adventure-experience each reach a system beyond where they're earned.)*

### 9.4 Dice & determinism

All rolls run **server-side through the seeded RNG** (reuse the same injectable-rand discipline the genetics engine uses), so outcomes are authoritative, reproducible, and uncheatable. Surface rolls visually (animated dice, clear DC vs. result) — it's a great *show-don't-tell* moment and a satisfying juicy beat.

### 9.4a Turn-based combat (JRPG-lineage, cozy/no-death)

A positionless, menu-driven battle (Final Fantasy / Pokémon lineage — **no** tactical grid), adapted to our no-death world and built entirely on the existing stat/skill/personality/relationship systems. **Cozy spine:** combat is about *reading, not violence* — a "boss" is a grumpy guardian, KO is a nap, a wipe is a retreat. HP is **battle-scoped** (every fight starts full; nothing persists — no grind-down, no wounded-horse waiting room).

- **The four approaches** (damage "types", §14.7) each map to a **class** (§9.4b) + a stat, so a horse's specialization *is* its battle role: **Confront** (Knight/STR/smithing), **Outwit** (Wizard/INT/reading), **Skirmish** (Rogue/DEX/athletics), **Soothe** (Cleric/**kindness** — the Agreeableness trait ÷ `KINDNESS_STAT_DIV` — + performance). DEX also = turn order + Flee; WIS = reading the foe. Soothe keying off kindness gives **Benevolent** horses a real role (the Cleric). Every job structure (Forge/Library/Track/Stage) trains a role.
- **Roles from existing systems:** high STR/INT → attacker, high WIS + **Agreeableness** ("Benevolent") → healer, high CON + **Conscientiousness** → defender, high DEX → skirmisher, **low Neuroticism** → resists fear statuses. Composition matters.
- **Data model** (`services/combat.ts`, `content/enemies.ts`, persisted in the `battles` table — seeded + resumable like `adventure_runs`): a `Combatant` (HP from `HP_BASE + HP_PER_CON·CON`; battle-scoped statuses + `defending`), an authored `EnemyDef` (maxHp/power/guard/speed/weakness/resist/moves/reward/tell), and a `BattleSnapshot` (round, turn cursor, order, combatants, log) stored as jsonb.
- **Turn loop:** order by **DEX desc, ties by the seeded RNG**, recomputed each round; KO'd skip. Each roll derives from `(seed, round, turnIndex)` so a battle replays identically. The menu (per party turn) is the horse's class **Attack** (+ the Cleric's **Mend**) **· Item · Defend · Flee**. Resolution reuses `skillCheck`: a clean hit scales with the attacker's stat mod + crit; a miss still chips (`DMG_GLANCE`, cozy); Defend halves the next incoming hit; Flee is a DEX check (a miss only costs the turn).
- **Approaches & weaknesses (the tactical heart).** A horse's **class** fixes its Attack to one **approach** (Confront/Outwit/Skirmish/Soothe — §9.4b), each a `skillCheck` on its stat (Soothe on **kindness**). An enemy is **weak** to one approach (×`COMBAT_WEAKNESS_MULT`) and may **resist** one (×`COMBAT_RESIST_MULT`); a resisted hit still lands for ≥1 (cozy — the wrong class is weaker, never a punish). The foe's **tell** is surfaced (a readable hint, never blind guesswork), so matching the right **class** to the foe is the core decision; the log narrates it (*"★ A glaring weakness"* / *"◦ Barely scratched"*). The `EnemyDef` carries `weakness`/`resist`/`tell`; foes don't pick approaches (they just swing with `power`).
- **KO / retreat:** 0 HP = "spooked" (skipped, fine after). A full-party KO → **retreat** home with `REWARD_RETREAT_FRACTION` of the reward — never a loss/death/Game-Over. **The Healing Potion** (the herb-hunt's deferred terminal item, §9.3) is the v1 battle Item: it restores `POTION_HEAL_HP` to a conscious horse and **rouses a KO'd one** to `POTION_REVIVE_HP`. Constants in §14.7.
- **Entry:** v1 ships a **standalone "Sparring Ring"** (`POST /api/battle/start`, `/battle/:id/act`, `GET /battle/:id`; client at the Adventure hub → Spar, `/adventure/spar`) so the loop is playable now. The real entry — a battle as a new adventure **Outcome type** (`battle?: enemyId`) with a run→battle handoff, a **region boss** (the *Hollow-Keeper*) debuting *with* its weakness puzzle — lands with the next layer.
- **Deferred (layered after playtest):** the **status** layer (Rattled/Heartened — `CombatStatus` is forward-compat, empty so far), **harmony** (bonded shared-defense / "Covered"), the **rest of each class's ability kit** (Knight Guard, Wizard's bigger spells, Rogue evasion — the Cleric's Mend ships now), the run→battle handoff + **region boss** (the *Hollow-Keeper*), and combat-trains-horses (per-attack skill XP via the existing `grantSkillXp` path). Out of scope entirely: movement/positioning grid, MP/spell economy, a **class XP/leveling track** (classes ride on stats), multiclassing, gear gating, large enemy/status libraries.

### 9.4b Classes (an identity + ability layer over the approaches)

Four classes — **Knight / Wizard / Rogue / Cleric** — sit *on top of* the approach system (§9.4a) as a **flavor + themed-ability** layer, **not** a separate progression. A horse picks a class; the class maps to a signature approach (Knight→Confront/STR, Wizard→Outwit/INT, Rogue→Skirmish/DEX, Cleric→Soothe/kindness) and names its actions ("Cleave", "Hex", "Skirmish", "Soothe"), but the horse's **existing stats** decide how good it is (a high-STR horse makes a strong Knight; a kind horse a strong Cleric). So classes **extend** emergent specialization — they don't replace it.

- **The weakness puzzle is class-vs-enemy:** an enemy weak to an approach is weak to that class. Bringing a balanced party (Knight/Wizard/Rogue/Cleric) and matching the right class to each foe's tell is the tactic. (Live: a Cleric downs a Soothe-weak foe in ~4 rounds where a Knight, Confront-resisted, takes ~9.)
- **The Cleric's `Mend`** heals/revives an ally for `CLERIC_MEND_BASE` + the Cleric's kindness — the active ability that gives Benevolent horses their combat role (the other classes' extra abilities are deferred).
- **Get/change a class** — **freely re-assignable anytime** via `POST /api/horses/:id/class` (the simplest option, so players can experiment; a battle snapshots the class at its start, so it can't change mid-fight). No class XP, multiclass, or gear. Stored as a nullable `horses.class` enum; surfaced on `publicHorse` and the battle view. *(Design choice — picked the player's lean over choose-once/earned; commitment can come later.)*
- **Combat text** got a **JRPG reskin in our voice** — heroic structure with the deadpan kept: e.g. *"Brute strikes the Thistle-Whirl for 8."* → *"Sir Brute cleaves into the Thistle-Whirl — 8 damage."*; *"…a weak point! 💥"* → *"★ A glaring weakness."*; *"X is too spooked to go on."* → *"X is spooked! (Out cold — back by supper.)"*

### 9.4c The adventure → boss handoff (combat wired into the game)

Combat stops being an isolated practice mode: a region's interactive adventure can **culminate in a boss battle**, reached by pushing deep enough. This is the existing push-deeper/bank structure taken to its end — the boss *is* the deepest push.

- **Mechanism:** an `Outcome.battle?: enemyId` (on the adventure scene tree). When `chooseInRun` resolves that outcome, it reuses **`bankAndEnd`** (banks the journey haul, ends the run, bumps the Seasoned count) and then calls combat's **`startBattle`** with the run's party (linked via `battles.runId`), returning the battle in the `choose` result so the client switches screens. Sequential, not nested — `adventure-run` imports `combat`; combat never calls back (no circular dependency, no run-resume machinery).
- **Rewards:** the journey haul banks at the handoff (yours either way — cozy). The **boss's `EnemyDef.reward` is the big end-of-adventure prize**, granted on victory by the existing combat reward path; a loss grants the `REWARD_RETREAT_FRACTION`. So victory = journey haul + full boss prize; **losing is a retreat home with reduced rewards, never a loss/death** (the cozy rule, inherited from combat).
- **The bosses — one per region, each weak to a different class** (so the whole roster matters and party composition is the puzzle): **Green Grass → the Hollow-Keeper** (a vast old stag, weak to a **Cleric's** Soothe, resists Confront); **Dusty Dunes → the Sandstone Sentinel** (a cracked rock colossus, weak to a **Knight's** Confront, resists Soothe); **Weird Woods → the Mistwood Mimic** (a flickering trickster, weak to a **Wizard's** Outwit, resists Confront). Each has a real tell. A party that crushes one boss can struggle with the next.
- **Content reach:** every region now has authored interactive expeditions (Green Grass 3, Dusty Dunes 2, Weird Woods 1+) — not only Green Grass — so the picker offers real choice region-to-region. Adding more is pure data (an `AdventureScript` + an `EnemyDef`).
- **Reaching it:** the boss is its own expedition in the Green Grass pool; `startRun` takes an optional `scriptId` and the client offers an **expedition picker** (`GET /api/regions/:id/adventures`) so a region's adventures are chosen on purpose, not only drawn at random. The battle screen is a shared **`BattleArena`** component used by both the Sparring Ring and the boss handoff.
- **Deferred (after the full play-through):** statuses (Rattled/Heartened), harmony, the rest of each class's ability kit. Out of scope unchanged.

### 9.4d Combat woven into the adventure pool (variety pass)

The pools grew from boss-only-combat to a **deliberate cozy-dominant mix**, so combat shows up in regular adventures — not only the climax — while the cozy loop stays the default. **13 stories across 3 regions** (Green Grass 6, Dusty Dunes 4, Weird Woods 3):

> **"The Lost Lamb" (Green Grass, no combat) is the depth-of-decision showcase (§9.3).** It proves the scene-tree engine already expresses *real* branching + cross-scene consequence with zero engine changes: the opening fork reaches three genuinely different middles — the **Creek** (Swim/Befriend), the **Bramble-Hollow** (Force/Knowledge), and a secret **Openness-gated Fence-Line** (Use-Tool) — that don't funnel back. Early outcomes echo late, all via the herb-hunt feed-forward mechanism (route to a consequence-specific variant): calm- vs tense-arrival → `creek-calm`/`creek-tense` (Befriend DC 11 vs 14); a Winded climb-failure → `hollow`/`hollow-winded` (checks +2); the lamb's state + carried marsh-sage → which of five `finale-*` you land on (flavor + reward: bonded 35 ⬡, clean/soggy 25, full-flock 50, bank 8). Worst case is a soggy party + carried fatigue, never a loss. Content-integrity tests assert all three branches (incl. the gated fence) are reachable and the ending rewards vary correctly.


- **Ratio (by how combat appears):** **5 pure-cozy** (no fight) · **2 cozy + an *optional* fight** (a fully avoidable skirmish branch) · **2 combat-forward** (a short story whose climax is a non-boss skirmish) · **3 boss** (the grand terminal climax). So **7 / 12 are cozy-or-avoidable** and a player can clear ~9/12 with no forced fight — combat stays earned and special.
- **Enemy variety exercises the whole roster** — no class is the universal answer. Non-boss fights span all four: a Bramble-Tangle (Knight), a Snappish Gander (Cleric), a Thistle-Whirl (Wizard), a Mossback Tortoise (Rogue); bosses add Cleric/Knight/Wizard. Different stories demand different classes.
- **Same bar as Sunny Hollow:** every script has distinct stat checks across its scenes, ≥1 **personality gate** (a `requires` choice — listed but `available:false`, and `chooseInRun`-enforced, when no party member qualifies), and the push/bank fork. A **written voice & tone standard** (derived from Sunny Hollow + the Hollow-Keeper) now heads `adventures.ts` so new content can't drift flatter than the hand-crafted scripts.
- **Content-integrity tests** guard the pool: every script's `start` exists, every choice `next` resolves to a scene or `end`, no orphan scenes, every battle ref (boss **or** skirmish) resolves to a real enemy, and all three regions have a reachable pool.
- **Flagged, deliberately not built (pure-content pass):** a **mid-run skirmish that the story continues *past*** needs a small engine change (an `in_battle` run state + a resume-after-battle endpoint, so a battle can sit *between* scenes rather than ending the run). Combat-forward stories ship as terminal skirmishes for now; the fight-then-continue nicety is a clean follow-up.

### 7e Economy foundation: the per-horse daily gather cap

The first real economy lever. Passive daily gathering was uncapped (roam infinitely → material/Cube inflation → trivial crafting); it confused players because it shared menu space with grindable adventuring. The fix throttles the **source**, not crafting costs:

- **Gathering is capped at once per owned (adult) horse per day** (`GATHER_PER_HORSE_PER_DAY = 1`, balance.ts). One "Daily Gather" action sends the whole stable foraging — every horse still under its cap rolls `ROAM_DROPS_MIN..MAX` materials, banked together, then it's done until the next midnight-EST rollover (tracked by a per-horse `lastGatheredAt`, mirroring `lastCaredAt`). **A bigger stable gathers more** (every horse is mechanically valuable); raw materials are now finite/paced.
- **Adventuring stays uncapped/grindable but pays Cubes/loot/story, not bulk materials.** The dice-adventure path now grants `ADVENTURE_CUBES_PER_SUCCESS` per win; the measured material yield of grindable adventuring is ~2–3 raws/run (Cube/loot/rare-dominant) — *not* an alternate material firehose.
- **The two are now visibly different things in the UI.** Daily gathering (the chore + Quests) lives on the **Pasture**; grindable adventuring lives under the **⚔ Adventure** hub → **Venture Out** (`/adventure/venture`; the old `/world`, `/explore`, and `/spar` routes redirect into the hub). Onboarding quests retuned from "roam 3×" to a single daily gather. *(The Adventure hub also houses the no-stakes Sparring Ring at `/adventure/spar` — see §9.4.)*
- **Measured (3-day sim, 5-horse stable, 4 adventures/day):** ~34 raw mats from gathering vs ~28 from adventuring (gathering the majority); ~20 raws/day total; ~138 Cubes/day. So a day funds only a handful of ~5–7-raw products — crafting is no longer flooded. **Recommendation: hold crafting costs; the cap balanced the source.** Re-runnable via `apps/server/scripts/measure-economy.ts`.
- **Render fix (orthogonal):** horse sprites are now capped to the native **150×126 at integer scale only** (the canvas's CSS size is locked to its bitmap size; `image-rendering: pixelated`), so upscaled pixel art is crisp instead of fractionally blurred.

### 7f The progression spine: Herd Tier (the Cubes sink)

ONE legible ladder — `herds.level` (a dormant hook that already gated `pastureCapacity`, now actually written) — is the herd's long-term progression + the Cubes sink. Each rung raises **three capacities together** so it reads as one tier, not parallel meters: **herd-size cap** (the master lever) + **autonomy job slots** + **Pasture structure slots** (the existing `pastureCapacity(level)`). `HERD_TIERS` in balance.ts.

- **The ladder (5 tiers):** Smallholding (6 horses / 2 jobs / 4 slots, start) → Working Farm (10 / 3 / 5, **650 ⬡**) → Ranch (15 / 4 / 6, **1,250**) → Estate (22 / 5 / 7, **2,100**) → Dynasty (30 / 6 / 8, **3,600**).
- **Costs priced against measured income, not feel.** A projection (`scripts/project-progression.ts`) models income compounding 158 → 394 Cubes/day as the herd grows; the chosen costs give **days-to-tier ≈ 4 → 6 → 8 → 11** (earned, gently rising, never the 21-day wall the feel-based costs produced). 30 confirmed comfortable: the autonomy tick is bounded by `MAX_AUTONOMY_PAIRS=60`, jobs ≤ slots, the gather batch is linear.
- **The compounding loop is real:** more horses → more daily gathering (per-horse cap fixed → *count* is the only lever) + more autonomy-job Cubes (job-slot cap) + bigger adventure runs → more income → the next, bigger tier.
- **Gates force playing the breadth.** Tier 2 = a light early accomplishment (the **a-new-foal** quest — breed a foal) + Cubes; Tier 3 = **beat the Green Grass boss**; Tier 4 = **own a rare coat (≥0.5) AND beat the Dusty Dunes boss**; Tier 5 = **beat the Weird Woods boss**. Milestones are detected on demand (won-battle query, on-the-fly `coatRarityScore` scan, quest check) — nothing new stored.
- **Enforcement is motivating, never a dead end.** The herd-size cap is checked at the deliberate add-points (breeding, Tavern recruiting; the dice-adventure wild gracefully → Tavern); blocked → *"Your Smallholding is full (6/6). Reach Tier 2 (Working Farm) to raise it to 10 horses — 650 ⬡"* with a link to the progression panel. Job-slots cap likewise. (A rare story-befriended stray still joins — a cozy exception.)
- **Surfaced** as the **Herd Tier panel on the Pasture** (tier + caps, the next upgrade's cost/gates/unlocks, the Upgrade button) — `GET /api/progression`, `POST /api/progression/upgrade`.

### 7g The Care hub: the daily rhythm (cook AM / groom PM)

The cozy heartbeat that frames the day — **two bookend rituals**, both whole-herd batch actions (pleasant at 30 horses), both **daily and reset**. Firm guard: *rewarding to do, gentle to skip — no penalties, guilt, or neglect-spiral, ever; nothing is gated behind either ritual.* (A third play/leisure activity was considered and deliberately **left out** for beta — the Living Herd, §8, already runs bonding autonomously; two clean bookends beat three muddy ones.) Constants in balance.ts; the `care-hub.ts` service; `GET /api/care`, `POST /api/care/cook`, `POST /api/care/groom`; surfaced as the **🐴 Care** tab.

- **Morning — the communal pot (cook).** One **slot per herd horse** (`cookSlots`, clamped 2–30) — a bigger herd cooks a bigger meal, so cooking *rewards* herd-tier progress. Six common grains map 1:1 to the six stats (`GRAIN_STAT`: corn→STR, oats→DEX, barley→CON, wheat→INT, rice→WIS, rye→CHA); each grain in the pot buffs its stat, capped at **+5 per stat** (`COOK_PER_STAT_CAP` — one stat can't be trivialized). A rare **Saffron Bloom** multiplies the *whole dish* ×1.5 each (`COOK_RARE_MULT`), hard-capped at +10 (`COOK_BUFF_HARD_CAP`). The cooked mix is the day's **stat loadout**, applied uniformly as a **DC reduction** on every adventure, job, and boss check that day (same mechanism as harmony/care), live only on the day it was cooked (`herds.mealDay`/`mealBuffs`, keyed to `gameDay`). **Breadth scales with the herd:** a Smallholding (6) maxes one stat; a Dynasty (30 = 6×5) can max all six.
- **Evening — tuck the herd in (groom).** Lifts rough moods (clears `rattled` → `content`, set on a battle retreat — purely cosmetic, never a stat penalty) and queues a small **flat** `GROOM_CUBES` (25) bonus collected at the **next sunrise** (`groomBonusPending` → paid once on rollover in `advanceHerd`, alongside `DAILY_CUBES`). Deliberately flat and tiny (not per-horse) so skipping is genuinely guilt-free — a thank-you for tucking them in, not a FOMO lever.
- **Ingredients come from the existing economy, no parallel grind:** grains are a **gather byproduct** (one per gathering horse, `roam`); Saffron Bloom drops only from the three region **bosses** — far rarer, "save it for a feast."

### 7h Daily region omens (world weather)

One omen per region per game day — **world-level weather**: seeded by `(regionId, gameDay)` only (`omenFor`, services/omens.ts), so every herd sees the same mist over Green Grass; derived, never stored. Cozy: an omen is a **buff or pure flavor, never a penalty** — either one stat's expedition checks in that region get `OMEN_CHECK_BONUS` off the DC (applied in `resolveChoice` alongside harmony + the meal buff), or each daily-gather horse brings home `OMEN_GATHER_BONUS_QTY` extra of a featured item (`roam`; the omen never shifts the gather RNG stream), or it's a deadpan no-op ("An East Wind… the old horses will not say what"). Tables in `content/omens.ts` (5 per region, voice bar applies); surfaced via `GET /regions` (`RegionView.omen`: name + voice line + a qualitative hint, no balance numbers leaked) as a weather plate on Venture Out and a forager hint on the Daily Gather. Makes the randomized expedition pool feel different day-to-day — and picking a favorable sky to challenge a Keeper is intentional emergent depth.

### 7i First-day onboarding (the rhythm quest)

One quest, "Your First Day," teaches the whole daily loop by doing it — five objectives in rhythm order (labels teach the sequence; completion is order-free, cozy): **forage** (grains ride home) → **cook** → **expedition** → **groom** → **greet the next sunrise**. Built entirely on the existing quest engine via four new `GameEvent` types (`cook`, `groom`, `expedition` — recorded at cook success, groom, and `bankAndEnd`; `sunrise` — recorded by `advanceHerd` on a real rollover). The finale lands in the **Morning Post**: `DailyResult.questCompletions` (id + title + cubes, rewards granted server-side by `recordEvent`) renders as a 🎓 section. Reward 250 ⬡ (under the Tier-2 cost; stacks with First Steps' overlap on the forage, intentionally generous on day one).

### 7j The Garden (optional enrichment — never an obligation)

Preset plots; **plant the crop itself** (no seed items), harvest a real multiplier + sometimes a second resource (apple → apples + timber; carrot → carrots + greens). Everything a garden grows is also gatherable/cookable through existing systems (crops sit in the region gather tables — radish/carrot in Green Grass, pumpkin in the Dunes, apple/walnut in the Woods; grains & marsh-sage were already there) — a player who ignores it loses nothing; engaged players get the *deliberate* ingredient combinations gathering can't promise. With no seed items, gathering is also how the first specimen of each crop arrives. Crops join the cook map (`COOK_STAT` ⊇ `GRAIN_STAT`: radish→DEX, carrot→WIS, greens→CON, pumpkin→STR, apple→CHA, walnut→INT), so the garden is the targeted way to cook a chosen loadout. Content in `content/crops.ts`; tunables in balance; plot stages **derived from timestamps at read time** (nothing ticks). Five tiers (12/24/48/72/96h) with gently rising value-per-hour (~0.50→0.58 ⬡/h net — patience pays a little; fertilizers favor cycling; a playstyle, not an answer). **Plots ride the herd-tier spine**: `2 + tier` (3→7), no garden XP. **The cozy heart — withering returns the planted crop (0 net loss)** at the end of a long VISIBLE runway: full tank → 48h drain → grace `max(120h, 2× grow time)` → wither; any watering resets to safe; ≥7-day runway on every tier (weekly tending never loses a harvest). **Fertilizers (optional, additive, never required):** basic (one per horse per FED day — the communal cook the prior day; skipping just yields none) ×0.8 grow time; rich (2 basic + 1 bone — a new region-loot drop) +1–2 base crops; magic (1 basic + 1 fairy-dust — boss-only drop) +ONE random base crop from the defined pool (EV ≈ one 2⬡ item — a treat, not an exploit). **Sprinkler** (Cubes sink): 15⬡/day up to 14 days; pins every tank full + ~11% faster growth — convenience, never "pay or die". Routes under `/api/garden/*`; `DailyResult.fertilizer` feeds the Morning Post's 💩 ledger line. Surfaced as the 🌱 Garden tab.

### 7k The Town hub (a sense of place)

One settlement, one screen: **`/town`** draws the frontier's storefronts as pixel façades (banded awnings on the shared grid) — the **Tavern** (recruitment), the **Workshop** (crafting), the **Market** (horse listings + direct trades), a cross-link to the **Sparring Ring** (fiction-ally in Town; flow stays under the Adventure hub), and one boarded-up façade reserved for the future NPC shops (§8 "The Town & NPCs"). Pure landing/navigation on the Adventure-hub pattern: pages moved to `/town/{tavern,workshop,market}`, old flat routes redirect forever, sub-pages carry a "← The Town" back-link, and the nav shrinks 10 → 8 tabs (🏘 Town). Live touches ride one parallel fetch (tavern headcount, market listing count). No server changes.

### 7l The Debug Shrine (glitch access) + the live birth roll

Glitches (§4.3b/§5.7) were fully built but dormant — nothing in live play ever rolled one. Two doors open at once. **The natural roll now actually runs:** every new horse (bred, wild, founder, starter) rolls `GLITCH_CHANCE` inside `mintHorse`, derived from its own seed (`rollGlitch`, uniform over `GLITCH_KINDS` — all three: `inverted`/`screen`/`shade`); explicit input (debug/tests) still wins, foals stay white until the reveal (the adapter already defers the glitch to adulthood), and breeding still never copies one — a foal's column is its own fresh roll. **The deliberate door is the Debug Shrine** (`/town/shrine`, a Town façade): offer **1 fairy dust** (Keeper-only drop — second sink beside magic fertilizer, a real choice) and the monks introduce one bug of the SHRINE'S choosing (server-rolled uniform; the client previews all three looks but never picks); **filing a bug report** (`SHRINE_PATCH_FEE` = 50 ⬡) clears it — cheap on purpose, nobody is stuck with a look they hate. Adults only ("foals have no bugs yet"). Routes `POST /api/shrine/{glitch,patch}`; audited; atomic via the consume/spend kernels. `GLITCH_KINDS` is render-core's new runtime export — the one list the roll, the shrine, and the previews all share.

### 7m The Studbook (breeding goals + the Registrar)

Breeding gets direction without obligation. The **Registrar** (a Town façade → `/town/studbook`) keeps a **fixed ladder of 13 standing goals** — no rotation, no timers, no FOMO (cozy-first) — across three pages: Novice (4 × 100 ⬡ — the undiluted bases + "any first foal"), Journeyman (5 × 250 ⬡ — one deliberate gene: single cream, dun, roan, sooty, champagne), Master (4 × 600 ⬡ — double cream, dun-over-cream, gray, expressed pearl); `STUDBOOK_TIER_CUBES` in balance, ~4,050 ⬡ lifetime. Goals are content (`content/studbook.ts`): predicates over the RESOLVED phenotype (allele counts + flags, never display strings; "plain" base goals exclude dilutions — a Dunalino is not "a chestnut"), all reachable with the beta loci the regions actually roll. **A goal fulfills exactly once per herd, automatically, at the foal→adult coat reveal** (`matureFoals` → `checkStudbookOnMature`) and only for `origin === 'bred'` — recruits/founders walk in already written; a goal-coat foal *bought* young and raised to its reveal counts too (deliberate: studbook demand feeds the player Market, §10). Completions land in `studbook_entries` (unique herd+goal — the insert IS the double-award guard; the coat string is stored so the record survives the horse) and ride the Morning Post as a 📖 section (`DailyResult.studbook`). The book also derives **founded lines** at read: every coat bred to adulthood, earliest foal marked the line's author. Read-only API (`GET /api/studbook`); the Breed page shows the Registrar's next three open requests.

### 7n The polish bundle (paying off built systems)

Four small features, one principle: systems that already worked finally get *seen*. **The Naturalist's Purse** — Field Guide milestones (`FIELD_GUIDE_MILESTONES`: 10/25/40/55/71 coats → 150/300/500/750/1,500 ⬡, lifetime 3,200 ⬡) pay automatically inside `recordDiscovery`, once each via the unique `guide_milestones` (herd, coats) index; the top rung IS the catalog size (a content-integrity test pins 71 — a gene drop that grows the catalog extends the ladder in the same change). Reveals during the daily check-in ride the Morning Post ledger (`DailyResult.guide`); mid-day discoveries (recruits, befriends) announce through a 📖 Journal beat; the Guide page shows the ladder with claimed rungs. **Brag Lines** — `horses.accomplishments` (stored since §9.1, rendered nowhere) now wear 🏅 chips on the horse sheet, and a NEW accomplishment writes a 🏅 Journal beat from both grant sites (jobs at the rollover via `resolveJobsForDay(..., tickDay)`, adventures live). **The Registrar Squints** — `breedingOdds` returns the engine's carrier summary it always computed and discarded (`carriers`, pLive ≥ 0.1, top 4): the Breed odds card whispers what hides in the parents ("carried quietly — Pearl (50%)"), feeding exactly the Studbook's Master goals. **Proper Change** — `formatCubes()` renders the topbar purse in the three canonical metals (1,275 → "12s 75c", exact count in the tooltip; `CUBE_SILVER`/`CUBE_GOLD` finally imported); prices and fees stay plain ⬡ copper on purpose.

### 7o Night Reading (the craft→autonomy loop closes)

The plan's signature loop — *craft a Book → a horse reads it → gains a skill → that shifts who it befriends* — finally runs. Each autonomy night (per caught-up day, on the day's seeded rng — item-less herds consume zero draws, preserving twin-determinism): **📚 one seeded horse reads a Book** (consumed; `NIGHT_READ_XP` = 12 reading XP through the real skill path — level-ups, stat training, accomplishments, the 🏅 brag beat); a lone horse still reads (company optional, books not). **🎲 If the Meeting Hall stands** — its first real job since §8.4 promised "clubs and civil-society roles" — a seeded pair shares a Board Game (`GAME_NIGHT_AFFINITY` = +3, threshold-crossing friendship beats fire as usual), and the game occasionally wears out (`GAME_WEAR_CHANCE` = 0.15 — *"the dice went under the floorboards for good"* — gentle Workshop re-demand, never a punishment: the night still happened). A **game-club** founds itself once (Hall + an owned Board Game + `CLUB_MIN_MEMBERS` adults; the club-formation path now checks each club type independently). All beats ride the existing Journal → Morning Post pipeline; zero web changes. Tools remain the one product still awaiting a sink (flagged in `content/items.ts`).

### 9.5 Beta scope

Ship: the six stats \+ hidden Luck, 4–6 skills, 2–3 jobs tied to starter structures, single-horse-and-small-party adventures with one encounter table per starter region, the **wild-encounter → party-recruit → Tavern** flow, dice resolution UI, accomplishments. Defer to **post-beta content waves**: large/strategic parties, deep job trees, multi-stage expeditions, and civil-society offices — all extend the same stat+dice+event spine.

---

## 10\. Social & Economy (async)

- **The Tavern (recruitment pool)** — the shared pool of wild horses that reached the Tavern (from adventures, §9.3). **Any player can recruit one for a fee** (formula in §14.3) from rarity \+ skills \+ stats \+ personality. Primary **soft-currency sink** and a light contest for standout horses; recruitment is atomic (first to pay claims it). **The herd that first encountered the horse on an adventure is notified when it's recruited** — a small feel-good/anti-griefing touch closing the loop on "the one that got away."  
- **Marketplace** — list owned horses/items at a fixed price; server-escrowed purchase.  
- **Direct trades** — offer/counter/accept, both sides escrowed, atomic settlement.  
- **Inter-herd visits** — async: visit another herd's grounds, see their horses and journal highlights; later, cross-herd friendships/clubs.  
- **Messaging** — simple async threads.  
- **Anti-abuse for beta** — every trade/sale/breed/recruit in `AuditLog`; rate limits; mod tools to freeze accounts/reverse trades; report button.

---

## 11\. Build Phases (execute in order)

Each phase ends in something runnable and testable. The core (genetics \+ renderer) is front-loaded to de-risk; the RPG layer and the Living Herd land mid-roadmap once horses, herds, and items exist; social and hardening come last. The live-genetics content pipeline (§5.6) is stood up early so new gene drops are routine from then on.

**Phase 0 — Scaffold.** Monorepo, pnpm workspaces, TS config, lint/format, empty `genetics` package, `web` and `server` apps that boot. CI runs typecheck \+ tests.

**Phase 1 — Genetics package (port \+ wrap).** Vendor `genetics.js` \+ `data.js` into `packages/genetics/vendor/` untouched, bring the existing 340-test suite across and keep it green, add the typed ESM facade \+ types (§5.1) and the regional-frequency table format. No UI. Done when the typed API resolves/breeds/rolls identically in both Node and Vite.

**Phase 2 — Renderer \+ palette adapter.** Layer manifest, palette adapter (§4.3) \+ **procedural shading stage** (§4.3a: pangaré/sooty/roan) \+ glitch transforms (§4.3b), PixiJS compositor, tinting, layer selection, PNG export. Produce the two beta art additions (dorsal-stripe overlay, plain chestnut/black legs). Standalone dev page: generate a genotype → see the horse (resample \+ save PNG \+ copy link). **Also stand up the live-genetics content pipeline (§5.6)** so a gene drop \= data \+ assets \+ frequency, no engine/renderer changes.

**Phase 3 — Persistence & accounts.** Postgres \+ Drizzle schema \+ migrations, auth/sessions, **User \+ Herd \+ Horse** tables (Herd as the hub), mint/store/load horses, render-on-demand with caching.

**Phase 4 — Breeding loop.** Owned-horse selection, server-authoritative `breedFoal` with cooldowns and stage gates, foal minting (inheriting seed \+ personality \+ stats), **`punnett()` foal-odds preview (beta)**, pedigree view.

**Phase 5 — Exploration & quests.** Regions with per-region `freqOverride` (White/Gray rarest) and adventure encounter tables, paced roam action for items/resources/quest beats, quest chains, region gating. (Wild-horse acquisition arrives with adventures in Phase 8.)

**Phase 6 — Aging, care & daily rhythm.** Life-stage progression over real time, care actions, the **white-foal → adult-color reveal** at maturity, the **daily midnight rollover** \+ dailies \+ login-catchup cursor, Field Guide.

**Phase 7 — The Pasture, gathering & crafting.** Developable Pasture, placeable Structures, resource gathering from exploration, crafting (books/games/tools/materials). Sets up inputs for both the RPG layer and autonomy.

**Phase 8 — RPG progression (stats, jobs, adventures).** Six stats \+ hidden Luck (heritable \+ trainable), seeded dice resolution \+ UI, 2–3 structure-gated jobs, single-horse-and-small-party adventures with per-region encounter tables, the **wild-encounter → party-recruit → Tavern** flow (atomic fee-based recruiting \+ fee formula), accomplishments. The within-day depth engine, rare-item faucet, and new-horse source (§9).

**Phase 9 — The Living Herd (autonomy engine).** Personality vector \+ compatibility, Relationship graph, the deterministic daily tick (global \+ login-catchup), criteria-gated JournalEvents, friend/rival/bonded relationships, 1–2 structure-gated clubs/roles that hook into Phase 8 jobs. The signature feature; event types built to extend.

**Phase 10 — Social & economy.** Marketplace, escrowed trades, inter-herd visits, messaging.

**Phase 11 — Beta hardening.** AuditLog coverage, rate limiting, moderation tools, report flow, error/empty states, deploy pipeline, basic analytics, and a rehearsed gene-drop runbook.

> **Phase 11 contract (as built).** New endpoints: `POST /report` (any authed player; rate-limited 5/min), `GET /mod/reports` + `GET /mod/stats` (mod/admin), `POST /mod/users/:id/freeze` + `/unfreeze` (admin). Global rate limit 600 req/min per IP (configurable via `buildApp(db,{rateLimitMax})`; sensitive routes set a tighter per-route cap). Account freeze (`users.frozen`): a frozen account may read, but every non-`/auth` mutating request is refused with `403 {code:"frozen"}` via a central pre-handler. All errors now return JSON `{error, code}`; unknown routes return `404 {code:"not_found"}`. `AuditLog` coverage extended to `breed` and `tavern_recruit` (joining the economy actions). Basic analytics = the `/mod/stats` aggregate over the AuditLog event stream. Deploy: `apps/server/Dockerfile` + root `docker-compose.yml` run a single instance with PGlite persisted to a `/data` volume; horizontal scale swaps `DATABASE_URL` to real Postgres (§6). See `DEPLOY.md` and `docs/GENE_DROP_RUNBOOK.md`.

> **Audit hardening wave (June 2026).** The §11 atomicity doctrine — every value flow is a *conditional claim*: exactly one winner, the kernels own all Cube movement — now covers the last holdouts. (P0) Market buys and trade accepts debit through `spendCubes`/`creditCubes` inside their transactions (a stale pre-check can no longer drive a balance negative). (P1 races, same family) `advanceHerd` claims the whole catch-up range on the old `lastSimTick` before replaying days (concurrent check-ins at a rollover pay once) and reveals foals via per-row `lifeStage` claims; `chooseInRun` claims each step transition (`status='active' AND step=N`) before any side effect — wild strangers are pre-generated and minted only by the claim winner; `actInBattle` claims the state/status write before potions burn or prizes pay; the daily gather stamps `lastGatheredAt` with an under-cap conditional and rolls loot only for claimed rows. (Gates/leaks) Region Keepers carry `keeper: true` and `startBattle` refuses them without a run handoff, so `POST /battle/start` cannot skip the earned challenge that feeds `hasBeatenBoss`; **public contract change:** `publicHorse` and `/horses/:id/spec` redact `genotype`/`seed`/`glitch` to `{}`/`0`/`null` while `lifeStage='foal'` (the reveal stays a moment; foal-white renders identically), and `GET /herds/:id/horses` requires a session (cross-herd reads stay open for visiting). (Ops) `buildApp` accepts `logger`; prod runs pino and the error handler logs every 500 before the JSON envelope; `index.ts` drains on SIGTERM/SIGINT; the container runs as `node`, not root, with node as PID 1. (CI) a migration-drift gate (`db:generate` must be a no-op) and a `postgres:16` service job running the full suite over `DATABASE_URL` — the node-postgres path is no longer theory. Suite: 462 checks, including HTTP smokes over every newer route surface and a prod-mode (`webDir`) SPA-serving block.

> **P2 sweep (June 2026, follows the audit wave).** (Perf) studbook stamps load in one `inArray`; autonomy preloads the relationship graph once per day (was a SELECT per pair per catch-up day); the Tavern listing carries `genotype`/`seed`/`glitch` so the client stops fetching every horse for its sprite; BattleArena refreshes `/me` only when a battle ends. (Schema) indexes on `trades.from/to`, `horses.parent_a/b`, `market_listings.horse_id` (migration 0020). (Abuse) `POST /messages` rate-limited 20/min; usernames fold to lowercase (one handle, any-case login) and a concurrent duplicate registration maps to 409 via the unique index; malformed uuid path params answer 400 in the global error handler (PG 22P02, one place for every route); every Cube faucet now writes the AuditLog (`daily`/`quest_reward`/`battle_reward`/`expedition_bank`/`gather`). (PG) `DATABASE_SSL=true` opts into TLS; pools drain on shutdown (`closeDbPools`). (Web) action failures wear `role="alert"` error styling everywhere (not the success note); selects/steppers labeled; modals are real dialogs (Escape + focus); battle-log colors on AA tokens (`--alert` joins the palette); Venture/Spar/Workshop load states; HerdPage relationships name the horses; Town/Garden/Studbook get the wide layout; the authed app is a **lazy chunk** — `/login` ships without the genetics engine (312KB → 170KB entry). (Tests) midnight-straddle pins, pool-structural adventure assertions, cookie-flag + Living-Herd twin-determinism checks; engines floor `>=22.18` (type-stripping reality). Suite: 466 checks.

> **Admin debug toolkit (dev only).** A play-test shortcut layer, **mounted only when `buildApp(db,{allowDebug})` is on** (`index.ts` sets it `!isProd`), and then **every route additionally requires role `admin`** — so a prod build returns `404` (routes unmounted) and a non-admin `403`, same spirit as the `POST /horses` mint lock. Never reachable by a normal player. Endpoints under `/api/debug/*`: `grant` (Cubes + any item by id), `mint` (a custom horse — chosen OCEAN/stats/genotype/lifeStage, reuses `mintHorse`), `advance-days` + `tick` + `mature/:id` (time control, reusing `advanceHerd`/the daily maturation — this **consolidates the old `/daily/simulate`**, now removed), `horse/:id` + `runs` (inspect the full hidden truth — luck, OCEAN, genotype, relationships, raw run state), and `reset` (wipe the herd → re-grant starters via `grantStarterHorses`). Every command is a shortcut to existing game logic, not new rules. Surfaced as an admin-only **Debug** panel in the client (`/debug`, nav link shown only for `role==='admin'`). The `tester` seed account is promoted to `admin` by the seed script so the toolkit works on launch.

> **Uploading to The Cloud (as built, §14.3a).** The first **permanent / destructive** action: a player sends a horse off into The Cloud (lore: it goes free on the internet to help other herds) for a one-time Cube **parting gift** — a deliberate sink that removes the horse for good. Reward (server-authoritative; the client never computes it) = `UPLOAD_BASE + UPLOAD_RARITY_BONUS·rarity + UPLOAD_TRAINING_BONUS·training`, with a foal paying `round(UPLOAD_BASE·UPLOAD_FOAL_FACTOR)` (coat unrevealed + untrained → minimal). **Rarity is derived from the engine's phenotype** — it surfaces rare flags (`isGray`/`isWhiteMasked`/`isLeopard`/`hasRoan`/`sabinoWhite`) + `patterns`/`modifiers`, **not a continuous probability**, so the score weights those real features (rewarding the breeding game). Training scales with leveled skills + stats trained above base. Constants live in `balance.ts` (`UPLOAD_*`). Endpoints (horse-scoped): `GET /api/horses/:id/upload-quote` (read-only preview: names the horse, the exact reward, and **warnings** — bonded herdmates, on-adventure) and `POST /api/horses/:id/upload` (the irreversible send-off). **Guards:** a horse on an **active adventure run is blocked**; **relationships are surfaced as a warning, not a block** (a cozy game lets you say goodbye to a bonded horse on purpose). **Deletion is FK-clean:** child `parentA`/`parentB` links are nulled first (no cascade on those), then the delete cascades ancestry / jobs / relationships / market listings — no dangling rows (the debug-Reset FK surface). UI: an understated entry on the horse detail page opens a confirmation modal (names the horse + reward + warnings) → a bittersweet send-off screen. Framing is a fond goodbye, not a sale — rewards sit well below recruitment fees on purpose.

---

## 12\. Working With Claude Code

- Keep this file in the repo root; reference it at the start of each session and have Claude Code work one phase at a time.  
- Maintain a short `CLAUDE.md` with build/test commands and conventions so sessions stay consistent.  
- Treat the `genetics` package as the contract: when its public interface changes, update Section 5 here in the same commit.  
- After each phase, run the phase's acceptance checks before moving on.

---

## 13\. Open Questions / Decisions Still Needed

All major design decisions are settled. Confirmed this round: ✅ Rollover \= **fixed UTC−5, no DST** · ✅ Recruited-out horses **notify the first-encountering herd** · ✅ All tuning values set as **v0 defaults in §14**.

Lore round (locked): ✅ Player \= the Herd's **unseen guiding spirit** · ✅ Premise \= world of unknown origin, **literally digital**, cozy herd \+ gentle adventure conflict · ✅ Tone \= **whimsical, quirky, blunt, subtle dark humor** · ✅ Currency \= **Cubes** (copper/silver/gold) · ✅ Recruitment venue \= **the Tavern**; hub \= **The Town**; home \= **the Pasture**; collection \= **Field Guide** · ✅ Regions \= **Green Grass / Dusty Dunes / Weird Woods** (+ The Tundra later) · ✅ World is a **nebulous sandbox** (summoned spaces, no fixed map) · ✅ **No sex/gender, it/its, breed only if disjoint ancestry** · ✅ **Foals render white; colors revealed at adulthood; no aging visuals** · ✅ **Genes (heritable) vs glitches (non-heritable render transforms: inverted shipping, Screen/Shade planned)** · ✅ Non-viable cross \= **"…but nothing happened."** · ✅ Default names \= random **fruit/veg**, cosmetic only, ID/URL identity.

Still blank (cosmetic, safe to defer — placeholders kept): structure names (Library/Forge/Kitchen/Forager's Hut/Track/Stage), job/skill names, accomplishment/title naming, cosmetic-category name, club names, daily-rollover branding, season names, gene-drop internal codenames, world/setting proper name, species term. Fill any of these anytime; none block the build.

Nothing here blocks starting Phase 0\. The §14 numbers are explicitly **playtest dials** — implement them as named constants in one `balance.ts` so they're trivial to tune. The only genuinely deferred *design* work is the post-beta content waves (large parties, job trees, multi-stage expeditions, civil-society offices), which extend existing systems rather than add new ones.

---

## 14\. Tuning & Balance Defaults (v0 — implement as `balance.ts`)

Starting values, chosen for sane spreads and easy iteration. All are constants in one module; none are load-bearing for architecture. Soft currency: **Cubes** — copper / silver / gold denominations (gold \> silver \> copper).

### 14.1 Scales & conventions

- **Stats** (Str/Dex/Con/Int/Wis/Cha): integer **1–20**. Ability modifier \= `floor((stat − 10) / 2)` (range −5…+5).  
- **Hidden Luck**: integer **1–20**, never displayed. Contributes `luckMod = round((luck − 10) / 8)` (≈ −1…+1) to checks and a small crit nudge.  
- **Personality** (OCEAN): integer **0–100** per trait, population mean ≈ 50\.  
- **Skill level**: **0–10** per skill at beta.  
- **Cubes (currency):** store balances as integer **copper-equivalent**; display split into denominations. v0 ratio: **1 silver \= 100 copper, 1 gold \= 100 silver** (`CUBE_SILVER = 100`, `CUBE_GOLD = 10000`).  
- **Glitch rarity** (non-heritable, §5.7): per new horse at birth/encounter, `GLITCH_CHANCE = 0.001` (≈1 in 1,000); if it fires, pick uniformly among *enabled* glitches (`GLITCH_KINDS` — all three: `inverted`/`screen`/`shade`, live since §7l). Independent of coat genetics; tune freely. Deliberate access via the Debug Shrine (§7l).  
- All randomness server-side through the seeded RNG (same discipline as the genetics engine).

### 14.2 Heritability (at birth; clamp to scale)

Personality is *mostly random with a small parental nudge*; stats are *mostly inherited*; both add spread so siblings differ.

// roll() \~ rounded normal; clamp to each scale

personalityTrait \= clamp( roll(mean=50, sd=18) \+ 0.20 \* (avg(parentTrait) − 50), 0, 100 )

stat             \= clamp( round(0.70 \* avg(parentStat) \+ 0.30 \* roll(mean=10.5, sd=3)), 1, 20 )

luck             \= clamp( round(0.50 \* avg(parentLuck) \+ 0.50 \* roll(mean=10.5, sd=4)), 1, 20 )

PERSONALITY\_INHERIT \= 0.20   // small nudge

STAT\_INHERIT        \= 0.70   // dominant parental weight

LUCK\_INHERIT        \= 0.50

PERSONALITY\_MUTATION \= { chancePerTrait: 0.02, shift: ±\[15..30\] }  // rare big swing

- **Wild-caught** horses: full random rolls (no parents).  
- **Training:** successful jobs/adventures grant skill XP; crossing skill thresholds can raise the governing stat by \+1 toward a soft cap (default cap **18** by training; 19–20 only by breeding/rare items). `STAT_TRAIN_SOFTCAP = 18`.  
- **Personality alteration:** only via rare events/items (`PERSONALITY_ALTER` items), small shifts.

### 14.3 Recruitment fee (Tavern)

Sub-scores normalized 0–1; **Luck excluded** (hidden, must not leak).

rarityScore \= { common:0, uncommon:0.25, rare:0.5, exotic:0.75, unnatural:1.0 }\[coatRarityTier\]

skillScore  \= clamp( sum(skillLevels) / 40, 0, 1 )

statScore   \= (sum(sixStats) − 6\) / (120 − 6\)

persScore   \= clamp( 0.5 \+ 0.3\*((A−50)/50) − 0.2\*((N−50)/50) \+ 0.1\*specialistBonus, 0, 1 )

score \= 0.45\*rarityScore \+ 0.25\*skillScore \+ 0.20\*statScore \+ 0.10\*persScore   // 0..1

fee   \= round5( BASE\_FEE \* (1 \+ FEE\_MULT \* score) )

BASE\_FEE \= 75    // Cubes (copper-equiv); a plain young horse

FEE\_MULT \= 15    // → fee spans \~75 (all-low) to \~1200 (maxed rare)

- `coatRarityTier` derived from genotype frequency / catalog rarity (White/Gray & unnatural drops top out).  
- `specialistBonus`: small reward for extreme trait values (min-maxers value specialists).

### 14.4 Party & wild-accept odds

PARTY\_MAX \= 4          // beta cap; solo allowed

// Only if an open slot exists; else horse routes straight to the Tavern.

acceptChance \= clamp(

    0.50

  \+ 0.25 \* ((avgPartyCHA − 10\) / 10\)     // charismatic parties persuade

  \+ 0.15 \* ((horse.A − 50\) / 50\)          // agreeable horses join

  \- 0.10 \* ((horse.N − 50\) / 50\)          // anxious horses hesitate

  \+ 0.05 \* ((horse.E − 50\) / 50),         // extraverts join

  0.10, 0.90 )

- Full party or failed roll → horse walks to the Tavern (its first-encountering herd is remembered for the recruit notification, §10).

### 14.5 Adventure difficulty & loot

DC(tier)      \= 7 \+ 3 \* tier            // T1=10, T2=13, T3=16, T4=19, T5=22

checkTotal    \= d20 \+ abilityMod \+ skillLevel \+ luckMod

success       \= checkTotal \>= DC

margin        \= checkTotal − DC

crit          \= nat20 || margin \>= 10

rareItemChance \= 0.02 \+ 0.025\*(tier−1) \+ 0.01\*clamp(margin,0,10) \+ (crit ? 0.15 : 0\)

// gene-drop crafting inputs only roll at tier \>= 3, and only on crit or margin \>= 5

encountersPerAdventure \= 3..5

- Beta opens **Tiers 1–3** (3 starter regions). Each region shows a *recommended* power level; underpowered parties may still attempt — they just succeed less and haul less. **No death, ever** — worst case is a meager haul \+ short fatigue cooldown.

### 14.6 Skills → governing stat → job → structure (beta set)

| Skill | Stat | Job | Structure |
| :---- | :---- | :---- | :---- |
| Reading | INT | Librarian | Library |
| Smithing | STR | Blacksmith | Forge |
| Baking | DEX | Baker | Kitchen |
| Foraging | WIS | Forager | Forager's Hut |
| Athletics | CON | Trainer | Track |
| Performance | CHA | Performer | Stage |

Six skills cover all six visible stats — every stat has a home, so any horse has a niche. Post-beta skills (Tinkering, Herbalism, Lore…) slot into the same table.

### 14.7 Regional bias (starter `freqOverride`)

Each map **merges over the engine's default `rollFrequencies`** (which already make White/Gray rare: `G≈0.05`, `W≈0.012`). **Deferred white-spotting & leopard loci (`T, Sb, O, SW1, Lp, PATN1/2`) are pinned to 0 on their dominant alleles everywhere until art ships.** White/Gray remain the globally rarest regardless of region.

Green Grass (Tier 1, starter): plainest. Bias toward solid bases, almost no dilution.

  A: { A:0.55, At:0.15, a:0.30 }, C:{ C:0.97, Cr:0.03 }, D:{ nd:0.97, D:0.03 }

Dusty Dunes (Tier 2): warm, arid — dun & gold dilutions surface more.

  D:{ D:0.30, nd:0.70 }, Ch:{ Ch:0.10, n:0.90 }, C:{ Cr:0.12, C:0.88 }

Weird Woods (Tier 3): strange edge of the digital frontier — modifiers (sooty, roan,

  pearl) slightly likelier; the place future \*unnatural\* drop-genes first appear (still rare).

  Sty:{ on:0.20 }, Rn:{ Rn:0.10, n:0.90 }, C:{ prl:0.06, ... }

### 14.8 Onboarding (cold-start grant)

Every new Herd is granted a viable starting position on signup, so a new player is never stuck with nothing to do (this is a standing rule — see §6 Herd):

- **`STARTER_HORSE_COUNT` = 2** founder adults, **unrelated** (parentless founders share no ancestor, so they can breed immediately, §5.4a). v0 roster: one **Bay**, one **Chestnut** — plain real-coat bases with no lethal (`W`/`O`) allele, so the cross is always viable and first foals vary. Seeds are pinned, so the grant is deterministic.
- **`STARTING_CUBES` = 150** (= 3 × `DAILY_CUBES`): a small starting purse — enough to engage the economy (a craft, a save toward a first recruit) without immediately affording a standout Tavern horse (fees from `BASE_FEE` = 75 up).

- Frequencies are illustrative; tune so commons dominate early regions and rarity climbs with tier. A future region ("The Tundra") can lean *relatively* gray while gray stays rare globally. Region-name convention so far: playful alliterative "Adjective Noun" for wilds (Green Grass, Dusty Dunes, Weird Woods), "The Noun" for fixed places (The Town, The Pasture, The Tundra).

