import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStore, saveStore, storageInfo } from './store.js';
import { getNextRun, getRunning, rebuildDailyPoints, runSync } from './sync.js';
import { XxcgClient } from './xxcg.js';
import { getClientSnapshot, getRanking } from './client.js';
import { changePassword as savePassword, endSession, getSession, hasCustomPassword, requireAdmin, requireAuth, revokeOtherSessions, startSession, verifyPassword } from './auth.js';
import { allCredentialStatus, credentialStatus, getListUrl, saveListUrl } from './credentials.js';
import { registerBusinessRoutes } from './business.js';
import { aiEngine, aiSuggestions, askAI } from './ai.js';

const app = express();
const port = Number(process.env.PORT || 3001);
const timeZone = process.env.SYNC_TIMEZONE || 'Asia/Shanghai';
const dirname = path.dirname(fileURLToPath(import.meta.url));
app.set('trust proxy', 1);
app.use(express.json());
const loginAttempts = new Map();
const attemptKey = (req, jwcode) => `${req.ip}:${jwcode}`;
const tooManyAttempts = key => {
  const item = loginAttempts.get(key);
  if (!item || Date.now() - item.startedAt > 15 * 60 * 1000) return false;
  return item.count >= 10;
};
const registerFailure = key => {
  const previous = loginAttempts.get(key);
  const item = previous && Date.now() - previous.startedAt <= 15 * 60 * 1000 ? previous : { count: 0, startedAt: Date.now() };
  item.count += 1;
  loginAttempts.set(key, item);
};

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString(), storage: storageInfo().engine }));

app.post('/api/auth/login', (req, res) => {
  const jwcode = String(req.body?.jwcode || '').trim();
  const key = attemptKey(req, jwcode);
  if (!/^\d{6,12}$/.test(jwcode)) return res.status(400).json({ message: '请输入 6–12 位精网号' });
  if (!['3', '5'].includes(jwcode[0])) return res.status(400).json({ message: '仅支持 3 或 5 开头的精网号登录' });
  if (tooManyAttempts(key)) return res.status(429).json({ message: '尝试次数过多，请 15 分钟后再试' });
  const student = loadStore().students[jwcode];
  if (!student) {
    registerFailure(key);
    return res.status(401).json({ message: '精网号不存在或尚未同步' });
  }
  if (jwcode.startsWith('3') && !verifyPassword(jwcode, req.body?.password)) {
    registerFailure(key);
    return res.status(401).json({ message: '精网号或密码错误' });
  }
  const user = { jwcode, name: student.name || `学员 ${jwcode}`, role: jwcode.startsWith('3') ? 'admin' : 'student' };
  loginAttempts.delete(key);
  startSession(req, res, user);
  res.json({ user: { ...user, defaultPassword: user.role === 'admin' && !hasCustomPassword(jwcode) } });
});

app.get('/api/auth/me', (req, res) => {
  const session = getSession(req);
  if (!session) return res.json({ authenticated: false });
  res.json({ authenticated: true, user: { ...session.user, defaultPassword: session.user.role === 'admin' && !hasCustomPassword(session.user.jwcode) } });
});

app.post('/api/auth/logout', (req, res) => {
  endSession(req, res);
  res.json({ ok: true });
});

app.post('/api/auth/password', requireAdmin, (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (!verifyPassword(req.auth.user.jwcode, currentPassword)) return res.status(400).json({ message: '当前密码不正确' });
  if (newPassword.length < 6 || newPassword.length > 64) return res.status(400).json({ message: '新密码需为 6–64 位字符' });
  if (newPassword === currentPassword) return res.status(400).json({ message: '新密码不能与当前密码相同' });
  savePassword(req.auth.user.jwcode, newPassword);
  revokeOtherSessions(req.auth.user.jwcode, req.auth.token);
  res.json({ ok: true, message: '密码已修改，其他登录会话已退出' });
});

app.use(['/api/credentials', '/api/sync', '/api/classes', '/api/lives', '/api/points', '/api/scoring'], requireAdmin);
app.use('/api/client', requireAuth);
registerBusinessRoutes(app, requireAdmin);

app.get('/api/credentials', (req, res) => res.json({ list: allCredentialStatus() }));

app.post('/api/credentials/:platform', (req, res) => {
  try { res.json(saveListUrl(req.params.platform, req.body?.listUrl)); }
  catch (error) { res.status(400).json({ message: error.message }); }
});

app.post('/api/credentials/:platform/test', async (req, res) => {
  try {
    const platform = req.params.platform;
    credentialStatus(platform);
    const listUrl = req.body?.listUrl || getListUrl(platform);
    if (!listUrl) throw new Error('请先保存完整直播列表链接');
    const lives = await new XxcgClient(listUrl).listLives(1);
    res.json({ ok: true, message: `连接成功，最近 1 天有 ${lives.length} 场已结束直播` });
  } catch (error) { res.status(400).json({ ok: false, message: `连接失败：${error.message}` }); }
});

app.get('/api/sync/status', (req, res) => {
  const store = loadStore();
  const attendance = Object.values(store.attendance);
  res.json({
    configured: activePlatforms().length > 0, platforms: activePlatforms(), running: getRunning(), lastRun: store.syncRuns[0] || null,
    schedule: ['每天 12:00', '每天 24:00'], nextRun: getNextRun(timeZone), timeZone,
    lookbackDays: Number(process.env.SYNC_LOOKBACK_DAYS || 2), classSource: store.settings,
    storage: storageInfo(),
    totals: { lives: Object.keys(store.lives).length, attendance: attendance.length, students: Object.keys(store.students).length, points: Object.values(store.dailyPoints).reduce((sum, item) => sum + item.score, 0) },
  });
});

app.get('/api/sync/runs', (req, res) => res.json({ list: loadStore().syncRuns.slice(0, 20) }));

app.post('/api/sync/test', async (req, res) => {
  try {
    if (!getListUrl('xxcg')) throw new Error('请先在管理端配置精网凭证');
    const lives = await new XxcgClient(getListUrl('xxcg')).listLives(1);
    res.json({ ok: true, message: `连接成功，最近 1 天有 ${lives.length} 场已结束直播` });
  } catch (error) {
    res.status(400).json({ ok: false, message: `连接失败：${error.message}` });
  }
});

app.post('/api/sync/run', (req, res) => {
  if (getRunning()) return res.status(409).json({ message: '已有同步任务正在运行' });
  const days = Math.min(365, Math.max(1, Number(req.body?.days || process.env.SYNC_LOOKBACK_DAYS || 2)));
  (async () => {
    for (const platform of activePlatforms()) {
      try { await runSync({ days, trigger: 'manual', platform }); }
      catch (error) { console.error(`[sync/${platform}]`, error.message); }
    }
  })();
  res.status(202).json({ accepted: true, days, message: `已开始补查最近 ${days} 天` });
});

app.get('/api/classes', async (req, res) => {
  const store = loadStore();
  try {
    if (req.query.refresh !== '1' && Object.keys(store.classes).length) return res.json({ list: Object.values(store.classes).sort((a, b) => Number(b.id) - Number(a.id)), cached: true });
    const list = await new XxcgClient(getListUrl('xxcg')).listClasses();
    for (const item of list) store.classes[item.id] = item;
    saveStore(store);
    res.json({ list, cached: false });
  } catch (error) {
    if (Object.keys(store.classes).length) return res.json({ list: Object.values(store.classes).sort((a, b) => Number(b.id) - Number(a.id)), cached: true, warning: error.message });
    res.status(400).json({ message: `班级列表读取失败：${error.message}` });
  }
});

app.post('/api/classes/settings', (req, res) => {
  const store = loadStore();
  const classId = String(req.body?.classId || '');
  const selected = store.classes[classId];
  if (req.body?.enabled && !selected) return res.status(400).json({ message: '请先选择有效班级' });
  store.settings = { autoClassId: classId, autoClassName: selected?.name || '', autoClassEnabled: Boolean(req.body?.enabled && classId) };
  saveStore(store);
  res.json(store.settings);
});

app.post('/api/classes/sync', (req, res) => {
  if (getRunning()) return res.status(409).json({ message: '已有同步任务正在运行' });
  const store = loadStore();
  const classId = String(req.body?.classId || '');
  const selected = store.classes[classId];
  if (!selected) return res.status(400).json({ message: '请选择要补采的班级' });
  const days = Math.min(365, Math.max(1, Number(req.body?.days || 7)));
  runSync({ days, trigger: 'manual-class', classId, className: selected.name }).catch(error => console.error('[class-sync]', error.message));
  res.status(202).json({ accepted: true, days, message: `已开始抓取「${selected.name}」最近 ${days} 天的数据` });
});

app.get('/api/lives', (req, res) => {
  const list = Object.values(loadStore().lives).sort((a, b) => String(b.startTime).localeCompare(String(a.startTime))).slice(0, 100);
  res.json({ list });
});

app.get('/api/points/daily', (req, res) => {
  const { date, jwcode } = req.query;
  let list = Object.values(loadStore().dailyPoints);
  if (date) list = list.filter(item => item.date === date);
  if (jwcode) list = list.filter(item => item.jwcode === String(jwcode));
  list.sort((a, b) => b.date.localeCompare(a.date) || b.score - a.score);
  res.json({ list: list.slice(0, 500), total: list.length });
});

app.get('/api/scoring/config', (req, res) => {
  const store = loadStore();
  res.json({ scoring: store.scoring, meta: store.scoringMeta || null });
});

app.post('/api/scoring/settings', (req, res) => {
  const store = loadStore();
  const startDate = String(req.body?.startDate || '');
  const watchMinutes = Number(req.body?.watchMinutes);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return res.status(400).json({ message: '请选择正确的计分起算日期' });
  if (!Number.isFinite(watchMinutes) || watchMinutes < 1 || watchMinutes > 180) return res.status(400).json({ message: '观看阈值需在 1–180 分钟之间' });
  const giftNames = [...new Set((req.body?.giftNames || []).map(item => String(item).trim()).filter(Boolean))];
  if (!giftNames.length) return res.status(400).json({ message: '至少保留一种领航卡名称' });
  store.scoring.startDate = startDate;
  store.scoring.watchMinutes = watchMinutes;
  store.scoring.giftNames = giftNames;
  const meta = rebuildDailyPoints(store);
  saveStore(store);
  res.json({ scoring: store.scoring, meta });
});

app.post('/api/scoring/rules', (req, res) => {
  const store = loadStore();
  const input = req.body || {};
  if (!String(input.name || '').trim()) return res.status(400).json({ message: '请填写规则名称' });
  if (!['activity', 'multiplier'].includes(input.type)) return res.status(400).json({ message: '规则类型不正确' });
  if (input.type === 'activity' && (!Number.isFinite(Number(input.points)) || Number(input.points) <= 0 || Number(input.points) > 100)) return res.status(400).json({ message: '活动加分需在 0–100 分之间' });
  if (input.type === 'multiplier' && (!Number.isFinite(Number(input.multiplier)) || Number(input.multiplier) <= 0 || Number(input.multiplier) > 10)) return res.status(400).json({ message: '积分倍数需在 0–10 之间' });
  if (input.type === 'multiplier' && input.channel !== 'all' && !store.scoring.baseChannels.some(channel => channel.name === input.channel)) return res.status(400).json({ message: '翻倍活动请选择全部栏目、财经壹眼或易学久会' });
  if (input.startDate && input.endDate && input.endDate < input.startDate) return res.status(400).json({ message: '执行结束日期不能早于开始日期' });
  const clockPattern = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;
  if (input.type === 'activity' && ((input.liveStart && !clockPattern.test(input.liveStart)) || (input.liveEnd && !clockPattern.test(input.liveEnd)))) return res.status(400).json({ message: '直播时段格式不正确' });
  if (input.type === 'activity' && input.liveStart && input.liveEnd && input.liveEnd <= input.liveStart) return res.status(400).json({ message: '直播时段结束时间必须晚于开始时间' });
  const index = store.scoring.rules.findIndex(rule => rule.id === input.id);
  const previous = index >= 0 ? store.scoring.rules[index] : {};
  const rule = {
    ...previous, ...input, id: previous.id || `rule-${Date.now()}`, name: String(input.name).trim(),
    points: Number(input.points || 0), multiplier: Number(input.multiplier || 1), watchMinutes: Number(input.watchMinutes || 0),
    priority: Number(input.priority || 0), enabled: input.enabled !== false, builtIn: Boolean(previous.builtIn),
  };
  if (index >= 0) store.scoring.rules[index] = rule; else store.scoring.rules.push(rule);
  const meta = rebuildDailyPoints(store);
  saveStore(store);
  res.json({ rule, scoring: store.scoring, meta });
});

app.delete('/api/scoring/rules/:id', (req, res) => {
  const store = loadStore();
  const rule = store.scoring.rules.find(item => item.id === req.params.id);
  if (!rule) return res.status(404).json({ message: '规则不存在' });
  if (rule.builtIn) return res.status(400).json({ message: '内置活动只能停用，不能删除' });
  store.scoring.rules = store.scoring.rules.filter(item => item.id !== req.params.id);
  const meta = rebuildDailyPoints(store);
  saveStore(store);
  res.json({ ok: true, meta });
});

app.post('/api/scoring/recalculate', (req, res) => {
  const store = loadStore();
  const before = store.scoringMeta?.totalPoints || 0;
  const meta = rebuildDailyPoints(store);
  saveStore(store);
  res.json({ before, after: meta.totalPoints, meta });
});

const aiHits = new Map();
const aiLimit = Number(process.env.AI_RATE_LIMIT || 20);

app.use('/api/ai', requireAuth, (req, res, next) => {
  const key = req.auth.user.jwcode;
  const now = Date.now();
  const hits = (aiHits.get(key) || []).filter(time => now - time < 60000);
  if (hits.length >= aiLimit) return res.status(429).json({ message: '小AI 每分钟最多回答 20 次，请稍后再问' });
  hits.push(now);
  aiHits.set(key, hits);
  next();
});

app.get('/api/ai/status', (req, res) => res.json({ ...aiEngine(), suggestions: aiSuggestions }));

app.post('/api/ai/ask', async (req, res) => {
  const question = String(req.body?.question || '');
  if (question.length > 200) return res.status(400).json({ message: '问题请控制在 200 字以内' });
  try {
    const result = await askAI({ store: loadStore(), jwcode: req.auth.user.jwcode, question });
    res.json(result);
  } catch (error) {
    console.error('[ai]', error.message);
    res.status(500).json({ message: '小AI 暂时无法回答，请稍后再试' });
  }
});

app.get('/api/client/default', (req, res) => res.json({ jwcode: req.auth.user.jwcode }));

app.get('/api/client/ranking', (req, res) => {
  res.json(getRanking(loadStore(), req.auth.user.jwcode, req.query.period || '总榜', req.auth.user.role === 'admin'));
});

app.get('/api/client/:jwcode', (req, res) => {
  const jwcode = String(req.params.jwcode);
  if (jwcode !== req.auth.user.jwcode) return res.status(403).json({ message: '只能查看当前登录精网号的学习档案' });
  const snapshot = getClientSnapshot(loadStore(), jwcode);
  if (!snapshot) return res.status(404).json({ message: '该精网号暂无同步记录，请先完成数据补采' });
  res.json(snapshot);
});

const SYNC_PLATFORMS = ['xxcg', 'toujiao'];
function activePlatforms() { return SYNC_PLATFORMS.filter((item) => getListUrl(item)); }

async function executeScheduled(trigger) {
  if (getRunning()) return console.log(`[${trigger}] 上次任务未完成，本次跳过`);
  for (const platform of activePlatforms()) {
    try {
      const run = await runSync({ trigger, platform });
      console.log(`[${trigger}/${platform}] ${run.status}: ${run.courses} 场 / ${run.attendance} 条`);
    } catch (error) { console.error(`[${trigger}/${platform}]`, error.message); }
  }
  const settings = loadStore().settings;
  if (settings.autoClassEnabled && settings.autoClassId) {
    try {
      const run = await runSync({ trigger: `${trigger}-class`, classId: settings.autoClassId, className: settings.autoClassName });
      console.log(`[${trigger}-class] ${run.status}: ${run.courses} 场`);
    } catch (error) { console.error(`[${trigger}-class]`, error.message); }
  }
}

for (const [expression, trigger] of [['0 12 * * *', 'schedule-noon'], ['0 0 * * *', 'schedule-midnight']]) {
  cron.schedule(expression, () => executeScheduled(trigger), { timezone: timeZone });
}

if (process.env.SYNC_ON_BOOT === 'true') runSync({ trigger: 'startup' }).catch(error => console.error('[startup]', error.message));

const dist = path.resolve(dirname, '../dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile(path.join(dist, 'index.html')));
}

app.listen(port, () => console.log(`百炼同步服务已启动：http://localhost:${port}，定时：12:00 / 24:00（${timeZone}）`));
