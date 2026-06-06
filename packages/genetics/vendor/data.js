/* ==========================================================================
   data.js  —  Equine Coat Color Genetics Reference Tool
   Authoritative data layer. Load as a plain global (no modules / no build):
       <script src="js/data.js"></script>
   Everything else (genetics.js, ui.js) reads from window.HORSE_DATA.

   Sources merged in this model:
     - UT Institute of Agriculture, "Equine Genetics: Basic Coat Color
       Inheritance" (W 891)  — base 8 loci.
     - MellodicResonance's "Guide to Horse Colors" — expanded loci
       (seal brown, pearl, silver, flaxen, pangare, sooty, gray variants,
       KIT / white-spotting genes, rabicano, leopard complex).

   NOTE: This is a STYLIZED model for artists. It follows the guides'
   conventions even where they simplify real-world genetics
   (cream + pearl modeled as one locus; agouti dominance A > At > a).

   Notation in displayed genotypes:
     "-"  = wildcard ("any second allele"), e.g. E- = EE or Ee
     "n"  = the absent/recessive allele for many modifier loci
   Multi-letter / superscript tokens (Cr, At, SW1, PATN1 ...) should be
   rendered nicely in the UI (Cᶜʳ, Aᵗ, SW1, PATN1).
   ========================================================================== */

window.HORSE_DATA = {

  meta: {
    title: "Guide to Horse Colors",
    sources: [
      "University of Tennessee Institute of Agriculture — W 891, Equine Genetics: Basic Coat Color Inheritance",
      "MellodicResonance's Guide to Horse Colors"
    ],
    disclaimer:
      "A stylized educational model for teaching and reference. Follows the source guides' " +
      "conventions, which simplify some real-world genetics. Where a guide is " +
      "uncertain (e.g. sooty, flaxen), that uncertainty is preserved here.",
    // Things true of (almost) every horse unless a dilution / white gene changes it:
    defaults: {
      skin: "dark",
      hooves: "dark",
      eyes: "dark brown",
      sclera: "matches iris (NOT white) — except leopard-complex horses, which have white sclera",
      pupils: "oblong"
    }
  },

  /* ------------------------------------------------------------------ */
  /* LOCI  — grouped for the calculator's collapsible sections.          */
  /* `genotypes` are the user-selectable options (lethals excluded from  */
  /* selection but may still arise in breeding — see `lethalGenotypes`). */
  /* ------------------------------------------------------------------ */
  loci: [
    // ---- BASE -------------------------------------------------------
    {
      key: "E", name: "Extension", group: "Base", inheritance: "simple dominant",
      alleles: [
        { token: "E", label: "E", dominant: true, note: "black pigment present" },
        { token: "e", label: "e", note: "red pigment only (chestnut)" }
      ],
      genotypes: ["EE", "Ee", "ee"],
      affects: "Determines whether black pigment can appear at all. ee = chestnut.",
    },
    {
      key: "A", name: "Agouti", group: "Base", inheritance: "A > At > a",
      alleles: [
        { token: "A",  label: "A",  dominant: true, note: "bay — black restricted to points" },
        { token: "At", label: "Aᵗ", note: "seal brown — dominant to a, recessive to A" },
        { token: "a",  label: "a",  note: "uniform black" }
      ],
      genotypes: ["AA", "AAt", "Aa", "AtAt", "Ata", "aa"],
      affects: "Distributes black pigment. Only visible on E_ horses; carried silently on chestnut.",
    },

    // ---- DILUTIONS --------------------------------------------------
    {
      key: "C", name: "Cream / Pearl", group: "Dilutions",
      inheritance: "one locus, three alleles — cream incomplete-dominant, pearl recessive",
      alleles: [
        { token: "Cr",  label: "Cᶜʳ", note: "cream — incomplete dominant (1 vs 2 copies differ)" },
        { token: "prl", label: "prl", note: "pearl — recessive; needs 2 pearl OR pearl + cream to show" },
        { token: "C",   label: "C",   note: "no dilution" }
      ],
      genotypes: ["CC", "CCr", "CrCr", "Cprl", "prlprl", "Crprl"],
      affects: "Lightens the whole coat. See states: single/double cream, pearl, cream+pearl.",
    },
    {
      key: "Ch", name: "Champagne", group: "Dilutions", inheritance: "simple dominant",
      alleles: [
        { token: "Ch", label: "Ch", dominant: true, note: "champagne dilution" },
        { token: "n",  label: "n",  note: "no champagne" }
      ],
      genotypes: ["ChCh", "nCh", "nn"],
      affects: "Red→gold, black→chocolate; hazel eyes, freckled pink skin, chocolate hooves.",
    },
    {
      key: "D", name: "Dun", group: "Dilutions", inheritance: "simple dominant",
      alleles: [
        { token: "D", label: "D", dominant: true, note: "dun — dilutes body, adds primitive markings" },
        { token: "d", label: "d", note: "non-dun" }
      ],
      genotypes: ["DD", "Dd", "dd"],
      affects: "Lightens body; points + dorsal stripe / leg bars / shoulder & cobweb markings remain. DD not stronger than Dd.",
    },
    {
      key: "Z", name: "Silver", group: "Dilutions", inheritance: "simple dominant",
      alleles: [
        { token: "Z", label: "Z", dominant: true, note: "silver dapple" },
        { token: "n", label: "n", note: "no silver" }
      ],
      genotypes: ["ZZ", "nZ", "nn"],
      affects: "Black pigment only (E_). Black→chocolate w/ silver dapples, mane/tail→flaxen-white. No visible effect on chestnut (carrier). Linked to eye defects.",
    },

    // ---- SHADING (visual flags, base name unchanged) ----------------
    {
      key: "F", name: "Flaxen", group: "Shading", inheritance: "approx. recessive (mechanics debated)",
      alleles: [
        { token: "f", label: "f", note: "flaxen mane/tail" },
        { token: "F", label: "F", dominant: true, note: "no flaxen" }
      ],
      genotypes: ["FF", "Ff", "ff"],
      affects: "Chestnut only: mane & tail lighten to white/cream. Carried silently on non-chestnut.",
    },
    {
      key: "Pg", name: "Pangaré (mealy)", group: "Shading", inheritance: "simple dominant",
      alleles: [
        { token: "Pg", label: "Pg", dominant: true, note: "mealy lightening" },
        { token: "n",  label: "n",  note: "no pangaré" }
      ],
      genotypes: ["PgPg", "nPg", "nn"],
      affects: "Lightens belly, muzzle, insides of legs ('mealy'). Not on solid black.",
    },
    {
      key: "Sty", name: "Sooty", group: "Shading", inheritance: "uncertain (modeled as dominant flag)",
      alleles: [
        { token: "Sty", label: "Sty", dominant: true, note: "sooty (scattered dark hairs)" },
        { token: "n",   label: "n",   note: "no sooty" }
      ],
      genotypes: ["StySty", "nSty", "nn"],
      affects: "Dark hairs scattered over topline; irregular. No effect on black/seal brown; pronounced on buckskin/palomino. Mechanism uncertain.",
    },

    // ---- ROANING OVERLAYS ------------------------------------------
    {
      key: "Rn", name: "Roan", group: "Roaning", inheritance: "simple dominant",
      alleles: [
        { token: "Rn", label: "Rn", dominant: true, note: "classic roan" },
        { token: "rn", label: "rn", note: "non-roan" }
      ],
      genotypes: ["RnRn", "Rnrn", "rnrn"],
      affects: "~50% white intermix on body; head & lower legs solid; corn-marks over scars. Named by base.",
    },
    {
      key: "Rb", name: "Rabicano", group: "Roaning", inheritance: "simple dominant",
      alleles: [
        { token: "Rb", label: "Rb", dominant: true, note: "rabicano" },
        { token: "n",  label: "n",  note: "no rabicano" }
      ],
      genotypes: ["RbRb", "nRb", "nn"],
      affects: "White at tail base ('skunk tail') + belly/flank roaning; no corn marks.",
    },

    // ---- WHITE-SPOTTING / KIT --------------------------------------
    {
      key: "T", name: "Tobiano", group: "White Patterns", inheritance: "simple dominant (KIT)",
      alleles: [
        { token: "T", label: "T", dominant: true, note: "tobiano" },
        { token: "n", label: "n", note: "no tobiano" }
      ],
      genotypes: ["TT", "nT", "nn"],
      affects: "Smooth white crossing the spine, white legs; dark eyes unless diluted. Homozygous shows 'ink spots'.",
    },
    {
      key: "Sb", name: "Sabino", group: "White Patterns", inheritance: "incomplete dominant (KIT)",
      alleles: [
        { token: "Sb", label: "Sb", dominant: true, note: "sabino" },
        { token: "n",  label: "n",  note: "no sabino" }
      ],
      genotypes: ["SbSb", "nSb", "nn"],
      affects: "Ragged white, leg/face splash, flecking/roaning. Homozygous SbSb → white/near-white, brown eyes.",
    },
    {
      key: "O", name: "Overo", group: "White Patterns", inheritance: "simple dominant",
      alleles: [
        { token: "O", label: "O", dominant: true, note: "frame overo" },
        { token: "n", label: "n", note: "no frame" }
      ],
      genotypes: ["nO", "nn"],                 // OO excluded from selection (lethal)
      lethalGenotypes: ["OO"],
      affects: "White on body sides, not crossing spine; blue eyes where face is white. OO = lethal white (OLWS).",
    },
    {
      key: "SW1", name: "Splashed White", group: "White Patterns", inheritance: "incomplete dominant",
      alleles: [
        { token: "SW1", label: "SW1", dominant: true, note: "splashed white 1" },
        { token: "n",   label: "n",   note: "no splash" }
      ],
      genotypes: ["SW1SW1", "nSW1", "nn"],
      affects: "Het: socks/face/maybe nothing. Homozygous: bold 'splashed' white + blue eyes. (SW2/SW3 exist & are homozygous-lethal — not modeled.)",
    },
    {
      key: "W", name: "Dominant White", group: "White Patterns", inheritance: "dominant (KIT)",
      alleles: [
        { token: "W", label: "W", dominant: true, note: "dominant white" },
        { token: "w", label: "w", note: "not white" }
      ],
      genotypes: ["Ww", "ww"],                 // WW excluded (lethal)
      lethalGenotypes: ["WW"],
      epistatic: true,
      affects: "Full white: pink skin, light hooves, usually brown eyes. WW lethal — only Ww exists. Masks coat color.",
    },
    {
      key: "G", name: "Gray", group: "Gray", inheritance: "dominant, progressive",
      alleles: [
        { token: "G", label: "G", dominant: true, note: "gray (progressive)" },
        { token: "g", label: "g", note: "non-gray" }
      ],
      genotypes: ["GG", "Gg", "gg"],
      epistatic: true,
      affects: "Born underlying color, whitens with age (dapple → bloodmarked/fleabitten → white). Keeps dark skin/eyes unless cream/champagne/pearl present.",
    },

    // ---- LEOPARD COMPLEX -------------------------------------------
    {
      key: "Lp", name: "Leopard Complex", group: "Leopard Complex", inheritance: "incomplete dominant",
      alleles: [
        { token: "Lp", label: "Lp", dominant: true, note: "leopard complex (varnish roan base)" },
        { token: "lp", label: "lp", note: "no leopard complex" }
      ],
      genotypes: ["LpLp", "Lplp", "lplp"],
      affects: "Required for any appaloosa pattern. Mottled skin, striped hooves, WHITE sclera. Base form = varnish roan.",
    },
    {
      key: "PATN1", name: "Pattern-1", group: "Leopard Complex", inheritance: "incomplete dominant",
      requires: "Lp",
      alleles: [
        { token: "PATN1", label: "PATN1", dominant: true, note: "leopard / fewspot patterning" },
        { token: "patn1", label: "patn1", note: "no PATN1" }
      ],
      genotypes: ["PATN1PATN1", "PATN1patn1", "patn1patn1"],
      affects: "Needs Lp. Produces near-leopard / leopard / fewspot per Lp & PATN1 copies.",
    },
    {
      key: "PATN2", name: "Pattern-2", group: "Leopard Complex", inheritance: "dominant, recessive to PATN1",
      requires: "Lp",
      alleles: [
        { token: "PATN2", label: "PATN2", dominant: true, note: "blanket patterning" },
        { token: "patn2", label: "patn2", note: "no PATN2" }
      ],
      genotypes: ["PATN2PATN2", "PATN2patn2", "patn2patn2"],
      affects: "Needs Lp; hidden if PATN1 present. Produces blanket / spotted blanket.",
    }
  ],

  /* ------------------------------------------------------------------ */
  /* BASE COLORS                                                         */
  /* ------------------------------------------------------------------ */
  baseColors: {
    chestnut:   { name: "Chestnut",   swatch: "#9c4a25",
      cues: "Red/copper body, legs, face, mane & tail; no black points. Ranges sorrel→liver. Sun-bleaches.",
      variants: ["Sorrel", "Chestnut", "Liver Chestnut"], maneTail: "matches body (or varies)" },
    bay:        { name: "Bay",        swatch: "#6e3a1c",
      cues: "Brown/red body & face with BLACK points (mane, tail, lower legs, ear rims). Variants: bay, blood bay, wild bay.",
      variants: ["Bay", "Blood Bay", "Wild Bay"], maneTail: "black", points: "black" },
    seal_brown: { name: "Seal Brown", swatch: "#3a2417",
      cues: "Near-black body with brown on muzzle, flanks, belly, around eyes; black points.",
      maneTail: "black", points: "black" },
    black:      { name: "Black",      swatch: "#1c1a18",
      cues: "Uniform black. Jet black does not bleach; fading black sun-bleaches to brownish.",
      variants: ["Jet Black", "Fading Black"], maneTail: "black" }
  },

  /* ------------------------------------------------------------------ */
  /* DILUTION NAMING TABLES (per base). Resolver picks the recognized    */
  /* name when ONE dilution axis is active; composes descriptively when  */
  /* several stack.                                                      */
  /* ------------------------------------------------------------------ */
  dilutionNames: {

    // cream/pearl state -> name, by base
    creamPearl: {
      chestnut: {
        single_cream: { name: "Palomino",        swatch: "#d9a441", eyes: "dark", skin: "dark", maneTail: "flaxen/cream" },
        double_cream: { name: "Cremello",         swatch: "#f0e3c8", eyes: "blue", skin: "pink",  maneTail: "cream-white" },
        pearl:        { name: "Apricot Pearl",    swatch: "#d99a5e", eyes: "blue", skin: "purplish pink, freckled" },
        cream_pearl:  { name: "Palomino Pearl",   swatch: "#ecd9af", eyes: "blue", skin: "pink" }
      },
      bay: {
        single_cream: { name: "Buckskin",         swatch: "#c79a52", eyes: "dark", skin: "dark", points: "black" },
        double_cream: { name: "Perlino",          swatch: "#ece0c6", eyes: "blue", skin: "pink", points: "rusty/ivory" },
        pearl:        { name: "Bay Pearl",        swatch: "#ca9a5c", eyes: "blue", skin: "purplish pink, freckled" },
        cream_pearl:  { name: "Buckskin Pearl",   swatch: "#e6d4a8", eyes: "blue", skin: "pink" }
      },
      seal_brown: {
        single_cream: { name: "Smoky Brown",      swatch: "#5a4630", eyes: "dark", skin: "dark", note: "subtle; hard to read" },
        double_cream: { name: "Smoky Cream (seal)",swatch: "#ddd2bd", eyes: "blue", skin: "pink" },
        pearl:        { name: "Seal Brown Pearl", swatch: "#7a5e44", eyes: "blue", skin: "purplish pink, freckled" },
        cream_pearl:  { name: "Smoky Brown Pearl",swatch: "#cdbfa6", eyes: "blue", skin: "pink" }
      },
      black: {
        single_cream: { name: "Smoky Black",      swatch: "#2a2622", eyes: "dark", skin: "dark", note: "often indistinguishable from black" },
        double_cream: { name: "Smoky Cream",      swatch: "#d7ccbb", eyes: "blue", skin: "pink" },
        pearl:        { name: "Black Pearl",      swatch: "#5b4a3c", eyes: "blue", skin: "purplish pink, freckled" },
        cream_pearl:  { name: "Smoky Black Pearl",swatch: "#b9ad9c", eyes: "blue", skin: "pink" }
      }
    },

    // champagne, by base
    champagne: {
      chestnut:   { name: "Gold Champagne",    swatch: "#dcb45a", eyes: "hazel/amber", skin: "freckled pink", hooves: "chocolate" },
      bay:        { name: "Amber Champagne",   swatch: "#c79355", eyes: "hazel/amber", skin: "freckled pink", hooves: "chocolate", points: "diluted (not black)" },
      seal_brown: { name: "Sable Champagne",   swatch: "#7c6347", eyes: "hazel/amber", skin: "freckled pink", hooves: "chocolate" },
      black:      { name: "Classic Champagne", swatch: "#897462", eyes: "hazel/amber", skin: "freckled pink", hooves: "chocolate" }
    },

    // dun, by base (always adds primitive markings)
    dun: {
      chestnut:   { name: "Red Dun", swatch: "#c08a5e", primitiveMarkings: "red dorsal stripe + leg bars" },
      bay:        { name: "Bay Dun",  swatch: "#b9a06b", primitiveMarkings: "black dorsal stripe + leg bars", points: "black" },
      seal_brown: { name: "Seal Dun", swatch: "#8a7350", primitiveMarkings: "black dorsal stripe + leg bars", points: "black" },
      black:      { name: "Grullo",  swatch: "#8c8579", primitiveMarkings: "black dorsal stripe + leg bars" }
    },

    // silver — black pigment only; no entry for chestnut (carrier, no effect)
    silver: {
      bay:        { name: "Silver Bay",    swatch: "#7a4a2e", maneTail: "flaxen-white w/ dark roots", note: "body little changed; mane/tail silvered" },
      seal_brown: { name: "Silver Seal",   swatch: "#5a4434", maneTail: "flaxen-white w/ dark roots" },
      black:      { name: "Silver Dapple", swatch: "#5b4334", maneTail: "creamy-white w/ dark roots", note: "black→chocolate w/ silver dapples" }
    }
  },

  /* ------------------------------------------------------------------ */
  /* SHADING MODIFIERS — visual flags, do NOT rename the base.           */
  /* `appliesTo` lists base keys where the flag is visible.              */
  /* ------------------------------------------------------------------ */
  shadingModifiers: {
    flaxen:  { name: "Flaxen", trigger: { gene: "F", state: "ff" },
               appliesTo: ["chestnut"], effect: "Mane & tail lighten to white/cream.",
               label: "flaxen mane/tail" },
    pangare: { name: "Pangaré (mealy)", trigger: { gene: "Pg", state: "hasDominant" },
               appliesTo: ["chestnut", "bay", "seal_brown"], effect: "Lightened belly, muzzle, inner legs.",
               label: "mealy" },
    sooty:   { name: "Sooty", trigger: { gene: "Sty", state: "hasDominant" },
               appliesTo: ["chestnut", "bay"], effect: "Scattered dark hairs over the topline.",
               label: "sooty", uncertain: true }
  },

  /* ------------------------------------------------------------------ */
  /* OVERLAYS — roaning, white-spotting, gray. Reported in patterns[].   */
  /* Roan naming depends on base.                                        */
  /* ------------------------------------------------------------------ */
  overlays: {
    roan: {
      name: "Roan", trigger: { gene: "Rn", state: "hasDominant" },
      nameByBase: { chestnut: "Strawberry Roan", bay: "Bay Roan", seal_brown: "Bay Roan", black: "Blue Roan" },
      effect: "~50% white hairs intermixed on the body; head & lower legs solid.",
      skinUnderWhite: "dark", swatchTint: "+white intermix"
    },
    rabicano: {
      name: "Rabicano", trigger: { gene: "Rb", state: "hasDominant" },
      effect: "White at tail base ('skunk tail') + belly/flank roaning.",
    },
    tobiano: {
      name: "Tobiano", trigger: { gene: "T", state: "hasDominant" },
      effect: "Smooth white crossing the spine, white legs.",
      skinUnderWhite: "pink", hoovesUnderWhite: "tan", eyes: "dark unless diluted",
      homozygousNote: "ink spots within white patches"
    },
    sabino: {
      name: "Sabino", trigger: { gene: "Sb", state: "hasDominant" },
      effect: "Ragged white on legs/face, flecking & roaning.",
      skinUnderWhite: "pink",
      homozygous: { state: "SbSb", name: "Sabino White", effect: "white / near-white", eyes: "brown" }
    },
    frame: {
      name: "Overo", trigger: { gene: "O", state: "hasDominant" },
      effect: "White centered on the sides, not crossing the spine.",
      skinUnderWhite: "pink", eyes: "blue where face is white",
      lethal: { state: "OO", reason: "Overo Lethal White Syndrome (OLWS) — non-viable" }
    },
    splash: {
      name: "Splashed White", trigger: { gene: "SW1", state: "hasDominant" },
      effect: "White socks & face; homozygous = bold 'splashed' white + blue eyes.",
      skinUnderWhite: "pink", eyes: "blue when extensive",
      homozygous: { state: "SW1SW1", name: "Splashed White", effect: "broad splashed white" }
    },
    gray: {
      name: "Gray", trigger: { gene: "G", state: "hasDominant" }, progressive: true,
      stages: ["born underlying color", "dapple gray", "bloodmarked / fleabitten", "white"],
      effect: "Whitens progressively with age; retains DARK skin & eyes (the tell vs. true white) unless cream/champagne/pearl present.",
      swatch: "#cfcac2"
    },
    dominant_white: {
      name: "Dominant White", trigger: { gene: "W", state: "hasDominant" }, epistatic: true,
      effect: "Fully white coat; pink skin, light hooves, usually brown eyes. Masks the underlying color.",
      swatch: "#f6f4ef", eyes: "brown (sometimes blue)", skin: "pink", hooves: "light"
    }
  },

  /* ------------------------------------------------------------------ */
  /* LEOPARD COMPLEX                                                     */
  /* All Lp horses: mottled black/pink skin, striped hooves, WHITE sclera.*/
  /* Resolver: if Lp absent -> none. Else read PATN1 then PATN2 then bare.*/
  /* lpCopies: 1 = Lplp, 2 = LpLp.  patn1Copies / patn2 likewise.        */
  /* ------------------------------------------------------------------ */
  leopard: {
    sharedTraits: { skin: "mottled black & pink", hooves: "striped", sclera: "white" },
    // PATN1 present (incomplete dominant) — overrides PATN2
    patn1: {
      "1,1": { name: "Near-Leopard", swatch: "#b06a3e", note: "mostly white w/ dark roaning + large round spots in base color" }, // Lplp, PATN1 patn1
      "1,2": { name: "Leopard",      swatch: "#c88a5a", note: "white w/ large round 'leopard' spots in base color" },             // Lplp, PATN1 PATN1
      "2,1": { name: "Fewspot",      swatch: "#e7dccb", note: "mostly white w/ few scattered spots" },                            // LpLp, PATN1 patn1
      "2,2": { name: "Fewspot",      swatch: "#efe7da", note: "near-completely white" }                                           // LpLp, PATN1 PATN1
    },
    // PATN2 present, PATN1 absent (PATN2 dominant)
    patn2: {
      "1": { name: "Spotted Blanket", swatch: "#a85f37", note: "white over hindquarters w/ round dark spots" }, // Lplp
      "2": { name: "Blanket",         swatch: "#a85f37", note: "white hindquarters, no spots" }                 // LpLp
    },
    // Lp present but no pattern gene
    bare: {
      "1": { name: "Varnish Roan", swatch: "#b07a5c", note: "clumpy irregular roaning, denser with age" },
      "2": { name: "Varnish Roan", swatch: "#bd8a6c", note: "heavier varnish roaning (2 copies)" }
    },
    // black-based appaloosa "bronze" effect (descriptive only, not a gene)
    bronzeNote: "Black-based appaloosas may show a bronze cast (chocolate w/ red overtones) and light lower legs — a leopard-complex side effect, not a dilution gene."
  },

  /* ------------------------------------------------------------------ */
  /* DEFAULT / STARTING GENOTYPE for the calculator (all recessive/off,  */
  /* a plain bay so the first horse isn't a blank chestnut).             */
  /* ------------------------------------------------------------------ */
  startGenotype: {
    E: "ee", A: "aa", C: "CC", Ch: "nn", D: "dd", Z: "nn",
    F: "FF", Pg: "nn", Sty: "nn", Rn: "rnrn", Rb: "nn",
    T: "nn", Sb: "nn", O: "nn", SW1: "nn", W: "ww", G: "gg",
    Lp: "lplp", PATN1: "patn1patn1", PATN2: "patn2patn2"
  },

  /* ------------------------------------------------------------------ */
  /* GENOTYPE WRITE-ORDER (display). Loci that mask others come first;    */
  /* leopard genes grouped at the end.                                   */
  /* ------------------------------------------------------------------ */
  displayOrder: ["W", "G", "E", "A", "C", "Ch", "D", "Z",
                 "F", "Pg", "Sty", "Rn", "Rb",
                 "T", "Sb", "O", "SW1", "Lp", "PATN1", "PATN2"],

  /* ------------------------------------------------------------------ */
  /* GLOSSARY                                                            */
  /* ------------------------------------------------------------------ */
  glossary: [
    ["Gene", "A unit of heredity passed parent→offspring that helps determine a trait."],
    ["Allele", "A variant form of a gene."],
    ["Locus", "The fixed position of a gene on a chromosome."],
    ["Heterozygous", "Two different alleles at a locus (e.g. Ee)."],
    ["Homozygous", "Two identical alleles at a locus (e.g. EE or ee)."],
    ["Genotype", "The full set of alleles an individual carries."],
    ["Phenotype", "The visible result of a genotype."],
    ["Dominant", "An allele expressed even with one copy."],
    ["Recessive", "An allele masked unless present in two copies."],
    ["Incomplete dominance", "Heterozygote looks intermediate; two copies are stronger (e.g. cream, splash, Lp, PATN1)."],
    ["Epistatic", "A gene that masks the expression of other genes (e.g. gray, dominant white)."],
    ["Dash ( - )", "Wildcard in a written genotype: 'any second allele' (E- = EE or Ee)."],
    ["n", "Shorthand for the absent/recessive allele at many modifier loci."]
  ]
};

/* Tiny convenience the resolver can reuse for swatch fallbacks. */
window.HORSE_DATA.fallbackSwatch = "#8a6b4f";

/* ==========================================================================
   LAYERED HORSE PORTRAIT — the pixel-art paper-doll the calculator paints a
   resolved phenotype onto (ui.js -> horsePortrait). Head-LEFT, 150x126 native.
   Every layer is a flat-gray silhouette with TRUE ALPHA, registered to the same
   canvas, so each can be alpha-masked and tinted by genetics. `lineArt` is the
   only one DRAWN as-is (black ink, on top); the rest are fills.
   Leg layers are point-type alternates (pick one): bay = black points,
   seal = seal-brown (shorter), dun = dun legs + bars. `muzzle` = mealy/pangare
   light muzzle; `face` = mask for white face markings (star/blaze/bald).
   ========================================================================== */
window.HORSE_DATA.horseViewBox = "0 0 150 126";
window.HORSE_DATA.horseLayers = {
  coat:     "assets/horse/coat.png",
  maneTail: "assets/horse/mane-tail.png",
  legsBay:  "assets/horse/legs-bay.png",
  legsDun:  "assets/horse/legs-dun.png",
  legsSeal: "assets/horse/legs-seal.png",
  hooves:   "assets/horse/hooves.png",
  face:     "assets/horse/face.png",
  muzzle:   "assets/horse/muzzle.png",
  lineArt:  "assets/horse/line-art.png"
};

/* ==========================================================================
   GENETIC-HEALTH NOTES — surfaced by the resolver (genetics.js -> healthFlags)
   on the result card and, prominently, in the breeding tool. Keyed by locus.
   `severity`: info | caution | lethal-carrier | lethal-homozygous | lethal.
   ========================================================================== */
window.HORSE_DATA.healthNotes = {
  Z: {
    locus: "Silver", severity: "caution",
    text: "Silver (Z) is linked to Multiple Congenital Ocular Anomalies (MCOA / ASD). " +
          "One copy (nZ) usually means only mild cysts; two copies (ZZ) can bring more pronounced eye defects."
  },
  O: {
    locus: "Overo", severity: "lethal-carrier",
    text: "Overo (frame) carries Overo Lethal White Syndrome (OLWS). A single copy (nO) is healthy, but crossing " +
          "two overo carriers risks a 25% all-white, non-viable (OO) foal."
  },
  W: {
    locus: "Dominant White", severity: "lethal-homozygous",
    text: "Dominant White is homozygous-lethal: a WW embryo is lost, so every living dominant white is heterozygous (Ww)."
  },
  SW1: {
    locus: "Splashed White", severity: "caution",
    text: "Splashed white is associated with congenital deafness in some horses. The related SW2 / SW3 variants " +
          "— not modelled here — are themselves homozygous-lethal."
  },
  Lp: {
    locus: "Leopard Complex", severity: "caution",
    text: "Homozygous leopard complex (LpLp) is tied to Congenital Stationary Night Blindness (CSNB): affected " +
          "horses see poorly in low light but are otherwise healthy."
  },
  Sb: {
    locus: "Sabino", severity: "info",
    text: "Homozygous sabino (SbSb) simply produces a mostly-white, healthy horse — there is no lethal white linked to sabino."
  }
};

/* ==========================================================================
   RECOGNIZED STACKED DILUTIONS — the named portmanteau / compositional
   colours the resolver should use when exactly these dilution axes stack.
   Keyed by "<base>|<sorted axis-signature>"; axis tokens: cream:<state>,
   champ, dun, silver. Swatches per the §8.2 table. Combos not listed here
   fall back to a descriptive composed name ("Cremello + Dun").
   ========================================================================== */
window.HORSE_DATA.recognizedStacks = {
  "chestnut|champ+cream:single_cream": { name: "Gold Cream Champagne",    swatch: "#e8cf8f" },
  "bay|champ+cream:single_cream":      { name: "Amber Cream Champagne",   swatch: "#d8be86" },
  "black|champ+cream:single_cream":    { name: "Classic Cream Champagne", swatch: "#b3a48f" },
  "chestnut|cream:single_cream+dun":   { name: "Dunalino",                swatch: "#d8b067" },
  "bay|cream:single_cream+dun":        { name: "Dunskin",                 swatch: "#c2a064" },
  "black|cream:single_cream+dun":      { name: "Smoky Grullo",            swatch: "#9a9384" },
  "bay|dun+silver":                    { name: "Silver Bay Dun",          swatch: "#97784f" },
  "black|dun+silver":                  { name: "Silver Grullo",           swatch: "#6e6256" }
};

/* ==========================================================================
   SHADING SWATCHES (§8.2) — representative body colours for the shading
   variants, applied by the resolver when the shading is visible on a plain
   base (and, for sooty, on a single-cream palomino/buckskin). Keyed by base;
   sooty also has "<base>+cream" keys for its cream-diluted variants.
   ========================================================================== */
window.HORSE_DATA.shadingSwatches = {
  flaxen: { chestnut: "#a8572b", chestnut_liver: "#5b3320" },
  mealy:  { chestnut: "#a85a30", bay: "#6e3a1c", seal_brown: "#3a2417" },
  sooty:  { chestnut: "#7c3b22", bay: "#5a2e18", "chestnut+cream": "#b89047", "bay+cream": "#a8843f" }
};

/* ==========================================================================
   COLOUR VARIATION envelopes — a phenotype is a RANGE, not one hex. Each profile
   is the ± jitter applied around the representative swatch, in HSL units
   (h = degrees, s/l = percent), plus the "primary" axis the palette spreads
   along. Used by genetics.js varySwatch()/paletteSwatches(); the engine picks a
   profile from the resolved colour (base / dilution / gray). Tune here only.
   - red:     chestnut/sorrel/liver run yellow-toned <-> red-toned (hue axis)
   - redBody: bay & seal body, red component varies; black points stay fixed
   - cream:   palomino/buckskin/pearl — the gold deepens or pales (value)
   - pale:    cremello/perlino — little room; mostly saturation
   - dun:     sandy value range; champagne: warm hue; black: jet <-> sun-faded
   - gray:    natural spread of the greying value
   ========================================================================== */
/* ==========================================================================
   ROLL FREQUENCIES — "Roll a horse" draws each locus's alleles weighted by real
   rarity (Hardy-Weinberg per locus) instead of uniformly, so the dominant /
   epistatic alleles that MASK everything — Gray (G), Dominant White (W) — and the
   white-spotting / leopard patterns stay RARE. Each value is the relative
   frequency of that allele in the rolled population; genetics.js normalises them.
   Tune here. (Before this, a uniform roll made ~⅔ of horses gray and a third
   white/non-viable; now gray ≈ 10%, dominant white ≈ 2%.)
   ========================================================================== */
window.HORSE_DATA.rollFrequencies = {
  E:     { E: 0.50,   e: 0.50 },
  A:     { A: 0.50,   At: 0.20, a: 0.30 },
  C:     { C: 0.85,   Cr: 0.12, prl: 0.03 },
  Ch:    { Ch: 0.03,  n: 0.97 },
  D:     { D: 0.10,   d: 0.90 },
  Z:     { Z: 0.04,   n: 0.96 },
  F:     { F: 0.70,   f: 0.30 },
  Pg:    { Pg: 0.12,  n: 0.88 },
  Sty:   { Sty: 0.15, n: 0.85 },
  Rn:    { Rn: 0.06,  rn: 0.94 },
  Rb:    { Rb: 0.05,  n: 0.95 },
  T:     { T: 0.05,   n: 0.95 },
  Sb:    { Sb: 0.06,  n: 0.94 },
  O:     { O: 0.035,  n: 0.965 },
  SW1:   { SW1: 0.045, n: 0.955 },
  W:     { W: 0.012,  w: 0.988 },
  G:     { G: 0.05,   g: 0.95 },
  Lp:    { Lp: 0.05,  lp: 0.95 },
  PATN1: { PATN1: 0.16, patn1: 0.84 },
  PATN2: { PATN2: 0.18, patn2: 0.82 }
};

/* ==========================================================================
   TRAIT CHIPS — the calculator's plain-language picker. The base (E+A) is chosen
   with swatches; every other gene is a toggle chip. `off` is the recessive/absent
   token; `on` lists the genotype tokens by dose (1 copy, then 2) — a single entry
   means no dose control (Frame/Dominant White: homozygote is lethal; Flaxen: the
   visible trait is the recessive ff). Cream & Pearl share the C locus, so they're
   handled specially (kind) in ui.js. Order here = order on the shelf.
   ========================================================================== */
window.HORSE_DATA.traitChips = [
  { id: "cream",    label: "Cream",          group: "Dilutions",       kind: "cream" },
  { id: "pearl",    label: "Pearl",          group: "Dilutions",       kind: "pearl" },
  { id: "champ",    label: "Champagne",      group: "Dilutions",       locus: "Ch",    off: "nn",           on: ["nCh", "ChCh"] },
  { id: "dun",      label: "Dun",            group: "Dilutions",       locus: "D",     off: "dd",           on: ["Dd", "DD"] },
  { id: "silver",   label: "Silver",         group: "Dilutions",       locus: "Z",     off: "nn",           on: ["nZ", "ZZ"] },
  { id: "flaxen",   label: "Flaxen",         group: "Shading",         locus: "F",     off: "FF",           on: ["ff"] },
  { id: "mealy",    label: "Mealy",          group: "Shading",         locus: "Pg",    off: "nn",           on: ["nPg", "PgPg"] },
  { id: "sooty",    label: "Sooty",          group: "Shading",         locus: "Sty",   off: "nn",           on: ["nSty", "StySty"] },
  { id: "roan",     label: "Roan",           group: "Roaning",         locus: "Rn",    off: "rnrn",         on: ["Rnrn", "RnRn"] },
  { id: "rabicano", label: "Rabicano",       group: "Roaning",         locus: "Rb",    off: "nn",           on: ["nRb", "RbRb"] },
  { id: "tobiano",  label: "Tobiano",        group: "White Patterns",  locus: "T",     off: "nn",           on: ["nT", "TT"] },
  { id: "sabino",   label: "Sabino",         group: "White Patterns",  locus: "Sb",    off: "nn",           on: ["nSb", "SbSb"] },
  { id: "frame",    label: "Overo",          group: "White Patterns",  locus: "O",     off: "nn",           on: ["nO"] },
  { id: "splash",   label: "Splashed White", group: "White Patterns",  locus: "SW1",   off: "nn",           on: ["nSW1", "SW1SW1"] },
  { id: "white",    label: "Dominant White", group: "White Patterns",  locus: "W",     off: "ww",           on: ["Ww"] },
  { id: "gray",     label: "Gray",           group: "Gray",            locus: "G",     off: "gg",           on: ["Gg", "GG"] },
  { id: "leopard",  label: "Leopard",        group: "Leopard Complex", locus: "Lp",    off: "lplp",         on: ["Lplp", "LpLp"] },
  { id: "patn1",    label: "Pattern-1",      group: "Leopard Complex", locus: "PATN1", off: "patn1patn1",   on: ["PATN1patn1", "PATN1PATN1"] },
  { id: "patn2",    label: "Pattern-2",      group: "Leopard Complex", locus: "PATN2", off: "patn2patn2",   on: ["PATN2patn2", "PATN2PATN2"] }
];

/* ==========================================================================
   PRESETS — one-tap common colours for the calculator. Each `g` is a cleaned
   genotype string (parseGenotype fills the omitted loci with defaults), so a tap
   loads a clean version of that colour. Order = order on the quick-pick row.
   ========================================================================== */
window.HORSE_DATA.presets = [
  { label: "Chestnut",      g: "ee aa" },
  { label: "Bay",           g: "Ee Aa" },
  { label: "Black",         g: "Ee aa" },
  { label: "Palomino",      g: "ee aa CCr" },
  { label: "Buckskin",      g: "Ee Aa CCr" },
  { label: "Cremello",      g: "ee aa CrCr" },
  { label: "Smoky Black",   g: "Ee aa CCr" },
  { label: "Red Dun",       g: "ee aa Dd" },
  { label: "Grullo",        g: "Ee aa Dd" },
  { label: "Silver Dapple", g: "Ee aa nZ" },
  { label: "Bay Roan",      g: "Ee Aa Rnrn" },
  { label: "Grey",          g: "Ee Aa Gg" }
];

window.HORSE_DATA.colorVariation = {
  default:   { h: 5,  s: 7,  l: 6,  primary: "l" },
  red:       { h: 12, s: 12, l: 9,  primary: "h" },
  redBody:   { h: 9,  s: 11, l: 8,  primary: "h" },
  cream:     { h: 6,  s: 11, l: 9,  primary: "l" },
  pale:      { h: 4,  s: 6,  l: 6,  primary: "s" },
  dun:       { h: 7,  s: 9,  l: 9,  primary: "l" },
  champagne: { h: 7,  s: 9,  l: 8,  primary: "h" },
  black:     { h: 3,  s: 5,  l: 6,  primary: "l" },
  gray:      { h: 3,  s: 4,  l: 8,  primary: "l" }
};

/* ==========================================================================
   GRAY — its own category (§4.4). A short stage/type set for the field guide.
   Gray does NOT multiply across the pigmented colours: a horse is born its
   base colour and whitens with age, keeping DARK skin & eyes throughout.
   Swatches are representative; all of these are the one Gray (G_) genotype.
   ========================================================================== */
window.HORSE_DATA.grayStages = [
  { key: "rose-gray",       name: "Rose Gray",             swatch: "#b09a92", base: "chestnut",
    cue: "Early greying over a red (chestnut / bay) base — a warm, pinkish grey before it cools." },
  { key: "steel-gray",      name: "Steel / Iron Gray",     swatch: "#8a8a90", base: "black",
    cue: "Early greying over a black base — a cool blue-grey, often called iron grey." },
  { key: "dapple-gray",     name: "Dapple Gray",           swatch: "#b8b4ad", base: "any",
    cue: "Mid-greying with rings of dapples; dark skin still reads at the muzzle and eyes." },
  { key: "light-gray",      name: "Light (“White”) Gray", swatch: "#d8d5cf", base: "any",
    cue: "Almost fully whitened, yet with DARK skin and DARK eyes — the tell that separates grey from true white." },
  { key: "fleabitten-gray", name: "Fleabitten Gray",       swatch: "#d6d2ca", base: "any",
    cue: "White, flecked all over with tiny specks of the original base colour." },
  { key: "bloodmarked-gray",name: "Bloodmarked Gray",      swatch: "#c9b9b0", base: "chestnut",
    cue: "A whitened grey that keeps a persistent patch ('blood mark') of the base colour." }
];
