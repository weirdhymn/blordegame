/*
 * Logical backup — the durability floor (§11 / DEPLOY.md "Backups").
 *
 *   node --import ./scripts/register.mjs scripts/backup.ts
 *
 * Takes a `pg_dump` custom-format snapshot of DATABASE_URL (a managed-Postgres URL), writes
 * it to BACKUP_DIR with a timestamped name, rotates old snapshots by a clear retention
 * policy, and — if BACKUP_UPLOAD_CMD is set — ships the file OFF the database disk (the whole
 * point: a volume failure must not take the backups with it).
 *
 * This is provider-INDEPENDENT: even when the managed provider also does its own automated
 * backups + PITR, this is the second, guaranteed-retention copy we own. Run it on a schedule
 * (a Fly scheduled machine / cron) once a day.
 *
 * Env:
 *   DATABASE_URL        postgres://…  (required — PGlite/`file:` cannot be pg_dump'd; the
 *                       managed-PG production path is the one that needs backups)
 *   BACKUP_DIR          where to write dumps      (default ./.data/backups)
 *   BACKUP_RETAIN_DAYS  keep every dump newer than this  (default 30)
 *   BACKUP_RETAIN_WEEKS keep one Monday dump/week beyond that, this many weeks (default 8)
 *   BACKUP_UPLOAD_CMD   optional shell command; "{file}" is replaced with the dump path, run
 *                       AFTER a successful dump to copy it off-box. e.g.
 *                         aws s3 cp {file} s3://blorse-backups/
 *                         rclone copyto {file} r2:blorse-backups/$(basename {file})
 *   PG_BIN              dir holding pg_dump, if not on PATH
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

function pgTool(name: string): string {
  const dir = process.env.PG_BIN;
  return dir ? join(dir, name) : name; // resolved from PATH otherwise
}

/** A two-digit pad helper (Date in a one-shot script is fine — not the deterministic engine). */
const p2 = (n: number): string => String(n).padStart(2, '0');

function stamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}` +
    `-${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}`
  );
}

/** Retention: keep everything newer than RETAIN_DAYS; beyond that keep one dump per ISO week
 *  (the earliest in each week) for RETAIN_WEEKS weeks; delete the rest. Always keep the newest. */
function rotate(dir: string, retainDays: number, retainWeeks: number, now: number): string[] {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('blorse-') && f.endsWith('.dump'))
    .map((f) => ({ f, mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length <= 1) return [];

  const dayMs = 86_400_000;
  const keep = new Set<string>();
  if (files[0]) keep.add(files[0].f); // never delete the newest
  const weeksSeen = new Set<number>();
  for (const { f, mtime } of files) {
    const ageDays = (now - mtime) / dayMs;
    if (ageDays <= retainDays) {
      keep.add(f);
      continue;
    }
    const week = Math.floor(mtime / (7 * dayMs));
    if (!weeksSeen.has(week) && weeksSeen.size < retainWeeks) {
      weeksSeen.add(week);
      keep.add(f);
    }
  }
  const deleted: string[] = [];
  for (const { f } of files) {
    if (!keep.has(f)) {
      rmSync(join(dir, f));
      deleted.push(f);
    }
  }
  return deleted;
}

function main(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.startsWith('postgres')) {
    console.error(
      'backup: DATABASE_URL must be a postgres:// URL (the managed-Postgres production DB).\n' +
        '        PGlite/`file:` databases are backed up by snapshotting their volume, not pg_dump.',
    );
    process.exit(2);
  }
  const dir = process.env.BACKUP_DIR ?? './.data/backups';
  mkdirSync(dir, { recursive: true });
  const now = new Date();
  const file = join(dir, `blorse-${stamp(now)}.dump`);

  console.log(`• dumping → ${file}`);
  // -Fc custom format (compressed, selective restore); portable ownership/grants stripped so the
  // dump restores cleanly into any managed instance regardless of role names.
  execFileSync(pgTool('pg_dump'), ['-Fc', '--no-owner', '--no-privileges', '-d', url, '-f', file], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const sizeKb = Math.round(statSync(file).size / 1024);
  console.log(`• wrote ${sizeKb} KB`);

  const upload = process.env.BACKUP_UPLOAD_CMD;
  if (upload) {
    const cmd = upload.replace(/\{file\}/g, file);
    console.log(`• shipping off-box: ${cmd}`);
    execFileSync(process.platform === 'win32' ? 'cmd' : 'sh', [
      process.platform === 'win32' ? '/c' : '-c',
      cmd,
    ]);
  } else {
    console.log('• BACKUP_UPLOAD_CMD unset — local copy only (set it in prod to ship off-disk)');
  }

  const retainDays = Number(process.env.BACKUP_RETAIN_DAYS ?? 30);
  const retainWeeks = Number(process.env.BACKUP_RETAIN_WEEKS ?? 8);
  const deleted = rotate(dir, retainDays, retainWeeks, now.getTime());
  console.log(
    deleted.length
      ? `• rotated out ${deleted.length} old dump(s): ${deleted.join(', ')}`
      : '• retention: nothing to rotate',
  );
  console.log('=== backup complete ===');
}

main();
