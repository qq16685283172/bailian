import { describe, expect, it } from 'vitest';
import { channelFor } from '../server/channels.js';
import { rebuildDailyPoints, ruleMatches } from '../server/scoring.js';

const BASE_CHANNELS = [
  { name: '财经壹眼', time: '09:30', start: '09:00', end: '12:00' },
  { name: '易学久会', time: '20:00', start: '19:00', end: '24:00' },
];

/** 构造一个最小可用的 store，字段与 emptyStore() 对齐 */
function makeStore({ scoring = {}, lives = [], attendance = [], students = {}, welfareGrants = {}, pointAdjustments = {} } = {}) {
  const store = {
    scoring: {
      startDate: '2026-06-24',
      watchMinutes: 20,
      baseChannels: BASE_CHANNELS.map((item) => ({ ...item })),
      rules: [],
      ...scoring,
    },
    lives: Object.fromEntries(lives.map((live) => [live.id, live])),
    attendance: Object.fromEntries(attendance.map((record) => [`${record.liveId}|${record.jwcode}`, record])),
    students: { ...students },
    welfareGrants: { ...welfareGrants },
    pointAdjustments: { ...pointAdjustments },
  };
  return store;
}

const live = (id, startTime, extra = {}) => ({
  id,
  startTime,
  name: '常规直播',
  platform: 'xxcg',
  className: '',
  classId: '',
  ...extra,
});

const attendance = (liveId, jwcode, extra = {}) => ({
  liveId,
  jwcode,
  name: '张三',
  durationSeconds: 0,
  validCommentCount: 0,
  giftCount: 0,
  ...extra,
});

const multiplierRule = (overrides = {}) => ({
  id: 'rule-mul',
  type: 'multiplier',
  name: '双倍积分',
  enabled: true,
  platform: 'all',
  channel: 'all',
  multiplier: 2,
  priority: 50,
  startDate: '',
  endDate: '',
  ...overrides,
});

const activityRule = (overrides = {}) => ({
  id: 'rule-yuzhiweilai',
  type: 'activity',
  name: '领航粉丝群 · 20点听课',
  enabled: true,
  platform: 'xxcg',
  className: '领航粉丝群',
  classId: '3723',
  keyword: '',
  liveStart: '20:00',
  liveEnd: '21:00',
  startDate: '2026-06-24',
  endDate: '',
  trigger: 'watch',
  watchMinutes: 0,
  points: 9,
  multiplier: 1,
  priority: 100,
  ...overrides,
});

describe('channelFor 时段归类', () => {
  it('财经壹眼覆盖 09:00（含）到 12:00（不含）', () => {
    expect(channelFor('2026-07-01T09:00:00')).toBe('财经壹眼');
    expect(channelFor('2026-07-01T10:00:00')).toBe('财经壹眼');
    expect(channelFor('2026-07-01T11:59:00')).toBe('财经壹眼');
  });

  it('12:00–17:00 归入三点启航', () => {
    expect(channelFor('2026-07-01T12:00:00')).toBe('三点启航');
    expect(channelFor('2026-07-01T15:30:00')).toBe('三点启航');
    expect(channelFor('2026-07-01T16:59:00')).toBe('三点启航');
    expect(channelFor('2026-07-01T17:00:00')).toBe('未分配栏目');
  });

  it('易学久会覆盖 19:00（含）到 24:00（不含）', () => {
    expect(channelFor('2026-07-01T19:00:00')).toBe('易学久会');
    expect(channelFor('2026-07-01T23:59:00')).toBe('易学久会');
  });

  it('空档时间归为未分配栏目', () => {
    expect(channelFor('2026-07-01T08:59:00')).toBe('未分配栏目');
    expect(channelFor('2026-07-01T17:30:00')).toBe('未分配栏目');
    expect(channelFor('2026-07-01T18:59:00')).toBe('未分配栏目');
  });

  it('时间格式非法时兜底', () => {
    expect(channelFor('')).toBe('未分配栏目');
    expect(channelFor('2026-07-01')).toBe('未分配栏目');
  });
});

describe('ruleMatches 规则匹配', () => {
  const baseLive = { ...live('l1', '2026-07-01T10:00:00'), channel: '财经壹眼' };

  it('未启用的规则一律不匹配', () => {
    expect(ruleMatches({ enabled: false }, baseLive)).toBe(false);
  });

  it('起止日期包含边界', () => {
    const rule = { enabled: true, startDate: '2026-07-01', endDate: '2026-07-03' };
    expect(ruleMatches(rule, baseLive, '2026-07-01')).toBe(true);
    expect(ruleMatches(rule, baseLive, '2026-07-03')).toBe(true);
    expect(ruleMatches(rule, baseLive, '2026-06-30')).toBe(false);
    expect(ruleMatches(rule, baseLive, '2026-07-04')).toBe(false);
  });

  it('直播时段包含起点、不含终点', () => {
    const rule = { enabled: true, liveStart: '20:00', liveEnd: '21:00' };
    const at = (time) => ({ ...live('l', `2026-07-01T${time}:00`), channel: '易学久会' });
    expect(ruleMatches(rule, at('20:00'))).toBe(true);
    expect(ruleMatches(rule, at('20:59'))).toBe(true);
    expect(ruleMatches(rule, at('21:00'))).toBe(false);
    expect(ruleMatches(rule, at('19:59'))).toBe(false);
  });

  it('平台过滤：all 通配，指定平台需一致', () => {
    expect(ruleMatches({ enabled: true, platform: 'all' }, baseLive)).toBe(true);
    expect(ruleMatches({ enabled: true, platform: 'xxcg' }, baseLive)).toBe(true);
    expect(ruleMatches({ enabled: true, platform: 'toujiao' }, baseLive)).toBe(false);
  });

  it('班级 ID 用字符串比较，数字与字符串视为相同', () => {
    const target = { ...baseLive, classId: '3723' };
    expect(ruleMatches({ enabled: true, classId: 3723 }, target)).toBe(true);
    expect(ruleMatches({ enabled: true, classId: '3724' }, target)).toBe(false);
  });

  it('栏目与关键词过滤', () => {
    expect(ruleMatches({ enabled: true, channel: '财经壹眼' }, baseLive)).toBe(true);
    expect(ruleMatches({ enabled: true, channel: '易学久会' }, baseLive)).toBe(false);
    expect(ruleMatches({ enabled: true, keyword: '常规' }, baseLive)).toBe(true);
    expect(ruleMatches({ enabled: true, keyword: '不存在' }, baseLive)).toBe(false);
  });
});

describe('rebuildDailyPoints 基础听课计分', () => {
  it('观看超阈值 + 有效评论 + 礼物，各 1 分，合计 3 分', () => {
    const store = makeStore({
      lives: [live('l1', '2026-07-01T10:00:00')],
      attendance: [attendance('l1', '5001', { durationSeconds: 21 * 60, validCommentCount: 1, giftCount: 1 })],
    });

    rebuildDailyPoints(store);
    const items = Object.values(store.dailyPoints);

    expect(items).toHaveLength(1);
    expect(items[0].channel).toBe('财经壹眼');
    expect(items[0].baseScore).toBe(3);
    expect(items[0].score).toBe(3);
    expect(items[0].multiplier).toBe(1);
  });

  it('观看时长必须严格大于阈值，等于阈值不计分', () => {
    const store = makeStore({
      lives: [live('l1', '2026-07-01T10:00:00')],
      attendance: [
        attendance('l1', '5001', { durationSeconds: 20 * 60 }),
        attendance('l1', '5002', { durationSeconds: 20 * 60 + 1 }),
      ],
    });

    rebuildDailyPoints(store);
    const byCode = Object.fromEntries(Object.values(store.dailyPoints).map((item) => [item.jwcode, item]));

    // 出勤仍会落一条记录，但不产生基础分
    expect(byCode['5001'].baseScore).toBe(0);
    expect(byCode['5001'].score).toBe(0);
    expect(byCode['5002'].baseScore).toBe(1);
  });

  it('startDate 之前的记录不参与计分', () => {
    const store = makeStore({
      lives: [live('l1', '2026-06-23T10:00:00'), live('l2', '2026-06-24T10:00:00')],
      attendance: [
        attendance('l1', '5001', { durationSeconds: 3600 }),
        attendance('l2', '5001', { durationSeconds: 3600 }),
      ],
    });

    rebuildDailyPoints(store);
    expect(Object.values(store.dailyPoints)).toHaveLength(1);
    expect(Object.values(store.dailyPoints)[0].date).toBe('2026-06-24');
  });

  it('同一人同一天同栏目多场直播合并计分，不重复累加', () => {
    const store = makeStore({
      lives: [live('l1', '2026-07-01T09:10:00'), live('l2', '2026-07-01T10:30:00')],
      attendance: [
        attendance('l1', '5001', { durationSeconds: 3600 }),
        attendance('l2', '5001', { durationSeconds: 3600 }),
      ],
    });

    rebuildDailyPoints(store);
    const items = Object.values(store.dailyPoints);

    expect(items).toHaveLength(1);
    expect(items[0].baseScore).toBe(1);
    expect(items[0].score).toBe(1);
    expect(items[0].sources.watch).toHaveLength(2);
  });

  it('零时长零互动的场次落 0 分记录，不影响总分', () => {
    const store = makeStore({
      lives: [live('l1', '2026-07-01T10:00:00')],
      attendance: [attendance('l1', '5001')],
    });

    rebuildDailyPoints(store);
    const items = Object.values(store.dailyPoints);

    expect(items).toHaveLength(1);
    expect(items[0].score).toBe(0);
    expect(store.scoringMeta.totalPoints).toBe(0);
    expect(store.students['5001'].totalPoints).toBe(0);
  });
});

describe('rebuildDailyPoints 翻倍规则', () => {
  it('命中双倍规则后基础分乘倍', () => {
    const store = makeStore({
      scoring: { rules: [multiplierRule({ multiplier: 2, channel: '财经壹眼' })] },
      lives: [live('l1', '2026-07-01T10:00:00')],
      attendance: [attendance('l1', '5001', { durationSeconds: 3600, validCommentCount: 1 })],
    });

    rebuildDailyPoints(store);
    const item = Object.values(store.dailyPoints)[0];

    expect(item.baseScore).toBe(2);
    expect(item.multiplier).toBe(2);
    expect(item.score).toBe(4);
    expect(item.multiplierRuleName).toBe('双倍积分');
  });

  it('多条翻倍规则只取优先级最高的一条，不连乘', () => {
    const store = makeStore({
      scoring: {
        rules: [
          multiplierRule({ id: 'low', name: '低优先', multiplier: 2, priority: 10 }),
          multiplierRule({ id: 'high', name: '高优先', multiplier: 3, priority: 90 }),
        ],
      },
      lives: [live('l1', '2026-07-01T10:00:00')],
      attendance: [attendance('l1', '5001', { durationSeconds: 3600 })],
    });

    rebuildDailyPoints(store);
    const item = Object.values(store.dailyPoints)[0];

    expect(item.multiplier).toBe(3);
    expect(item.score).toBe(3); // 基础 1 分 × 3，而不是 1×2×3=6
  });

  it('规则日期范围之外不生效', () => {
    const store = makeStore({
      scoring: { rules: [multiplierRule({ startDate: '2026-08-01', endDate: '2026-08-07' })] },
      lives: [live('l1', '2026-07-01T10:00:00')],
      attendance: [attendance('l1', '5001', { durationSeconds: 3600 })],
    });

    rebuildDailyPoints(store);
    expect(Object.values(store.dailyPoints)[0].multiplier).toBe(1);
  });
});

describe('rebuildDailyPoints 活动规则', () => {
  const classLive = live('l1', '2026-07-01T20:30:00', { className: '领航粉丝群', classId: '3723' });

  it('领航粉丝群听课加 9 分，活动记录独立成条', () => {
    const store = makeStore({
      scoring: { rules: [activityRule()] },
      lives: [classLive],
      attendance: [attendance('l1', '5001', { durationSeconds: 600 })],
    });

    rebuildDailyPoints(store);
    const items = Object.values(store.dailyPoints);
    const activity = items.find((item) => item.ruleType === 'activity');

    // 一条基础记录（20:30 属易学久会，但时长不足 → 0 分）+ 一条活动记录
    expect(items).toHaveLength(2);
    expect(activity.score).toBe(9);
    expect(activity.channel).toBe('活动 · 领航粉丝群 · 20点听课');
    expect(store.scoringMeta.activityPoints).toBe(9);
    expect(store.students['5001'].totalPoints).toBe(9);
  });

  it('同一人同一天多条命中只算一次 9 分', () => {
    const store = makeStore({
      scoring: { rules: [activityRule()] },
      lives: [classLive, live('l2', '2026-07-01T20:45:00', { className: '领航粉丝群', classId: '3723' })],
      attendance: [
        attendance('l1', '5001', { durationSeconds: 600 }),
        attendance('l2', '5001', { durationSeconds: 900 }),
      ],
    });

    rebuildDailyPoints(store);
    const activityItems = Object.values(store.dailyPoints).filter((item) => item.ruleType === 'activity');

    expect(activityItems).toHaveLength(1);
    expect(activityItems[0].score).toBe(9);
    expect(activityItems[0].sources.watch).toHaveLength(2);
  });

  it('班级或时段不匹配时不加分', () => {
    const store = makeStore({
      scoring: { rules: [activityRule()] },
      lives: [live('l1', '2026-07-01T20:30:00', { className: '其它班', classId: '9999' })],
      attendance: [attendance('l1', '5001', { durationSeconds: 600 })],
    });

    rebuildDailyPoints(store);
    const items = Object.values(store.dailyPoints);

    expect(items.filter((item) => item.ruleType === 'activity')).toHaveLength(0);
    expect(store.scoringMeta.totalPoints).toBe(0);
  });

  it('活动分可被 includeActivity 的翻倍规则放大', () => {
    const store = makeStore({
      scoring: {
        rules: [
          activityRule(),
          multiplierRule({ id: 'welfare', channel: 'all', includeActivity: true, multiplier: 2, priority: 80 }),
        ],
      },
      lives: [classLive],
      attendance: [attendance('l1', '5001', { durationSeconds: 600 })],
    });

    rebuildDailyPoints(store);
    const activity = Object.values(store.dailyPoints).find((item) => item.ruleType === 'activity');

    expect(activity.activityMultiplier).toBe(2);
    expect(activity.score).toBe(18);
  });
});

describe('rebuildDailyPoints 人工分与汇总', () => {
  it('福利发放计入活动分', () => {
    const store = makeStore({
      welfareGrants: {
        g1: { id: 'g1', jwcode: '5001', date: '2026-07-01', points: 30, title: '新计划奖励' },
      },
    });

    rebuildDailyPoints(store);
    const item = Object.values(store.dailyPoints)[0];

    expect(item.ruleType).toBe('activity');
    expect(item.score).toBe(30);
  });

  it('只有审核通过的调整才入账，待审的忽略', () => {
    const store = makeStore({
      pointAdjustments: {
        a1: { id: 'a1', jwcode: '5001', points: 5, status: 'approved', effectiveDate: '2026-07-01', reason: '补分' },
        a2: { id: 'a2', jwcode: '5001', points: 99, status: 'pending', effectiveDate: '2026-07-01' },
      },
    });

    rebuildDailyPoints(store);
    const items = Object.values(store.dailyPoints);

    expect(items).toHaveLength(1);
    expect(items[0].score).toBe(5);
    expect(items[0].channel).toBe('人工补分');
  });

  it('学员总分与汇总统计一致', () => {
    const store = makeStore({
      scoring: { rules: [multiplierRule({ multiplier: 2 })] },
      lives: [live('l1', '2026-07-01T10:00:00'), live('l2', '2026-07-02T10:00:00')],
      attendance: [
        attendance('l1', '5001', { durationSeconds: 3600, validCommentCount: 1, giftCount: 1 }),
        attendance('l2', '5001', { durationSeconds: 3600 }),
        attendance('l2', '5002', { durationSeconds: 3600 }),
      ],
    });

    const meta = rebuildDailyPoints(store);

    expect(meta.records).toBe(3);
    expect(meta.basePoints).toBe(5); // 3 + 1 + 1
    expect(meta.totalPoints).toBe(10); // 全部 ×2
    expect(store.students['5001'].totalPoints).toBe(8); // 3×2 + 1×2
    expect(store.students['5002'].totalPoints).toBe(2);
  });
});
