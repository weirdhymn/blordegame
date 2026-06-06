/* ==========================================================================
   genetics.js  —  Equine Coat Color Genetics Reference Tool
   PURE, DOM-FREE logic layer. Reads window.HORSE_DATA, exposes
   window.HorseGenetics = { resolve, analyze, reverseLookup, punnett,
                            enumerateColors, randomGenotype, ... }.

   No DOM, no globals beyond the namespace — safe to unit-test under Node
   (see test/run-tests.js). The UI (ui.js) is the ONLY consumer that touches
   the document; all colour logic lives here and is data-driven from data.js.

   Pipeline (see resolve): viability -> base (E/A) -> body dilutions ->
   shading flags -> roaning -> white-spotting -> leopard complex ->
   gray overlay -> dominant white overlay. The underlying coat is always
   computed first so a "masked" (gray / dominant white) horse can still
   report what it would otherwise be.
   ========================================================================== */
(function (root) {
  'use strict';

  var DATA = root.HORSE_DATA;
  if (!DATA) { throw new Error('genetics.js: window.HORSE_DATA not found — load data.js first.'); }

  /* ----------------------------------------------------------------------
     Locus indexing & allele bookkeeping (all derived from data.js)
     ---------------------------------------------------------------------- */
  var LOCI = DATA.loci;
  var LOCUS_BY_KEY = {};
  var TOKENS = {};        // key -> [token,...] sorted by length desc (greedy parse)
  var TOKEN_SET = {};     // key -> { token: true }
  var TOKEN_LABEL = {};   // key -> { token: prettyLabel }
  var DOM_TOKEN = {};     // key -> dominant allele token
  var PAIR_TO_GENO = {};  // key -> { 'a|b': canonicalGenotypeString }

  LOCI.forEach(function (l) {
    LOCUS_BY_KEY[l.key] = l;
    var toks = l.alleles.map(function (a) { return a.token; });
    TOKENS[l.key] = toks.slice().sort(function (a, b) { return b.length - a.length; });
    TOKEN_SET[l.key] = {};
    TOKEN_LABEL[l.key] = {};
    l.alleles.forEach(function (a) {
      TOKEN_SET[l.key][a.token] = true;
      TOKEN_LABEL[l.key][a.token] = a.label;
      if (a.dominant) { DOM_TOKEN[l.key] = a.token; }
    });
    // dominant token fallback: first allele
    if (!DOM_TOKEN[l.key]) { DOM_TOKEN[l.key] = l.alleles[0].token; }
  });

  // memoised greedy parse of a two-allele genotype string into [t1, t2]
  var PARSE_CACHE = {};
  function parsePair(key, str) {
    var ck = key + ':' + str;
    if (PARSE_CACHE[ck]) { return PARSE_CACHE[ck]; }
    var toks = TOKENS[key];
    for (var i = 0; i < toks.length; i++) {
      var a = toks[i];
      if (str.indexOf(a) === 0) {
        var rest = str.slice(a.length);
        if (TOKEN_SET[key][rest]) {
          var pair = [a, rest];
          PARSE_CACHE[ck] = pair;
          return pair;
        }
      }
    }
    throw new Error('genetics.js: cannot parse genotype "' + str + '" at locus ' + key);
  }

  // build PAIR_TO_GENO from the canonical genotype strings (+ lethal ones, so
  // breeding can name an OO / WW offspring before flagging it non-viable)
  LOCI.forEach(function (l) {
    PAIR_TO_GENO[l.key] = {};
    var all = l.genotypes.concat(l.lethalGenotypes || []);
    all.forEach(function (g) {
      var p = parsePair(l.key, g);
      PAIR_TO_GENO[l.key][sortedKey(p[0], p[1])] = g;
    });
  });

  function sortedKey(a, b) { return (a < b) ? (a + '|' + b) : (b + '|' + a); }

  // canonical genotype string for an arbitrary allele pair (used by breeding)
  function comboGeno(key, a, b) {
    var g = PAIR_TO_GENO[key][sortedKey(a, b)];
    if (g) { return g; }
    // fallback: concatenate dominant-first by allele order
    var order = TOKENS_ORDER(key);
    return (order[a] <= order[b]) ? (a + b) : (b + a);
  }
  var _orderCache = {};
  function TOKENS_ORDER(key) {
    if (_orderCache[key]) { return _orderCache[key]; }
    var o = {};
    LOCUS_BY_KEY[key].alleles.forEach(function (a, i) { o[a.token] = i; });
    _orderCache[key] = o;
    return o;
  }

  /* ----------------------------------------------------------------------
     small genotype helpers
     ---------------------------------------------------------------------- */
  var OFF = {
    E: 'ee', A: 'aa', C: 'CC', Ch: 'nn', D: 'dd', Z: 'nn',
    F: 'FF', Pg: 'nn', Sty: 'nn', Rn: 'rnrn', Rb: 'nn',
    T: 'nn', Sb: 'nn', O: 'nn', SW1: 'nn', W: 'ww', G: 'gg',
    Lp: 'lplp', PATN1: 'patn1patn1', PATN2: 'patn2patn2'
  };

  function clone(g) {
    var o = {};
    for (var k in g) { if (g.hasOwnProperty(k)) { o[k] = g[k]; } }
    return o;
  }
  function withDefaults(g) {
    var o = clone(OFF);
    if (g) { for (var k in g) { if (g.hasOwnProperty(k) && g[k]) { o[k] = g[k]; } } }
    return o;
  }
  function count(G, key, token) {
    var p = parsePair(key, G[key]);
    return (p[0] === token ? 1 : 0) + (p[1] === token ? 1 : 0);
  }
  function has(G, key, token) { return count(G, key, token) > 0; }
  function hasDom(G, key) { return has(G, key, DOM_TOKEN[key]); }

  /* ----------------------------------------------------------------------
     pretty-printing of allele tokens / genotypes (unicode, no HTML)
     ---------------------------------------------------------------------- */
  function prettyGenotype(key, str) {
    var p = parsePair(key, str);
    return labelOf(key, p[0]) + labelOf(key, p[1]);
  }
  function labelOf(key, token) { return (TOKEN_LABEL[key] && TOKEN_LABEL[key][token]) || token; }

  function writtenGenotype(genotype) {
    var G = withDefaults(genotype);
    return DATA.displayOrder.map(function (key) { return prettyGenotype(key, G[key]); }).join(' ');
  }

  // cleaned genotype — only the loci that matter: E and A always (they set the
  // base), plus any locus that differs from its recessive/absent default. Omitted
  // loci are assumed default, so this round-trips through parseGenotype. e.g.
  // chestnut -> "ee aa", solid bay -> "Ee Aa", red dun -> "ee aa Dd".
  function cleanGenotype(genotype) {
    var G = withDefaults(genotype);
    var out = [prettyGenotype('E', G.E), prettyGenotype('A', G.A)];
    DATA.displayOrder.forEach(function (key) {
      if (key === 'E' || key === 'A') { return; }
      if (G[key] !== OFF[key]) { out.push(prettyGenotype(key, G[key])); }
    });
    return out.join(' ');
  }

  function slugify(name) {
    return String(name).toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /* ----------------------------------------------------------------------
     cream / pearl state from the C locus
     ---------------------------------------------------------------------- */
  function creamState(G) {
    var cr = count(G, 'C', 'Cr');
    var prl = count(G, 'C', 'prl');
    if (cr === 2) { return 'double_cream'; }
    if (cr === 1 && prl === 1) { return 'cream_pearl'; }
    if (cr === 1) { return 'single_cream'; }
    if (prl === 2) { return 'pearl'; }
    if (prl === 1) { return 'pearl_carrier'; }
    return 'none';
  }
  var CREAM_TAG = {
    single_cream: 'Cream', double_cream: 'Double Cream',
    pearl: 'Pearl', cream_pearl: 'Cream-Pearl'
  };

  /* ----------------------------------------------------------------------
     compose a head colour name from the active dilution "axes"
     One axis -> recognised table name. Many -> head (by priority) + tags.
     Priority chosen so e.g. bay+champagne+cream -> "Amber Champagne + Cream".
     ---------------------------------------------------------------------- */
  var HEAD_PRIORITY = { champ: 0, cream: 1, silver: 2, dun: 3 };
  function composeHead(axes, baseName) {
    if (axes.length === 0) { return baseName; }
    var sorted = axes.slice().sort(function (a, b) { return HEAD_PRIORITY[a.id] - HEAD_PRIORITY[b.id]; });
    var name = sorted[0].full;
    var rest = sorted.slice(1);
    if (rest.length) { name += ' + ' + rest.map(function (a) { return a.tag; }).join(' + '); }
    return name;
  }
  function headSwatch(axes, baseSwatch) {
    if (axes.length === 0) { return baseSwatch; }
    var sorted = axes.slice().sort(function (a, b) { return HEAD_PRIORITY[a.id] - HEAD_PRIORITY[b.id]; });
    return sorted[0].swatch || baseSwatch;
  }

  /* ======================================================================
     resolve(genotype) -> full phenotype
     ====================================================================== */
  function resolve(genotype) {
    var G = withDefaults(genotype);
    var layers = [];
    var patterns = [];
    var modifiers = [];   // visual flags (shading) — {name,label,kind,uncertain}
    var notes = [];
    var flags = {
      isLethal: false, lethalReason: null,
      isGray: false, isGraying: false,
      isWhiteMasked: false, isLeopard: false,
      hasRoan: false, sabinoWhite: false
    };
    var traits = {
      eyes: DATA.meta.defaults.eyes,
      skin: DATA.meta.defaults.skin,
      hooves: DATA.meta.defaults.hooves,
      sclera: 'matches iris (not white)',
      maneTail: 'matches body',
      points: null,
      primitiveMarkings: null
    };

    /* 1. VIABILITY ----------------------------------------------------- */
    if (count(G, 'W', 'W') === 2) {
      return lethal('Dominant White homozygous (WW) — embryonic lethal; WW foals are not viable.', G);
    }
    if (count(G, 'O', 'O') === 2) {
      return lethal(DATA.overlays.frame.lethal.reason + ' (homozygous frame, OO).', G);
    }

    /* 2. BASE (Extension + Agouti) ------------------------------------- */
    var baseKey;
    if (!has(G, 'E', 'E')) { baseKey = 'chestnut'; }
    else if (has(G, 'A', 'A')) { baseKey = 'bay'; }
    else if (has(G, 'A', 'At')) { baseKey = 'seal_brown'; }
    else { baseKey = 'black'; }
    var baseInfo = DATA.baseColors[baseKey];

    var head = baseInfo.name;
    var swatch = baseInfo.swatch;
    var tags = [];
    var current = baseInfo.name;
    layers.push({ gene: 'Extension + Agouti', from: null, to: current, kind: 'base' });

    traits.maneTail = baseInfo.maneTail || 'matches body';
    if (baseInfo.points) { traits.points = baseInfo.points; }

    function relabel() { current = head + (tags.length ? ' — ' + tags.join(', ') : ''); return current; }

    /* 3. BODY DILUTIONS ------------------------------------------------ */
    var cs = creamState(G);
    var champ = hasDom(G, 'Ch');
    var dun = hasDom(G, 'D');
    var silverVisible = hasDom(G, 'Z') && baseKey !== 'chestnut';
    var silverCarrier = hasDom(G, 'Z') && baseKey === 'chestnut';

    var axes = [];
    if (cs !== 'none' && cs !== 'pearl_carrier') {
      var cp = DATA.dilutionNames.creamPearl[baseKey][cs];
      axes.push({ id: 'cream', gene: 'Cream / Pearl', full: cp.name, tag: CREAM_TAG[cs], swatch: cp.swatch, entry: cp });
    } else if (cs === 'pearl_carrier') {
      notes.push('Carries one pearl allele (hidden — needs a second pearl or a cream to show).');
    }
    if (champ) {
      var ch = DATA.dilutionNames.champagne[baseKey];
      axes.push({ id: 'champ', gene: 'Champagne', full: ch.name, tag: 'Champagne', swatch: ch.swatch, entry: ch });
    }
    if (dun) {
      var dn = DATA.dilutionNames.dun[baseKey];
      axes.push({ id: 'dun', gene: 'Dun', full: dn.name, tag: 'Dun', swatch: dn.swatch, entry: dn });
    }
    if (silverVisible) {
      var sv = DATA.dilutionNames.silver[baseKey];
      axes.push({ id: 'silver', gene: 'Silver', full: sv.name, tag: 'Silver', swatch: sv.swatch, entry: sv });
    } else if (silverCarrier) {
      notes.push('Carries silver, but silver only acts on black pigment — no visible effect on a red (chestnut) base.');
    }

    // apply dilution layers incrementally (cumulative composed name per step)
    var applied = [];
    axes.forEach(function (ax) {
      applied.push(ax);
      head = composeHead(applied, baseInfo.name);
      relabel();
      layers.push({ gene: ax.gene, from: layers[layers.length - 1].to, to: current, kind: 'dilution' });
    });
    if (axes.length) { swatch = headSwatch(axes, baseInfo.swatch); }

    // recognized stacked-dilution name (Dunalino, Dunskin, Silver Grullo, Gold
    // Cream Champagne, …) — replaces the descriptive composed name when the
    // exact set of dilution axes has a conventional portmanteau.
    if (axes.length >= 2 && DATA.recognizedStacks) {
      var sig = axes.map(function (ax) { return ax.id === 'cream' ? 'cream:' + cs : ax.id; }).sort().join('+');
      var stack = DATA.recognizedStacks[baseKey + '|' + sig];
      if (stack) {
        head = stack.name; swatch = stack.swatch; relabel();
        if (layers.length) { layers[layers.length - 1].to = current; }
      }
    }

    // dilution trait effects (field-by-field, later axes win for shared fields)
    applied.forEach(function (ax) {
      var e = ax.entry;
      if (e.maneTail) { traits.maneTail = e.maneTail; }
      if (e.points) { traits.points = e.points; }
      if (e.hooves) { traits.hooves = e.hooves; }
      if (e.primitiveMarkings) { traits.primitiveMarkings = e.primitiveMarkings; }
      if (e.note) { notes.push(e.note); }
    });
    // eyes / skin precedence: double-dilute (blue) > champagne (hazel) > single cream/none
    if (cs === 'double_cream' || cs === 'pearl' || cs === 'cream_pearl') {
      var cpe = DATA.dilutionNames.creamPearl[baseKey][cs];
      traits.eyes = cpe.eyes || 'blue';
      traits.skin = cpe.skin || 'pink';
    } else if (champ) {
      var che = DATA.dilutionNames.champagne[baseKey];
      traits.eyes = che.eyes || 'hazel/amber';
      traits.skin = che.skin || 'freckled pink';
      if (che.hooves) { traits.hooves = che.hooves; }
    } else if (cs === 'single_cream') {
      var sce = DATA.dilutionNames.creamPearl[baseKey][cs];
      if (sce.eyes) { traits.eyes = sce.eyes; }
      if (sce.skin) { traits.skin = sce.skin; }
    }
    if (silverVisible) { notes.push('Silver is linked to eye defects (MCOA) in some lines.'); }

    /* 4. SHADING FLAGS (name prefixes; §8.2 swatch on a plain base — base
       classification unchanged) */
    var preHead = head;
    var shSw = DATA.shadingSwatches || { flaxen: {}, mealy: {}, sooty: {} };
    var plainBase = !champ && !dun && !silverVisible;   // no body dilution renaming
    // pangaré (mealy) — not on solid black
    if (hasDom(G, 'Pg') && ['chestnut', 'bay', 'seal_brown'].indexOf(baseKey) >= 0) {
      head = 'Mealy ' + head;
      modifiers.push({ name: 'Pangaré (mealy)', label: 'mealy', kind: 'shading' });
      notes.push('Mealy: lightened muzzle, belly and inner legs.');
      if (plainBase && cs === 'none' && shSw.mealy[baseKey]) { swatch = shSw.mealy[baseKey]; }
    }
    // flaxen — chestnut only, recessive ff
    if (count(G, 'F', 'f') === 2 && baseKey === 'chestnut') {
      head = 'Flaxen ' + head;
      modifiers.push({ name: 'Flaxen', label: 'flaxen mane/tail', kind: 'shading' });
      traits.maneTail = 'flaxen / white';
      if (plainBase && cs === 'none' && shSw.flaxen.chestnut) { swatch = shSw.flaxen.chestnut; }
    } else if (count(G, 'F', 'f') === 2) {
      notes.push('Carries flaxen, but flaxen only shows on a chestnut base.');
    }
    // sooty — chestnut / bay (incl. their single-cream palomino / buckskin); a
    // name prefix like mealy/flaxen so it reads "Sooty Bay" (§4.3).
    var sooty = hasDom(G, 'Sty') && ['chestnut', 'bay'].indexOf(baseKey) >= 0;
    if (sooty) {
      head = 'Sooty ' + head;
      modifiers.push({ name: 'Sooty', label: 'sooty', kind: 'shading', uncertain: true });
      notes.push('Sooty: scattered dark hairs along the topline. Mechanism uncertain.');
      var sootyKey = baseKey + (cs === 'single_cream' ? '+cream' : '');
      if (plainBase && (cs === 'none' || cs === 'single_cream') && shSw.sooty[sootyKey]) { swatch = shSw.sooty[sootyKey]; }
    } else if (hasDom(G, 'Sty')) {
      notes.push('Carries sooty, but it has little visible effect on a black / seal-brown base.');
    }
    if (head !== preHead) {
      relabel();
      layers.push({ gene: 'Shading', from: preHead + (tags.length ? ' — ' + tags.join(', ') : ''), to: current, kind: 'shading' });
    }

    /* 5. ROANING OVERLAYS --------------------------------------------- */
    if (hasDom(G, 'Rn')) {
      flags.hasRoan = true;
      var roanName = DATA.overlays.roan.nameByBase[baseKey];
      patterns.push({ name: roanName, kind: 'roaning', desc: DATA.overlays.roan.effect, glyph: 'roan' });
      var before = current;
      if (axes.length === 0 && head === baseInfo.name) {
        head = roanName; // e.g. plain black -> "Blue Roan"
      } else {
        tags.push('Roan');
      }
      relabel();
      layers.push({ gene: 'Roan', from: before, to: current, kind: 'overlay' });
      traits.skin = traits.skin + '; roaning is white hairs over dark skin';
    }
    if (hasDom(G, 'Rb')) {
      patterns.push({ name: 'Rabicano', kind: 'roaning', desc: DATA.overlays.rabicano.effect, glyph: 'rabicano' });
      var b2 = current; tags.push('Rabicano'); relabel();
      layers.push({ gene: 'Rabicano', from: b2, to: current, kind: 'overlay' });
    }

    /* 6. WHITE-SPOTTING / KIT ----------------------------------------- */
    if (hasDom(G, 'T')) {
      var homT = count(G, 'T', 'T') === 2;
      patterns.push({
        name: 'Tobiano', kind: 'white', glyph: 'tobiano',
        desc: DATA.overlays.tobiano.effect + (homT ? ' Homozygous: ' + DATA.overlays.tobiano.homozygousNote + '.' : '')
      });
      var bT = current; tags.push(homT ? 'Tobiano (ink spots)' : 'Tobiano'); relabel();
      layers.push({ gene: 'Tobiano', from: bT, to: current, kind: 'overlay' });
      traits.skin = 'dark, with pink skin under the white patches';
    }
    var sabinoWhite = false;
    if (hasDom(G, 'Sb')) {
      if (count(G, 'Sb', 'Sb') === 2) {
        sabinoWhite = true;
        patterns.push({ name: DATA.overlays.sabino.homozygous.name, kind: 'white', glyph: 'white', desc: DATA.overlays.sabino.homozygous.effect });
      } else {
        patterns.push({ name: 'Sabino', kind: 'white', glyph: 'sabino', desc: DATA.overlays.sabino.effect });
        var bS = current; tags.push('Sabino'); relabel();
        layers.push({ gene: 'Sabino', from: bS, to: current, kind: 'overlay' });
        traits.skin = 'dark, pink under ragged white markings';
      }
    }
    if (hasDom(G, 'O')) { // nO only — OO already returned as lethal
      patterns.push({ name: 'Overo', kind: 'white', glyph: 'frame', desc: DATA.overlays.frame.effect });
      var bO = current; tags.push('Overo'); relabel();
      layers.push({ gene: 'Overo', from: bO, to: current, kind: 'overlay' });
      traits.skin = 'dark, pink under white';
      traits.eyes = 'blue where the face is white';
      notes.push('Carries one frame allele. Two copies (OO) cause lethal white foal syndrome.');
    }
    if (hasDom(G, 'SW1')) {
      var homSW = count(G, 'SW1', 'SW1') === 2;
      patterns.push({
        name: 'Splashed White', kind: 'white', glyph: 'splash',
        desc: homSW ? 'Bold "dipped-in-paint" splashed white with blue eyes.' : 'Crisp white socks / blaze; can be minimal or near-absent.'
      });
      var bSW = current; tags.push(homSW ? 'Splashed White' : 'Splash (minimal)'); relabel();
      layers.push({ gene: 'Splashed White', from: bSW, to: current, kind: 'overlay' });
      traits.skin = 'dark, pink under white';
      if (homSW) { traits.eyes = 'blue'; }
    }

    /* 7. LEOPARD COMPLEX ---------------------------------------------- */
    var lpCopies = count(G, 'Lp', 'Lp');
    if (lpCopies > 0) {
      flags.isLeopard = true;
      var patn1 = count(G, 'PATN1', 'PATN1');
      var patn2 = hasDom(G, 'PATN2');
      var entry;
      if (patn1 > 0) { entry = DATA.leopard.patn1[lpCopies + ',' + patn1]; }
      else if (patn2) { entry = DATA.leopard.patn2[String(lpCopies)]; }
      else { entry = DATA.leopard.bare[String(lpCopies)]; }

      var before = current;
      var leoName = entry.name;
      // plain chestnut head is dropped ("Varnish Roan", "Leopard"); other
      // bases keep their colour as a prefix ("Black Spotted Blanket"...).
      head = (head === 'Chestnut') ? leoName : (head + ' ' + leoName);
      relabel();
      patterns.push({ name: leoName, kind: 'leopard', glyph: 'appaloosa', desc: entry.note });
      layers.push({ gene: 'Leopard Complex', from: before, to: current, kind: 'overlay' });
      swatch = entry.swatch || swatch;
      traits.skin = DATA.leopard.sharedTraits.skin;
      traits.hooves = DATA.leopard.sharedTraits.hooves;
      traits.sclera = DATA.leopard.sharedTraits.sclera;
      if (baseKey === 'black' || baseKey === 'seal_brown') { notes.push(DATA.leopard.bronzeNote); }
    }

    /* underlying coat (before gray / dominant-white masking) ---------- */
    var underlyingName = current;
    var underlyingSwatch = swatch;
    var displayName = underlyingName;

    /* sabino white (near-white coat — overrides the colour name) ------ */
    if (sabinoWhite) {
      flags.sabinoWhite = true;
      displayName = DATA.overlays.sabino.homozygous.name;
      swatch = '#efe9e0';
      traits.eyes = DATA.overlays.sabino.homozygous.eyes || 'brown';
      traits.skin = 'pink';
      traits.maneTail = 'white';
      traits.points = null;
      layers.push({ gene: 'Sabino (homozygous)', from: underlyingName, to: displayName, kind: 'overlay' });
    }

    /* 8. GRAY (progressive epistatic overlay) ------------------------- */
    if (hasDom(G, 'G')) {
      flags.isGray = true;
      flags.isGraying = true;
      patterns.push({ name: 'Gray', kind: 'gray', glyph: 'gray', desc: DATA.overlays.gray.effect });
      layers.push({ gene: 'Gray', from: displayName, to: 'Gray (progressive)', kind: 'epistatic' });
      displayName = 'Gray';
      swatch = DATA.overlays.gray.swatch;
      // gray keeps dark skin & eyes unless a dilution already lightened them.
    }

    /* 9. DOMINANT WHITE (epistatic — masks everything) ---------------- */
    if (hasDom(G, 'W')) {
      flags.isWhiteMasked = true;
      patterns.push({ name: 'Dominant White', kind: 'white', glyph: 'white', desc: DATA.overlays.dominant_white.effect });
      layers.push({ gene: 'Dominant White', from: displayName, to: 'Dominant White', kind: 'epistatic' });
      displayName = 'Dominant White';
      swatch = DATA.overlays.dominant_white.swatch;
      traits.skin = DATA.overlays.dominant_white.skin;
      traits.hooves = DATA.overlays.dominant_white.hooves;
      traits.eyes = DATA.overlays.dominant_white.eyes;
      traits.maneTail = 'white';
      traits.points = null;
      traits.primitiveMarkings = null;
    }

    return {
      genotype: G,
      displayName: displayName,
      underlyingName: underlyingName,
      baseKey: baseKey,
      baseName: baseInfo.name,
      swatch: swatch,
      underlyingSwatch: underlyingSwatch,
      layers: layers,
      patterns: patterns,
      modifiers: modifiers,
      notes: dedupe(notes),
      traits: traits,
      flags: flags,
      written: writtenGenotype(G)
    };

    function lethal(reason, g) {
      return {
        genotype: g, displayName: 'Non-viable', underlyingName: 'Non-viable',
        baseKey: null, baseName: null, swatch: '#d7d2cb', underlyingSwatch: '#d7d2cb',
        layers: [], patterns: [], modifiers: [], notes: [reason], traits: traits,
        flags: { isLethal: true, lethalReason: reason, isGray: false, isGraying: false, isWhiteMasked: false, isLeopard: false, hasRoan: false, sabinoWhite: false },
        written: writtenGenotype(g)
      };
    }
  }

  function dedupe(arr) {
    var seen = {}, out = [];
    arr.forEach(function (x) { if (!seen[x]) { seen[x] = true; out.push(x); } });
    return out;
  }

  /* ======================================================================
     analyze(witness) — per-locus constraints + count for the colour the
     witness produces. Works because, in this model, every modifier depends
     only on its own locus and the (pinned) base, so the set of genotypes
     sharing an appearance factorises into a per-locus Cartesian product.
     ====================================================================== */
  function analyze(witnessGenotype) {
    var W = withDefaults(witnessGenotype);
    var target = resolve(W);
    if (target.flags.isLethal) {
      return { lethal: true, reason: target.flags.lethalReason };
    }
    var targetName = target.displayName;
    var constraints = [];
    var total = 1;

    DATA.displayOrder.forEach(function (key) {
      var locus = LOCUS_BY_KEY[key];
      var compatible = [];
      locus.genotypes.forEach(function (g) {
        var trial = clone(W);
        trial[key] = g;
        var r = resolve(trial);
        if (!r.flags.isLethal && r.displayName === targetName) { compatible.push(g); }
      });
      if (compatible.length === 0) { compatible = [W[key]]; } // safety
      constraints.push({
        key: key, name: locus.name, group: locus.group,
        genos: compatible, label: compactLabel(key, compatible),
        free: compatible.length === locus.genotypes.length
      });
      total *= compatible.length;
    });

    return {
      color: targetName, swatch: target.swatch, underlying: target.underlyingName,
      constraints: constraints, count: total, witness: W,
      masked: target.flags.isGray || target.flags.isWhiteMasked
    };
  }

  function compactLabel(key, genos) {
    var locus = LOCUS_BY_KEY[key];
    if (genos.length === locus.genotypes.length) { return 'any'; }
    if (genos.length === 1) { return prettyGenotype(key, genos[0]); }
    // does the set equal "every genotype carrying the dominant allele"?
    var dom = DOM_TOKEN[key];
    var domGenos = locus.genotypes.filter(function (g) {
      var p = parsePair(key, g); return p[0] === dom || p[1] === dom;
    });
    if (sameSet(genos, domGenos)) { return labelOf(key, dom) + '-'; }
    return genos.map(function (g) { return prettyGenotype(key, g); }).join(' / ');
  }
  function sameSet(a, b) {
    if (a.length !== b.length) { return false; }
    var s = {}; a.forEach(function (x) { s[x] = true; });
    return b.every(function (x) { return s[x]; });
  }

  /* full list of genotypes that share an appearance (capped) ----------- */
  function reverseLookup(witnessGenotype, opts) {
    opts = opts || {};
    var cap = opts.cap || 300;
    var info = analyze(witnessGenotype);
    if (info.lethal) { return info; }
    // Cartesian product of the per-locus compatible sets, capped.
    var combos = [{}];
    var truncated = false;
    for (var i = 0; i < info.constraints.length && !truncated; i++) {
      var c = info.constraints[i];
      var next = [];
      for (var j = 0; j < combos.length; j++) {
        for (var k = 0; k < c.genos.length; k++) {
          var ng = clone(combos[j]); ng[c.key] = c.genos[k];
          next.push(ng);
          if (next.length >= cap) { truncated = true; break; }
        }
        if (truncated) { break; }
      }
      combos = next;
    }
    info.sample = combos;
    info.truncated = truncated || info.count > combos.length;
    return info;
  }

  /* ======================================================================
     punnett(parentA, parentB) — offspring colour distribution
     ====================================================================== */
  function crossLocus(ga, gb, key) {
    var pa = parsePair(key, ga), pb = parsePair(key, gb);
    var dist = {};
    for (var i = 0; i < 2; i++) {
      for (var j = 0; j < 2; j++) {
        var g = comboGeno(key, pa[i], pb[j]);
        dist[g] = (dist[g] || 0) + 0.25;
      }
    }
    return dist;
  }

  // breedFoal(sire, dam, rand?) — draw ONE offspring. For each locus it samples a
  // genotype from crossLocus's Mendelian distribution (so foals match the Punnett
  // odds in aggregate), assembles the full genotype, resolves it, and reports
  // viability. A non-viable draw (homozygous lethal WW / OO, or an OLWS frame foal)
  // comes back viable:false + lethalReason so a game can stage a "lost foal".
  // `rand` is an optional () => [0,1) for deterministic tests (default Math.random).
  function breedFoal(sire, dam, rand) {
    var rnd = rand || Math.random, A = clone(OFF), B = clone(OFF), k;
    for (k in sire) { if (sire.hasOwnProperty(k) && sire[k]) { A[k] = sire[k]; } }
    for (k in dam) { if (dam.hasOwnProperty(k) && dam[k]) { B[k] = dam[k]; } }
    var foal = clone(OFF);
    DATA.displayOrder.forEach(function (key) {
      var dist = crossLocus(A[key], B[key], key), toks = Object.keys(dist);
      var roll = rnd(), acc = 0, chosen = toks[toks.length - 1];
      for (var i = 0; i < toks.length; i++) { acc += dist[toks[i]]; if (roll < acc) { chosen = toks[i]; break; } }
      foal[key] = chosen;
    });
    var r = resolve(foal);
    return {
      genotype: foal,
      resolved: r,
      viable: !r.flags.isLethal,
      lethalReason: r.flags.isLethal ? (r.flags.lethalReason || 'non-viable') : null
    };
  }

  var CARRIER_LABEL = {
    redfactor: 'carry red factor (e), hidden under black pigment',
    pearl: 'carry a pearl allele unseen',
    cream: 'carry cream that barely shows on a dark base (smoky black / brown)',
    frame: 'carry frame overo — an OLWS risk if bred to another carrier',
    flaxen: 'carry flaxen, hidden off a chestnut base'
  };

  // Shared aggregation: a list of weighted child genotypes [{geno, p}] (Σp ≈ 1)
  // -> color distribution + per-colour genotype breakdown + carrier summary +
  // lethal accounting. Used by BOTH the exact-product path and the Monte-Carlo
  // backstop so they always agree on shape and semantics.
  function aggregateOffspring(weighted) {
    var live = {}, lethalFraction = 0, lethalReasons = {}, carrier = {};
    function bump(id, p) { carrier[id] = (carrier[id] || 0) + p; }

    weighted.forEach(function (c) {
      var r = resolve(c.geno);
      if (r.flags.isLethal) {
        lethalFraction += c.p;
        lethalReasons[r.flags.lethalReason] = (lethalReasons[r.flags.lethalReason] || 0) + c.p;
        return;
      }
      var o = live[r.displayName] || (live[r.displayName] = { name: r.displayName, swatch: r.swatch, baseKey: r.baseKey, p: 0, genos: {} });
      o.p += c.p;
      var gstr = formatGenotype(c.geno);
      o.genos[gstr] = (o.genos[gstr] || 0) + c.p;

      var G = c.geno;
      if (r.baseKey && r.baseKey !== 'chestnut' && count(G, 'E', 'e') >= 1) { bump('redfactor', c.p); }
      if (count(G, 'C', 'prl') >= 1 && r.displayName.indexOf('Pearl') < 0) { bump('pearl', c.p); }
      if (count(G, 'C', 'Cr') >= 1 && (r.baseKey === 'black' || r.baseKey === 'seal_brown') && creamState(G) === 'single_cream') { bump('cream', c.p); }
      if (hasDom(G, 'O')) { bump('frame', c.p); }
      if (count(G, 'F', 'f') >= 1 && r.baseKey !== 'chestnut') { bump('flaxen', c.p); }
    });

    var liveTotal = 1 - lethalFraction;
    var distribution = Object.keys(live).map(function (n) {
      var o = live[n];
      var genotypes = Object.keys(o.genos).map(function (s) {
        return { geno: s, p: o.genos[s], pLive: liveTotal > 0 ? o.genos[s] / liveTotal : 0 };
      }).sort(function (a, b) { return b.p - a.p; });
      return { name: o.name, swatch: o.swatch, baseKey: o.baseKey, p: o.p, pLive: liveTotal > 0 ? o.p / liveTotal : 0, genotypes: genotypes };
    }).sort(function (a, b) { return b.p - a.p || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });

    var carriers = Object.keys(carrier).map(function (id) {
      return { id: id, label: CARRIER_LABEL[id] || id, p: carrier[id], pLive: liveTotal > 0 ? carrier[id] / liveTotal : 0 };
    }).filter(function (x) { return x.p > 1e-9; }).sort(function (a, b) { return b.pLive - a.pLive; });

    return { distribution: distribution, carriers: carriers, lethalFraction: lethalFraction, lethalReasons: lethalReasons, liveTotal: liveTotal };
  }

  // Deterministic PRNG so a given cross renders identically every time (seeded
  // from the two parent genotype strings — stable across re-renders).
  function hashStr(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function sampleChild(perLocus, rng) {
    var g = {};
    for (var k = 0; k < perLocus.length; k++) {
      var pl = perLocus[k], keys = Object.keys(pl.dist);
      if (keys.length === 1) { g[pl.key] = keys[0]; continue; }
      var r = rng(), acc = 0, chosen = keys[keys.length - 1];
      for (var i = 0; i < keys.length; i++) { acc += pl.dist[keys[i]]; if (r < acc) { chosen = keys[i]; break; } }
      g[pl.key] = chosen;
    }
    return g;
  }

  // generic helpers for the factored path
  function crossKeys(keys, byKey) {
    var combos = [{ geno: {}, p: 1 }];
    keys.forEach(function (key) {
      var dist = byKey[key], ks = Object.keys(dist), next = [];
      combos.forEach(function (c) {
        ks.forEach(function (gt) { var ng = clone(c.geno); ng[key] = gt; next.push({ geno: ng, p: c.p * dist[gt] }); });
      });
      combos = next;
    });
    return combos;
  }
  function collapseBy(combos, classify) {
    var m = {};
    combos.forEach(function (c) { var k = classify(c.geno); if (!m[k]) { m[k] = { geno: c.geno, p: 0 }; } m[k].p += c.p; });
    return Object.keys(m).map(function (k) { return m[k]; });
  }
  function mergeGeno() {
    var o = {};
    for (var i = 0; i < arguments.length; i++) { var g = arguments[i]; for (var k in g) { if (g.hasOwnProperty(k)) { o[k] = g[k]; } } }
    return o;
  }

  // EXACT — full Cartesian product over branching loci (single-outcome pinned).
  function exactProduct(perLocus) {
    var combos = [{ geno: {}, p: 1 }];
    perLocus.forEach(function (pl) {
      var keys = Object.keys(pl.dist);
      if (keys.length === 1) { var only = keys[0]; combos.forEach(function (c) { c.geno[pl.key] = only; }); return; }
      var next = [];
      combos.forEach(function (c) { keys.forEach(function (gt) { var ng = clone(c.geno); ng[pl.key] = gt; next.push({ geno: ng, p: c.p * pl.dist[gt] }); }); });
      combos = next;
    });
    var out = aggregateOffspring(combos);
    out.combinations = combos.length;
    return out;
  }

  // MONTE-CARLO — seeded sampling so the tool always answers (ultimate backstop).
  function monteCarloSample(perLocus, A, B, sampleSize) {
    var rng = mulberry32(hashStr(formatGenotype(A) + '|' + formatGenotype(B)));
    var tally = {};
    for (var s = 0; s < sampleSize; s++) {
      var child = sampleChild(perLocus, rng);
      var ck = formatGenotype(child);
      if (tally[ck]) { tally[ck].count++; } else { tally[ck] = { geno: child, count: 1 }; }
    }
    var weighted = Object.keys(tally).map(function (kk) { return { geno: tally[kk].geno, p: tally[kk].count / sampleSize }; });
    var out = aggregateOffspring(weighted);
    out.combinations = sampleSize;
    return out;
  }

  // baseKeyOf(g) — base colour from an {E,A} subset (no resolve needed).
  function baseKeyOf(g) {
    if (parsePair('E', g.E).indexOf('E') < 0) { return 'chestnut'; }
    var a = parsePair('A', g.A);
    if (a.indexOf('A') >= 0) { return 'bay'; }
    if (a.indexOf('At') >= 0) { return 'seal_brown'; }
    return 'black';
  }

  // overlayRecipe(G) — the coat-INDEPENDENT part of an overlay genotype, computed
  // once per overlay combo (not per coat). `midTags` are the tags between roan and
  // leopard; roan (head replace vs tag) and leopard (head prefix) depend on coat.
  function overlayRecipe(G) {
    var sabinoWhite = count(G, 'Sb', 'Sb') === 2, midTags = [];
    if (hasDom(G, 'Rb')) { midTags.push('Rabicano'); }
    if (hasDom(G, 'T')) { midTags.push(count(G, 'T', 'T') === 2 ? 'Tobiano (ink spots)' : 'Tobiano'); }
    if (hasDom(G, 'Sb') && !sabinoWhite) { midTags.push('Sabino'); }
    if (hasDom(G, 'O')) { midTags.push('Overo'); }
    if (hasDom(G, 'SW1')) { midTags.push(count(G, 'SW1', 'SW1') === 2 ? 'Splashed White' : 'Splash (minimal)'); }
    var lp = count(G, 'Lp', 'Lp'), leopardEntry = null;
    if (lp > 0) {
      var p1 = count(G, 'PATN1', 'PATN1');
      if (p1 > 0) { leopardEntry = DATA.leopard.patn1[lp + ',' + p1]; }
      else if (hasDom(G, 'PATN2')) { leopardEntry = DATA.leopard.patn2[String(lp)]; }
      else { leopardEntry = DATA.leopard.bare[String(lp)]; }
    }
    return { roan: hasDom(G, 'Rn'), midTags: midTags, leopardEntry: leopardEntry, sabinoWhite: sabinoWhite };
  }

  // overlayName(coat, recipe) — compose final display name + swatch from a coat
  // state and a precomputed overlay recipe, mirroring resolve()'s steps 5-7 +
  // sabino-white (gray / dominant white / OO / WW handled by factoredPunnett, not
  // here). MUST stay in lock-step with resolve(); the differential test guards it.
  function overlayName(coat, oc) {
    if (oc.sabinoWhite) { return { displayName: 'Sabino White', swatch: '#efe9e0' }; }
    var head = coat.head, swatch = coat.swatch, tags;
    if (oc.roan) {
      if (head === coat.baseName) { head = DATA.overlays.roan.nameByBase[coat.baseKey]; tags = oc.midTags.slice(); }
      else { tags = ['Roan'].concat(oc.midTags); }
    } else { tags = oc.midTags.slice(); }
    if (oc.leopardEntry) {
      head = (head === 'Chestnut') ? oc.leopardEntry.name : (head + ' ' + oc.leopardEntry.name);
      swatch = oc.leopardEntry.swatch || swatch;
    }
    return { displayName: head + (tags.length ? ' — ' + tags.join(', ') : ''), swatch: swatch };
  }

  // EXACT FACTORED — bounded, exact distribution for large crosses. Splits the
  // two epistatic genes (G, W) + the two lethals (OO, WW) out analytically. The
  // COAT is sub-factored (base E/A × dilution-shading) so naming each coat costs
  // only resolve()s for the distinct base×dil/shade reps; overlays are then
  // composed by the cheap overlayName(). Returns null if the cross is still too
  // large (-> Monte-Carlo). See docs/track-a-breeding-scalability.md.
  function factoredPunnett(perLocus, crossCap) {
    var byKey = {};
    perLocus.forEach(function (pl) { byKey[pl.key] = pl.dist; });
    function P(key, geno) { return byKey[key][geno] || 0; }
    function sumWhere(key, pred) { var t = 0, d = byKey[key]; Object.keys(d).forEach(function (g) { if (pred(g)) { t += d[g]; } }); return t; }

    var pWW = P('W', 'WW'), pWw = P('W', 'Ww'), pww = P('W', 'ww'), pNotWW = 1 - pWW;
    var pOO = P('O', 'OO'), pNO = P('O', 'nO'), pNN = P('O', 'nn'), pNotOO = 1 - pOO;
    var pgg = P('G', 'gg'), pGray = P('G', 'GG') + P('G', 'Gg');
    var pSbSb = P('Sb', 'SbSb');
    var pLiveTotal = pNotWW * pNotOO;

    // COAT (sub-factored): collapse E,A -> base, cross dilution/shading once, and
    // resolve only the base×dil/shade reps to name each distinct coat.
    var baseClasses = collapseBy(crossKeys(['E', 'A'], byKey), baseKeyOf);
    var dilShade = crossKeys(['C', 'Ch', 'D', 'Z', 'F', 'Pg', 'Sty'], byKey);
    var coatMap = {};
    baseClasses.forEach(function (bc) {
      dilShade.forEach(function (ds) {
        var coatGeno = mergeGeno(bc.geno, ds.geno);
        var cr = resolve(withDefaults(coatGeno)), name = cr.displayName, o = coatMap[name];
        if (!o) {
          o = coatMap[name] = {
            coat: { head: name, baseName: cr.baseName, baseKey: cr.baseKey, swatch: cr.swatch },
            geno: coatGeno, p: 0
          };
        }
        o.p += bc.p * ds.p;
      });
    });
    var coatClasses = Object.keys(coatMap).map(function (k) { return coatMap[k]; });

    var roanClasses = collapseBy(crossKeys(['Rn', 'Rb'], byKey),
      function (g) { return (hasDom(g, 'Rn') ? 'R' : 'r') + (hasDom(g, 'Rb') ? 'B' : 'b'); });
    var oCond = {}; if (pNN > 0) { oCond.nn = pNN / pNotOO; } if (pNO > 0) { oCond.nO = pNO / pNotOO; }
    var whiteByKey = { T: byKey.T, Sb: byKey.Sb, SW1: byKey.SW1, O: oCond };
    var whiteClasses = collapseBy(crossKeys(['T', 'Sb', 'O', 'SW1'], whiteByKey), function (g) {
      var t = count(g, 'T', 'T') === 2 ? '2' : (hasDom(g, 'T') ? '1' : '0');
      var sb = count(g, 'Sb', 'Sb') === 2 ? '2' : (hasDom(g, 'Sb') ? '1' : '0');
      var sw = count(g, 'SW1', 'SW1') === 2 ? '2' : (hasDom(g, 'SW1') ? '1' : '0');
      return t + sb + (hasDom(g, 'O') ? 'O' : '_') + sw;
    });
    var leopardClasses = collapseBy(crossKeys(['Lp', 'PATN1', 'PATN2'], byKey), function (g) {
      var lp = count(g, 'Lp', 'Lp'); if (lp === 0) { return 'lp0'; }
      var p1 = count(g, 'PATN1', 'PATN1'); if (p1 > 0) { return 'lp' + lp + 'a' + p1; }
      return 'lp' + lp + 'b' + (hasDom(g, 'PATN2') ? 1 : 0);
    });

    var crossSize = coatClasses.length * roanClasses.length * whiteClasses.length * leopardClasses.length;
    if (crossSize > (crossCap || 250000)) { return null; }   // hand off to Monte-Carlo

    var nonMaskedMass = pww * pNotOO * pgg;   // pNotGray = pgg
    var live = {};
    function add(name, swatch, baseKey, mass, coatGeno, overlayGeno) {
      if (mass <= 0) { return; }
      var o = live[name] || (live[name] = { name: name, swatch: swatch, baseKey: baseKey, p: 0, repCoat: null, repOverlay: null, repMass: -1, comboCount: 0 });
      o.p += mass; o.comboCount++;
      if (mass > o.repMass) { o.repMass = mass; o.repCoat = coatGeno; o.repOverlay = overlayGeno; }
    }

    // precompute each overlay combo's recipe ONCE (merge + the coat-independent
    // name parts), then compose names across all coats with the cheap overlayName.
    var overlayCombos = [];
    roanClasses.forEach(function (roan) {
      whiteClasses.forEach(function (white) {
        leopardClasses.forEach(function (leo) {
          var og = mergeGeno(roan.geno, white.geno, leo.geno);
          var rec = overlayRecipe(og);
          rec.og = og; rec.p = roan.p * white.p * leo.p;
          overlayCombos.push(rec);
        });
      });
    });
    coatClasses.forEach(function (coat) {
      var cc = coat.coat;
      overlayCombos.forEach(function (oc) {
        var nm = overlayName(cc, oc);
        add(nm.displayName, nm.swatch, cc.baseKey, coat.p * oc.p * nonMaskedMass, coat.geno, oc.og);
      });
    });

    add('Dominant White', DATA.overlays.dominant_white.swatch, null, pWw * pNotOO, null, null);
    add('Gray', DATA.overlays.gray.swatch, null, pww * pNotOO * pGray, null, null);

    var distribution = Object.keys(live).map(function (n) {
      var o = live[n];
      return { name: o.name, swatch: o.swatch, baseKey: o.baseKey, p: o.p, pLive: pLiveTotal > 0 ? o.p / pLiveTotal : 0, genotypes: [], comboCount: o.comboCount, _rc: o.repCoat, _ro: o.repOverlay, _rm: o.repMass };
    }).sort(function (a, b) { return b.p - a.p || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });
    // name the representative genotype only for the colours the UI can actually
    // show (it caps the table) — avoids formatGenotype-ing a 100k-colour tail.
    distribution.forEach(function (e, i) {
      if (i < 60 && e._rc) {
        e.genotypes = [{ geno: formatGenotype(withDefaults(mergeGeno(e._rc, e._ro, { W: 'ww', G: 'gg' }))), p: e._rm, pLive: pLiveTotal > 0 ? e._rm / pLiveTotal : 0 }];
      }
      delete e._rc; delete e._ro; delete e._rm;
    });

    var lethalReasons = {};
    if (pWW > 1e-15) { lethalReasons[resolve(withDefaults({ W: 'WW' })).flags.lethalReason] = pWW; }
    if (pOO > 1e-15) { lethalReasons[resolve(withDefaults({ O: 'OO' })).flags.lethalReason] = pNotWW * pOO; }

    // carriers — closed form among live foals (derivation in docs/track-a)
    var pEe = P('E', 'Ee'), pE_ = P('E', 'EE') + P('E', 'Ee');
    var pNoA = sumWhere('A', function (g) { return parsePair('A', g).indexOf('A') < 0; });
    var pCCr = P('C', 'CCr');
    var pPrl1 = sumWhere('C', function (g) { return parsePair('C', g).indexOf('prl') >= 0; });
    var pPrlShow = P('C', 'prlprl') + P('C', 'Crprl');
    var pFhasf = sumWhere('F', function (g) { return parsePair('F', g).indexOf('f') >= 0; });
    var raw = {
      redfactor: pEe,
      frame: pNotOO > 0 ? pNO / pNotOO : 0,
      flaxen: pFhasf * pE_,
      cream: pCCr * pE_ * pNoA,
      pearl: pPrl1 - pPrlShow * (1 - pSbSb) * pgg * (pNotWW > 0 ? pww / pNotWW : 0)
    };
    var carriers = Object.keys(raw).map(function (id) {
      return { id: id, label: CARRIER_LABEL[id] || id, p: raw[id] * pLiveTotal, pLive: raw[id] };
    }).filter(function (x) { return x.p > 1e-9; }).sort(function (a, b) { return b.pLive - a.pLive; });

    return {
      distribution: distribution, carriers: carriers,
      lethalFraction: pWW + pOO - pWW * pOO, lethalReasons: lethalReasons,
      liveTotal: pLiveTotal, combinations: crossSize
    };
  }

  function punnett(parentA, parentB, opts) {
    opts = opts || {};
    var exactCap = opts.cap || 250000;
    var sampleSize = opts.sampleSize || 20000;
    var crossCap = opts.crossCap || 250000;
    var A = withDefaults(parentA), B = withDefaults(parentB);

    var perLocus = DATA.displayOrder.map(function (key) { return { key: key, dist: crossLocus(A[key], B[key], key) }; });
    var projected = 1;
    perLocus.forEach(function (pl) { projected *= Object.keys(pl.dist).length; });
    var force = opts.force;

    var out = null;
    if (force === 'monte-carlo') { /* fall through to Monte-Carlo below */ }
    else if (force === 'exact' || (!force && projected <= exactCap)) { out = exactProduct(perLocus); out.method = 'exact'; out.approximate = false; }
    else { out = factoredPunnett(perLocus, crossCap); if (out) { out.method = 'factored'; out.approximate = false; } }
    if (!out) { out = monteCarloSample(perLocus, A, B, sampleSize); out.method = 'monte-carlo'; out.approximate = true; out.sampleSize = sampleSize; }
    out.projected = projected;
    return out;
  }

  /* ======================================================================
     enumerateColors() — the gallery / field-guide entry list, built from
     the data tables. Each entry carries a representative genotype so the
     UI can resolve it for full traits, prefill the calculator, etc.
     ====================================================================== */
  function baseGeno(baseKey) {
    var g = clone(OFF);
    if (baseKey === 'chestnut') { g.E = 'ee'; g.A = 'aa'; }
    else if (baseKey === 'bay') { g.E = 'Ee'; g.A = 'Aa'; }
    else if (baseKey === 'seal_brown') { g.E = 'Ee'; g.A = 'Ata'; }
    else if (baseKey === 'black') { g.E = 'Ee'; g.A = 'aa'; }
    return g;
  }
  function mk(baseKey, over) {
    var g = baseGeno(baseKey);
    if (over) { for (var k in over) { if (over.hasOwnProperty(k)) { g[k] = over[k]; } } }
    return g;
  }

  var _gallery = null;
  function enumerateColors() {
    if (_gallery) { return _gallery; }
    var out = [];
    var bases = ['chestnut', 'bay', 'seal_brown', 'black'];

    function add(canonical, slug, baseKey, groups, genotype) {
      var r = resolve(genotype);
      out.push({
        slug: slug,
        canonical: canonical,
        name: r.displayName,
        baseKey: baseKey,
        groups: groups,
        swatch: r.swatch,
        genotype: genotype,
        resolved: r,
        cues: cueFor(r, canonical)
      });
    }

    // base colours
    bases.forEach(function (b) {
      add(DATA.baseColors[b].name, slugify(DATA.baseColors[b].name), b, ['base'], baseGeno(b));
    });

    // cream / pearl
    var creamOver = { single_cream: { C: 'CCr' }, double_cream: { C: 'CrCr' }, pearl: { C: 'prlprl' }, cream_pearl: { C: 'Crprl' } };
    bases.forEach(function (b) {
      Object.keys(creamOver).forEach(function (state) {
        var nm = DATA.dilutionNames.creamPearl[b][state].name;
        add(nm, slugify(nm), b, ['dilution'], mk(b, creamOver[state]));
      });
    });
    // champagne
    bases.forEach(function (b) {
      var nm = DATA.dilutionNames.champagne[b].name;
      add(nm, slugify(nm), b, ['dilution'], mk(b, { Ch: 'nCh' }));
    });
    // dun
    bases.forEach(function (b) {
      var nm = DATA.dilutionNames.dun[b].name;
      add(nm, slugify(nm), b, ['dilution'], mk(b, { D: 'Dd' }));
    });
    // silver (black pigment only)
    ['bay', 'seal_brown', 'black'].forEach(function (b) {
      var nm = DATA.dilutionNames.silver[b].name;
      add(nm, slugify(nm), b, ['dilution'], mk(b, { Z: 'nZ' }));
    });

    // recognized stacked dilutions (first-class catalog colours — §4.3)
    [
      { slug: 'dunalino', base: 'chestnut', over: { C: 'CCr', D: 'Dd' } },
      { slug: 'dunskin', base: 'bay', over: { C: 'CCr', D: 'Dd' } },
      { slug: 'smoky-grullo', base: 'black', over: { C: 'CCr', D: 'Dd' } },
      { slug: 'silver-grullo', base: 'black', over: { Z: 'nZ', D: 'Dd' } },
      { slug: 'silver-bay-dun', base: 'bay', over: { Z: 'nZ', D: 'Dd' } },
      { slug: 'gold-cream-champagne', base: 'chestnut', over: { Ch: 'nCh', C: 'CCr' } },
      { slug: 'amber-cream-champagne', base: 'bay', over: { Ch: 'nCh', C: 'CCr' } },
      { slug: 'classic-cream-champagne', base: 'black', over: { Ch: 'nCh', C: 'CCr' } }
    ].forEach(function (s) {
      var geno = mk(s.base, s.over);
      add(resolve(geno).displayName, s.slug, s.base, ['dilution'], geno);
    });

    // shading — flaxen (+ the liver-chestnut shade variant, display-only)
    add('Flaxen Chestnut', 'flaxen-chestnut', 'chestnut', ['shading'], mk('chestnut', { F: 'ff' }));
    (function () {
      var geno = mk('chestnut', { F: 'ff' });
      out.push({
        slug: 'flaxen-liver-chestnut', canonical: 'Flaxen Liver Chestnut', name: 'Flaxen Liver Chestnut',
        baseKey: 'chestnut', groups: ['shading'], swatch: DATA.shadingSwatches.flaxen.chestnut_liver,
        genotype: geno, resolved: resolve(geno),
        cues: 'Dark liver-chestnut body with a pale flaxen mane & tail — the high-contrast end of flaxen chestnut (same genotype, darker shade).',
        stage: true
      });
    })();
    // shading — mealy (pangaré)
    ['chestnut', 'bay', 'seal_brown'].forEach(function (b) {
      add('Mealy ' + DATA.baseColors[b].name, 'mealy-' + b.replace('_', '-'), b, ['shading'], mk(b, { Pg: 'nPg' }));
    });
    // shading — sooty (incl. the single-cream palomino / buckskin variants)
    add('Sooty Chestnut', 'sooty-chestnut', 'chestnut', ['shading'], mk('chestnut', { Sty: 'nSty' }));
    add('Sooty Bay', 'sooty-bay', 'bay', ['shading'], mk('bay', { Sty: 'nSty' }));
    add('Sooty Palomino', 'sooty-palomino', 'chestnut', ['shading'], mk('chestnut', { C: 'CCr', Sty: 'nSty' }));
    add('Sooty Buckskin', 'sooty-buckskin', 'bay', ['shading'], mk('bay', { C: 'CCr', Sty: 'nSty' }));

    // roaning
    add('Strawberry Roan', 'strawberry-roan', 'chestnut', ['roaning'], mk('chestnut', { Rn: 'Rnrn' }));
    add('Bay Roan', 'bay-roan', 'bay', ['roaning'], mk('bay', { Rn: 'Rnrn' }));
    add('Blue Roan', 'blue-roan', 'black', ['roaning'], mk('black', { Rn: 'Rnrn' }));
    add('Rabicano', 'rabicano', 'chestnut', ['roaning'], mk('chestnut', { Rb: 'nRb' }));

    // white-spotting
    add('Tobiano', 'tobiano', 'bay', ['white'], mk('bay', { T: 'nT' }));
    add('Sabino', 'sabino', 'bay', ['white'], mk('bay', { Sb: 'nSb' }));
    add('Sabino White', 'sabino-white', 'bay', ['white'], mk('bay', { Sb: 'SbSb' }));
    add('Overo', 'overo', 'bay', ['white'], mk('bay', { O: 'nO' }));
    add('Splashed White', 'splashed-white', 'bay', ['white'], mk('bay', { SW1: 'SW1SW1' }));
    add('Dominant White', 'dominant-white', 'bay', ['white'], mk('bay', { W: 'Ww' }));

    // gray — its own category: the stage / type set (all are the one G_ genotype)
    (DATA.grayStages || []).forEach(function (gs) {
      var baseKey = gs.base === 'black' ? 'black' : (gs.base === 'chestnut' ? 'chestnut' : 'bay');
      var geno = mk(baseKey, { G: 'Gg' });
      out.push({
        slug: gs.key, canonical: gs.name, name: gs.name, baseKey: baseKey,
        groups: ['gray'], swatch: gs.swatch, genotype: geno, resolved: resolve(geno),
        cues: gs.cue, stage: true
      });
    });

    // leopard complex
    add('Varnish Roan', 'varnish-roan', 'chestnut', ['leopard'], mk('chestnut', { Lp: 'Lplp' }));
    add('Near-Leopard', 'near-leopard', 'chestnut', ['leopard'], mk('chestnut', { Lp: 'Lplp', PATN1: 'PATN1patn1' }));
    add('Leopard', 'leopard', 'chestnut', ['leopard'], mk('chestnut', { Lp: 'Lplp', PATN1: 'PATN1PATN1' }));
    add('Fewspot', 'fewspot', 'chestnut', ['leopard'], mk('chestnut', { Lp: 'LpLp', PATN1: 'PATN1patn1' }));
    add('Spotted Blanket', 'spotted-blanket', 'chestnut', ['leopard'], mk('chestnut', { Lp: 'Lplp', PATN2: 'PATN2patn2' }));
    add('Blanket', 'blanket', 'chestnut', ['leopard'], mk('chestnut', { Lp: 'LpLp', PATN2: 'PATN2patn2' }));
    add('Black Appaloosa', 'black-appaloosa', 'black', ['leopard'], mk('black', { Lp: 'Lplp', PATN2: 'PATN2patn2' }));

    _gallery = out;
    return out;
  }

  function cueFor(resolved, canonical) {
    var t = resolved.traits;
    var bits = [];
    if (resolved.patterns.length) {
      bits.push(resolved.patterns[resolved.patterns.length - 1].desc);
    }
    bits.push('Eyes: ' + t.eyes + '. Skin: ' + t.skin + '.');
    if (t.maneTail) { bits.push('Mane/tail: ' + t.maneTail + '.'); }
    if (t.primitiveMarkings) { bits.push('Primitive markings: ' + t.primitiveMarkings + '.'); }
    if (resolved.notes.length) { bits.push(resolved.notes[0]); }
    return bits.join(' ');
  }

  function colorBySlug(slug) {
    var list = enumerateColors();
    for (var i = 0; i < list.length; i++) { if (list[i].slug === slug) { return list[i]; } }
    return null;
  }

  /* ----------------------------------------------------------------------
     misc public helpers
     ---------------------------------------------------------------------- */
  // "Roll a horse" — draw each locus's two alleles weighted by real-world rarity
  // (DATA.rollFrequencies, Hardy-Weinberg per locus) instead of uniformly, so the
  // dominant alleles that MASK everything — Gray (G), Dominant White (W) — and the
  // white-spotting / leopard patterns stay rare. A locus with no frequencies falls
  // back to a uniform pick. Lethal homozygotes (WW, OO) aren't in the genotype
  // lists, so an (astronomically rare) hom-dominant draw degrades to the het.
  function rollAllele(freq) {
    var toks = Object.keys(freq), sum = 0, i;
    for (i = 0; i < toks.length; i++) { sum += freq[toks[i]]; }
    var r = Math.random() * sum, acc = 0;
    for (i = 0; i < toks.length; i++) { acc += freq[toks[i]]; if (r < acc) { return toks[i]; } }
    return toks[toks.length - 1];
  }
  function matchGeno(l, x, y) {
    for (var i = 0; i < l.genotypes.length; i++) {
      var p = parsePair(l.key, l.genotypes[i]);
      if ((p[0] === x && p[1] === y) || (p[0] === y && p[1] === x)) { return l.genotypes[i]; }
    }
    return null;
  }
  function rollGeno(l, freq) {
    var a1 = rollAllele(freq), a2 = rollAllele(freq);
    var t = matchGeno(l, a1, a2);
    if (t) { return t; }
    var rec = parsePair(l.key, OFF[l.key])[0];      // hom-dominant excluded → pair with recessive
    return matchGeno(l, a1, rec) || matchGeno(l, a2, rec) || OFF[l.key];
  }
  // randomGenotype(freqOverride?) — a rarity-weighted roll. `freqOverride` replaces
  // the per-allele weight map at named loci (used by the breeding game's regions /
  // expeditions to bias what colours a survey turns up).
  function randomGenotype(freqOverride) {
    var RF = DATA.rollFrequencies || {}, OV = freqOverride || {};
    var g = {};
    LOCI.forEach(function (l) {
      var freq = OV[l.key] || RF[l.key];
      g[l.key] = freq ? rollGeno(l, freq) : l.genotypes[Math.floor(Math.random() * l.genotypes.length)];
    });
    return g;
  }
  function defaultGenotype() { return clone(DATA.startGenotype); }
  function offGenotype() { return clone(OFF); }

  /* ----------------------------------------------------------------------
     CANONICAL GENOTYPE STRING (the record-keeping backbone)
       formatGenotype(g)  -> "ww/gg/Ee/Aa/CCr/.../patn2patn2"  (raw tokens,
                             displayOrder, slash-separated)
       parseGenotype(str) -> { genotype, warnings, ok }        (tolerant)
     Round-trips losslessly: parseGenotype(formatGenotype(g)).genotype deep-
     equals withDefaults(g). The parser also accepts partial / "active genes
     only" strings (omitted loci default to recessive/absent), reordered
     tokens, separators (/ space , ;), pretty superscripts (Cᶜʳ, Aᵗ), and
     case-insensitivity wherever a locus's alleles don't collide on case.
     ---------------------------------------------------------------------- */
  function formatGenotype(genotype) {
    var G = withDefaults(genotype);
    return DATA.displayOrder.map(function (k) { return G[k]; }).join('/');
  }

  // A locus is case-insensitive-safe only if no two alleles share a lowercase
  // form. E / A / D / F / G / W / Rn / Lp / PATN* are NOT safe (case = meaning).
  var CI_SAFE = {};
  LOCI.forEach(function (l) {
    var seen = {}, safe = true;
    l.alleles.forEach(function (a) { var lc = a.token.toLowerCase(); if (seen[lc]) { safe = false; } seen[lc] = true; });
    CI_SAFE[l.key] = safe;
  });

  var SUPERSCRIPT = { 'ᶜ': 'c', 'ʳ': 'r', 'ᵗ': 't', '¹': '1', '²': '2' };
  function deSuper(s) { return String(s).replace(/[ᶜʳᵗ¹²]/g, function (c) { return SUPERSCRIPT[c] || c; }); }

  function parsePairLoose(key, raw) {
    try { return parsePair(key, raw); } catch (e) { /* try looser below */ }
    if (!CI_SAFE[key]) { return null; }
    var toks = TOKENS[key], lower = raw.toLowerCase();
    for (var i = 0; i < toks.length; i++) {
      var a = toks[i];
      if (lower.indexOf(a.toLowerCase()) === 0) {
        var rest = lower.slice(a.length);
        for (var j = 0; j < toks.length; j++) {
          if (toks[j].toLowerCase() === rest) { return [a, toks[j]]; }
        }
      }
    }
    return null;
  }

  function canonicalGenoFor(key, raw) {
    var L = LOCUS_BY_KEY[key];
    var all = L.genotypes.concat(L.lethalGenotypes || []);
    if (all.indexOf(raw) >= 0) { return raw; }
    var p = parsePairLoose(key, raw);
    if (p) { var c = PAIR_TO_GENO[key][sortedKey(p[0], p[1])]; if (c) { return c; } }
    return null;
  }

  function parseGenotype(input) {
    var out = clone(OFF), warnings = [];
    if (input == null || String(input).trim() === '') {
      return { genotype: out, warnings: ['Empty input — defaulted to all-recessive (chestnut).'], ok: false };
    }
    var groups = deSuper(String(input)).trim().split(/[\/\s,;]+/).filter(Boolean);
    var order = DATA.displayOrder;

    // Positional path — one group per locus, all valid -> full canonical string.
    if (groups.length === order.length) {
      var pos = {}, allValid = true;
      for (var i = 0; i < order.length; i++) {
        var c = canonicalGenoFor(order[i], groups[i]);
        if (c == null) { allValid = false; break; }
        pos[order[i]] = c;
      }
      if (allValid) {
        for (var k in pos) { if (pos.hasOwnProperty(k)) { out[k] = pos[k]; } }
        return { genotype: out, warnings: warnings, ok: true };
      }
    }

    // Identification path — shorthand / active-genes-only / reordered tokens.
    groups.forEach(function (grp) {
      var cands = [];
      order.forEach(function (key) {
        var c = canonicalGenoFor(key, grp);
        if (c != null) { cands.push({ key: key, geno: c }); }
      });
      if (!cands.length) { warnings.push('Skipped unrecognised token "' + grp + '".'); return; }
      var active = cands.filter(function (x) { return x.geno !== OFF[x.key]; });
      if (active.length === 0) { return; } // an all-"off" token (e.g. nn) — leave default
      var pick = active[0];
      if (active.length > 1) { warnings.push('"' + grp + '" could fit several loci; assigned to ' + LOCUS_BY_KEY[pick.key].name + '.'); }
      out[pick.key] = pick.geno;
    });
    return { genotype: out, warnings: warnings, ok: warnings.length === 0 };
  }

  /* ----------------------------------------------------------------------
     carriedAlleles(genotype) — heritable alleles NOT visible in the coat.
     ("Carried (not visible, but heritable)") — so a user can see what a
     horse can pass on unseen: red factor, masked agouti, pearl carrier, a
     cream that barely shows, silver/flaxen on the wrong base, etc.
     ---------------------------------------------------------------------- */
  function carriedAlleles(genotype) {
    var G = withDefaults(genotype);
    var r = resolve(G);
    var out = [];
    if (r.flags.isLethal) { return out; }
    function add(locus, alleles, note) { out.push({ locus: locus, alleles: alleles, note: note }); }
    var base = r.baseKey;

    // red factor — a black-pigment horse carrying one chestnut allele
    if (base && base !== 'chestnut' && count(G, 'E', 'E') === 1 && count(G, 'E', 'e') === 1) {
      add('Extension', labelOf('E', 'e'), 'Red factor, hidden under black pigment — two e foals come out chestnut.');
    }
    // agouti invisible on chestnut, or a recessive agouti allele under a dominant one
    if (base === 'chestnut') {
      add('Agouti', prettyGenotype('A', G.A), 'Agouti shows nothing on a chestnut (ee) base, yet is inherited and shapes any black-pigmented foal.');
    } else {
      var ap = parsePair('A', G.A);
      if (base === 'bay' && ap.indexOf('At') >= 0) { add('Agouti', labelOf('A', 'At'), 'Seal-brown allele carried under bay (A is dominant).'); }
      else if (base === 'bay' && ap.indexOf('a') >= 0) { add('Agouti', labelOf('A', 'a'), 'Black allele carried under bay.'); }
      else if (base === 'seal_brown' && ap.indexOf('a') >= 0) { add('Agouti', labelOf('A', 'a'), 'Black allele carried under seal brown — two a foals are black.'); }
    }
    // pearl carrier
    if (count(G, 'C', 'prl') === 1 && count(G, 'C', 'Cr') === 0) {
      add('Cream / Pearl', labelOf('C', 'prl'), 'Pearl carrier — invisible alone; needs a second pearl or a cream allele to show.');
    }
    // single cream that barely reads on a dark base (smoky black / brown)
    if (creamState(G) === 'single_cream' && (base === 'black' || base === 'seal_brown')) {
      add('Cream / Pearl', labelOf('C', 'Cr'), 'One cream allele, but it barely shows on a dark base (smoky black / smoky brown) — easily passed on unseen.');
    }
    // silver carried on a red base (acts on black pigment only)
    if (hasDom(G, 'Z') && base === 'chestnut') {
      add('Silver', labelOf('Z', 'Z'), 'Silver only dilutes black pigment, so it is invisible on chestnut — but still heritable.');
    }
    // flaxen carried where it cannot show
    if (count(G, 'F', 'f') >= 1 && base !== 'chestnut') {
      add('Flaxen', count(G, 'F', 'f') === 2 ? 'ff' : labelOf('F', 'f'), 'Flaxen only lightens a chestnut mane & tail, so it is hidden here but can surface in chestnut foals.');
    } else if (count(G, 'F', 'f') === 1 && base === 'chestnut') {
      add('Flaxen', labelOf('F', 'f'), 'One flaxen allele — hidden (flaxen needs two copies) but heritable.');
    }
    // pattern genes with no leopard complex to act on
    if (!hasDom(G, 'Lp') && (hasDom(G, 'PATN1') || hasDom(G, 'PATN2'))) {
      var pat = [];
      if (hasDom(G, 'PATN1')) { pat.push('PATN1'); }
      if (hasDom(G, 'PATN2')) { pat.push('PATN2'); }
      add('Leopard pattern', pat.join(' / '), 'A spotting-pattern gene with no leopard-complex (Lp) allele to act on — silent here, but inherited.');
    }
    // gray whitens the coat with age — its dilutions / patterns stay heritable
    if (r.flags.isGraying) {
      add('Coat (greying)', 'underlying ' + r.underlyingName, 'Gray whitens the coat with age, but the underlying ' + r.underlyingName + ' and its dilution / pattern alleles are inherited and can reappear un-greyed in foals.');
    }
    // dominant white masks the whole coat
    if (r.flags.isWhiteMasked) {
      add('Coat (masked)', 'underlying ' + r.underlyingName, 'Dominant white hides the coat — every base, dilution, shading and pattern allele below it is carried unseen.');
    }
    return out;
  }

  /* ----------------------------------------------------------------------
     healthFlags(genotype) — genetic-health notes for the alleles present,
     drawn from DATA.healthNotes (Silver↔MCOA, Frame↔OLWS, WW/OO non-viable,
     Splashed-White deafness/SW2-3, Leopard↔CSNB).
     ---------------------------------------------------------------------- */
  function healthFlags(genotype) {
    var G = withDefaults(genotype);
    var H = DATA.healthNotes || {};
    var notes = [];
    function push(key, extra) { if (H[key]) { notes.push({ locus: H[key].locus, severity: H[key].severity, text: H[key].text + (extra || '') }); } }

    if (hasDom(G, 'Z')) { push('Z', count(G, 'Z', 'Z') === 2 ? ' This horse is ZZ.' : ''); }
    if (count(G, 'O', 'O') === 2) { notes.push({ locus: 'Overo', severity: 'lethal', text: DATA.overlays.frame.lethal.reason + ' This genotype (OO) is itself non-viable.' }); }
    else if (hasDom(G, 'O')) { push('O'); }
    if (count(G, 'W', 'W') === 2) { notes.push({ locus: 'Dominant White', severity: 'lethal', text: 'WW is embryonic-lethal and non-viable.' }); }
    else if (hasDom(G, 'W')) { push('W'); }
    if (hasDom(G, 'SW1')) { push('SW1'); }
    if (hasDom(G, 'Lp')) { push('Lp', count(G, 'Lp', 'Lp') === 2 ? ' This horse is LpLp (highest CSNB association).' : ''); }
    if (count(G, 'Sb', 'Sb') === 2) { push('Sb'); }
    return notes;
  }

  /* ----------------------------------------------------------------------
     COLOUR VARIATION — every phenotype is a small RANGE, not one fixed hex.
     A real chestnut runs from yellow-toned to red-toned; a black fades in the
     sun; a palomino's gold deepens. varySwatch() samples one plausible colour
     inside the genotype's constraints (seeded → reproducible / shareable), and
     paletteSwatches() walks the phenotype's primary axis to show the spread.
     Pure maths — no DOM — so the UI can offer a "resample" / copy palette.
     ---------------------------------------------------------------------- */
  function _hex2rgb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) { h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2); }
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function _chan(x) { x = Math.round(x); if (x < 0) { x = 0; } if (x > 255) { x = 255; } var s = x.toString(16); return s.length < 2 ? '0' + s : s; }
  function hexToHsl(hex) {
    var rgb = _hex2rgb(hex), r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0, s = 0, l = (max + min) / 2;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) { h = (g - b) / d + (g < b ? 6 : 0); }
      else if (max === g) { h = (b - r) / d + 2; }
      else { h = (r - g) / d + 4; }
      h *= 60;
    }
    return { h: h, s: s * 100, l: l * 100 };
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100;
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return '#' + _chan((r + m) * 255) + _chan((g + m) * 255) + _chan((b + m) * 255);
  }
  // pick the variation envelope (± ranges + primary axis) for a resolved colour
  function colorVarProfile(r) {
    var V = DATA.colorVariation || {};
    var def = V.default || { h: 5, s: 7, l: 6, primary: 'l' };
    if (!r || !r.swatch || (r.flags && r.flags.isLethal)) { return def; }
    if (r.flags && (r.flags.isWhiteMasked || r.flags.sabinoWhite)) { return V.pale || def; }
    if (r.flags && (r.flags.isGray || r.flags.isGraying)) { return V.gray || def; }
    var G = r.genotype, cs = G ? creamState(G) : 'none';
    if (cs === 'double_cream' || cs === 'cream_pearl') { return V.pale || def; }
    if (G && hasDom(G, 'Ch')) { return V.champagne || def; }
    if (cs === 'single_cream' || cs === 'pearl') { return V.cream || def; }
    if (G && hasDom(G, 'D')) { return V.dun || def; }
    if (r.baseKey === 'black') { return V.black || def; }
    if (r.baseKey === 'chestnut') { return V.red || def; }
    if (r.baseKey === 'bay' || r.baseKey === 'seal_brown') { return V.redBody || def; }
    return def;
  }
  // one plausible colour inside the phenotype's range (seed → reproducible)
  function varySwatch(r, seed) {
    var swatch = (r && r.swatch) || DATA.fallbackSwatch || '#7a4a2e';
    if (!/^#/.test(swatch)) { return swatch; }
    var p = colorVarProfile(r), hsl = hexToHsl(swatch);
    var rng = mulberry32(((seed >>> 0) ^ hashStr(swatch)) >>> 0);
    function jit(range) { return (rng() * 2 - 1) * range; }
    return hslToHex(hsl.h + jit(p.h), hsl.s + jit(p.s), hsl.l + jit(p.l));
  }
  // a spread of n variations walking the primary axis (red→yellow chestnut, …)
  function paletteSwatches(r, n) {
    n = n || 6;
    var swatch = (r && r.swatch) || DATA.fallbackSwatch || '#7a4a2e', out = [];
    if (!/^#/.test(swatch)) { while (out.length < n) { out.push(swatch); } return out; }
    var p = colorVarProfile(r), hsl = hexToHsl(swatch), prim = p.primary || 'l';
    var rng = mulberry32((hashStr(swatch) ^ 0x9e3779b9) >>> 0);
    function ax(axis, range, t) { return axis === prim ? t * range : (rng() * 2 - 1) * range * 0.5; }
    for (var i = 0; i < n; i++) {
      var t = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
      out.push(hslToHex(hsl.h + ax('h', p.h, t), hsl.s + ax('s', p.s, t), hsl.l + ax('l', p.l, t)));
    }
    return out;
  }
  // the SMOOTH natural-variation gradient: the colour at position t in [0,1] across
  // the phenotype's range, with coordinated shifts in hue, tone (saturation) AND
  // value (lightness) — the primary axis sweeps its full range, the other two shift
  // gently in step, all inside the phenotype's bounds. t = 0.5 is the representative
  // swatch. Continuous, so the UI can paint a gradient and sample any clicked point.
  function gradientColorAt(r, t) {
    var swatch = (r && r.swatch) || DATA.fallbackSwatch || '#7a4a2e';
    if (!/^#/.test(swatch)) { return swatch; }
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    var p = colorVarProfile(r), hsl = hexToHsl(swatch), u = 2 * t - 1;
    var kh = p.primary === 'h' ? 1 : 0.5;
    var ks = p.primary === 's' ? 1 : -0.5;
    var kl = p.primary === 'l' ? 1 : 0.6;
    return hslToHex(hsl.h + u * p.h * kh, hsl.s + u * p.s * ks, hsl.l + u * p.l * kl);
  }

  /* ----------------------------------------------------------------------
     export
     ---------------------------------------------------------------------- */
  root.HorseGenetics = {
    resolve: resolve,
    analyze: analyze,
    reverseLookup: reverseLookup,
    punnett: punnett,
    breedFoal: breedFoal,
    formatGenotype: formatGenotype,
    parseGenotype: parseGenotype,
    carriedAlleles: carriedAlleles,
    healthFlags: healthFlags,
    enumerateColors: enumerateColors,
    colorBySlug: colorBySlug,
    randomGenotype: randomGenotype,
    defaultGenotype: defaultGenotype,
    offGenotype: offGenotype,
    withDefaults: withDefaults,
    prettyGenotype: prettyGenotype,
    prettyToken: labelOf,
    writtenGenotype: writtenGenotype,
    cleanGenotype: cleanGenotype,
    slugify: slugify,
    creamState: creamState,
    varySwatch: varySwatch,
    paletteSwatches: paletteSwatches,
    gradientColorAt: gradientColorAt,
    colorVarProfile: colorVarProfile,
    hexToHsl: hexToHsl,
    hslToHex: hslToHex,
    LOCI: LOCI,
    LOCUS_BY_KEY: LOCUS_BY_KEY,
    DOM_TOKEN: DOM_TOKEN,
    OFF: OFF
  };

})(typeof window !== 'undefined' ? window : this);
