/* ==========================================================================
   game.js — the "Field Stable" breeding game: state + persistence.
   window.HorseGame. A plain state object behind a localStorage wrapper that
   falls back to in-memory when storage is unavailable (private mode, some
   file:// setups, the node test harness). DOM-free so the logic is testable.
   Loaded after data.js + genetics.js, before ui.js.
   ========================================================================== */
(function () {
  'use strict';
  var ROOT = (typeof window !== 'undefined') ? window : global;
  var GG = ROOT.HorseGenetics;
  var KEY = 'equine-field-stable';
  var SAVE_V = 2;
  var TEST_COST = 8, NEW_DEX_GRANT = 3, START_GRANTS = 12, N_REQUESTS = 3;
  // research-grant reward for an Institute request, by the target's rarity group
  var REWARD = { base: 10, dilution: 14, shading: 16, roaning: 20, white: 24, gray: 24, leopard: 30 };

  // storage: real localStorage if usable, else an in-memory shim (tests / file://)
  var STORE = (function () {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        localStorage.setItem('__fs_t', '1'); localStorage.removeItem('__fs_t');
        return localStorage;
      }
    } catch (e) { /* blocked → memory */ }
    var mem = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; }
    };
  })();

  var NAMES = ['Bramble', 'Cinder', 'Juniper', 'Sorrel', 'Hazel', 'Pippin', 'Thistle', 'Willow', 'Comet', 'Dusk',
    'Ember', 'Fennel', 'Garnet', 'Heather', 'Ivy', 'Juno', 'Larkspur', 'Maple', 'Nettle', 'Onyx', 'Poppy', 'Quill',
    'Rowan', 'Saffron', 'Tansy', 'Umber', 'Vesper', 'Wren', 'Yarrow', 'Aspen', 'Birch', 'Clover', 'Dune', 'Flint',
    'Ginger', 'Hollow', 'Indigo', 'Jasper', 'Kestrel', 'Lichen', 'Moss', 'Briar', 'Cobble', 'Drift', 'Acorn', 'Teasel'];

  var state = null, _catalog = null;

  function geno(over) { return Object.assign(GG.offGenotype(), over); }
  function specimen(over) {
    return Object.assign({ id: null, name: '', sex: 'mare', genotype: GG.offGenotype(), gen: 1, born: 1, sireId: null, damId: null, origin: 'bred', documented: false, tested: false, known: {} }, over || {});
  }
  function uid(s) { s.nextId = (s.nextId || 0) + 1; return 'h' + s.nextId; }

  function colorSlug(spec) { return GG.slugify(GG.resolve(spec.genotype).displayName); }
  // a phenotype documents SEVERAL catalogue entries: its full name, its base/
  // dilution colour, and each overlay — so "Buckskin — Tobiano" credits both the
  // Buckskin and the Tobiano plates (the catalogue keys patterns by overlay slug).
  function colorSlugs(spec) {
    var name = GG.resolve(spec.genotype).displayName, out = {};
    out[GG.slugify(name)] = true;
    var parts = name.split(' — ');
    out[GG.slugify(parts[0])] = true;
    if (parts[1]) { parts[1].split(/,\s*/).forEach(function (ov) { out[GG.slugify(ov)] = true; }); }
    return Object.keys(out);
  }
  function isNew(spec) { var cat = catalogSet(), dex = st().dex; return colorSlugs(spec).some(function (slug) { return cat[slug] && !dex[slug]; }); }
  function docSpec(s, spec) {
    spec.documented = true; var fresh = false, cat = catalogSet();
    colorSlugs(spec).forEach(function (slug) { if (!s.dex[slug] && cat[slug]) { fresh = true; } s.dex[slug] = true; });
    return fresh;
  }

  // A founding pair: a Buckskin stallion × a Palomino mare — both cream carriers,
  // both heterozygous at E & A, so the very first cross already segregates a rich
  // spread (bay/chestnut/black bases × cream doses, up to a blue-eyed cremello).
  function starter() {
    var s = { v: SAVE_V, stable: [], dex: {}, grants: START_GRANTS, season: 1, nextId: 0, nextReq: 0, requests: [], log: [] };
    var stal = specimen({ id: uid(s), name: 'Bracken', sex: 'stallion', genotype: geno({ E: 'Ee', A: 'Aa', C: 'CCr' }), origin: 'starter' });
    var mare = specimen({ id: uid(s), name: 'Marigold', sex: 'mare', genotype: geno({ E: 'ee', A: 'Aa', C: 'CCr' }), origin: 'starter' });
    s.stable.push(stal, mare); docSpec(s, stal); docSpec(s, mare);
    refillRequests(s);
    s.log.unshift({ t: 'start', text: 'Founded the field stable with ' + mare.name + ' and ' + stal.name + '.' });
    return s;
  }

  /* ---- Institute requests + research grants (the economy) ---------------- */
  function requestReward(entry) { var best = 10; (entry.groups || []).forEach(function (g) { if (REWARD[g] > best) { best = REWARD[g]; } }); return best; }
  function genRequest(s) {
    var cat = GG.enumerateColors(), active = {}; s.requests.forEach(function (r) { active[r.slug] = true; });
    var pool = cat.filter(function (e) { return !s.dex[e.slug] && !active[e.slug]; });
    if (!pool.length) { pool = cat.filter(function (e) { return !active[e.slug]; }); }
    if (!pool.length) { pool = cat; }
    var e = pool[Math.floor(Math.random() * pool.length)];
    s.nextReq = (s.nextReq || 0) + 1;
    return { id: 'rq' + s.nextReq, slug: e.slug, name: e.name, swatch: e.swatch, reward: requestReward(e) };
  }
  function refillRequests(s) { while (s.requests.length < N_REQUESTS) { s.requests.push(genRequest(s)); } }
  function findMatch(req) { var a = st().stable, i; for (i = 0; i < a.length; i++) { if (colorSlugs(a[i]).indexOf(req.slug) >= 0) { return a[i]; } } return null; }
  function canFulfill(req) { return !!findMatch(req); }
  function fulfillRequest(reqId, specId) {
    var s = st(), req = null, i;
    for (i = 0; i < s.requests.length; i++) { if (s.requests[i].id === reqId) { req = s.requests[i]; } }
    if (!req) { return { ok: false, reason: 'No such request.' }; }
    var spec = specId ? byId(specId) : findMatch(req);
    if (!spec || colorSlugs(spec).indexOf(req.slug) < 0) { return { ok: false, reason: 'No matching specimen yet.' }; }
    s.grants += req.reward;
    s.requests = s.requests.filter(function (r) { return r.id !== reqId; });
    refillRequests(s);
    s.log.unshift({ t: 'grant', text: 'Fulfilled the Institute request for a ' + req.name + ' (+' + req.reward + ' grants).' });
    save();
    return { ok: true, reward: req.reward, name: req.name };
  }

  function persist(s) { try { STORE.setItem(KEY, JSON.stringify(s)); } catch (e) { /* quota / blocked */ } }
  function load() {
    var raw = STORE.getItem(KEY);
    if (raw) { try { var p = JSON.parse(raw); if (p && p.v === SAVE_V && Array.isArray(p.stable)) { return p; } } catch (e) { /* corrupt → fresh */ } }
    var s = starter(); persist(s); return s;
  }
  function st() { if (!state) { state = load(); } return state; }
  function save() { persist(st()); }

  function resolveOf(spec) { return GG.resolve(spec.genotype); }
  function byId(id) { var a = st().stable, i; for (i = 0; i < a.length; i++) { if (a[i].id === id) { return a[i]; } } return null; }

  function uniqueName(s, base) {
    var taken = {}; s.stable.forEach(function (h) { taken[h.name] = true; });
    if (!taken[base]) { return base; }
    var suff = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'], i;
    for (i = 0; i < suff.length; i++) { if (!taken[base + ' ' + suff[i]]) { return base + ' ' + suff[i]; } }
    return base + ' ' + (s.nextId + 1);
  }
  function pickName(s, rnd) { return uniqueName(s, NAMES[Math.floor((rnd || Math.random)() * NAMES.length)]); }

  function canBreed(sireId, damId) {
    var sire = byId(sireId), dam = byId(damId);
    if (!sire || !dam) { return { ok: false, reason: 'Choose a dam (♀) and a sire (♂) from your stable.' }; }
    if (sire.id === dam.id) { return { ok: false, reason: 'A horse cannot breed with itself.' }; }
    if (sire.sex !== 'stallion') { return { ok: false, reason: sire.name + ' is not a stallion.' }; }
    if (dam.sex !== 'mare') { return { ok: false, reason: dam.name + ' is not a mare.' }; }
    return { ok: true };
  }

  // breed(sireId, damId, rand?) — draw a foal via GG.breedFoal; a viable foal is
  // named, sexed, documented and added to the stable; a non-viable draw is logged
  // as a loss. Advances the season either way. Returns a result for the UI.
  function breed(sireId, damId, rnd) {
    var chk = canBreed(sireId, damId); if (!chk.ok) { return { ok: false, reason: chk.reason }; }
    rnd = rnd || Math.random;
    var s = st(), sire = byId(sireId), dam = byId(damId);
    var draw = GG.breedFoal(sire.genotype, dam.genotype, rnd);
    s.season++;
    ageStable(s);   // a season passes: graying horses advance a stage (documenting it)
    if (!draw.viable) {
      s.log.unshift({ t: 'loss', text: 'A foal from ' + dam.name + ' × ' + sire.name + ' was not viable (' + draw.lethalReason + ').' });
      save();
      return { ok: true, viable: false, lethalReason: draw.lethalReason, sire: sire, dam: dam };
    }
    var foal = specimen({
      id: uid(s), name: pickName(s, rnd), sex: rnd() < 0.5 ? 'mare' : 'stallion',
      genotype: draw.genotype, gen: Math.max(sire.gen, dam.gen) + 1, born: s.season, sireId: sire.id, damId: dam.id, origin: 'bred'
    });
    s.stable.push(foal);
    var fresh = docSpec(s, foal);
    if (fresh) { s.grants += NEW_DEX_GRANT; }
    var revealed = revealFromFoal(foal.genotype, [sire, dam]);   // a recessive foal outs its carrier parents
    s.log.unshift({ t: 'birth', text: foal.name + ' (' + draw.resolved.displayName + ') born to ' + dam.name + ' × ' + sire.name + '.' });
    if (revealed.length) { s.log.unshift({ t: 'reveal', text: 'This foal revealed: ' + revealed.join('; ') + '.' }); }
    save();
    return { ok: true, viable: true, foal: foal, resolved: draw.resolved, newDex: fresh, revealed: revealed, sire: sire, dam: dam };
  }

  function rename(id, name) { var h = byId(id); if (h) { h.name = String(name || '').slice(0, 24) || h.name; save(); } }
  function release(id) { var s = st(); s.stable = s.stable.filter(function (h) { return h.id !== id; }); save(); }
  function isDocumented(slug) { return !!st().dex[slug]; }

  /* ---- hidden carriers (the genetic-detective layer) ---------------------- */
  // A horse's recessive carriers are hidden until a genetic test reveals them, or
  // until a foal EXPRESSES the recessive (which outs both parents). carriers() is
  // the engine's carriedAlleles; `tested` reveals all; `known[locus]` reveals one.
  function carriers(spec) { return GG.carriedAlleles(spec.genotype); }
  function fullyKnown(spec) { return !!spec.tested || carriers(spec).every(function (c) { return spec.known && spec.known[c.locus]; }); }
  function testHorse(id) {
    var h = byId(id), s = st();
    if (!h || h.tested) { return { ok: false, reason: 'Already known.' }; }
    if (s.grants < TEST_COST) { return { ok: false, reason: 'Not enough research grants — a genetic test costs ' + TEST_COST + '.' }; }
    s.grants -= TEST_COST; h.tested = true;
    s.log.unshift({ t: 'test', text: 'Genetic test on ' + h.name + ' (−' + TEST_COST + ' grants) revealed its full make-up.' });
    save(); return { ok: true };
  }

  // Observable recessives that "out" both parents when a foal shows them.
  var REVEALS = [
    { key: 'E', label: 'Extension', when: function (g) { return g.E === 'ee'; } },                 // chestnut foal → red carriers
    { key: 'A', label: 'Agouti', when: function (g) { return g.A === 'aa' && g.E !== 'ee'; } },     // black foal → black-agouti carriers
    { key: 'F', label: 'Flaxen', when: function (g) { return g.E === 'ee' && g.F === 'ff'; } }       // flaxen chestnut foal → flaxen carriers
  ];
  function revealFromFoal(foalGeno, parents) {
    var out = [];
    REVEALS.forEach(function (rv) {
      if (!rv.when(foalGeno)) { return; }
      parents.forEach(function (p) {
        if (p.tested || p.known[rv.label]) { return; }
        if (GG.carriedAlleles(p.genotype).some(function (c) { return c.locus === rv.label; })) { p.known[rv.label] = true; out.push(p.name + ' carries ' + rv.label.toLowerCase()); }
      });
    });
    return out;
  }

  // survey(regionId?, rand?) — encounter a wild horse, rarity-weighted via
  // GG.randomGenotype with the region's frequency bias. A paid expedition deducts
  // its cost up front. Returns { ok, region, encounter:{spec,resolved} } or a reason.
  function survey(regionId, rnd) {
    rnd = rnd || Math.random;
    var s = st(), region = regionById(regionId || 'home');
    if (region.cost > 0 && s.grants < region.cost) { return { ok: false, reason: 'An expedition to ' + region.name + ' costs ' + region.cost + ' grants.' }; }
    if (region.cost > 0) { s.grants -= region.cost; s.log.unshift({ t: 'expedition', text: 'Set out on an expedition to ' + region.name + ' (−' + region.cost + ' grants).' }); save(); }
    var g = GG.randomGenotype(region.freq), r = GG.resolve(g), guard = 0;
    while (r.flags.isLethal && guard++ < 25) { g = GG.randomGenotype(region.freq); r = GG.resolve(g); }
    return { ok: true, region: region, encounter: { spec: specimen({ id: 'wild', name: NAMES[Math.floor(rnd() * NAMES.length)], sex: rnd() < 0.5 ? 'mare' : 'stallion', genotype: g, gen: 1, origin: 'survey' }), resolved: r } };
  }
  function documentWild(spec) {
    var s = st(), fresh = false, cat = catalogSet();
    colorSlugs(spec).forEach(function (slug) { if (!s.dex[slug] && cat[slug]) { fresh = true; } s.dex[slug] = true; });
    if (fresh) { s.grants += NEW_DEX_GRANT; s.log.unshift({ t: 'survey', text: 'Documented a wild ' + GG.resolve(spec.genotype).displayName + ' on a survey (+' + NEW_DEX_GRANT + ' grants).' }); }
    save(); return fresh;
  }
  function capture(spec) {
    var s = st(); spec.id = uid(s); spec.name = uniqueName(s, spec.name); spec.born = s.season;
    var fresh = docSpec(s, spec); if (fresh) { s.grants += NEW_DEX_GRANT; } s.stable.push(spec);
    s.log.unshift({ t: 'capture', text: 'Captured ' + spec.name + ' (' + GG.resolve(spec.genotype).displayName + ') on a survey.' }); save();
    return { spec: spec, newDex: fresh };
  }

  function catalogSet() { if (!_catalog) { _catalog = {}; GG.enumerateColors().forEach(function (e) { _catalog[e.slug] = true; }); } return _catalog; }
  function dexProgress() {
    var cat = catalogSet(), total = Object.keys(cat).length, n = 0, dex = st().dex, slug;
    for (slug in dex) { if (dex[slug] && cat[slug]) { n++; } }
    return { documented: n, total: total, pct: total ? n / total : 0 };
  }

  function reset() { state = starter(); persist(state); return state; }

  /* ---- Phase 4: lineage (kinship / inbreeding) + regions / expeditions ---- */
  function parentOf(spec, which) { return spec ? byId(which === 'sire' ? spec.sireId : spec.damId) : null; }
  // Wright's kinship coefficient via the recursive shared-ancestor algorithm
  // (founders unrelated). The inbreeding coefficient of a sire×dam foal = f(sire,dam):
  // full sibs / parent-offspring → 0.25, half sibs → 0.125, unrelated → 0.
  function kinship(a, b, memo) {
    if (!a || !b) { return 0; }
    var key = (a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id);
    if (memo[key] != null) { return memo[key]; }
    var res;
    if (a.id === b.id) { res = 0.5 * (1 + kinship(parentOf(a, 'sire'), parentOf(a, 'dam'), memo)); }
    else {
      var x = a, y = b; if ((a.gen || 1) < (b.gen || 1)) { x = b; y = a; }   // expand the younger
      var xs = parentOf(x, 'sire'), xd = parentOf(x, 'dam');
      res = (!xs && !xd) ? 0 : 0.5 * (kinship(xs, y, memo) + kinship(xd, y, memo));
    }
    memo[key] = res; return res;
  }
  function inbreeding(sireId, damId) { var a = byId(sireId), b = byId(damId); return (a && b) ? kinship(a, b, {}) : 0; }
  function ancestry(id, depth) {
    var h = byId(id); if (!h || depth < 0) { return null; }
    return { spec: h, sire: depth > 0 ? ancestry(h.sireId, depth - 1) : null, dam: depth > 0 ? ancestry(h.damId, depth - 1) : null };
  }

  var REGIONS = [
    { id: 'home', name: 'Home Range', blurb: 'Familiar countryside — every colour at its natural rarity.', cost: 0, freq: null },
    { id: 'cream', name: 'Cream Coast', blurb: 'Pale dunes where cream dilutions run high.', cost: 6, freq: { C: { C: 0.35, Cr: 0.55, prl: 0.10 } } },
    { id: 'dun', name: 'Dun Steppe', blurb: 'Plains thick with primitive dun markings.', cost: 6, freq: { D: { D: 0.6, d: 0.4 } } },
    { id: 'champagne', name: 'Champagne Downs', blurb: 'Hills where the champagne gene gilds the herds.', cost: 8, freq: { Ch: { Ch: 0.5, n: 0.5 } } },
    { id: 'silver', name: 'Silvered Woods', blurb: 'Shadowed forest full of silver dapple.', cost: 8, freq: { Z: { Z: 0.5, n: 0.5 }, E: { E: 0.75, e: 0.25 } } },
    { id: 'spotted', name: 'Spotted Highlands', blurb: 'Uplands famed for the leopard complex.', cost: 10, freq: { Lp: { Lp: 0.55, lp: 0.45 }, PATN1: { PATN1: 0.55, patn1: 0.45 } } },
    { id: 'grey', name: 'Misted Moor', blurb: 'Fog-greyed moorland where many horses go grey.', cost: 8, freq: { G: { G: 0.5, g: 0.5 } } }
  ];
  function regionById(id) { for (var i = 0; i < REGIONS.length; i++) { if (REGIONS[i].id === id) { return REGIONS[i]; } } return REGIONS[0]; }

  /* ---- Phase 5: gray progression over seasons ----------------------------- */
  var GRAY_AGE = ['rose-gray', 'steel-gray', 'dapple-gray', 'light-gray', 'fleabitten-gray'];   // by age 1..5+
  function isGraying(spec) { var g = spec.genotype; return !!(g && g.G && g.G !== 'gg'); }
  function grayStageSlug(spec, season) {
    if (spec.id === 'wild' || !isGraying(spec)) { return null; }
    var age = (season || st().season) - (spec.born || 1);
    return age < 1 ? null : GRAY_AGE[Math.min(age - 1, GRAY_AGE.length - 1)];
  }
  // display name/swatch for a specimen, accounting for how far a grey has aged
  function displayOf(spec) {
    var slug = grayStageSlug(spec);
    if (slug) { var e = GG.colorBySlug(slug); if (e) { return { name: e.name, swatch: e.swatch, graySlug: slug }; } }
    var r = GG.resolve(spec.genotype);
    if (spec.id !== 'wild' && isGraying(spec)) { return { name: 'Greying — born ' + (r.underlyingName || r.displayName), swatch: r.underlyingSwatch || r.swatch, graySlug: null }; }
    return { name: r.displayName, swatch: r.swatch, graySlug: null };
  }
  function ageStable(s) {
    s.stable.forEach(function (h) {
      var slug = grayStageSlug(h, s.season);
      if (slug && !s.dex[slug] && catalogSet()[slug]) {
        s.dex[slug] = true; s.grants += NEW_DEX_GRANT;
        var e = GG.colorBySlug(slug); s.log.unshift({ t: 'aging', text: h.name + ' greyed into ' + ((e && e.name) || slug) + ' (+' + NEW_DEX_GRANT + ' grants).' });
      }
    });
  }

  /* ---- save / share codes (export / import) ------------------------------- */
  function enc64(s) { return (typeof btoa !== 'undefined') ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64'); }
  function dec64(s) { return (typeof atob !== 'undefined') ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, 'base64').toString('utf8'); }
  function exportCode() { try { return enc64(JSON.stringify(st())); } catch (e) { return ''; } }
  function importCode(code) {
    try {
      var p = JSON.parse(dec64(String(code).trim()));
      if (p && p.v === SAVE_V && Array.isArray(p.stable)) { state = p; persist(state); return { ok: true }; }
      return { ok: false, reason: 'That code is from a different game version, or invalid.' };
    } catch (e) { return { ok: false, reason: 'That is not a valid field-journal code.' }; }
  }

  ROOT.HorseGame = {
    state: st, reload: function () { state = null; return st(); }, save: save, reset: reset,
    byId: byId, resolveOf: resolveOf, colorSlug: colorSlug, canBreed: canBreed, breed: breed,
    rename: rename, release: release, isDocumented: isDocumented, dexProgress: dexProgress, isNew: isNew,
    survey: survey, documentWild: documentWild, capture: capture,
    carriers: carriers, fullyKnown: fullyKnown, testHorse: testHorse,
    findMatch: findMatch, canFulfill: canFulfill, fulfillRequest: fulfillRequest, refillRequests: refillRequests,
    testCost: TEST_COST, newDexGrant: NEW_DEX_GRANT,
    inbreeding: inbreeding, ancestry: ancestry, regions: REGIONS, regionById: regionById,
    isGraying: isGraying, grayStageSlug: grayStageSlug, displayOf: displayOf,
    exportCode: exportCode, importCode: importCode,
    KEY: KEY, NAMES: NAMES
  };
})();
