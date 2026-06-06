// Default auto-generated horse names: random fruit/veg, cosmetic only — identity is
// the row id (§6/§9). Players can rename later.
const FRUIT_VEG = [
  'Plum',
  'Pepper',
  'Turnip',
  'Cherry',
  'Parsnip',
  'Mango',
  'Radish',
  'Fig',
  'Squash',
  'Beet',
  'Date',
  'Kiwi',
  'Pumpkin',
  'Olive',
  'Hazel',
  'Pickle',
  'Sage',
  'Basil',
  'Apricot',
  'Sorrel',
  'Rhubarb',
  'Quince',
  'Pippin',
  'Clementine',
];

export function randomHorseName(): string {
  return FRUIT_VEG[Math.floor(Math.random() * FRUIT_VEG.length)] ?? 'Sprout';
}
