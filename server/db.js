import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch { DatabaseSync = null; }

export const sqliteSupported = Boolean(DatabaseSync);
export const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
export const dbFile = process.env.BAILIAN_DB_FILE || path.join(dataDir, 'bailian.db');

const schema = `
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT);
CREATE TABLE IF NOT EXISTS students (
  jwcode TEXT PRIMARY KEY, name TEXT, dept TEXT, shop TEXT,
  total_points REAL NOT NULL DEFAULT 0, payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lives (
  id TEXT PRIMARY KEY, date TEXT, channel TEXT, name TEXT, start_time TEXT, payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attendance (
  key TEXT PRIMARY KEY, live_id TEXT NOT NULL, jwcode TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_points (
  key TEXT PRIMARY KEY, jwcode TEXT NOT NULL, date TEXT NOT NULL, channel TEXT, rule_type TEXT,
  score REAL NOT NULL DEFAULT 0, base_score REAL NOT NULL DEFAULT 0,
  bonus_score REAL NOT NULL DEFAULT 0, multiplier REAL NOT NULL DEFAULT 1, payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attendance_jwcode ON attendance(jwcode);
CREATE INDEX IF NOT EXISTS idx_attendance_live ON attendance(live_id);
CREATE INDEX IF NOT EXISTS idx_daily_jwcode_date ON daily_points(jwcode, date);
CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_points(date);
CREATE INDEX IF NOT EXISTS idx_students_points ON students(total_points);
`;

export const kvKeys = ['version', 'createdAt', 'settings', 'scoring', 'scoringMeta', 'classes', 'syncRuns', 'auditLogs', 'rewards', 'rewardClaims', 'cosmeticSelections', 'welfareGrants', 'announcements', 'pointAdjustments', 'feedback', 'meta'];
const bigFields = ['students', 'lives', 'attendance', 'dailyPoints'];

const tableOf = field => field === 'dailyPoints' ? 'daily_points' : field;
const keyColumnOf = field => field === 'students' ? 'jwcode' : field === 'lives' ? 'id' : 'key';

const statements = new WeakMap();

function prepared(db) {
  let cache = statements.get(db);
  if (cache) return cache;
  cache = {
    kvSet: db.prepare('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'),
    kvGet: db.prepare('SELECT value FROM kv WHERE key = ?'),
    kvAll: db.prepare('SELECT key, value FROM kv'),
    count: Object.fromEntries(bigFields.map(field => [field, db.prepare(`SELECT COUNT(*) AS n FROM ${tableOf(field)}`)])),
    read: Object.fromEntries(bigFields.map(field => [field, db.prepare(`SELECT ${keyColumnOf(field)} AS k, payload FROM ${tableOf(field)}`)])),
    upsert: {
      students: db.prepare('INSERT INTO students (jwcode, name, dept, shop, total_points, payload) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(jwcode) DO UPDATE SET name = excluded.name, dept = excluded.dept, shop = excluded.shop, total_points = excluded.total_points, payload = excluded.payload'),
      lives: db.prepare('INSERT INTO lives (id, date, channel, name, start_time, payload) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET date = excluded.date, channel = excluded.channel, name = excluded.name, start_time = excluded.start_time, payload = excluded.payload'),
      attendance: db.prepare('INSERT INTO attendance (key, live_id, jwcode, payload) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET live_id = excluded.live_id, jwcode = excluded.jwcode, payload = excluded.payload'),
      dailyPoints: db.prepare('INSERT INTO daily_points (key, jwcode, date, channel, rule_type, score, base_score, bonus_score, multiplier, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET jwcode = excluded.jwcode, date = excluded.date, channel = excluded.channel, rule_type = excluded.rule_type, score = excluded.score, base_score = excluded.base_score, bonus_score = excluded.bonus_score, multiplier = excluded.multiplier, payload = excluded.payload'),
    },
    remove: Object.fromEntries(bigFields.map(field => [field, db.prepare(`DELETE FROM ${tableOf(field)} WHERE ${keyColumnOf(field)} = ?`)])),
    clear: Object.fromEntries(bigFields.map(field => [field, db.prepare(`DELETE FROM ${tableOf(field)}`)])),
  };
  statements.set(db, cache);
  return cache;
}

function rowValues(field, key, item) {
  const payload = JSON.stringify(item);
  if (field === 'students') return [String(key), item.name || '', item.dept || '', item.shop || '', Number(item.totalPoints || 0), payload];
  if (field === 'lives') return [String(key), item.date || '', item.channel || '', item.name || '', item.startTime || '', payload];
  if (field === 'attendance') return [String(key), String(item.liveId || ''), String(item.jwcode || ''), payload];
  return [String(key), String(item.jwcode || ''), item.date || '', item.channel || '', item.ruleType || '', Number(item.score || 0), Number(item.baseScore || 0), Number(item.bonusScore || 0), Number(item.multiplier || 1), payload];
}

function writeRows(db, field, entries) {
  const stmt = prepared(db).upsert[field];
  for (const [key, item] of entries) stmt.run(...rowValues(field, key, item));
}

export function openDatabase() {
  if (!DatabaseSync) throw new Error('当前 Node.js 不支持 node:sqlite，请升级到 22.5 及以上版本');
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(dbFile);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec(schema);
  prepared(db);
  return db;
}

export function hasImported(db) {
  return Boolean(prepared(db).kvGet.get('meta'));
}

export function readAll(db) {
  const store = { version: 2, lives: {}, attendance: {}, dailyPoints: {}, students: {}, classes: {}, rewards: {}, rewardClaims: {}, pointAdjustments: {}, auditLogs: [], syncRuns: [] };
  for (const row of prepared(db).kvAll.all()) {
    try { store[row.key] = JSON.parse(row.value); } catch { /* 忽略损坏的配置行 */ }
  }
  for (const field of bigFields) {
    const target = store[field];
    for (const row of prepared(db).read[field].all()) target[row.k] = JSON.parse(row.payload);
  }
  return store;
}

export function importStore(db, store) {
  const sql = prepared(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const field of bigFields) {
      sql.clear[field].run();
      writeRows(db, field, Object.entries(store[field] || {}));
    }
    for (const key of kvKeys) sql.kvSet.run(key, JSON.stringify(store[key] ?? null), new Date().toISOString());
    sql.kvSet.run('meta', JSON.stringify({ engine: 'sqlite', importedAt: new Date().toISOString(), source: 'store.json' }), new Date().toISOString());
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// changes: { replaced: Set<field>, upserts: Map<field, Set<key>>, deletes: Map<field, Set<key>> }
export function writeStore(db, store, changes) {
  const sql = prepared(db);
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const field of bigFields) {
      if (changes.replaced.has(field)) {
        sql.clear[field].run();
        writeRows(db, field, Object.entries(store[field] || {}));
        continue;
      }
      const upserts = changes.upserts.get(field);
      if (upserts?.size) writeRows(db, field, [...upserts].filter(key => store[field]?.[key] !== undefined).map(key => [key, store[field][key]]));
      const deletes = changes.deletes.get(field);
      if (deletes?.size) for (const key of deletes) sql.remove[field].run(String(key));
    }
    for (const key of kvKeys) sql.kvSet.run(key, JSON.stringify(store[key] ?? null), now);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function databaseStats(db) {
  return Object.fromEntries(bigFields.map(field => [tableOf(field), prepared(db).count[field].get().n]));
}
