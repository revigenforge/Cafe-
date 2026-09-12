/**
 * Drops the database file and rebuilds it from scratch, then seeds.
 * Destructive — refuses to run unless --yes is passed.
 *
 *   npm run db:reset -- --yes
 */
import fs from 'node:fs';
import { DB_PATH } from './index.js';

if (!process.argv.includes('--yes')) {
  console.error('This deletes every lead, activity and task in the database.');
  console.error('Re-run with --yes if that is what you want:  npm run db:reset -- --yes');
  process.exit(1);
}

for (const suffix of ['', '-wal', '-shm']) {
  const p = DB_PATH + suffix;
  if (fs.existsSync(p)) {
    fs.rmSync(p);
    console.log(`removed ${p}`);
  }
}

/* Imported after the file is gone so the connection opens a fresh one. */
const { seed } = await import('./seed.js');
seed();
