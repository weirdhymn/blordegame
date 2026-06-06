/** Turn an id like "grass-tuft" / "reading-circle" into "Grass Tuft" / "Reading Circle". */
export function pretty(id: string): string {
  return id
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}
