# assets/layers

Grayscale layer PNGs + `manifest.json` + `palette-map.ts` land here in **Phase 2**
(see `BLORSE_PLAN.md` §4). Empty during Phase 0.

The runtime set is **9 uniform 150×126 layers** (`coat`, `mane-tail`, `legs-bay`,
`legs-dun`, `legs-seal`, `hooves`, `face`, `muzzle`, `line-art`). The prototype art
currently lives as base64 in `../../js/horse-art-data.js` and as plain PNGs in the
sibling `equine-color-genetics/assets/horse/`. Phase 2 brings them here as plain
PNGs served over http(s) — **drop the base64 workaround** (§4.1).
