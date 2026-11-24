// Which schema version the desktop app migrates from on startup.
//
// The database records its own version in db_meta (since v18). That is the
// truth: after restoring an older backup, or after setting the version by hand
// in Settings → الأساسيات → متقدم, the .env DB_VERSION written at install time
// is stale. The .env value is only a fallback for databases that have no
// recorded version (pre-v18) or when the query fails.

/** Parse `psql -At -c "SELECT value FROM db_meta WHERE key='version'"` output. */
export function parseDbVersionOutput(stdout: string): number | null {
  const text = stdout.trim();
  if (!/^\d+$/.test(text)) return null;
  return parseInt(text, 10);
}

/** The version to migrate from: the database's own when known, else .env. */
export function resolveStartVersion(
  envVersion: number,
  dbVersion: number | null,
): number {
  return dbVersion ?? envVersion;
}

/** The migrations to run, ascending, for files named update_db_<N>.py. */
export function pendingMigrations(
  files: string[],
  fromVersion: number,
): { num: number; file: string }[] {
  const out: { num: number; file: string }[] = [];
  for (const file of files) {
    const match = file.match(/^update_db_(\d+)\.py$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > fromVersion) out.push({ num, file });
    }
  }
  return out.sort((a, b) => a.num - b.num);
}
