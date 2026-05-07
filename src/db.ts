import Database from 'better-sqlite3';
import { DB_PATH } from './config.js';
import type { Recipient, SendLog, Settings } from './types.js';

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipients (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL DEFAULT '',
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS send_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sent_at         TEXT NOT NULL DEFAULT (datetime('now')),
  recipient_count INTEGER NOT NULL,
  status          TEXT NOT NULL,
  message         TEXT NOT NULL DEFAULT '',
  duration_ms     INTEGER NOT NULL DEFAULT 0
);
`);

const DEFAULTS: Settings = {
  tautulli_url: '',
  tautulli_api_key: '',

  smtp_host: 'smtp-relay.brevo.com',
  smtp_port: 587,
  smtp_secure: 0,
  smtp_user: '',
  smtp_pass: '',
  smtp_from_name: 'Plex Newsletter',
  smtp_from_email: '',

  brand_name: 'My Plex Newsletter',
  brand_accent: '#e5a00d',
  brand_logo_path: '',
  brand_header_html: 'Here’s what’s new this week.',
  brand_footer_html: 'You’re receiving this because you have access to my Plex server.',

  recently_added_count: 20,
  include_movies: 1,
  include_tv: 1,
  include_music: 0,
  show_summaries: 1,

  enable_top_watched: 0,
  enable_top_users: 0,
  enable_stats: 0,
  stats_window_days: 7,

  schedule_cron: '0 9 * * 0',
  schedule_enabled: 0,
  newsletter_subject: 'New on Plex — {{date}}'
};

// Seed defaults for any missing key
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULTS)) {
  insertSetting.run(k, String(v));
}

export function getSettings(): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const out: Record<string, string | number> = { ...DEFAULTS } as any;
  for (const { key, value } of rows) {
    if (typeof (DEFAULTS as any)[key] === 'number') {
      out[key] = Number(value);
    } else {
      out[key] = value;
    }
  }
  return out as unknown as Settings;
}

const upsertSetting = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

export function updateSettings(patch: Partial<Settings>): Settings {
  const current = getSettings();
  const next = { ...current, ...patch };
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(next)) {
      // only persist keys we know about
      if (!(k in DEFAULTS)) continue;
      upsertSetting.run(k, String(v));
    }
  });
  tx();
  return getSettings();
}

export function listRecipients(): Recipient[] {
  return db.prepare('SELECT * FROM recipients ORDER BY created_at DESC').all() as Recipient[];
}

export function listActiveRecipients(): Recipient[] {
  return db.prepare('SELECT * FROM recipients WHERE active = 1 ORDER BY email').all() as Recipient[];
}

export function addRecipient(email: string, name: string): Recipient {
  const info = db
    .prepare('INSERT INTO recipients (email, name) VALUES (?, ?)')
    .run(email.trim().toLowerCase(), name.trim());
  return db.prepare('SELECT * FROM recipients WHERE id = ?').get(info.lastInsertRowid) as Recipient;
}

export function updateRecipient(id: number, patch: { email?: string; name?: string; active?: number }): Recipient | null {
  const existing = db.prepare('SELECT * FROM recipients WHERE id = ?').get(id) as Recipient | undefined;
  if (!existing) return null;
  const email = patch.email !== undefined ? patch.email.trim().toLowerCase() : existing.email;
  const name = patch.name !== undefined ? patch.name.trim() : existing.name;
  const active = patch.active !== undefined ? (patch.active ? 1 : 0) : existing.active;
  db.prepare('UPDATE recipients SET email = ?, name = ?, active = ? WHERE id = ?').run(email, name, active, id);
  return db.prepare('SELECT * FROM recipients WHERE id = ?').get(id) as Recipient;
}

export function deleteRecipient(id: number): boolean {
  const info = db.prepare('DELETE FROM recipients WHERE id = ?').run(id);
  return info.changes > 0;
}

export function logSend(entry: Omit<SendLog, 'id' | 'sent_at'>): void {
  db.prepare(
    'INSERT INTO send_log (recipient_count, status, message, duration_ms) VALUES (?, ?, ?, ?)'
  ).run(entry.recipient_count, entry.status, entry.message, entry.duration_ms);
  // keep only the last 100 entries
  db.exec(
    "DELETE FROM send_log WHERE id NOT IN (SELECT id FROM send_log ORDER BY sent_at DESC LIMIT 100)"
  );
}

export function listSendLog(limit = 25): SendLog[] {
  return db.prepare('SELECT * FROM send_log ORDER BY sent_at DESC LIMIT ?').all(limit) as SendLog[];
}
