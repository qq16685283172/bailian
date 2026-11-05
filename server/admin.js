import { levelFor, shanghaiDate } from './client.js';

const DAY = 86400000;
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
const percent = (value, total) => total ? round(value / total * 100) : 0;
const learning = item => ['base', 'activity'].includes(item.ruleType) && item.score > 0;
const shift = (today, days) => shanghaiDate(new Date(new Date(`${today}T00:00:00+08:00`).getTime() + days * DAY));

function periodRange(period) {
  const days = Number(period) === 30 ? 30 : 7;
  const today = shanghaiDate();
  const start = shift(today, -(days - 1));
  return { today, start, days, dates: Array.from({ length: days }, (_, index) => shift(start, index)) };
}

function buildStats(store) {
  const stats = new Map();
  const ensure = jwcode => {
    if (!stats.has(jwcode)) stats.set(jwcode, { todayScore: 0, lastLearning: '', lastPoints: '', activeDates: new Set(), baseByDate: new Map(), channels: new Map() });
    return stats.get(jwcode);
  };
  const today = shanghaiDate();
  for (const item of Object.values(store.dailyPoints)) {
    const stat = ensure(item.jwcode);
    if (item.date === today) stat.todayScore = round(stat.todayScore + item.score);
    if (item.score !== 0 && (!stat.lastPoints || item.date > stat.lastPoints)) stat.lastPoints = item.date;
    if (!learning(item)) continue;
    if (!stat.lastLearning || item.date > stat.lastLearning) stat.lastLearning = item.date;
    stat.activeDates.add(item.date);
    stat.baseByDate.set(item.date, round((stat.baseByDate.get(item.date) || 0) + Number(item.baseScore || 0)));
    if (item.ruleType === 'base') {
      if (!stat.channels.has(item.channel)) stat.channels.set(item.channel, new Set());
      stat.channels.get(item.channel).add(item.date);
    }
  }
  return stats;
}

function studentRows(store) {
  const stats = buildStats(store);
  return Object.values(store.students).map(student => {
    const stat = stats.get(student.jwcode) || { todayScore: 0, lastLearning: '', lastPoints: '', activeDates: new Set(), baseByDate: new Map(), channels: new Map() };
    return {
      id: student.jwcode, name: student.name || `学员 ${student.jwcode}`, dept: student.dept || '未同步分部', shop: student.shop || '',
      level: levelFor(student.totalPoints || 0).title, score: student.totalPoints || 0, today: stat.todayScore,
      lastLearning: stat.lastLearning || null, lastPoints: stat.lastPoints || null, activeDates: stat.activeDates,
      baseByDate: stat.baseByDate, channels: stat.channels,
    };
  });
}

function publicRow(row, today) {
  const weekStart = shift(today, -6);
  return {
    id: row.id, name: row.name, dept: row.dept, shop: row.shop, level: row.level, score: row.score, today: row.today,
    status: row.lastLearning && row.lastLearning >= weekStart ? 'active' : 'risk',
    lastLearning: row.lastLearning, lastPoints: row.lastPoints,
  };
}

export function getDashboard(store, period = 7) {
  const { today, start, days, dates } = periodRange(period);
  const rows = studentRows(store);
  const risk = rows.filter(row => !row.lastLearning || row.lastLearning < start);
  const todayActive = rows.filter(row => row.activeDates.has(today));
  const fullToday = rows.filter(row => (row.baseByDate.get(today) || 0) >= 6);
  const trend = dates.map(date => ({
    date, active: rows.filter(row => row.activeDates.has(date)).length,
    full: rows.filter(row => (row.baseByDate.get(date) || 0) >= 6).length,
  }));
  const channels = store.scoring.baseChannels.map(channel => {
    const participants = rows.filter(row => row.channels.get(channel.name)?.has(today)).length;
    return { name: channel.name, time: channel.time, participants, rate: percent(participants, rows.length) };
  });
  return {
    today, period: days, generatedAt: new Date().toISOString(), totalStudents: rows.length,
    metrics: { active: todayActive.length, participationRate: percent(todayActive.length, rows.length), full: fullToday.length, fullRate: percent(fullToday.length, todayActive.length), risk: risk.length },
    trend, channels,
    riskList: risk.sort((a, b) => String(a.lastLearning || '').localeCompare(String(b.lastLearning || '')) || b.score - a.score).slice(0, 6).map(row => publicRow(row, today)),
  };
}

export function getStudents(store, options = {}) {
  const today = shanghaiDate();
  const query = String(options.query || '').trim().toLowerCase();
  const dept = String(options.dept || '');
  const status = String(options.status || '');
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(options.pageSize) || 20));
  const all = studentRows(store).map(row => publicRow(row, today));
  const filtered = all.filter(row => (!query || `${row.name} ${row.id} ${row.dept} ${row.shop}`.toLowerCase().includes(query)) && (!dept || row.dept === dept) && (!status || row.status === status));
  const sortKey = ['score', 'today', 'lastLearning', 'name', 'id'].includes(String(options.sort)) ? String(options.sort) : 'score';
  const direction = String(options.dir) === 'asc' ? 1 : -1;
  filtered.sort((a, b) => {
    const left = a[sortKey] ?? '';
    const right = b[sortKey] ?? '';
    const compare = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right), 'zh-CN');
    return compare * direction || a.id.localeCompare(b.id);
  });
  return {
    list: filtered.slice((page - 1) * pageSize, page * pageSize), all: filtered,
    total: filtered.length, page, pageSize, totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
    departments: [...new Set(all.map(row => row.dept))].sort(), generatedAt: new Date().toISOString(),
  };
}

function behaviorData(store, period, dept) {
  const range = periodRange(period);
  const rows = studentRows(store).filter(row => !dept || row.dept === dept);
  const codes = new Set(rows.map(row => row.id));
  const records = Object.values(store.dailyPoints).filter(item => item.date >= range.start && item.date <= range.today && codes.has(item.jwcode));
  const attendance = Object.values(store.attendance).filter(record => {
    const live = store.lives[record.liveId];
    return live && live.startTime.slice(0, 10) >= range.start && live.startTime.slice(0, 10) <= range.today && codes.has(record.jwcode);
  });
  return { range, rows, records, attendance };
}

export function getBehaviorAnalytics(store, period = 7, dept = '') {
  const { range, rows, records, attendance } = behaviorData(store, period, dept);
  const participants = new Set(records.filter(learning).map(item => item.jwcode));
  const watchers = new Set(records.filter(item => item.ruleType === 'base' && item.sources.watch.length).map(item => item.jwcode));
  const commenters = new Set(records.filter(item => item.ruleType === 'base' && item.sources.comment.length).map(item => item.jwcode));
  const gifters = new Set(records.filter(item => item.ruleType === 'base' && item.sources.gift.length).map(item => item.jwcode));
  const fullChannel = new Set(records.filter(item => item.ruleType === 'base' && item.baseScore >= 3).map(item => item.jwcode));
  const fullDay = new Set(rows.filter(row => [...row.baseByDate.entries()].some(([date, score]) => date >= range.start && score >= 6)).map(row => row.id));
  const watchSeconds = attendance.reduce((sum, record) => sum + Number(record.durationSeconds || 0), 0);
  const combinationMap = new Map();
  for (const code of participants) {
    const flags = [watchers.has(code), commenters.has(code), gifters.has(code)];
    const key = flags.map(Number).join('');
    combinationMap.set(key, (combinationMap.get(key) || 0) + 1);
  }
  const comboNames = { '111': '观看 + 评论 + 领航卡', '110': '观看 + 评论', '101': '观看 + 领航卡', '011': '评论 + 领航卡', '100': '仅有效观看', '010': '仅有效评论', '001': '仅领航卡' };
  const combinations = Object.entries(combinationMap).map(([key, count]) => ({ key, name: comboNames[key], count, rate: percent(count, participants.size) })).sort((a, b) => b.count - a.count);
  const trend = range.dates.map(date => {
    const dayRecords = records.filter(item => item.date === date);
    const active = new Set(dayRecords.filter(learning).map(item => item.jwcode)).size;
    return { date, active, points: round(dayRecords.reduce((sum, item) => sum + item.score, 0)), watchMinutes: round(attendance.filter(record => store.lives[record.liveId]?.startTime.startsWith(date)).reduce((sum, record) => sum + Number(record.durationSeconds || 0), 0) / 60) };
  });
  const channels = store.scoring.baseChannels.map(channel => {
    const channelRecords = records.filter(item => item.ruleType === 'base' && item.channel === channel.name);
    return { name: channel.name, participants: new Set(channelRecords.map(item => item.jwcode)).size, watch: new Set(channelRecords.filter(item => item.sources.watch.length).map(item => item.jwcode)).size, comment: new Set(channelRecords.filter(item => item.sources.comment.length).map(item => item.jwcode)).size, gift: new Set(channelRecords.filter(item => item.sources.gift.length).map(item => item.jwcode)).size };
  });
  const segments = [
    { name: '高活跃', rule: `近 ${range.days} 天活跃 ≥ 6 天`, count: rows.filter(row => [...row.activeDates].filter(date => date >= range.start).length >= 6).length },
    { name: '稳定学习', rule: '活跃 3–5 天', count: rows.filter(row => { const days = [...row.activeDates].filter(date => date >= range.start).length; return days >= 3 && days <= 5; }).length },
    { name: '轻度参与', rule: '活跃 1–2 天', count: rows.filter(row => { const days = [...row.activeDates].filter(date => date >= range.start).length; return days >= 1 && days <= 2; }).length },
    { name: '周期内未活跃', rule: '无有效学习得分', count: rows.filter(row => ![...row.activeDates].some(date => date >= range.start)).length },
  ].map(item => ({ ...item, rate: percent(item.count, rows.length) }));
  return {
    ...range, generatedAt: new Date().toISOString(), totalStudents: rows.length,
    metrics: { participants: participants.size, participationRate: percent(participants.size, rows.length), avgWatchMinutes: attendance.length ? round(watchSeconds / attendance.length / 60) : 0, comments: attendance.reduce((sum, record) => sum + Number(record.validCommentCount || 0), 0), gifts: attendance.reduce((sum, record) => sum + Number(record.giftCount || 0), 0) },
    funnel: [
      { name: '产生有效学习得分', count: participants.size }, { name: '完成有效观看', count: watchers.size },
      { name: '产生有效互动', count: new Set([...commenters, ...gifters]).size }, { name: '完成单栏目基础满分', count: fullChannel.size }, { name: '完成单日 6 个基础行为', count: fullDay.size },
    ].map((item, index, list) => ({ ...item, rate: percent(item.count, list[0].count), previousRate: index ? percent(item.count, list[index - 1].count) : null })),
    combinations, trend, channels, segments, departments: [...new Set(studentRows(store).map(row => row.dept))].sort(),
  };
}

export function getOperationsAnalytics(store, period = 7, dept = '') {
  const behavior = getBehaviorAnalytics(store, period, dept);
  const { range, rows, attendance } = behaviorData(store, period, dept);
  const weekStart = shift(range.today, -6);
  const departmentNames = [...new Set(rows.map(row => row.dept))].sort();
  const departments = departmentNames.map(name => {
    const members = rows.filter(row => row.dept === name);
    const active = members.filter(row => [...row.activeDates].some(date => date >= range.start)).length;
    const full = members.filter(row => [...row.baseByDate.entries()].some(([date, score]) => date >= range.start && score >= 6)).length;
    return { name, students: members.length, active, participationRate: percent(active, members.length), full, fullRate: percent(full, active), risk: members.filter(row => !row.lastLearning || row.lastLearning < weekStart).length, points: round(members.reduce((sum, row) => sum + row.score, 0)) };
  }).sort((a, b) => b.participationRate - a.participationRate);
  const claims = Object.values(store.rewardClaims || {}).filter(claim => !dept || store.students[claim.jwcode]?.dept === dept || (!store.students[claim.jwcode]?.dept && dept === '未同步分部'));
  const trend = behavior.trend.map(item => ({ ...item, participationRate: percent(item.active, rows.length), fullRate: percent(rows.filter(row => (row.baseByDate.get(item.date) || 0) >= 6).length, item.active) }));
  return {
    ...range, generatedAt: new Date().toISOString(), totalStudents: rows.length,
    metrics: { participationRate: behavior.metrics.participationRate, active: behavior.metrics.participants, full: trend.at(-1)?.fullRate || 0, totalPoints: round(rows.reduce((sum, row) => sum + row.score, 0)), rewardClaims: claims.length, attendance: attendance.length },
    trend, departments,
    rewards: { configured: Object.keys(store.rewards || {}).length, enabled: Object.values(store.rewards || {}).filter(item => item.enabled).length, claims: claims.length },
    syncRuns: (store.syncRuns || []).slice(0, 8),
    totals: { lives: Object.keys(store.lives).length, attendance: Object.keys(store.attendance).length, students: Object.keys(store.students).length, scoring: store.scoringMeta || null },
  };
}
