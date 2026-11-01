import { storeVersion } from './store.js';

const levels = [
  { level: 1, name: '铁砧', title: '百炼新人', threshold: 0 }, { level: 2, name: '淬火', title: '淬火学徒', threshold: 60 },
  { level: 3, name: '锻打', title: '锻打匠人', threshold: 150 }, { level: 4, name: '成型', title: '成型巧匠', threshold: 280 },
  { level: 5, name: '开刃', title: '开刃师傅', threshold: 450 }, { level: 6, name: '精钢', title: '精钢大师', threshold: 680 },
  { level: 7, name: '百炼成钢', title: '百炼宗师', threshold: 900 },
];
const channelIds = { 财经壹眼: 'morning', 三点启航: 'afternoon', 易学久会: 'evening' };

export function shanghaiDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = type => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function levelFor(score) {
  score = Math.max(0, Number(score) || 0);
  const current = [...levels].reverse().find(item => score >= item.threshold) || levels[0];
  const next = levels.find(item => item.level === current.level + 1) || null;
  return { ...current, score, next, remaining: next ? Math.max(0, next.threshold - score) : 0, progress: next ? Math.round((score - current.threshold) / (next.threshold - current.threshold) * 100) : 100 };
}

function maskName(name) {
  const value = String(name || '学员');
  return `${value.slice(0, 1)}${'*'.repeat(Math.min(2, Math.max(1, value.length - 1)))}`;
}

// dailyPoints 已有 14 万条，逐请求全量遍历要数百毫秒；按账本版本建立精网号索引与榜单缓存
const ledgerCache = { version: -1, byJwcode: null, rankings: new Map() };

function ledgerOf(store) {
  const version = storeVersion();
  if (ledgerCache.version === version && ledgerCache.byJwcode) return ledgerCache.byJwcode;
  const byJwcode = new Map();
  for (const item of Object.values(store.dailyPoints)) {
    const key = String(item.jwcode);
    const list = byJwcode.get(key);
    if (list) list.push(item); else byJwcode.set(key, [item]);
  }
  ledgerCache.version = version;
  ledgerCache.byJwcode = byJwcode;
  ledgerCache.rankings = new Map();
  return byJwcode;
}

function periodMatcher(period) {
  const today = shanghaiDate();
  const month = today.slice(0, 7);
  const weekStart = shanghaiDate(new Date(Date.now() - 6 * 86400000));
  if (period === '日榜') return item => item.date === today;
  if (period === '月榜') return item => item.date.startsWith(month);
  if (period === '周榜') return item => item.date >= weekStart;
  return () => true;
}

export function getRanking(store, jwcode, period = '总榜', includeScores = false) {
  const byJwcode = ledgerOf(store);
  let rows = ledgerCache.rankings.get(period);
  if (!rows) {
    const match = periodMatcher(period);
    const scores = new Map();
    for (const [id, list] of byJwcode) {
      let matched = false, score = 0;
      for (const item of list) if (match(item)) { matched = true; score += item.score; }
      if (matched) scores.set(id, score);
    }
    rows = [...scores.entries()].map(([id, score]) => {
      const student = store.students[id] || {};
      const level = levelFor(student.totalPoints || 0);
      return { jwcode: id, name: maskName(student.name), title: level.title, score, branch: student.dept || '未设置分部', avatar: String(student.name || '学').slice(0, 1) };
    }).sort((a, b) => b.score - a.score || a.jwcode.localeCompare(b.jwcode));
    rows.forEach((row, index) => { row.rank = index + 1; });
    ledgerCache.rankings.set(period, rows);
  }
  const meIndex = rows.findIndex(row => row.jwcode === String(jwcode));
  const me = meIndex >= 0 ? { ...rows[meIndex], name: store.students[jwcode]?.name || '我', gap: meIndex > 0 ? rows[meIndex - 1].score - rows[meIndex].score : 0 } : { rank: '—', score: 0, gap: 0, name: store.students[jwcode]?.name || '我' };
  // 榜单只展示前 10 名；本人排名单独由 me 返回，前端在榜外时追加一行
  const list = rows.slice(0, 10).map(({ jwcode: id, ...row }) => {
    if (!includeScores) delete row.score;
    return row;
  });
  return { list, me, period };
}

function learningStreak(records, today) {
  const dates = new Set(records.filter(item => item.score > 0).map(item => item.date));
  let streak = 0;
  let cursor = new Date(`${today}T00:00:00+08:00`);
  if (!dates.has(shanghaiDate(cursor))) cursor = new Date(cursor.getTime() - 86400000);
  while (dates.has(shanghaiDate(cursor))) { streak += 1; cursor = new Date(cursor.getTime() - 86400000); }
  return streak;
}

export function getClientSnapshot(store, jwcode) {
  const student = store.students[jwcode];
  if (!student) return null;
  const today = shanghaiDate();
  const records = ledgerOf(store).get(String(jwcode)) || [];
  const todayRecords = records.filter(item => item.date === today);
  const tasks = { morning: [false, false, false], evening: [false, false, false] };
  for (const item of todayRecords) {
    const id = channelIds[item.channel];
    if (id) tasks[id] = [item.comment, item.gift, item.watch];
  }
  const totalPoints = student.totalPoints || 0;
  const ranking = getRanking(store, jwcode, '总榜');
  const monthRanking = getRanking(store, jwcode, '月榜');
  const lastSync = Object.values(store.lives).map(item => item.syncedAt).sort().at(-1) || null;
  const claims = Object.values(store.rewardClaims || {}).filter(item => item.jwcode === jwcode);
  const rewards = Object.values(store.rewards || {}).filter(item => item.enabled).map(reward => {
    const claimedCount = Object.values(store.rewardClaims || {}).filter(item => item.rewardId === reward.id).length;
    const claim = claims.find(item => item.rewardId === reward.id);
    return { ...reward, claimed: Boolean(claim), claimedAt: claim?.createdAt || null, claimedCount, remainingStock: Math.max(0, Number(reward.stock || 0) - claimedCount) };
  }).sort((a, b) => a.points - b.points);
  const pendingRewards = rewards.filter(item => !item.claimed && item.points <= totalPoints && item.remainingStock > 0 && (item.kind !== 'material' || Boolean(item.fileUrl))).length;
  const cosmetics = { avatarFrame: null, rankBubble: null, theme: null };
  for (const claim of [...claims].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const reward = store.rewards[claim.rewardId];
    if (reward?.styleKey && ['avatarFrame', 'rankBubble', 'theme'].includes(reward.kind)) cosmetics[reward.kind] = reward.styleKey;
  }
  const selection = store.cosmeticSelections?.[jwcode] || {};
  for (const kind of ['avatarFrame', 'rankBubble', 'theme']) {
    if (Object.hasOwn(selection, kind)) cosmetics[kind] = selection[kind] || null;
  }
  const channels = store.scoring.baseChannels.map((channel, index) => ({ id: channelIds[channel.name] || `channel-${index}`, name: channel.name, time: channel.time, status: `统计 ${channel.start}–${channel.end}`, tone: index ? 'blue' : 'gold' }));
  return {
    student: { jwcode, name: student.name, dept: student.dept || '未同步分部', shop: student.shop || '', joinDays: new Set(records.map(item => item.date)).size },
    date: today, tasks, channels, watchMinutes: Number(store.scoring.watchMinutes), levelThresholds: [0, 60, 150, 280, 450, 680, 900],
    todayScore: todayRecords.reduce((sum, item) => sum + item.score, 0),
    todayBaseScore: todayRecords.filter(item => item.ruleType === 'base').reduce((sum, item) => sum + item.baseScore, 0),
    todayActivityScore: todayRecords.filter(item => item.ruleType === 'activity').reduce((sum, item) => sum + item.score, 0),
    todayAdjustmentScore: todayRecords.filter(item => item.ruleType === 'manual').reduce((sum, item) => sum + item.score, 0), totalPoints,
    level: levelFor(totalPoints), streak: learningStreak(records, today), rank: ranking.me, monthRank: monthRanking.me,
    nextReward: rewards.find(item => !item.claimed) || null, claimedRewards: claims.length, pendingRewards, cosmetics,
    ledger: [...records].sort((a, b) => b.date.localeCompare(a.date) || b.score - a.score).slice(0, 30).map(item => ({
      date: item.date, title: item.ruleType === 'manual' ? `${item.channel} · 审核通过` : `${item.channel} · ${item.ruleType === 'activity' ? '活动达标' : [item.comment && '有效打卡', item.gift && '送出领航卡', item.watch && `观看超过 ${store.scoring.watchMinutes} 分钟`].filter(Boolean).join('、') || '学习任务'}${(item.ruleType === 'base' && item.multiplier > 1) || (item.ruleType === 'activity' && item.activityMultiplier > 1) ? ` · ${item.ruleType === 'activity' ? item.activityMultiplier : item.multiplier} 倍积分` : ''}`,
      live: item.ruleType === 'manual' || item.ruleId?.startsWith('welfare-') ? item.reason : `${item.sources.watch.length + item.sources.comment.length + item.sources.gift.length} 条计分来源`, points: item.score,
    })),
    lastSync,
  };
}

export function getDefaultJwcode(store) {
  const candidates = Object.values(store.dailyPoints).sort((a, b) => b.date.localeCompare(a.date) || b.score - a.score || a.jwcode.localeCompare(b.jwcode));
  return candidates[0]?.jwcode || Object.keys(store.students)[0] || null;
}
