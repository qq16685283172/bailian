import { channelFor } from './channels.js';

const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
const sourceId = (live, liveId) => `${live.platform || 'xxcg'}:${liveId}`;

export function ruleMatches(rule, live, date = live.startTime?.slice(0, 10)) {
  if (!rule.enabled || !live || !date) return false;
  if (rule.startDate && date < rule.startDate) return false;
  if (rule.endDate && date > rule.endDate) return false;
  const clock = String(live.startTime || '').slice(11, 16);
  if (rule.liveStart && clock < rule.liveStart) return false;
  if (rule.liveEnd && clock >= rule.liveEnd) return false;
  const platform = live.platform || 'xxcg';
  if (rule.platform && rule.platform !== 'all' && rule.platform !== platform) return false;
  if (rule.className && live.className !== rule.className) return false;
  if (rule.classId && String(live.classId) !== String(rule.classId)) return false;
  if (rule.channel && rule.channel !== 'all' && live.channel !== rule.channel) return false;
  if (rule.keyword && !String(live.name || '').includes(rule.keyword)) return false;
  return true;
}

function activityTriggered(rule, record) {
  if (rule.trigger === 'comment') return record.validCommentCount > 0;
  if (rule.trigger === 'gift') return record.giftCount > 0;
  const minutes = Number(rule.watchMinutes || 0);
  return minutes === 0 ? record.durationSeconds > 0 : record.durationSeconds > minutes * 60;
}

function addSource(item, behavior, source) {
  if (!item.sources[behavior].includes(source)) item.sources[behavior].push(source);
}

export function rebuildDailyPoints(store) {
  const scoring = store.scoring;
  const daily = {};
  const baseNames = new Set(scoring.baseChannels.map(item => item.name));
  const activeRules = scoring.rules.filter(rule => rule.enabled);
  const liveBySource = new Map(Object.values(store.lives).map(live => [sourceId(live, live.id), { ...live, channel: channelFor(live.startTime, scoring.baseChannels) }]));
  const watchThreshold = Number(scoring.watchMinutes) * 60;

  for (const record of Object.values(store.attendance)) {
    const storedLive = store.lives[record.liveId];
    if (!storedLive) continue;
    const live = { ...storedLive, channel: channelFor(storedLive.startTime, scoring.baseChannels) };
    const date = live.startTime.slice(0, 10);
    if (date < scoring.startDate) continue;
    const source = sourceId(live, record.liveId);

    if (baseNames.has(live.channel)) {
      const key = `${record.jwcode}|${date}|${live.channel}|base`;
      if (!daily[key]) daily[key] = { key, jwcode: record.jwcode, name: record.name, date, channel: live.channel, ruleType: 'base', watch: false, comment: false, gift: false, baseScore: 0, bonusScore: 0, multiplier: 1, score: 0, sources: { watch: [], comment: [], gift: [] }, updatedAt: new Date().toISOString() };
      const item = daily[key];
      if (record.durationSeconds > watchThreshold) { item.watch = true; addSource(item, 'watch', source); }
      if (record.validCommentCount > 0) { item.comment = true; addSource(item, 'comment', source); }
      if (record.giftCount > 0) { item.gift = true; addSource(item, 'gift', source); }
    }

    for (const rule of activeRules) {
      if (rule.type !== 'activity' || !ruleMatches(rule, live, date) || !activityTriggered(rule, record)) continue;
      const key = `${record.jwcode}|${date}|${rule.id}|activity`;
      if (!daily[key]) daily[key] = { key, jwcode: record.jwcode, name: record.name, date, channel: `活动 · ${rule.name}`, ruleType: 'activity', ruleId: rule.id, watch: false, comment: false, gift: false, baseScore: 0, bonusScore: 0, multiplier: Number(rule.multiplier || 1), score: 0, sources: { watch: [], comment: [], gift: [] }, updatedAt: new Date().toISOString() };
      const item = daily[key];
      const behavior = rule.trigger === 'comment' ? 'comment' : rule.trigger === 'gift' ? 'gift' : 'watch';
      item[behavior] = true;
      addSource(item, behavior, source);
      item.bonusScore = round(Number(rule.points || 0) * Number(rule.multiplier || 1));
      item.score = item.bonusScore;
    }
  }

  for (const grant of Object.values(store.welfareGrants || {})) {
    const points = Number(grant.points || 0);
    if (!grant.jwcode || !grant.date || !points) continue;
    const key = `${grant.jwcode}|${grant.date}|${grant.id}|welfare`;
    daily[key] = { key, jwcode: grant.jwcode, name: store.students[grant.jwcode]?.name || grant.jwcode, date: grant.date, channel: `活动 · ${grant.title}`, ruleType: 'activity', ruleId: grant.id, watch: false, comment: false, gift: false, baseScore: 0, bonusScore: points, multiplier: 1, activityMultiplier: 1, score: points, reason: grant.evidence || '领航粉季专属回馈', sources: { watch: [], comment: [], gift: [] }, updatedAt: grant.createdAt || new Date().toISOString() };
  }

  for (const item of Object.values(daily)) {
    if (item.ruleType === 'activity') {
      const activityRules = activeRules.filter(rule => rule.type === 'multiplier' && rule.includeActivity && rule.channel === 'all' && (!rule.startDate || item.date >= rule.startDate) && (!rule.endDate || item.date <= rule.endDate)).sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
      if (activityRules.length) {
        item.activityMultiplier = Number(activityRules[0].multiplier || 1);
        item.multiplierRuleName = activityRules[0].name;
        item.score = round(item.bonusScore * item.activityMultiplier);
      }
      continue;
    }
    if (item.ruleType !== 'base') continue;
    item.baseScore = Number(item.watch) + Number(item.comment) + Number(item.gift);
    const sources = [...item.sources.watch, ...item.sources.comment, ...item.sources.gift];
    const multiplierRules = activeRules.filter(rule => rule.type === 'multiplier' && sources.some(source => {
      const live = liveBySource.get(source);
      return live && ruleMatches(rule, live, item.date) && (!rule.channel || rule.channel === 'all' || rule.channel === item.channel);
    })).sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || Number(b.multiplier || 1) - Number(a.multiplier || 1));
    if (multiplierRules.length) {
      item.multiplier = Number(multiplierRules[0].multiplier || 1);
      item.multiplierRuleName = multiplierRules[0].name;
    }
    item.score = round(item.baseScore * item.multiplier);
  }

  for (const adjustment of Object.values(store.pointAdjustments || {}).filter(item => item.status === 'approved')) {
    const date = adjustment.effectiveDate || adjustment.createdAt.slice(0, 10);
    const points = Number(adjustment.points || 0);
    const key = `${adjustment.jwcode}|${date}|${adjustment.id}|manual`;
    daily[key] = { key, jwcode: adjustment.jwcode, name: store.students[adjustment.jwcode]?.name || adjustment.jwcode, date, channel: points >= 0 ? '人工补分' : '人工扣分', ruleType: 'manual', ruleId: adjustment.id, watch: false, comment: false, gift: false, baseScore: 0, bonusScore: 0, multiplier: 1, score: points, reason: adjustment.reason, sources: { watch: [], comment: [], gift: [] }, updatedAt: adjustment.reviewedAt };
  }

  store.dailyPoints = daily;
  for (const student of Object.values(store.students)) student.totalPoints = 0;
  for (const item of Object.values(daily)) {
    if (!store.students[item.jwcode]) store.students[item.jwcode] = { jwcode: item.jwcode, name: item.name, totalPoints: 0 };
    store.students[item.jwcode].totalPoints = round(store.students[item.jwcode].totalPoints + item.score);
  }
  const values = Object.values(daily);
  store.scoringMeta = {
    recalculatedAt: new Date().toISOString(), records: values.length,
    basePoints: round(values.reduce((sum, item) => sum + item.baseScore, 0)),
    activityPoints: round(values.filter(item => item.ruleType === 'activity').reduce((sum, item) => sum + item.score, 0)),
    manualPoints: round(values.filter(item => item.ruleType === 'manual').reduce((sum, item) => sum + item.score, 0)),
    totalPoints: round(values.reduce((sum, item) => sum + item.score, 0)),
  };
  return store.scoringMeta;
}
