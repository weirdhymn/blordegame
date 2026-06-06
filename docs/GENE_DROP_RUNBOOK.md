# Gene-Drop Runbook

A **rehearsed**, repeatable procedure for shipping new genetic content to the live beta —
a new heritable **gene**, a non-heritable **glitch**, or a new **region** bias. Per
`BLORSE_PLAN.md` §5.6, a drop is **content, not code**: data + (optional) art + frequency,
with the engine and renderer untouched. This runbook is the checklist to do that safely.

> **Cadence (§5.6):** drops are infrequent and *unannounced*. New genes simply start
> appearing in the wild; players discover them. Do not pre-announce — gate frequency, ship
> dark, then turn the dial up.

---

## 0. Principles (why this is low-risk)

- **Backward compatibility is automatic.** The engine's `withDefaults`/`OFF` fills any
  omitted locus with the absent baseline, so **every stored horse stays valid the instant a
  new locus ships** — no genotype migration, no DB migration for a gene/glitch.
- **Phenotype is derived, never stored.** Only `(genotype, seed, glitch)` persists; the look
  is recomputed. A bad art/palette change can be reverted with zero data loss.
- **The test suites are the guardrail.** The vendored engine's ~340 differential/ratio tests
  catch a malformed locus; render-core + server suites catch integration breaks. **Green
  gauntlet is the gate.**

---

## 1. Know your change surface

| Drop type            | Touches                                                                                          | DB migration? |
| -------------------- | ----------------------------------------------------------------------------------------------- | ------------- |
| **Heritable gene**   | genetics **data** (locus: alleles, dominance, genotypes, naming, swatches/effects) + render-core `manifest`/`palette-map` *only if new art* + `@blorse/balance` roll frequency | **No** |
| **Glitch** (§5.7)    | `glitchKindEnum` value + a transform in render-core (§4.3b) + glitch-chance dial in `@blorse/balance` | **No** |
| **Region bias**      | the region's `freqOverride` table (exploration × genetics)                                       | No (data)     |

Prefer a **procedural gradient pass** (§4.3a) over new art whenever the effect allows — no
new PNGs to ship. Keep White/Gray the rarest.

> **Engine boundary (golden rule).** `packages/genetics/vendor/{genetics.js,data.js}` is
> sacred — never refactor its *logic*. A heritable gene is a **data entry** the engine
> iterates over; author it as a reviewed data change and re-run the full ~340-test engine
> suite. A **glitch never touches the engine** — it's render-core + balance only.

---

## 2. Pre-flight (on a branch, against staging)

1. `git switch -c gene-drop/<name>` — one drop per PR (data + assets + frequency).
2. **Gate it dark:** set the wild roll frequency to **0** in `@blorse/balance` for now (the
   gene/glitch exists and renders, but cannot yet appear in the wild).
3. Author the change per the table above. Tag the gene with an **introduced-version + rarity**
   (for analytics and the Field Guide's after-the-fact "undiscovered slot" reveal).
4. **Run the full gauntlet — this is the gate:**
   ```bash
   pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
   ```
   All four green, including the vendored engine's differential/ratio tests. A malformed
   locus fails here, not in production.
5. **Visual parity check:** in the render dev page, generate the new genotype, confirm the
   look, and confirm an *old* genotype renders **pixel-identically** to before the drop
   (same `(genotype, seed)` ⇒ same pixels — the drop must not perturb existing horses).

## 3. Deploy

6. Snapshot the data volume (see `DEPLOY.md` → Backups). This is the rollback point.
7. Build & roll the image:
   ```bash
   docker compose up -d --build      # migrations re-apply idempotently on boot
   ```
8. **Smoke test against the running instance** (a gene/glitch drop needs **no** migration, so
   boot should be instant):
   - `GET /health` → `{status:"ok"}`.
   - Register a throwaway herd; mint/breed a horse carrying the new allele; fetch it and
     confirm it resolves with the new phenotype and renders.
   - Confirm an existing horse still resolves and renders unchanged.
   - `GET /mod/stats` (as an admin) for a sanity read on world counts.

## 4. Enable

9. **Turn the dial up:** raise the wild frequency from 0 to its target rarity in
   `@blorse/balance`, re-run the gauntlet, redeploy. The gene now appears in the wild — let
   players find it.
10. Watch `auditLog` / `GET /mod/stats` for the first sightings and any error-rate change.

---

## 5. Rollback

Because phenotype is derived and a gene/glitch needs no migration, rollback is clean:

- **Frequency-only regret** (it's appearing too much / too soon): set frequency back to 0 in
  balance and redeploy. Already-minted horses remain valid and keep their look.
- **Bad art/palette/transform:** revert the render-core change and redeploy — stored data is
  untouched; the look recomputes correctly on next render.
- **Malformed locus that somehow shipped:** revert the data change and redeploy; existing
  horses fall back to the absent baseline via `withDefaults`/`OFF`. Restore the volume
  snapshot only if a horse was *minted* depending on the bad locus and you need its exact
  prior state.

---

## 6. Definition of done

- [ ] One PR: data + (optional) assets + frequency, engine/renderer core untouched.
- [ ] Full gauntlet green (incl. the ~340 engine tests).
- [ ] New genotype renders; an existing genotype renders pixel-identically.
- [ ] Shipped gated (freq 0), smoke-tested live, then enabled to target rarity.
- [ ] Gene tagged with introduced-version + rarity; Field Guide slot reserved.
- [ ] Volume snapshot taken before deploy.
