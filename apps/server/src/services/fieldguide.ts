import { eq } from 'drizzle-orm';
import { enumerateColors, resolve, slugify, type Genotype } from '@blorse/genetics';
import type { DB } from '../db/client.js';
import { fieldGuide } from '../db/schema.js';

const CATALOG_SIZE = enumerateColors().length;

/** Record a horse's revealed coat in its herd's Field Guide (idempotent; keeps first). */
export async function recordDiscovery(
  db: DB,
  herdId: string,
  horse: { id: string; genotype: Genotype },
): Promise<void> {
  const r = resolve(horse.genotype);
  if (r.flags.isLethal) return; // non-viable never reveals a coat
  await db
    .insert(fieldGuide)
    .values({
      herdId,
      colorSlug: slugify(r.displayName),
      name: r.displayName,
      firstHorseId: horse.id,
    })
    .onConflictDoNothing({ target: [fieldGuide.herdId, fieldGuide.colorSlug] });
}

export interface FieldGuideView {
  discovered: { slug: string; name: string }[];
  discoveredCount: number;
  catalogSize: number;
}

export async function getFieldGuide(db: DB, herdId: string): Promise<FieldGuideView> {
  const rows = await db
    .select({ slug: fieldGuide.colorSlug, name: fieldGuide.name })
    .from(fieldGuide)
    .where(eq(fieldGuide.herdId, herdId));
  return { discovered: rows, discoveredCount: rows.length, catalogSize: CATALOG_SIZE };
}
