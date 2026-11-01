import { XxcgClient } from './xxcg.js';
import { loadStore, saveStore } from './store.js';
import { getListUrl } from './credentials.js';
import { rebuildDailyPoints as rebuildWithRules } from './scoring.js';
import { channelFor } from './channels.js';

export { channelFor } from './channels.js';

let running = null;

export function parseDuration(value) {
  if (typeof value === 'number') return Math.max(0, Math.round(value));
  const text = String(value || '').trim();
  if (!text) return 0;
  if (/^\d+$/.test(text)) return Number(text);
  const hours = Number(text.match(/(\d+)\s*(?:h|小时)/i)?.[1] || 0);
  const minutes = Number(text.match(/(\d+)\s*(?:m|分钟)/i)?.[1] || 0);
  const seconds = Number(text.match(/(\d+)\s*(?:s|秒)/i)?.[1] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function normalizedComment(row) {
  if (row.type !== 'text' || Number(row.state) !== 1) return '';
  const content = String(row.content || '').trim();
  const meaningful = content.match(/[\p{L}\p{N}]/gu) || [];
  return meaningful.length >= 2 ? content.replace(/\s+/g, '').toLowerCase() : '';
}

export function countValidComments(comments) {
  const grouped = new Map();
  for (const row of comments) {
    const user = String(row.jwcode || '');
    const content = normalizedComment(row);
    if (!user || !content) continue;
    if (!grouped.has(user)) grouped.set(user, new Map());
    const byContent = grouped.get(user);
    if (!byContent.has(content)) byContent.set(content, []);
    byContent.get(content).push(new Date(String(row.created_at).replace(' ', 'T')).getTime());
  }
  const result = new Map();
  for (const [user, byContent] of grouped) {
    let valid = 0;
    for (const times of byContent.values()) {
      times.sort((a, b) => a - b);
      const spam = times.length >= 5 && times.some((time, index) => index >= 4 && time - times[index - 4] <= 60000);
      if (!spam) valid += times.length;
    }
    result.set(user, valid);
  }
  return result;
}

export function rebuildDailyPoints(store) {
  return rebuildWithRules(store);
}

function summarizeUsers(records) {
  return new Set(records.map(row => String(row.jwcode || '')).filter(Boolean)).size;
}

export async function runSync({ days = Number(process.env.SYNC_LOOKBACK_DAYS || 2), trigger = 'manual', classId = '', className = '' } = {}) {
  if (running) throw new Error('已有同步任务正在运行');
  if (!getListUrl('xxcg')) throw new Error('尚未配置 LIVE_LIST_URL');
  const startedAt = new Date().toISOString();
  const run = { id: `SYNC${Date.now()}`, trigger, days, source: classId ? 'class' : 'channel', classId: String(classId || ''), className, startedAt, finishedAt: null, status: 'running', courses: 0, attendance: 0, comments: 0, gifts: 0, newRecords: 0, students: 0, errors: [] };
  const store = loadStore();
  store.syncRuns.unshift(run);
  store.syncRuns = store.syncRuns.slice(0, 50);
  saveStore(store);
  // 账本约 100MB，单次落盘要 1.5 秒、全量重算要 2 秒；逐场写入会把事件循环堵死
  const saveInterval = Math.max(2000, Number(process.env.SYNC_SAVE_INTERVAL_MS || 15000));
  let lastSavedAt = Date.now();
  running = { id: run.id, startedAt, processed: 0, total: 0, currentCourse: '正在获取直播清单' };

  try {
    const client = new XxcgClient(getListUrl('xxcg'));
    const lives = classId ? await client.listClassLives(classId, days) : await client.listLives(days);
    running.total = lives.length;
    running.source = classId ? 'class' : 'channel';
    running.className = className;
    for (const live of lives) {
      running.currentCourse = live.name;
      const liveId = String(live.id);
      try {
        const [watch, comments, gifts] = await Promise.all([
          client.getWatchRecords(live.id), client.getComments(live.room_id), client.getGifts(live.id),
        ]);
        const validComments = countValidComments(comments);
        const commentCounts = new Map();
        const giftCounts = new Map();
        const giftNames = store.scoring?.giftNames || ['领航卡', '终身领航卡'];
        for (const row of comments) {
          const user = String(row.jwcode || '');
          if (user) commentCounts.set(user, (commentCounts.get(user) || 0) + 1);
        }
        for (const row of gifts) {
          const user = String(row.jwcode || '');
          if (giftNames.includes(row.gift_name) && user) giftCounts.set(user, (giftCounts.get(user) || 0) + 1);
        }
        for (const row of watch) {
          const jwcode = String(row.jwcode || '');
          if (!jwcode) continue;
          const key = `${liveId}:${jwcode}`;
          if (!store.attendance[key]) run.newRecords += 1;
          store.attendance[key] = {
            liveId, jwcode, name: row.name || '未命名学员', dept: row.dept_name || '', shop: row.shop_name || '',
            enterTime: row.enter_time || '', durationSeconds: parseDuration(row.duration), commentCount: commentCounts.get(jwcode) || 0,
            validCommentCount: validComments.get(jwcode) || 0, giftCount: giftCounts.get(jwcode) || 0, updatedAt: new Date().toISOString(),
          };
          store.students[jwcode] = { ...(store.students[jwcode] || {}), jwcode, name: row.name || '未命名学员', dept: row.dept_name || '', shop: row.shop_name || '', totalPoints: store.students[jwcode]?.totalPoints || 0 };
        }
        store.lives[liveId] = {
          id: liveId, roomId: String(live.room_id), name: live.name, startTime: live.start_time, date: live.start_time.slice(0, 10),
          source: classId ? 'class' : 'channel', classId: String(classId || ''), className,
          channel: channelFor(live.start_time, store.scoring.baseChannels), attendanceCount: watch.length, participantCount: summarizeUsers(watch), commentCount: comments.length,
          giftCount: gifts.filter(item => giftNames.includes(item.gift_name)).length, status: 'success', syncedAt: new Date().toISOString(),
        };
        run.courses += 1; run.attendance += watch.length; run.comments += comments.length; run.gifts += gifts.length;
      } catch (error) {
        run.errors.push({ liveId, name: live.name, message: error.message });
        store.lives[liveId] = { ...(store.lives[liveId] || {}), id: liveId, name: live.name, startTime: live.start_time, date: live.start_time.slice(0, 10), channel: channelFor(live.start_time, store.scoring.baseChannels), status: 'error', error: error.message, syncedAt: new Date().toISOString() };
      }
      running.processed += 1;
      if (Date.now() - lastSavedAt >= saveInterval) {
        lastSavedAt = Date.now();
        saveStore(store);
      }
    }
    run.students = new Set(Object.values(store.attendance).filter(item => lives.some(live => String(live.id) === item.liveId)).map(item => item.jwcode)).size;
    run.status = run.errors.length ? (run.courses ? 'partial' : 'failed') : 'success';
  } catch (error) {
    run.status = 'failed';
    run.errors.push({ message: error.message });
  } finally {
    run.finishedAt = new Date().toISOString();
    run.durationSeconds = Math.round((new Date(run.finishedAt) - new Date(startedAt)) / 1000);
    rebuildDailyPoints(store);
    saveStore(store);
    running = null;
  }
  return run;
}

export function getRunning() {
  return running;
}

export function getNextRun(timeZone = 'Asia/Shanghai') {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const parts = Object.fromEntries(formatter.formatToParts(now).map(p => [p.type, p.value]));
  const hour = Number(parts.hour);
  const next = hour < 12 ? `${parts.year}-${parts.month}-${parts.day} 12:00` : `${parts.year}-${parts.month}-${parts.day} 24:00`;
  return next;
}
