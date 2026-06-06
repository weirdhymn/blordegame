const DAY_MS = 86_400_000;

// The single daily rollover is at midnight EST = fixed UTC−5, year-round (no DST),
// so client countdowns always match the server (BLORSE_PLAN.md §2).
const UTC_OFFSET_MS = -5 * 60 * 60 * 1000;

/** Integer game-day index — days since the epoch in the UTC−5 zone. */
export function gameDay(ms: number): number {
  return Math.floor((ms + UTC_OFFSET_MS) / DAY_MS);
}

/** UTC timestamp (ms) of the next midnight-EST rollover strictly after `ms`. */
export function nextRollover(ms: number): number {
  return (gameDay(ms) + 1) * DAY_MS - UTC_OFFSET_MS;
}

/** Inverse of {@link gameDay}: a UTC timestamp inside game-day `day` (its start). */
export function dayToMs(day: number): number {
  return day * DAY_MS - UTC_OFFSET_MS;
}
