import path from 'node:path';
import fs from 'node:fs';
import 'dotenv/config';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const DB_PATH = path.join(DATA_DIR, 'ribs.db');
export const PORT = Number(process.env.PORT || 1998);
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
export const TZ = process.env.TZ || 'UTC';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
