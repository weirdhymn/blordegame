# blorsegame — Lore & Naming Audit

A worksheet of every customizable name, place, and piece of fiction in the plan. Each slot shows the **current placeholder** (almost all are mine, not decisions) and a blank for **your choice**. Fill in what you want; leave blanks where you're happy with the placeholder or want to defer. Once filled, these become the canonical strings wired into `BLORSE_PLAN.md` and the code.

Legend: ⭐ = high-leverage (code/UI references it early — worth deciding first) · 🧩 = deeper fiction, not just a name · 💤 = safe to defer (post-beta or cosmetic).

---

## 1. Core identity ⭐

| Slot | Current placeholder | Your choice |
|---|---|---|
| Game name | "blorsegame" (working); `BLORSE` = codebase shorthand | `____` |
| The world / setting name (the digital realm they live in) | **unnamed** — only called "the digital world / digital frontier" | `____` |
| What the creatures are called in-world (species term) | **unnamed** — generically "pixel horses" / "horses" | `____` |
| Player-unit term (the account/group of horses) | "Herd" | options: Herd, Band, Mob, Harras, String, Stable, Remuda → `____` |
| What the player *is* in the fiction (role/POV) 🧩 | **undefined** — guide? rancher? unseen hand? a horse themselves? | `____` |

---

## 2. The fiction / premise 🧩
Not naming — these are the worldbuilding choices that give the names meaning. All currently **open**.

- **Origin / premise:** why do digital horses exist? Who or what made this world? Is there a myth? → `____`
- **The "digital" nature:** is it literal (a simulation/server they live in), metaphorical, or just aesthetic flavor? → `____`
- **Tension vs. pure cozy:** any gentle conflict/mystery, or strictly slice-of-life? (No fail states either way.) → `____`
- **Voice/tone of flavor text:** the game is image-first, but the little text that exists (journal beats, item flavor, quest cards) has a voice — whimsical? dry? storybook? → `____`
- **Why horses can read/work/organize:** is this explained, or just a cheerful given? → `____`

---

## 3. Currency & economy ⭐

| Slot | Current placeholder | Your choice |
|---|---|---|
| Soft currency name | "bits" (working) | `____` |
| Premium currency | none (by design) | keep none? `____` |
| Marketplace name | "Marketplace" (generic) | `____` |
| Town recruitment pool name | "town recruitment pool" (generic) | `____` |

---

## 4. Geography & places ⭐

| Slot | Current placeholder | Your choice |
|---|---|---|
| The hub/town (where shops, NPCs, recruitment live) | **unnamed** — "town" / "hub" | `____` |
| Overall world map / realm geography 🧩 | **undefined** | `____` |
| The herd's home base | "home grounds" (generic) | `____` |
| Region 1 (Tier 1, starter) | "Verdant Commons" | `____` |
| Region 2 (Tier 2, arid/dun) | "Sundust Flats" | `____` |
| Region 3 (Tier 3, strange edge) | "Hollow Wilds" | `____` |
| Future region (example only) 💤 | "Frostmere" | `____` |
| Naming convention for future regions 💤 | none set | `____` |

---

## 5. Structures (home-grounds buildings) ⭐
Functional placeholders — rename for flavor. Each pairs with a job + skill (§6).

| Function | Placeholder | Your choice |
|---|---|---|
| Reading building | "Library" | `____` |
| Smithing building | "Forge" | `____` |
| Baking building | "Kitchen" | `____` |
| Foraging building | "Forager's Hut" | `____` |
| Athletics building | "Track" | `____` |
| Performance building | "Stage" | `____` |
| Clubs/roles building 💤 | "Meeting Hall" | `____` |
| (later) crafting/tinkering 💤 | "Workshop" | `____` |
| (later) games/exercise 💤 | "Playground" | `____` |

---

## 6. Jobs & skills ⭐
Paired placeholders (skill ↔ job ↔ governing stat). Rename either or both.

| Skill | Job title | Stat | Your skill name | Your job name |
|---|---|---|---|---|
| Reading | Librarian | INT | `____` | `____` |
| Smithing | Blacksmith | STR | `____` | `____` |
| Baking | Baker | DEX | `____` | `____` |
| Foraging | Forager | WIS | `____` | `____` |
| Athletics | Trainer | CON | `____` | `____` |
| Performance | Performer | CHA | `____` | `____` |

Post-beta skills to name later 💤: Tinkering, Herbalism, Lore… → `____`

---

## 7. Social systems (named features)

| Slot | Current placeholder | Your choice |
|---|---|---|
| The autonomous-events feed ("what your herd did") ⭐ | "the journal" / `JournalEvent` | `____` |
| The collection/registry of discovered coats ⭐ | "menagerie" / "registry" / `DiscoveryLog` | `____` |
| Clubs (emergent groups) — examples | "reading circle", "game club" | `____` |
| Civil-society roles 💤 | "librarian", "organizer", "guild lead" | `____` |
| Relationship types | friend / rival / bonded / mentor | reflavor? `____` |

---

## 8. Genetics, coats & gene drops

The engine already names *realistic* coats (e.g., "Sooty Mealy Bay — Roan") from a 71-entry catalog — those are fine as-is unless you want to reskin terminology. The open creative space is the **live-service whimsy**:

- **Unnatural coat themes** (the digital-world payoff) ⭐ — my examples were galaxy / neon / glitch / metallic. What fantastical coats exist, and what are they called? → `____`
- **How "unnatural" reads in-fiction** 🧩 — rare glitches in the simulation? blessed/legendary? seasonal magic? → `____`
- **Gene-drop set names (internal/teasable)** 💤 — drops are unannounced, but you may still want internal codenames. → `____`
- **Non-viable embryo framing** 🧩 — the engine flags `WW`/`OO` as non-viable, but the game has *no death*. How do we present a non-viable breeding result gently/coziy (e.g., "didn't take," a soft retry) without a grim beat? → `____`

---

## 9. Lifecycle & creatures

| Slot | Current placeholder | Your choice |
|---|---|---|
| Life-stage names ⭐ | only "foal" → "adult" defined | add yearling / elder / others? `____` |
| Sex framing (non-genetic attribute) | "sex" (mechanical) | flavor/term? `____` |
| Aging visual (graying over life) | mechanical only | any lore? `____` |
| Default auto-generated horse names 💤 | none — example names were "Pixel", "Dapple" | provide a name pool / generator style? `____` |
| Horse-name rules (length, profanity filter, uniqueness) ⭐ | undefined | `____` |

---

## 10. Items, cosmetics & accomplishments 💤

| Slot | Current placeholder | Your choice |
|---|---|---|
| Resource/material names | generic ("materials", "tools") | `____` |
| Activity items | "books", "games" | `____` |
| Accomplishment/title/badge names | generic ("Accomplishments") | `____` |
| Cosmetic category name | "cosmetics" | `____` |

---

## 11. Time & seasons 💤

| Slot | Current placeholder | Your choice |
|---|---|---|
| Daily rollover branding (the "new day" moment) | none — just "rollover" | `____` |
| Season names (post-beta) | none | `____` |

---

## Suggested order to decide
1. **§1 core identity** — game name, world name, species term, player-unit term. Everything downstream leans on these.
2. **§3 currency** + **§4 region/town names** + **§5–6 structures/jobs/skills** — the strings UI and code reference first (Phases 2–8).
3. **§2 + §8 fiction** — the premise and the unnatural-coat fantasy; shapes tone and content, less urgent for code.
4. **§9–11** — lifecycle/item/season polish; mostly deferrable.

Fill in what you like and hand it back — I'll propagate the choices into `BLORSE_PLAN.md` and flag anything that creates a knock-on naming need.
