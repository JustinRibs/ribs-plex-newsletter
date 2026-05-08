import path from 'node:path';
import fs from 'node:fs';
import 'dotenv/config';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const DB_PATH = path.join(DATA_DIR, 'pivo.db');
const LEGACY_DB_PATH = path.join(DATA_DIR, 'ribs.db');

// One-time migration: pre-rebrand databases lived at /data/ribs.db.
// If the new path doesn't exist but the old one does, move it (and its
// WAL/SHM sidecar files) so existing installs upgrade transparently.
if (!fs.existsSync(DB_PATH) && fs.existsSync(LEGACY_DB_PATH)) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const from = LEGACY_DB_PATH + suffix;
    const to = DB_PATH + suffix;
    if (fs.existsSync(from)) {
      try { fs.renameSync(from, to); } catch (err) { console.warn(`Failed to migrate ${from}:`, err); }
    }
  }
  console.log('[migration] Renamed ribs.db → pivo.db');
}
export const PORT = Number(process.env.PORT || 1998);
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
export const TZ = process.env.TZ || 'UTC';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
