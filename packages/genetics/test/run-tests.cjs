/* Headless acceptance tests for the genetics engine.
   Run:  node test/run-tests.js
   Loads data.js + genetics.js as plain globals (no build, no modules). */
'use strict';
global.window = global;                 // data.js / genetics.js attach to window
require('../vendor/data.js');
require('../vendor/genetics.js');
require('../vendor/game.js');
var GG = global.HorseGenetics;
var HG = global.HorseGame;
var OFF = GG.OFF;

var pass = 0, fail = 0, fails = [];
function eq(desc, actual, expected) {
  if (actual === expected) { pass++; }
  else { fail++; fails.push(desc + '\n     expected: ' + JSON.stringify(expected) + '\n     got:      ' + JSON.stringify(actual)); }
}
function contains(desc, actual, sub) {
  if (typeof actual === 'string' && actual.indexOf(sub) >= 0) { pass++; }
  else { fail++; fails.push(desc + '\n     expected to contain: ' + JSON.stringify(sub) + '\n     got: ' + JSON.stringify(actual)); }
}
function ok(desc, cond) { if (cond) { pass++; } else { fail++; fails.push(desc + ' :: assertion was false'); } }
function approx(desc, actual, expected, eps) {
  eps = eps || 1e-9;
  if (typeof actual === 'number' && Math.abs(actual - expected) < eps) { pass++; }
  else { fail++; fails.push(desc + '\n     expected ~' + expected + '\n     got      ' + actual); }
}
function g(over) { return Object.assign({}, OFF, over); }
function nm(over) { return GG.resolve(g(over)).displayName; }

/* ---- BASE & AGOUTI ---- */
['AA', 'Aa', 'aa', 'AAt', 'Ata', 'AtAt'].forEach(function (a) {
  eq('ee ' + a + ' -> Chestnut', nm({ E: 'ee', A: a }), 'Chestnut');
});
eq('Ee Aa -> Bay', nm({ E: 'Ee', A: 'Aa' }), 'Bay');
eq('EE AA -> Bay', nm({ E: 'EE', A: 'AA' }), 'Bay');
eq('Ee AAt -> Bay (A dominant over At)', nm({ E: 'Ee', A: 'AAt' }), 'Bay');
eq('Ee Ata -> Seal Brown', nm({ E: 'Ee', A: 'Ata' }), 'Seal Brown');
eq('Ee AtAt -> Seal Brown', nm({ E: 'Ee', A: 'AtAt' }), 'Seal Brown');
eq('Ee aa -> Black', nm({ E: 'Ee', A: 'aa' }), 'Black');

/* ---- DILUTIONS ---- */
eq('ee CCr -> Palomino', nm({ E: 'ee', C: 'CCr' }), 'Palomino');
eq('ee CrCr -> Cremello', nm({ E: 'ee', C: 'CrCr' }), 'Cremello');
eq('E- A- CCr -> Buckskin', nm({ E: 'Ee', A: 'Aa', C: 'CCr' }), 'Buckskin');
eq('E- A- CrCr -> Perlino', nm({ E: 'Ee', A: 'Aa', C: 'CrCr' }), 'Perlino');
eq('E- aa CCr -> Smoky Black', nm({ E: 'Ee', A: 'aa', C: 'CCr' }), 'Smoky Black');
eq('E- aa CrCr -> Smoky Cream', nm({ E: 'Ee', A: 'aa', C: 'CrCr' }), 'Smoky Cream');
eq('ee prlprl -> Apricot Pearl', nm({ E: 'ee', C: 'prlprl' }), 'Apricot Pearl');
eq('E- aa prlprl -> Black Pearl', nm({ E: 'Ee', A: 'aa', C: 'prlprl' }), 'Black Pearl');
eq('E- A- prlprl -> Bay Pearl', nm({ E: 'Ee', A: 'Aa', C: 'prlprl' }), 'Bay Pearl');
eq('ee Crprl -> Palomino Pearl', nm({ E: 'ee', C: 'Crprl' }), 'Palomino Pearl');
eq('E- A- Crprl -> Buckskin Pearl', nm({ E: 'Ee', A: 'Aa', C: 'Crprl' }), 'Buckskin Pearl');
eq('C-prl (pearl carrier) is invisible', nm({ E: 'Ee', A: 'Aa', C: 'Cprl' }), 'Bay');

eq('ee nCh -> Gold Champagne', nm({ E: 'ee', Ch: 'nCh' }), 'Gold Champagne');
eq('E- A- nCh -> Amber Champagne', nm({ E: 'Ee', A: 'Aa', Ch: 'nCh' }), 'Amber Champagne');
eq('E- At_ nCh -> Sable Champagne', nm({ E: 'Ee', A: 'Ata', Ch: 'nCh' }), 'Sable Champagne');
eq('E- aa nCh -> Classic Champagne', nm({ E: 'Ee', A: 'aa', Ch: 'nCh' }), 'Classic Champagne');

eq('ee Dd -> Red Dun', nm({ E: 'ee', D: 'Dd' }), 'Red Dun');
eq('E- A- Dd -> Bay Dun', nm({ E: 'Ee', A: 'Aa', D: 'Dd' }), 'Bay Dun');
eq('E- Aᵗ Dd -> Seal Dun', nm({ E: 'Ee', A: 'Ata', D: 'Dd' }), 'Seal Dun');
eq('E- aa Dd -> Grullo', nm({ E: 'Ee', A: 'aa', D: 'Dd' }), 'Grullo');
ok('Dun shows primitive markings', !!GG.resolve(g({ E: 'Ee', A: 'aa', D: 'Dd' })).traits.primitiveMarkings);
eq('DD not stronger than Dd', nm({ E: 'Ee', A: 'aa', D: 'DD' }), 'Grullo');

eq('E- aa nZ -> Silver Dapple', nm({ E: 'Ee', A: 'aa', Z: 'nZ' }), 'Silver Dapple');
eq('E- A- nZ -> Silver Bay', nm({ E: 'Ee', A: 'Aa', Z: 'nZ' }), 'Silver Bay');
eq('ee nZ -> Chestnut (silver carrier, no visible change)', nm({ E: 'ee', Z: 'nZ' }), 'Chestnut');

/* ---- SHADING ---- */
eq('ee ff -> Flaxen Chestnut', nm({ E: 'ee', F: 'ff' }), 'Flaxen Chestnut');
eq('E- ff -> carrier only (Bay)', nm({ E: 'Ee', A: 'Aa', F: 'ff' }), 'Bay');
eq('ee nPg -> Mealy Chestnut', nm({ E: 'ee', Pg: 'nPg' }), 'Mealy Chestnut');
eq('E- A- nPg -> Mealy Bay', nm({ E: 'Ee', A: 'Aa', Pg: 'nPg' }), 'Mealy Bay');
eq('pangare on black -> no effect', nm({ E: 'Ee', A: 'aa', Pg: 'nPg' }), 'Black');
eq('sooty on black -> no effect', nm({ E: 'Ee', A: 'aa', Sty: 'nSty' }), 'Black');
eq('sooty on seal brown -> no effect', nm({ E: 'Ee', A: 'Ata', Sty: 'nSty' }), 'Seal Brown');
eq('sooty on bay -> Sooty Bay (prefix)', nm({ E: 'Ee', A: 'Aa', Sty: 'nSty' }), 'Sooty Bay');
eq('sooty on palomino -> Sooty Palomino', nm({ E: 'ee', C: 'CCr', Sty: 'nSty' }), 'Sooty Palomino');
/* §8.2 shading swatches applied on a plain base */
eq('Sooty Bay uses the §8.2 swatch', GG.resolve(g({ E: 'Ee', A: 'Aa', Sty: 'nSty' })).swatch, '#5a2e18');
eq('Flaxen Chestnut uses the §8.2 swatch', GG.resolve(g({ E: 'ee', F: 'ff' })).swatch, '#a8572b');
eq('Mealy Chestnut uses the §8.2 swatch', GG.resolve(g({ E: 'ee', Pg: 'nPg' })).swatch, '#a85a30');
eq('Sooty Palomino uses the §8.2 cream swatch', GG.resolve(g({ E: 'ee', C: 'CCr', Sty: 'nSty' })).swatch, '#b89047');
(function () {
  var gal = GG.enumerateColors(), names = gal.map(function (e) { return e.name; });
  ok('Sooty Palomino in gallery', names.indexOf('Sooty Palomino') >= 0);
  ok('Sooty Buckskin in gallery', names.indexOf('Sooty Buckskin') >= 0);
  ok('Flaxen Liver Chestnut in gallery', names.indexOf('Flaxen Liver Chestnut') >= 0);
})();

/* ---- WHITE / KIT / GRAY ---- */
contains('ee nO -> Overo', nm({ E: 'ee', O: 'nO' }), 'Overo');
ok('OO -> lethal white', GG.resolve(g({ E: 'ee', O: 'OO' })).flags.isLethal);
contains('ee nSW1 -> minimal splash', nm({ E: 'ee', SW1: 'nSW1' }), 'minimal');
contains('ee SW1SW1 -> Splashed White', nm({ E: 'ee', SW1: 'SW1SW1' }), 'Splashed White');
contains('ee nRb -> Rabicano', nm({ E: 'ee', Rb: 'nRb' }), 'Rabicano');
contains('ee nT -> Tobiano', nm({ E: 'ee', T: 'nT' }), 'Tobiano');
contains('ee TT -> Tobiano ink spots', nm({ E: 'ee', T: 'TT' }), 'ink spots');
contains('ee nSb -> Sabino', nm({ E: 'ee', Sb: 'nSb' }), 'Sabino');
(function () {
  var r = GG.resolve(g({ E: 'ee', Sb: 'SbSb' }));
  contains('ee SbSb -> near-white', r.displayName, 'Sabino White');
  eq('ee SbSb -> brown eyes', r.traits.eyes, 'brown');
})();
(function () {
  var r = GG.resolve(g({ E: 'Ee', A: 'Aa', W: 'Ww' }));
  eq('Ww -> Dominant White', r.displayName, 'Dominant White');
  eq('Ww underlying reported', r.underlyingName, 'Bay');
  ok('Ww masked flag', r.flags.isWhiteMasked);
})();
(function () {
  var r = GG.resolve(g({ E: 'Ee', A: 'Aa', G: 'Gg' }));
  eq('Gg -> Gray', r.displayName, 'Gray');
  ok('Gg graying flag', r.flags.isGraying);
  eq('Gg underlying Bay', r.underlyingName, 'Bay');
})();
(function () {
  var r = GG.resolve(g({ E: 'ee', C: 'CrCr', G: 'Gg' }));
  eq('gray over cremello underlying', r.underlyingName, 'Cremello');
})();

/* ---- LEOPARD COMPLEX ---- */
eq('ee Lplp -> Varnish Roan', nm({ E: 'ee', Lp: 'Lplp' }), 'Varnish Roan');
eq('ee Lplp PATN1patn1 -> Near-Leopard', nm({ E: 'ee', Lp: 'Lplp', PATN1: 'PATN1patn1' }), 'Near-Leopard');
eq('ee Lplp PATN1PATN1 -> Leopard', nm({ E: 'ee', Lp: 'Lplp', PATN1: 'PATN1PATN1' }), 'Leopard');
eq('ee LpLp PATN1patn1 -> Fewspot', nm({ E: 'ee', Lp: 'LpLp', PATN1: 'PATN1patn1' }), 'Fewspot');
eq('ee LpLp PATN1PATN1 -> Fewspot', nm({ E: 'ee', Lp: 'LpLp', PATN1: 'PATN1PATN1' }), 'Fewspot');
eq('ee Lplp PATN2patn2 -> Spotted Blanket', nm({ E: 'ee', Lp: 'Lplp', PATN2: 'PATN2patn2' }), 'Spotted Blanket');
eq('ee LpLp PATN2patn2 -> Blanket', nm({ E: 'ee', Lp: 'LpLp', PATN2: 'PATN2patn2' }), 'Blanket');
ok('leopard sclera is white', GG.resolve(g({ E: 'ee', Lp: 'Lplp' })).traits.sclera === 'white');
(function () {
  var r = GG.resolve(g({ E: 'Ee', A: 'aa', Lp: 'Lplp', PATN2: 'PATN2patn2' }));
  contains('black appaloosa keeps base', r.displayName, 'Black');
  contains('black appaloosa pattern', r.displayName, 'Spotted Blanket');
  ok('bronze note present', r.notes.join(' ').toLowerCase().indexOf('bronze') >= 0);
})();
ok('PATN1 hidden without Lp', nm({ E: 'ee', PATN1: 'PATN1PATN1' }) === 'Chestnut');

/* ---- BREEDING REGRESSION ---- */
(function () {
  var A = g({ E: 'Ee', A: 'Aa', C: 'CCr' });  // Buckskin Ee Aa C Cr
  var B = g({ E: 'ee', A: 'Aa', C: 'CC' });   // Chestnut ee Aa C C
  var res = GG.punnett(A, B);
  var m = {}; res.distribution.forEach(function (d) { m[d.name] = d.p; });
  approx('Palomino = 1/4', m['Palomino'], 0.25);
  approx('Chestnut = 1/4', m['Chestnut'], 0.25);
  approx('Buckskin = 3/16', m['Buckskin'], 3 / 16);
  approx('Bay = 3/16', m['Bay'], 3 / 16);
  approx('Black = 1/16', m['Black'], 1 / 16);
  approx('Smoky Black = 1/16', m['Smoky Black'], 1 / 16);
  ok('no lethal loss in this cross', res.lethalFraction === 0);
  approx('distribution sums to 1', res.distribution.reduce(function (s, d) { return s + d.p; }, 0), 1);
})();

/* ---- UT W891 ERRATUM (Example 2): correct Mendelian math ---- */
(function () {
  var res = GG.punnett(g({ E: 'Ee', A: 'aa' }), g({ E: 'Ee', A: 'Aa' }));
  var m = {}; res.distribution.forEach(function (d) { m[d.name] = d.p; });
  approx('Bay = 0.375 (not 0.25)', m['Bay'], 0.375);
  approx('Black = 0.375 (not 0.50)', m['Black'], 0.375);
  approx('Chestnut = 0.25', m['Chestnut'], 0.25);
})();

/* ---- BREEDING: lethal aggregation (frame x frame) ---- */
(function () {
  var res = GG.punnett(g({ E: 'ee', O: 'nO' }), g({ E: 'ee', O: 'nO' }));
  approx('frame x frame -> 1/4 lethal loss', res.lethalFraction, 0.25);
  ok('lethal reason recorded', Object.keys(res.lethalReasons).length > 0);
})();

/* ---- REVERSE / ANALYZE ---- */
(function () {
  var info = GG.analyze(g({ E: 'Ee', A: 'Aa' })); // visible bay
  eq('bay reverse: E constraint', constraintLabel(info, 'E'), 'E-');
  eq('bay reverse: A constraint', constraintLabel(info, 'A'), 'A-');
  eq('bay reverse: W constraint', constraintLabel(info, 'W'), 'ww');
  eq('bay reverse: G constraint', constraintLabel(info, 'G'), 'gg');
  eq('bay reverse: F is free', constraintLabel(info, 'F'), 'any');
  // 324 × 3 since the §7u Mushroom drop (one more free 3-genotype locus in the space).
  eq('bay reverse: distinct genotype count', info.count, 972);
  function constraintLabel(info, key) {
    var c = info.constraints.filter(function (x) { return x.key === key; })[0];
    return c ? c.label : null;
  }
})();
(function () {
  var rl = GG.reverseLookup(g({ E: 'ee' }), { cap: 50 }); // chestnut
  ok('chestnut reverse count > 1', rl.count > 1);
  ok('chestnut reverse sample present', rl.sample.length > 0);
})();

/* ---- GALLERY ENUMERATION ---- */
(function () {
  var gal = GG.enumerateColors();
  ok('gallery has > 40 entries', gal.length > 40);
  var slugs = {}; var dup = false;
  gal.forEach(function (e) { if (slugs[e.slug]) { dup = true; } slugs[e.slug] = true; });
  ok('all gallery slugs unique', !dup);
  ok('Palomino present', gal.some(function (e) { return e.name === 'Palomino'; }));
  ok('Silver Bay present', gal.some(function (e) { return e.name === 'Silver Bay'; }));
  ok('every entry resolves with a swatch', gal.every(function (e) { return /^#/.test(e.swatch); }));
})();

/* ---- MISC ---- */
eq('OFF (all recessive) -> Chestnut', GG.resolve(OFF).displayName, 'Chestnut');
eq('startGenotype -> Chestnut (the true default, no modifiers)', GG.resolve(GG.defaultGenotype()).displayName, 'Chestnut');
ok('writtenGenotype is a string', typeof GG.writtenGenotype(OFF) === 'string');
ok('prettyGenotype superscripts cream', GG.prettyGenotype('C', 'CrCr').indexOf('ᶜʳ') >= 0);

/* ---- RECOGNIZED STACKED DILUTIONS ---- */
eq('ee CCr Dd -> Dunalino', nm({ E: 'ee', C: 'CCr', D: 'Dd' }), 'Dunalino');
eq('E- A- CCr Dd -> Dunskin', nm({ E: 'Ee', A: 'Aa', C: 'CCr', D: 'Dd' }), 'Dunskin');
eq('E- aa CCr Dd -> Smoky Grullo', nm({ E: 'Ee', A: 'aa', C: 'CCr', D: 'Dd' }), 'Smoky Grullo');
eq('E- aa nZ Dd -> Silver Grullo', nm({ E: 'Ee', A: 'aa', Z: 'nZ', D: 'Dd' }), 'Silver Grullo');
eq('E- A- nZ Dd -> Silver Bay Dun', nm({ E: 'Ee', A: 'Aa', Z: 'nZ', D: 'Dd' }), 'Silver Bay Dun');
eq('ee nCh CCr -> Gold Cream Champagne', nm({ E: 'ee', Ch: 'nCh', C: 'CCr' }), 'Gold Cream Champagne');
eq('E- A- nCh CCr -> Amber Cream Champagne', nm({ E: 'Ee', A: 'Aa', Ch: 'nCh', C: 'CCr' }), 'Amber Cream Champagne');
eq('E- aa nCh CCr -> Classic Cream Champagne', nm({ E: 'Ee', A: 'aa', Ch: 'nCh', C: 'CCr' }), 'Classic Cream Champagne');
(function () {
  var gal = GG.enumerateColors();
  ok('Dunalino in gallery', gal.some(function (e) { return e.name === 'Dunalino'; }));
  ok('Silver Grullo in gallery', gal.some(function (e) { return e.name === 'Silver Grullo'; }));
  ok('Gold Cream Champagne in gallery', gal.some(function (e) { return e.name === 'Gold Cream Champagne'; }));
})();

/* ---- GENOTYPE STRING: format + tolerant parse + lossless round-trip ---- */
(function () {
  // 'MyMy' joined after silver with the §7u Mushroom drop.
  eq('canonical OFF string', GG.formatGenotype(OFF),
    'ww/gg/ee/aa/CC/nn/dd/nn/MyMy/FF/nn/nn/rnrn/nn/nn/nn/nn/nn/lplp/patn1patn1/patn2patn2');
  var samples = [
    OFF, GG.defaultGenotype(),
    g({ E: 'Ee', A: 'Aa', C: 'CCr', Z: 'nZ', F: 'Ff', G: 'Gg' }),
    g({ E: 'ee', C: 'Crprl', Rb: 'nRb', Lp: 'Lplp', PATN1: 'PATN1patn1' }),
    GG.randomGenotype(), GG.randomGenotype(), GG.randomGenotype()
  ];
  var lossless = samples.every(function (s) {
    var str = GG.formatGenotype(s);
    var back = GG.parseGenotype(str).genotype;
    return GG.formatGenotype(back) === str && GG.resolve(back).displayName === GG.resolve(s).displayName;
  });
  ok('genotype string round-trips losslessly', lossless);
  // partial / "active genes only" shorthand -> sensible defaults
  eq('parse "CCr" -> Palomino', GG.resolve(GG.parseGenotype('CCr').genotype).displayName, 'Palomino');
  eq('parse "Ee/Aa/CCr" -> Buckskin', GG.resolve(GG.parseGenotype('Ee/Aa/CCr').genotype).displayName, 'Buckskin');
  eq('parse "ee nZ" -> Chestnut (carrier)', GG.resolve(GG.parseGenotype('ee nZ').genotype).displayName, 'Chestnut');
  eq('parse case-insensitive "nz" at Silver', GG.parseGenotype('Ee/aa/nz').genotype.Z, 'nZ');
  ok('parse round-trips the pretty written form', GG.resolve(GG.parseGenotype(GG.writtenGenotype(g({ E: 'Ee', A: 'Aa', Z: 'nZ' }))).genotype).displayName === 'Silver Bay');
})();

/* ---- CARRIED (hidden, heritable) ALLELES ---- */
(function () {
  function carried(over) { return GG.carriedAlleles(g(over)); }
  function findLocus(list, loc) { return list.filter(function (c) { return c.locus === loc; })[0]; }
  var bay = carried({ E: 'Ee', A: 'Aa' });
  ok('Ee bay reports red factor e carried', !!findLocus(bay, 'Extension') && findLocus(bay, 'Extension').alleles.indexOf('e') >= 0);
  var smoky = carried({ E: 'Ee', A: 'aa', C: 'CCr' });
  var sc = findLocus(smoky, 'Cream / Pearl');
  ok('smoky black reports cream carried/near-invisible', !!sc && /barely|unseen/i.test(sc.note));
  var pearlCarrier = carried({ E: 'Ee', A: 'Aa', C: 'Cprl' });
  var pc = findLocus(pearlCarrier, 'Cream / Pearl');
  ok('pearl carrier (C prl) reported', !!pc && /pearl carrier/i.test(pc.note));
  // graying horse: its underlying coat (which greys out) is still heritable
  ok('graying horse reports its underlying coat as carried/heritable', carried({ E: 'Ee', A: 'Aa', C: 'CCr', G: 'Gg' }).some(function (c) { return c.locus === 'Coat (greying)'; }));
})();

/* ---- GENETIC-HEALTH FLAGS ---- */
(function () {
  function locs(over) { return GG.healthFlags(g(over)).map(function (h) { return h.locus; }); }
  ok('Silver -> MCOA health note', locs({ E: 'Ee', A: 'aa', Z: 'nZ' }).indexOf('Silver') >= 0);
  ok('Frame -> OLWS health note', locs({ E: 'ee', O: 'nO' }).indexOf('Overo') >= 0);
  ok('Dominant White -> WW-lethal health note', locs({ E: 'ee', W: 'Ww' }).indexOf('Dominant White') >= 0);
  ok('Splashed White -> SW1 health note', locs({ E: 'ee', SW1: 'SW1SW1' }).indexOf('Splashed White') >= 0);
})();

/* ---- BREEDING: carrier summary + per-colour genotype breakdown ---- */
(function () {
  var res = GG.punnett(g({ E: 'Ee', A: 'Aa', C: 'CCr' }), g({ E: 'ee', A: 'Aa', C: 'CC' }));
  ok('breeding returns a carrier summary', Array.isArray(res.carriers) && res.carriers.length > 0);
  var buck = res.distribution.filter(function (d) { return d.name === 'Buckskin'; })[0];
  ok('each colour carries a genotype breakdown', !!buck && Array.isArray(buck.genotypes) && buck.genotypes.length > 0);
  var sumLive = res.distribution.reduce(function (s, d) { return s + d.pLive; }, 0);
  approx('live distribution sums to 1', sumLive, 1, 1e-9);
})();

/* ---- GRAY as its own stage set ---- */
(function () {
  var grays = GG.enumerateColors().filter(function (e) { return e.groups.indexOf('gray') >= 0; });
  eq('six gray stages in the field guide (graying-foal removed)', grays.length, 6);
  ok('gray stages carry their own swatch', grays.every(function (e) { return /^#/.test(e.swatch); }));
})();

/* ---- BREEDING SCALABILITY: never-refuses + exact factored (Track A, Incr 1 & 2) ---- */
(function () {
  // never refuses: an all-heterozygous cross (~387M combos, ~120k distinct colors)
  // answers — too many distinct outcomes for exact, so it samples.
  var het = {}; GG.LOCI.forEach(function (l) { het[l.key] = l.genotypes[1] || l.genotypes[0]; });
  var res = GG.punnett(het, het);
  ok('huge cross does not refuse (no tooLarge)', !res.tooLarge);
  ok('huge cross answers exactly via the factored path', res.method === 'factored' && res.approximate === false);
  ok('huge cross returns a real distribution', res.distribution.length > 0);
  approx('huge-cross live distribution sums to 1', res.distribution.reduce(function (s, d) { return s + d.pLive; }, 0), 1, 1e-9);
  ok('huge cross reports projected >> combinations', res.projected > res.combinations);

  // a cross too big for exact but bounded once factored -> exact factored path
  var bigP = g({ E: 'Ee', A: 'Aa', C: 'CCr', Rn: 'Rnrn', Rb: 'nRb', T: 'nT', Sb: 'nSb', SW1: 'nSW1', O: 'nO', Lp: 'Lplp', PATN1: 'PATN1patn1', PATN2: 'PATN2patn2' });
  var bf = GG.punnett(bigP, bigP);
  ok('large-but-bounded cross uses the exact factored path', bf.method === 'factored' && bf.approximate === false);
  ok('factored cross exceeded the exact cap', bf.projected > 250000);
  approx('factored distribution sums to 1', bf.distribution.reduce(function (s, d) { return s + d.pLive; }, 0), 1, 1e-9);

  // small crosses stay on the exact product
  var ex = GG.punnett(g({ E: 'Ee', A: 'Aa', C: 'CCr' }), g({ E: 'ee', A: 'Aa', C: 'CC' }));
  eq('small cross uses exact path', ex.method, 'exact');
  ok('exact path not flagged approximate', ex.approximate === false);

  // DIFFERENTIAL (the linchpin): forced-factored == exact on distribution, lethal & carriers
  function diff(desc, a, b) {
    var A = GG.punnett(a, b, { force: 'exact' }), F = GG.punnett(a, b, { force: 'factored' });
    ok(desc + ': factored path used', !!F && F.method === 'factored');
    var ma = {}, mf = {}, names = {};
    A.distribution.forEach(function (d) { ma[d.name] = d.pLive; names[d.name] = 1; });
    F.distribution.forEach(function (d) { mf[d.name] = d.pLive; names[d.name] = 1; });
    var dd = 0; Object.keys(names).forEach(function (n) { dd = Math.max(dd, Math.abs((ma[n] || 0) - (mf[n] || 0))); });
    ok(desc + ': distribution == exact (maxΔ=' + dd.toExponential(1) + ')', dd < 1e-9);
    ok(desc + ': lethalFraction == exact', Math.abs(A.lethalFraction - F.lethalFraction) < 1e-9);
    var ca = {}, cf = {}, cids = {};
    A.carriers.forEach(function (c) { ca[c.id] = c.pLive; cids[c.id] = 1; });
    F.carriers.forEach(function (c) { cf[c.id] = c.pLive; cids[c.id] = 1; });
    var cd = 0; Object.keys(cids).forEach(function (i) { cd = Math.max(cd, Math.abs((ca[i] || 0) - (cf[i] || 0))); });
    ok(desc + ': carriers == exact (maxΔ=' + cd.toExponential(1) + ')', cd < 1e-9);
  }
  diff('regression buckskin×chestnut', g({ E: 'Ee', A: 'Aa', C: 'CCr' }), g({ E: 'ee', A: 'Aa', C: 'CC' }));
  diff('pearl + cream', g({ E: 'Ee', A: 'Aa', C: 'Cprl' }), g({ E: 'ee', A: 'aa', C: 'Crprl' }));
  diff('frame×frame (OO lethal)', g({ E: 'ee', O: 'nO' }), g({ E: 'ee', O: 'nO' }));
  diff('dom white × Ww (WW lethal)', g({ E: 'Ee', A: 'Aa', W: 'Ww' }), g({ E: 'ee', A: 'aa', W: 'Ww' }));
  diff('gray × gray', g({ E: 'Ee', A: 'Aa', G: 'Gg' }), g({ E: 'ee', A: 'aa', G: 'Gg' }));
  diff('sabino × sabino (SbSb white)', g({ E: 'ee', Sb: 'nSb' }), g({ E: 'Ee', A: 'Aa', Sb: 'nSb' }));
  diff('silver dun', g({ E: 'Ee', A: 'aa', Z: 'nZ', D: 'Dd' }), g({ E: 'Ee', A: 'Aa', Z: 'nZ', D: 'Dd' }));
  diff('leopard mix', g({ E: 'Ee', A: 'aa', Lp: 'Lplp', PATN1: 'PATN1patn1' }), g({ E: 'ee', Lp: 'Lplp', PATN2: 'PATN2patn2' }));
  // overlay-name coverage: roan (plain-base replacement per base), rabicano, tobiano, splash
  diff('strawberry roan', g({ E: 'ee', Rn: 'Rnrn' }), g({ E: 'ee', Rn: 'Rnrn' }));
  diff('blue roan', g({ E: 'Ee', A: 'aa', Rn: 'Rnrn' }), g({ E: 'Ee', A: 'aa', Rn: 'Rnrn' }));
  diff('bay roan', g({ E: 'Ee', A: 'Aa', Rn: 'Rnrn' }), g({ E: 'Ee', A: 'Aa', Rn: 'Rnrn' }));
  diff('buckskin roan (tag, not replace)', g({ E: 'Ee', A: 'Aa', C: 'CCr', Rn: 'Rnrn' }), g({ E: 'ee', A: 'Aa', Rn: 'Rnrn' }));
  diff('tobiano (TT/nT/nn)', g({ E: 'ee', T: 'nT' }), g({ E: 'ee', T: 'nT' }));
  diff('splash (homo/het/none)', g({ E: 'ee', SW1: 'nSW1' }), g({ E: 'ee', SW1: 'nSW1' }));
  diff('rabicano', g({ E: 'Ee', A: 'Aa', Rb: 'nRb' }), g({ E: 'Ee', A: 'Aa', Rb: 'nRb' }));
  diff('sooty bay + roan + tobiano', g({ E: 'Ee', A: 'Aa', Sty: 'nSty', Rn: 'Rnrn', T: 'nT' }), g({ E: 'Ee', A: 'Aa', Sty: 'nSty' }));
  diff('roan + leopard on black', g({ E: 'Ee', A: 'aa', Rn: 'Rnrn', Lp: 'Lplp', PATN1: 'PATN1patn1' }), g({ E: 'Ee', A: 'aa', Lp: 'Lplp' }));
  diff('kitchen sink (mask + lethal + dilutions)',
    g({ E: 'Ee', A: 'Aa', C: 'CCr', D: 'Dd', G: 'Gg', O: 'nO', Sb: 'nSb' }),
    g({ E: 'Ee', A: 'Ata', C: 'Cprl', D: 'Dd', G: 'Gg', O: 'nO', Sb: 'nSb' }));

  // Monte-Carlo (forced) ~ exact, and deterministic
  var a = g({ E: 'Ee', A: 'Aa', C: 'CCr' }), b = g({ E: 'ee', A: 'Aa', C: 'CC' });
  var exact = GG.punnett(a, b);
  var mc = GG.punnett(a, b, { force: 'monte-carlo', sampleSize: 40000 });
  ok('forced monte-carlo path used', mc.method === 'monte-carlo' && mc.approximate === true);
  var em = {}, mm = {}; exact.distribution.forEach(function (d) { em[d.name] = d.pLive; }); mc.distribution.forEach(function (d) { mm[d.name] = d.pLive; });
  ['Palomino', 'Chestnut', 'Buckskin', 'Bay', 'Black', 'Smoky Black'].forEach(function (nmC) {
    ok('MC within 1.5% of exact for ' + nmC, Math.abs((mm[nmC] || 0) - (em[nmC] || 0)) < 0.015);
  });
  var mc2 = GG.punnett(a, b, { force: 'monte-carlo', sampleSize: 40000 });
  eq('monte-carlo is deterministic',
    JSON.stringify(mc.distribution.map(function (d) { return [d.name, d.p]; })),
    JSON.stringify(mc2.distribution.map(function (d) { return [d.name, d.p]; })));
})();

/* ---- ROLL FREQUENCIES (rarity-weighted "Roll a horse") ---- */
(function () {
  var N = 3000, gray = 0, white = 0, lethals = 0, bases = {};
  for (var i = 0; i < N; i++) {
    var r = GG.resolve(GG.randomGenotype());
    if (r.flags.isLethal) { lethals++; continue; }
    if (r.flags.isGraying) { gray++; }
    if (r.flags.isWhiteMasked) { white++; }
    if (r.baseKey) { bases[r.baseKey] = true; }
  }
  // generous bounds (true means ≈10% gray, ≈2% white) — was ~66% / ~33% when uniform
  ok('roll never produces a non-viable horse (no WW / OO)', lethals === 0);
  ok('gray stays rare in rolls (<25%, was ~66%)', gray / N < 0.25);
  ok('dominant white stays rare in rolls (<8%, was ~33%)', white / N < 0.08);
  ok('rolls are not dominated by maskers (gray+white <35%)', (gray + white) / N < 0.35);
  ok('rolls span multiple base colours', Object.keys(bases).length >= 3);
})();

/* ---- CLEANED GENOTYPE (active loci only; E & A always) ---- */
(function () {
  function clean(over) { return GG.cleanGenotype(g(over)); }
  eq('chestnut (the default) cleans to "ee aa"', clean({}), 'ee aa');
  eq('solid bay cleans to "Ee Aa"', clean({ E: 'Ee', A: 'Aa' }), 'Ee Aa');
  eq('red dun cleans to "ee aa Dd"', clean({ D: 'Dd' }), 'ee aa Dd');
  eq('black cleans to "Ee aa"', clean({ E: 'Ee' }), 'Ee aa');
  eq('defaultGenotype is the chestnut baseline', GG.cleanGenotype(GG.defaultGenotype()), 'ee aa');
  // omitted loci are default, so the cleaned string round-trips through the parser
  var bay = g({ E: 'Ee', A: 'Aa', D: 'Dd' });
  eq('cleaned genotype round-trips through parseGenotype', GG.formatGenotype(GG.parseGenotype(GG.cleanGenotype(bay)).genotype), GG.formatGenotype(bay));
})();

/* ---- COLOUR VARIATION (per-phenotype palette sampling) ---- */
(function () {
  var chest = GG.resolve(g({}));                   // Chestnut (ee aa)
  var crem = GG.resolve(g({ C: 'CrCr' }));         // Cremello (ee, double cream)
  var gray = GG.resolve(g({ G: 'Gg' }));           // graying

  // the engine picks the right axis for each phenotype
  eq('chestnut varies along hue (red <-> yellow)', GG.colorVarProfile(chest).primary, 'h');
  eq('cremello varies along saturation (pale, little room)', GG.colorVarProfile(crem).primary, 's');
  eq('graying varies along value', GG.colorVarProfile(gray).primary, 'l');

  // hex <-> hsl round-trips within 2/255 per channel
  function toRgb(h) { h = h.replace('#', ''); var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  var hsl = GG.hexToHsl('#a8572b'), rt = toRgb(GG.hslToHex(hsl.h, hsl.s, hsl.l)), src = [0xa8, 0x57, 0x2b];
  ok('hsl round-trip stays within 2/255 per channel', rt.every(function (v, i) { return Math.abs(v - src[i]) <= 2; }));

  // varySwatch: deterministic, valid, seed-sensitive
  eq('varySwatch is deterministic for a fixed seed', GG.varySwatch(chest, 7), GG.varySwatch(chest, 7));
  ok('varySwatch returns a valid hex', /^#[0-9a-f]{6}$/i.test(GG.varySwatch(chest, 7)));
  ok('different seeds give different colours', GG.varySwatch(chest, 1) !== GG.varySwatch(chest, 2));

  // every sampled chestnut stays inside the genotype's hue envelope
  var baseH = GG.hexToHsl(chest.swatch).h, prof = GG.colorVarProfile(chest), within = true;
  for (var s = 0; s < 40; s++) { if (Math.abs(GG.hexToHsl(GG.varySwatch(chest, s)).h - baseH) > prof.h + 3) { within = false; } }
  ok('every sampled chestnut stays inside the hue range', within);

  // palette: requested count, all valid, deterministic, and spans a visible spread
  var pal = GG.paletteSwatches(chest, 6);
  eq('paletteSwatches returns the requested count', pal.length, 6);
  ok('palette entries are all valid hex', pal.every(function (h) { return /^#[0-9a-f]{6}$/i.test(h); }));
  eq('paletteSwatches is deterministic', GG.paletteSwatches(chest, 6).join(','), GG.paletteSwatches(chest, 6).join(','));
  var hues = pal.map(function (h) { return GG.hexToHsl(h).h; });
  ok('chestnut palette spans a visible hue range', (Math.max.apply(null, hues) - Math.min.apply(null, hues)) > 6);
})();

/* ---- GRADIENT COLOUR (smooth, continuous, click-to-sample) ---- */
(function () {
  var chest = GG.resolve(g({}));
  function toRgb(h) { h = h.replace('#', ''); var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  var mid = toRgb(GG.gradientColorAt(chest, 0.5)), sw = toRgb(chest.swatch);
  ok('gradient midpoint t=0.5 is the representative swatch', mid.every(function (v, i) { return Math.abs(v - sw[i]) <= 2; }));
  ok('gradient endpoints are valid hex', /^#[0-9a-f]{6}$/i.test(GG.gradientColorAt(chest, 0)) && /^#[0-9a-f]{6}$/i.test(GG.gradientColorAt(chest, 1)));
  ok('gradient ends differ (a real range)', GG.gradientColorAt(chest, 0) !== GG.gradientColorAt(chest, 1));
  ok('chestnut gradient shifts hue end-to-end (red <-> yellow)', Math.abs(GG.hexToHsl(GG.gradientColorAt(chest, 0)).h - GG.hexToHsl(GG.gradientColorAt(chest, 1)).h) > 6);
  // value also shifts across the bar (not hue-only) — tone/value movement
  ok('gradient shifts value end-to-end too', Math.abs(GG.hexToHsl(GG.gradientColorAt(chest, 0)).l - GG.hexToHsl(GG.gradientColorAt(chest, 1)).l) > 2);
  var smooth = true, prev = GG.hexToHsl(GG.gradientColorAt(chest, 0));
  for (var k = 1; k <= 20; k++) { var c = GG.hexToHsl(GG.gradientColorAt(chest, k / 20)); if (Math.abs(c.l - prev.l) > 6 || Math.abs(c.h - prev.h) > 6) { smooth = false; } prev = c; }
  ok('gradient is smooth (no jumps between adjacent points)', smooth);
  eq('gradient clamps t<0 to the t=0 end', GG.gradientColorAt(chest, -0.5), GG.gradientColorAt(chest, 0));
  eq('gradient clamps t>1 to the t=1 end', GG.gradientColorAt(chest, 2), GG.gradientColorAt(chest, 1));
})();

/* ---- PRESETS (one-tap common colours) ---- */
(function () {
  var presets = (global.HORSE_DATA && global.HORSE_DATA.presets) || [];
  ok('preset list is present', presets.length >= 8);
  var expect = { Palomino: 'Palomino', Buckskin: 'Buckskin', Cremello: 'Cremello', 'Smoky Black': 'Smoky Black', 'Red Dun': 'Red Dun', Grullo: 'Grullo', 'Silver Dapple': 'Silver Dapple' };
  presets.forEach(function (p) {
    var r = GG.resolve(GG.parseGenotype(p.g).genotype);
    ok('preset "' + p.label + '" is viable', !r.flags.isLethal);
    if (expect[p.label]) { eq('preset "' + p.label + '" resolves to ' + expect[p.label], r.displayName, expect[p.label]); }
  });
})();

/* ---- TRAIT CHIP TABLE (calculator picker data integrity) ---- */
(function () {
  var chips = (global.HORSE_DATA && global.HORSE_DATA.traitChips) || [];
  ok('trait-chip table is present', chips.length >= 18);
  var bad = null;
  chips.forEach(function (t) {
    if (t.kind) { return; }   // cream / pearl share the C locus, handled specially
    var L = GG.LOCUS_BY_KEY[t.locus];
    if (!L) { bad = t.id + ': unknown locus ' + t.locus; return; }
    if (L.genotypes.indexOf(t.off) < 0) { bad = t.id + ': off token ' + t.off + ' not a ' + t.locus + ' genotype'; }
    t.on.forEach(function (tok) { if (L.genotypes.indexOf(tok) < 0) { bad = t.id + ': on token ' + tok + ' not a ' + t.locus + ' genotype'; } });
  });
  ok('every trait-chip token is a valid genotype for its locus' + (bad ? ' — ' + bad : ''), !bad);
  var cg = GG.LOCUS_BY_KEY.C.genotypes;
  ok('cream/pearl chips map onto valid C genotypes', ['CC', 'CCr', 'CrCr', 'Cprl', 'prlprl', 'Crprl'].every(function (x) { return cg.indexOf(x) >= 0; }));
})();

/* ---- BREED A FOAL (the breeding-game core: sample one offspring) ---- */
(function () {
  // deterministic: a true-breeding cross only ever yields the same look
  var chestnut = g({ E: 'ee', A: 'aa' });
  var f1 = GG.breedFoal(chestnut, chestnut, function () { return 0.5; });
  eq('ee aa x ee aa -> a chestnut foal', f1.resolved.displayName, 'Chestnut');
  ok('breedFoal returns a full, viable genotype that resolves', f1.viable && !!f1.genotype.E && !!f1.resolved.displayName);
  eq('breedFoal is deterministic for a fixed rand fn',
    GG.formatGenotype(GG.breedFoal(g({ E: 'Ee', A: 'Aa' }), g({ E: 'Ee', A: 'Aa' }), function () { return 0.1; }).genotype),
    GG.formatGenotype(GG.breedFoal(g({ E: 'Ee', A: 'Aa' }), g({ E: 'Ee', A: 'Aa' }), function () { return 0.1; }).genotype));

  // statistical: Ee x Ee -> ~25% chestnut (ee); Black points Aa x Aa segregate
  var N = 4000, ee = 0, blk = 0;
  for (var i = 0; i < N; i++) {
    var f = GG.breedFoal(g({ E: 'Ee', A: 'aa' }), g({ E: 'Ee', A: 'aa' }));
    if (f.resolved.baseKey === 'chestnut') { ee++; }       // ee shows as chestnut even though A=aa
    else if (f.resolved.baseKey === 'black') { blk++; }
  }
  ok('Ee x Ee foals are ~1/4 chestnut (got ' + (ee / N).toFixed(2) + ')', Math.abs(ee / N - 0.25) < 0.05);
  ok('Ee x Ee foals are ~3/4 black-based (got ' + (blk / N).toFixed(2) + ')', Math.abs(blk / N - 0.75) < 0.05);

  // lethal stakes: nO x nO (frame x frame) -> ~25% OO = non-viable OLWS foals
  var L = 4000, lost = 0, olws = 0;
  for (var j = 0; j < L; j++) {
    var ff = GG.breedFoal(g({ E: 'Ee', A: 'Aa', O: 'nO' }), g({ E: 'Ee', A: 'Aa', O: 'nO' }));
    if (!ff.viable) { lost++; if (ff.lethalReason) { olws++; } }
  }
  ok('frame x frame loses ~1/4 of foals to OLWS (got ' + (lost / L).toFixed(2) + ')', Math.abs(lost / L - 0.25) < 0.05);
  ok('every lost frame foal reports a lethal reason', lost > 0 && olws === lost);

  // a non-carrier cross never loses a foal
  var safe = 0;
  for (var k = 0; k < 1500; k++) { if (!GG.breedFoal(chestnut, chestnut).viable) { safe++; } }
  ok('ee aa x ee aa never loses a foal', safe === 0);
})();

/* ---- FIELD STABLE (the breeding game: state + persistence) ---- */
(function () {
  var s = HG.reset();
  eq('starter stable has 2 specimens', s.stable.length, 2);
  var mares = s.stable.filter(function (h) { return h.sex === 'mare'; });
  var stals = s.stable.filter(function (h) { return h.sex === 'stallion'; });
  ok('starter is one mare + one stallion', mares.length === 1 && stals.length === 1);
  ok('founders are documented in the dex', Object.keys(s.dex).length >= 2);
  var mare = mares[0], stal = stals[0];
  ok('canBreed stallion x mare is ok', HG.canBreed(stal.id, mare.id).ok);
  ok('canBreed mare x mare is rejected', !HG.canBreed(mare.id, mare.id).ok);
  ok('canBreed a horse with itself is rejected', !HG.canBreed(stal.id, stal.id).ok);

  var before = HG.state().stable.length;
  var r = HG.breed(stal.id, mare.id, function () { return 0.3; });   // cream cross → always viable
  ok('breed produces a viable foal', r.ok && r.viable && !!r.foal);
  eq('the foal joins the stable', HG.state().stable.length, before + 1);
  ok('the foal is documented', r.foal.documented && HG.isDocumented(HG.colorSlug(r.foal)));
  ok('the foal is gen 2', r.foal.gen === 2);
  ok('breed persists across a reload', HG.reload().stable.length === before + 1);

  var p = HG.dexProgress();
  ok('dex progress is sane (documented within [2, total])', p.documented >= 2 && p.documented <= p.total && p.total > 60);

  // release shrinks the stable but keeps the documented colour
  var foalSlug = HG.colorSlug(r.foal);
  HG.release(r.foal.id);
  ok('release removes the foal', HG.state().stable.length === before);
  ok('released colour stays documented', HG.isDocumented(foalSlug));

  // a determined frame x frame eventually loses a foal (OLWS) via the game layer
  var st2 = HG.reset();
  st2.stable[0].genotype = Object.assign(GG.offGenotype(), { E: 'Ee', A: 'Aa', O: 'nO' });   // stallion
  st2.stable[1].genotype = Object.assign(GG.offGenotype(), { E: 'Ee', A: 'Aa', O: 'nO' });   // mare
  var sid = st2.stable.filter(function (h) { return h.sex === 'stallion'; })[0].id;
  var did = st2.stable.filter(function (h) { return h.sex === 'mare'; })[0].id;
  var losses = 0, births = 0;
  for (var i = 0; i < 60; i++) { var rr = HG.breed(sid, did); if (rr.viable) { births++; } else { losses++; } }
  ok('frame x frame yields both births and OLWS losses', births > 0 && losses > 0);

  // field survey: encounter a viable wild horse; capture grows the stable, while
  // document-only fills the dex without taking the horse.
  HG.reset();
  var enc = HG.survey().encounter;
  ok('survey returns a viable wild horse', !!enc.spec && !enc.resolved.flags.isLethal);
  var capBefore = HG.state().stable.length;
  HG.capture(enc.spec);
  ok('capture adds the wild horse to the stable', HG.state().stable.length === capBefore + 1);
  ok('a captured horse is documented', HG.isDocumented(HG.colorSlug(enc.spec)));
  var enc2 = HG.survey().encounter, stableBefore = HG.state().stable.length;
  HG.documentWild(enc2.spec);
  ok('document-only does not add to the stable', HG.state().stable.length === stableBefore);
  ok('document-only still records the colour', HG.isDocumented(HG.colorSlug(enc2.spec)));

  // hidden carriers: untested → unknown; a genetic test reveals; a recessive foal outs the parents
  HG.reset();
  var s3 = HG.state();
  s3.stable.forEach(function (h) { h.genotype = Object.assign(GG.offGenotype(), { E: 'Ee', A: 'Aa' }); h.known = {}; h.tested = false; });   // both bay carriers of e + a
  var sid3 = s3.stable.filter(function (h) { return h.sex === 'stallion'; })[0].id;
  var did3 = s3.stable.filter(function (h) { return h.sex === 'mare'; })[0].id;
  ok('a bay carries hidden alleles', HG.carriers(HG.byId(sid3)).length > 0);
  ok('an untested carrier is not fully known', !HG.fullyKnown(HG.byId(sid3)));
  HG.testHorse(sid3);
  ok('a genetic test makes a horse fully known', HG.fullyKnown(HG.byId(sid3)));
  for (var b = 0; b < 60; b++) { HG.breed(sid3, did3); }   // a chestnut (ee) foal will appear
  ok('a chestnut foal outs the dam as a red-factor carrier', !!(HG.byId(did3).known && HG.byId(did3).known.Extension));

  // economy: grants, Institute requests, test cost
  var s4 = HG.reset();
  ok('starts with research grants', s4.grants > 0);
  ok('starts with three Institute requests', s4.requests.length === 3);
  ok('requests target undocumented colours (goals)', s4.requests.every(function (r) { return !s4.dex[r.slug]; }));
  var sire4 = s4.stable.filter(function (h) { return h.sex === 'stallion'; })[0];
  var dam4 = s4.stable.filter(function (h) { return h.sex === 'mare'; })[0];
  var g0 = HG.state().grants, gotNew = false;
  for (var k4 = 0; k4 < 40 && !gotNew; k4++) { var r4 = HG.breed(sire4.id, dam4.id); if (r4.viable && r4.newDex) { gotNew = true; } }
  ok('documenting a new colour pays a grant', gotNew && HG.state().grants > g0);
  var untested = HG.state().stable.filter(function (h) { return !HG.fullyKnown(h); })[0];
  var preG = HG.state().grants, tr = HG.testHorse(untested.id);
  ok('a genetic test succeeds and deducts its cost', tr.ok && HG.state().grants === preG - HG.testCost);
  // fulfil a request the stable can already satisfy (Bracken is a Buckskin)
  HG.state().requests[0] = { id: 'rqX', slug: 'buckskin', name: 'Buckskin', swatch: '#c79a52', reward: 14 };
  var gBefore = HG.state().grants, fr = HG.fulfillRequest('rqX');
  ok('fulfilling a request pays its reward', fr.ok && HG.state().grants === gBefore + 14);
  ok('a fulfilled request is replaced (still three active)', HG.state().requests.length === 3);

  // Phase 4: lineage / inbreeding coefficient (kinship)
  HG.reset();
  var stal0 = HG.state().stable.filter(function (h) { return h.sex === 'stallion'; })[0];
  var mare0 = HG.state().stable.filter(function (h) { return h.sex === 'mare'; })[0];
  ok('unrelated founders have inbreeding 0', HG.inbreeding(stal0.id, mare0.id) === 0);
  var sibs = [];
  for (var si = 0; si < 40 && sibs.length < 2; si++) {
    var fr = HG.breed(stal0.id, mare0.id);
    if (fr.viable && !sibs.some(function (x) { return x.sex === fr.foal.sex; })) { sibs.push(fr.foal); }
  }
  if (sibs.length === 2) { approx('full siblings: inbreeding coefficient ≈ 0.25', HG.inbreeding(sibs[0].id, sibs[1].id), 0.25, 1e-9); }
  approx('parent x offspring: inbreeding ≈ 0.25', HG.inbreeding(stal0.id, sibs[0].id), 0.25, 1e-9);

  // Phase 4: regions + paid expeditions
  HG.reset();
  var gPre = HG.state().grants, ex = HG.survey('cream');
  ok('a paid expedition succeeds and deducts its cost', ex.ok && HG.state().grants === gPre - HG.regionById('cream').cost);
  ok('home range survey is always free', HG.survey('home').ok);
  HG.state().grants = 0;
  ok('cannot afford an expedition with no grants', !HG.survey('spotted').ok);

  // Phase 5: grey progression over seasons
  HG.reset();
  var sg = HG.state();
  sg.stable[0].genotype = Object.assign(GG.offGenotype(), { E: 'Ee', A: 'Aa', G: 'Gg' });   // a greying stallion
  sg.stable[0].born = sg.season;
  var gSid = sg.stable[0].id, gDid = sg.stable[1].id;
  ok('a fresh grey is not yet staged', HG.grayStageSlug(HG.byId(gSid)) === null);
  HG.breed(gSid, gDid);
  ok('after a season the grey reaches rose-gray', HG.grayStageSlug(HG.byId(gSid)) === 'rose-gray');
  ok('aging documented the rose-gray plate', HG.isDocumented('rose-gray'));
  for (var ag = 0; ag < 4; ag++) { HG.breed(gSid, gDid); }
  ok('older greys reach later stages', /steel|dapple|light|fleabitten/.test(HG.grayStageSlug(HG.byId(gSid)) || ''));

  // Phase 5: save-code (export / import) round-trip
  HG.reset();
  var hs = HG.state(); HG.breed(hs.stable.filter(function (h) { return h.sex === 'stallion'; })[0].id, hs.stable.filter(function (h) { return h.sex === 'mare'; })[0].id);
  var sizeBefore = HG.state().stable.length, code = HG.exportCode();
  ok('exportCode produces a non-empty string', typeof code === 'string' && code.length > 0);
  HG.reset();
  ok('reset shrinks the stable back to the founders', HG.state().stable.length === 2);
  ok('importCode restores the saved stable', HG.importCode(code).ok && HG.reload().stable.length === sizeBefore);
  ok('a garbage code is rejected', !HG.importCode('not-a-code').ok);

  HG.reset();
})();

/* ---- REPORT ---- */
console.log('\n=== Equine genetics engine tests ===');
if (fails.length) {
  console.log('\nFAILURES:\n');
  fails.forEach(function (f, i) { console.log((i + 1) + '. ' + f + '\n'); });
}
console.log('passed: ' + pass + '   failed: ' + fail + '   total: ' + (pass + fail));
process.exit(fail ? 1 : 0);
