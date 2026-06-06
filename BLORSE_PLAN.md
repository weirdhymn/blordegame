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
- **Data model.** An `AdventureScript = { id, regionId, start, scenes }`; each `Scene = { id, stage, text, choices[] }`; each `Choice = { id, text, requires?, check?, success, failure? }`. `requires` = personality gate; `check = { stat, skill?, dc, harmony? }` (a `harmony` check gets the party's avg pairwise-compatibility as a DC reduction, **buff-only**, cap `ADVENTURE_HARMONY_MAX`); `Outcome = { text, items?, cubes?, fatigue?, wild?, next }` where `next` is a scene id or `'end'`. Authoring more regions/scenes = pure data.
- **Run flow.** `POST /api/adventure/start {regionId, party}` → `{ runId, scene, run }`; `POST /api/adventure/:runId/choose {choiceId}` → next scene or a banked end summary. The best party member rolls each check; loot/cubes **accrue and bank only on `end`** (the *push-deeper vs. bank-and-retreat* tension). A `wild` outcome mints a stranger **straight into the herd** — recruitment as narrative (no Tavern fee). `GET /api/regions` now carries an `interactive` flag.
- **Cozy worst case.** A failed check → a soft `failure` (less/no loot here, a tired party, sometimes an early retreat); you keep whatever you'd banked. The only loss is *un-banked* haul if you abandon mid-run.
- **Run persistence.** Run state lives in the `adventure_runs` table (regionId, scriptId, sceneId, step, seed + the accrued, not-yet-banked haul), so an in-flight run survives a restart / redeploy / multiple instances; resolution stays pure + seeded. Ended runs are kept as history. Fatigue is still flavor-only (no hard cooldown yet).
- **Script pools.** Each region holds a **pool** of scripts (`ADVENTURE_POOLS`); a run draws one uniformly at random, **seeded** (a `PICK_SALT` distinct from the dice salts), and stores the chosen `scriptId` on the run so it stays put across a redeploy even if the pool changes. `interactive = pool.length > 0`; `ADVENTURE_BY_ID` resolves a run's script. Green Grass ships **two**: *The Sunny Hollow* (befriend a stranger) and *The Marsh-Sage Brew* (the herb hunt — distinct stat checks, a Conscientiousness gate, a harmony-buffed brew, and **feed-forward**: the sage quality won in the fen sets the final brew's difficulty). Its reward, the **Healing Potion**, is a deliberate terminal item (future-combat provisioning, §7); **marsh-sage** has a real source (Green Grass loot) and sink (the *Brew Healing Potion* recipe).

### 9.4 Dice & determinism

All rolls run **server-side through the seeded RNG** (reuse the same injectable-rand discipline the genetics engine uses), so outcomes are authoritative, reproducible, and uncheatable. Surface rolls visually (animated dice, clear DC vs. result) — it's a great *show-don't-tell* moment and a satisfying juicy beat.

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
- **Glitch rarity** (non-heritable, §5.7): per new horse at birth/encounter, `GLITCH_CHANCE = 0.001` (≈1 in 1,000); if it fires, pick uniformly among *enabled* glitches (beta: just `inverted`). Independent of coat genetics; tune freely.  
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

