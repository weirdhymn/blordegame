/**
 * Tiny JSON-schema builders for route input validation (§11 hardening).
 *
 * These are TRANSPORT-SHAPE guards, not game rules: types, string/array/object size ceilings, and
 * numeric maxima that bound what a request may even carry. Business minimums (price > 0, party ≤ 4,
 * affordability…) stay in the services so their friendly error codes keep firing — a schema failure
 * is a plain 400 (`bad_request`) from Fastify's validator, mapped by the app error handler.
 * The ceilings are request-shape guards (same precedent as daily.ts's catch-up cap), not balance.
 */

/** An id-ish string (uuid, slug, item id) — bounded, never a paragraph. */
export const id = { type: 'string', minLength: 1, maxLength: 64 } as const;

/** Free text with a hard length ceiling (names, messages, reasons). */
export const shortText = (maxLength: number) =>
  ({ type: 'string', minLength: 1, maxLength }) as const;

/** A bounded integer — the transport ceiling; services own the game-rule minimums. */
export const bounded = (maximum: number, minimum?: number) => {
  return minimum === undefined
    ? ({ type: 'integer', maximum } as const)
    : ({ type: 'integer', minimum, maximum } as const);
};

/** An array of id-ish strings (party pickers, enemy lists, horse lists). */
export const idArray = (maxItems: number) => ({ type: 'array', items: id, maxItems }) as const;

/** A `{ schema: { body } }` route option. Additional properties stay allowed (forward-compat). */
export const bodySchema = (properties: Record<string, unknown>, required: string[] = []) =>
  ({ schema: { body: { type: 'object', properties, required } } }) as const;
