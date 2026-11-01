import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultBaseChannels, normalizeBaseChannels } from './channels.js';
import { databaseStats, dbFile, hasImported, importStore, openDatabase, readAll, sqliteSupported, writeStore } from './db.js';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const dataFile = path.join(dataDir, 'store.json');
const classWatchRule = () => ({ id: 'rule-yuzhiweilai', builtIn: true, type: 'activity', name: '领航粉丝群 · 20点听课', enabled: true, platform: 'xxcg', className: '领航粉丝群', classId: '3723', keyword: '', liveStart: '20:00', liveEnd: '21:00', startDate: '2026-06-24', endDate: '', trigger: 'watch', watchMinutes: 0, points: 9, multiplier: 1, stackWithBase: true, priority: 100 });
const multiplierRule = (id, name, startDate, endDate, keyword = '', priority = 50, channel = '财经壹眼') => ({ id, builtIn: true, type: 'multiplier', name, enabled: true, platform: 'all', className: '', classId: '', keyword, channel, liveStart: '', liveEnd: '', startDate, endDate, trigger: 'watch', watchMinutes: 0, points: 0, multiplier: 2, stackWithBase: false, priority });
const defaultMultiplierRules = () => [
  multiplierRule('rule-first-week-double', '首周学习 · 双倍积分', '2026-06-24', '2026-06-30', '', 60),
  multiplierRule('rule-mid-autumn-double', '中秋当周 · 双倍积分', '2026-09-21', '2026-09-27', '', 60, 'all'),
  multiplierRule('rule-national-day-double', '国庆当周 · 双倍积分', '2026-09-28', '2026-10-04', '', 60, 'all'),
  multiplierRule('rule-super-short-double', '超级短线周 · 双倍积分', '2026-07-18', '2026-07-22'),
  { ...multiplierRule('rule-welfare-oct-double', '领航粉季 · 积分翻倍', '2026-10-16', '2026-10-19', '', 80, 'all'), includeActivity: true },
];
const cosmeticReward = (id, name, type, points, styleKey, kind, description) => ({ id, name, type, category: '装扮奖励', points, styleKey, kind, description, fileUrl: '', stock: 1000000, enabled: true, createdAt: '2026-10-29T00:00:00.000Z', updatedAt: '2026-10-29T00:00:00.000Z' });
const defaultRewards = () => Object.fromEntries([
  cosmeticReward('reward-avatar-quench', '淬火鎏金头像框', '等级奖励', 60, 'avatar-frame-quench', 'avatarFrame', '累计 60 分解锁，领取后自动用于个人中心头像，不消耗积分。'),
  cosmeticReward('reward-bubble-gold', '鎏金排名气泡', '兑换奖励', 150, 'rank-bubble-gold', 'rankBubble', '累计 150 分可兑换，领取后自动点亮排行榜本人名次，不消耗积分。'),
  cosmeticReward('reward-bubble-red', '百炼荣耀排名气泡', '兑换奖励', 450, 'rank-bubble-red', 'rankBubble', '累计 450 分可兑换，领取后自动升级为荣耀排名气泡，不消耗积分。'),
  cosmeticReward('reward-avatar-master', '百炼宗师头像框', '等级奖励', 900, 'avatar-frame-master', 'avatarFrame', '累计 900 分解锁，领取后自动用于个人中心头像，不消耗积分。'),
  cosmeticReward('reward-theme-cute', '软萌云朵主题', '兑换奖励', 280, 'theme-cute', 'theme', '累计 280 分可兑换，领取后可在「我的装扮」中启用可爱云朵主题，不消耗积分。'),
  cosmeticReward('reward-theme-tech', '星环科技主题', '兑换奖励', 680, 'theme-tech', 'theme', '累计 680 分可兑换，领取后可在「我的装扮」中启用深蓝科技主题，不消耗积分。'),
].map(reward => [reward.id, reward]));
const defaultAnnouncements = () => [
  { id: 'notice-20261029-style', title: '双倍积分与全新装扮已上线', content: '首周及7月18日至22日超级短线周已加入财经壹眼双倍计分，中秋和国庆当周为两个栏目共同双倍。\n奖励中心新增翅膀头像框、排名气泡、软萌云朵和星环科技主题。累计积分达到门槛即可领取，兑换不会减少积分。\n领取后可前往「我的装扮」自由穿戴或卸下，祝每一天都有新进步。', publishedAt: '2026-10-29T10:00:00.000Z', enabled: true, important: true },
  { id: 'notice-20261029-welfare-ai', title: '百炼新计划福利与百炼小AI上线', content: '10月16日至19日积分翻倍已按新规则重新核算，领航群和AI课程专属回馈已计入。\n全体学员已发放30分百炼新计划奖励，可在积分明细中查看。\n奖励中心现已分为装扮奖励和学习奖励，学习资料领取后可直接下载PDF。\n百炼小AI正式上线，可查询积分、等级、排名、任务、双倍活动与奖励。', publishedAt: '2026-10-29T12:00:00.000Z', enabled: true, important: true },
];
const emptyStore = () => ({
  version: 2, lives: {}, attendance: {}, dailyPoints: {}, students: {}, classes: {},
  rewards: defaultRewards(), rewardClaims: {}, cosmeticSelections: {}, welfareGrants: {}, announcements: defaultAnnouncements(), pointAdjustments: {}, auditLogs: [],
  settings: { autoClassId: '', autoClassName: '', autoClassEnabled: false },
  scoring: {
    startDate: '2026-06-24', watchMinutes: 20, giftNames: ['领航卡', '终身领航卡'],
    baseChannels: defaultBaseChannels.map(channel => ({ ...channel })),
    rules: [classWatchRule()],
  },
  syncRuns: [], createdAt: new Date().toISOString(),
});

// 大表走 SQLite 增量写；students 存在 totalPoints 这类嵌套修改，用快照差异捕捉
const trackedFields = ['attendance', 'dailyPoints'];
const proxied = new WeakSet();
let db = null;
let backend = '';
let cache = null;
let cacheStamp = '';
let dataVersion = 0;
let changes = null;
let studentShadow = new Map();

export function storeVersion() {
  return dataVersion;
}

export function storageInfo() {
  return {
    engine: backend || (sqliteSupported ? 'sqlite' : 'json'),
    database: backend === 'sqlite' ? path.basename(dbFile) : path.basename(dataFile),
    tables: backend === 'sqlite' && db ? databaseStats(db) : null,
  };
}

function freshChanges() {
  return {
    replaced: new Set(),
    upserts: new Map(trackedFields.map(field => [field, new Set()])),
    deletes: new Map(trackedFields.map(field => [field, new Set()])),
  };
}

function track(field, target) {
  const proxy = new Proxy(target, {
    set(object, key, value) {
      if (typeof key === 'string' && changes) {
        changes.upserts.get(field).add(key);
        changes.deletes.get(field).delete(key);
      }
      object[key] = value;
      return true;
    },
    deleteProperty(object, key) {
      if (typeof key === 'string' && changes) {
        changes.deletes.get(field).add(key);
        changes.upserts.get(field).delete(key);
      }
      delete object[key];
      return true;
    },
  });
  proxied.add(proxy);
  return proxy;
}

function attachTracking(store) {
  for (const field of trackedFields) {
    if (!proxied.has(store[field])) store[field] = track(field, store[field] || {});
  }
  return store;
}

function normalizeStore(store) {
  store = { ...emptyStore(), ...store };
  for (const key of ['rewards', 'rewardClaims', 'cosmeticSelections', 'welfareGrants', 'pointAdjustments']) if (!store[key]) store[key] = {};
  if (!Array.isArray(store.announcements)) store.announcements = defaultAnnouncements();
  if (!Array.isArray(store.auditLogs)) store.auditLogs = [];
  store.rewards = { ...defaultRewards(), ...store.rewards };
  for (const reward of Object.values(store.rewards)) if (!reward.category) reward.category = reward.kind && reward.kind !== 'material' ? '装扮奖励' : '学习奖励';
  store.scoring.baseChannels = normalizeBaseChannels(store.scoring.baseChannels);
  const rules = store.scoring.rules || [];
  const builtIns = [classWatchRule(), ...defaultMultiplierRules()];
  store.scoring.rules = [
    ...builtIns.map(rule => {
      const current = rules.find(item => item.id === rule.id);
      return current ? { ...rule, ...current, id: rule.id, builtIn: true } : rule;
    }),
    ...rules.filter(rule => !builtIns.some(item => item.id === rule.id)),
  ];
  return store;
}

function stampOf() {
  try {
    const stat = fs.statSync(dataFile);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return '';
  }
}

function ensureBackend() {
  if (backend) return;
  fs.mkdirSync(dataDir, { recursive: true });
  if (!sqliteSupported) {
    backend = 'json';
    console.warn('[store] 当前 Node.js 不支持 node:sqlite，暂用 JSON 账本，建议升级到 22.5+');
    return;
  }
  backend = 'sqlite';
  db = openDatabase();
  if (!hasImported(db)) {
    if (fs.existsSync(dataFile)) {
      const startedAt = Date.now();
      const legacy = normalizeStore(JSON.parse(fs.readFileSync(dataFile, 'utf8')));
      importStore(db, legacy);
      console.log(`[store] 已将 store.json 导入 SQLite（${Date.now() - startedAt} ms），原 JSON 保留为迁移快照`);
    } else {
      importStore(db, emptyStore());
    }
  }
}

function readLegacy() {
  if (!fs.existsSync(dataFile)) return emptyStore();
  return normalizeStore(JSON.parse(fs.readFileSync(dataFile, 'utf8')));
}

export function loadStore() {
  ensureBackend();
  if (backend === 'sqlite') {
    if (cache) return cache;
    cache = attachTracking(normalizeStore(readAll(db)));
    changes = freshChanges();
    studentShadow = new Map();
    dataVersion += 1;
    return cache;
  }
  if (!fs.existsSync(dataFile)) return emptyStore();
  const stamp = stampOf();
  if (cache && stamp && cacheStamp === stamp) return cache;
  try {
    cache = readLegacy();
    cacheStamp = stamp;
    dataVersion += 1;
    return cache;
  } catch (error) {
    cache = null;
    cacheStamp = '';
    const backup = `${dataFile}.broken-${Date.now()}`;
    fs.copyFileSync(dataFile, backup);
    throw new Error(`数据文件读取失败，已备份损坏文件：${error.message}`);
  }
}

function diffStudents(store) {
  const upserts = new Set();
  const current = store.students || {};
  for (const [jwcode, student] of Object.entries(current)) {
    const signature = JSON.stringify(student);
    if (studentShadow.get(jwcode) !== signature) {
      upserts.add(jwcode);
      studentShadow.set(jwcode, signature);
    }
  }
  const deletes = new Set();
  for (const jwcode of studentShadow.keys()) if (!current[jwcode]) { deletes.add(jwcode); studentShadow.delete(jwcode); }
  return { upserts, deletes };
}

export function saveStore(store) {
  ensureBackend();
  if (backend === 'sqlite') {
    if (!changes) changes = freshChanges();
    for (const field of trackedFields) if (!proxied.has(store[field])) changes.replaced.add(field);
    // students / lives 行数小且存在嵌套修改，分别走快照差异与整表 upsert
    const students = diffStudents(store);
    const batch = {
      replaced: changes.replaced,
      upserts: new Map([
        ['students', students.upserts],
        ['lives', new Set(Object.keys(store.lives || {}))],
        ['attendance', changes.upserts.get('attendance')],
        ['dailyPoints', changes.upserts.get('dailyPoints')],
      ]),
      deletes: new Map([
        ['students', students.deletes],
        ['lives', new Set()],
        ['attendance', changes.deletes.get('attendance')],
        ['dailyPoints', changes.deletes.get('dailyPoints')],
      ]),
    };
    writeStore(db, store, batch);
    changes = freshChanges();
    attachTracking(store);
    cache = store;
    dataVersion += 1;
    return;
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const temp = `${dataFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store), 'utf8');
  fs.renameSync(temp, dataFile);
  cache = store;
  cacheStamp = stampOf();
  dataVersion += 1;
}

// 丢弃内存副本，下次 loadStore 重新读库（外部改动或校验失败时使用）
export function dropStoreCache() {
  cache = null;
  cacheStamp = '';
  changes = freshChanges();
  studentShadow = new Map();
  dataVersion += 1;
}
