/** Turn an id like "plant-fiber" / "reading-circle" into "Plant Fiber" / "Reading Circle". */
export function pretty(id: string): string {
  return id
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}
