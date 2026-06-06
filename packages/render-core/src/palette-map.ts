/**
 * Token → hex maps (BLORSE_PLAN.md §4.3). These let designers tune the look
 * without touching genetics. Values are ported from the prototype renderer so
 * BLORSE matches its proven output.
 */

// Leg points (the "points" colorRole).
export const POINT_BLACK = '#1c1a17';
export const POINT_CHOCOLATE = '#6f4f37'; // champagne — diluted/"not black" points
export const POINT_PALE_RUSTY = '#b89a6a'; // perlino — rusty/ivory points

// Mane / tail.
export const MANE_BLACK = '#241d18';
export const MANE_CHOCOLATE = '#6f4f37';
export const MANE_FLAXEN = '#e8d6a8'; // flaxen / cream / silver / ivory / gold
export const MANE_WHITE = '#f4eddb';

// Hooves.
export const HOOVES_DARK = '#2b2620';
export const HOOVES_CHOCOLATE = '#5a4636';
export const HOOVES_LIGHT = '#b9a98c';

// Masks / washes.
export const COAT_WHITE = '#fbfbf7'; // dominant white, sabino-white, foal silhouette
export const MEALY_WASH = '#fff4d8';
export const ROAN_WASH = '#f2efe8';

// Fallback when the engine yields a non-hex body token.
export const FALLBACK_SWATCH = '#7a4a2e';
