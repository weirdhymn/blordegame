/*
 * Restore from a logical backup (DEPLOY.md "Backups").
 *
 *   CONFIRM_RESTORE=yes node --import ./scripts/register.mjs scripts/restore.ts [dumpFile]
 *
 * Restores a `pg_dump` custom-format snapshot INTO DATABASE_URL with `--clean --if-exists`,
 * so the target is reset to the snapshot's exact state. DESTRUCTIVE — it drops and recreates
 * every object in the dump — so it refuses to run unless CONFIRM_RESTORE=yes.
 *
 * If no dumpFile arg is given, restores the NEWEST dump in BACKUP_DIR.
 *
 * Env: DATABASE_URL (postgres://… required), BACKUP_DIR (default ./.data/backups), PG_BIN.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function pgTool(name: string): string {
  const dir = process.env.PG_BIN;
  return dir ? join(dir, name) : name;
}

function newestDump(dir: string): string {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('blorse-') && f.endsWith('.dump'))
    .map((f) => ({ f: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length === 0) throw new Error(`no blorse-*.dump found in ${dir}`);
  return files[0]!.f;
}

function main(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.startsWith('postgres')) {
    console.error('restore: DATABASE_URL must be a postgres:// URL.');
    process.exit(2);
  }
  if (process.env.CONFIRM_RESTORE !== 'yes') {
    console.error(
      'restore: REFUSING — this overwrites the target database.\n' +
        '         Re-run with CONFIRM_RESTORE=yes once you are sure.',
    );
    process.exit(3);
  }
  const dir = process.env.BACKUP_DIR ?? './.data/backups';
  const file = process.argv[2] ?? newestDump(dir);

  console.log(`• restoring ${file} → ${url.replace(/:[^:@/]*@/, ':***@')}`);
  // --clean --if-exists: drop existing objects first so the restore is a true reset, not a merge.
  // pg_restore exits non-zero on benign "does not exist" notices the first time; --if-exists +
  // --exit-on-error off keeps it clean. We surface stderr regardless.
  execFileSync(
    pgTool('pg_restore'),
    ['--clean', '--if-exists', '--no-owner', '--no-privileges', '-d', url, file],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  console.log('=== restore complete ===');
}

main();
