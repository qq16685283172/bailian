import { getClientSnapshot, shanghaiDate } from './client.js';

const MAX_QUESTION = 200;
const MAX_ANSWER = 800;

export const aiSuggestions = ['我现在的总积分是多少', '本周和本月各得多少分', '6月24日我得了多少分', '我有哪些双倍积分', '连续学习多少天了', '有什么头像框和气泡可以领'];

// 只读白名单：小AI 能回答的话题，全部来自本账号的积分记录
const topicMatchers = [
  { intent: 'rewards', pattern: /奖励|兑换|领取|礼品|权益|库存|头像框|气泡|装扮/ },
  { intent: 'multiplier', pattern: /翻倍|双倍|超级短线|中秋|国庆|首周/ },
  { intent: 'period', pattern: /本周|这周|这一周|本月|这个月|月度/ },
  { intent: 'history', pattern: /昨天|昨日|\d{1,2}月\d{1,2}日/ },
  { intent: 'streak', pattern: /连续|坚持.*天|学习.*天|多少天/ },
  { intent: 'channel', pattern: /财经壹眼|易学久会/ },
  { intent: 'level', pattern: /等级|级别|升级|阶段|称号/ },
  { intent: 'rank', pattern: /排名|排行|第几|名次|榜单/ },
  { intent: 'ledger', pattern: /明细|记录|为什么|怎么来|来源|流水|扣分|加分/ },
  { intent: 'task', pattern: /任务|打卡|评论|观看|时长|领航卡|直播|怎么得|如何获得/ },
  { intent: 'rule', pattern: /规则|怎么算|计分|倍数|活动分|起算/ },
  { intent: 'appeal', pattern: /申诉|少了|漏了|不对|有误|纠错/ },
  { intent: 'today', pattern: /今天|今日|当天/ },
  { intent: 'points', pattern: /积分|分数|多少分|总分|几分/ },
];

// 越权 / 高危话题直接拒绝，绝不落到模型
const blockedPatterns = [
  { pattern: /其他学员|别人|他人|朋友的|同学.*(积分|分数)|他的|她的|所有人|全站|全公司|所有学员/, reason: '我只能查询你本人（当前登录精网号）的积分和奖励，无法查看其他学员的数据。' },
  { pattern: /改分|加分给我|补分给我|(积分|分数|分).{0,6}(改成|改为|改到|设成|调成|调高|补成|删除)|修改积分|删除记录|重置|导出|后台|管理员|审核通过|调账/, reason: '积分只能由管理员在管理端按规则认定或审核，我不能修改、新增或删除任何积分记录。' },
  { pattern: /密码|令牌|token|凭证|密钥|cookie/i, reason: '我不会处理密码、令牌、凭证等信息，请勿把这类内容发给小AI。' },
];

function signed(points) {
  const value = Number(points) || 0;
  return `${value > 0 ? '+' : ''}${value} 分`;
}

function rewardsOf(store, jwcode, totalPoints) {
  const claims = Object.values(store.rewardClaims || {});
  return Object.values(store.rewards || {})
    .map(reward => {
      const used = claims.filter(item => item.rewardId === reward.id).length;
      const claim = claims.find(item => item.rewardId === reward.id && item.jwcode === jwcode);
      const remainingStock = Math.max(0, Number(reward.stock || 0) - used);
      return {
        id: reward.id, name: reward.name, points: Number(reward.points || 0), type: reward.type || '学习权益',
        description: reward.description || '', enabled: Boolean(reward.enabled), claimed: Boolean(claim),
        claimedAt: claim?.createdAt || null, remainingStock,
        canClaim: Boolean(reward.enabled) && !claim && totalPoints >= Number(reward.points || 0) && remainingStock > 0,
      };
    })
    .filter(reward => reward.enabled || reward.claimed)
    .sort((a, b) => a.points - b.points);
}

function channelProgress(snapshot) {
  return (snapshot.channels || []).map(channel => {
    const values = snapshot.tasks?.[channel.id] || [false, false, false];
    return `${channel.name} 已完成 ${values.filter(Boolean).length}/3`;
  }).join('；');
}

const handlers = {
  points({ snapshot }) {
    const level = snapshot.level;
    return {
      text: `你的累计总积分是 ${snapshot.totalPoints} 分，当前等级 Lv.${level.level}「${level.title}」（${level.name}）。${level.next ? `距 ${level.next.title} 还需 ${level.remaining} 分，当前阶段完成度 ${level.progress}%。` : '已经是最高等级。'}`,
      facts: { 累计总积分: snapshot.totalPoints, 当前等级: `Lv.${level.level} ${level.title}`, 升级还需: level.next ? `${level.remaining} 分` : '已是最高等级' },
    };
  },
  today({ snapshot }) {
    const rows = snapshot.ledger.filter(item => item.date === snapshot.date && Number(item.points) !== 0).slice(0, 3);
    return {
      text: `今天（${snapshot.date}）你已获得 ${snapshot.todayScore} 分：基础行为分 ${snapshot.todayBaseScore} 分、活动奖励分 ${snapshot.todayActivityScore} 分、人工调整分 ${snapshot.todayAdjustmentScore} 分。${snapshot.todayScore ? `明细：${rows.map(item => `${item.title} ${signed(item.points)}`).join('；')}` : '今天还没有计分记录，完成打卡、观看超时或送领航卡后会自动入账。'}`,
      facts: { 今日积分: snapshot.todayScore, 基础行为分: snapshot.todayBaseScore, 活动奖励分: snapshot.todayActivityScore, 人工调整分: snapshot.todayAdjustmentScore },
    };
  },
  period({ store, jwcode, question, snapshot }) {
    const records = Object.values(store.dailyPoints || {}).filter(item => item.jwcode === jwcode);
    const today = shanghaiDate();
    const showWeek = /本周|这周|这一周/.test(question);
    const showMonth = /本月|这个月|月度/.test(question) || !showWeek;
    const weekStart = shanghaiDate(new Date(Date.now() - 6 * 86400000));
    const month = today.slice(0, 7);
    const weekScore = Math.round(records.filter(item => item.date >= weekStart && item.date <= today).reduce((sum, item) => sum + item.score, 0) * 100) / 100;
    const monthScore = Math.round(records.filter(item => item.date.startsWith(month)).reduce((sum, item) => sum + item.score, 0) * 100) / 100;
    const parts = [showWeek && `本周（近 7 天）获得 ${weekScore} 分`, showMonth && `本月获得 ${monthScore} 分`].filter(Boolean);
    return { text: `${parts.join('，')}。你的累计总积分为 ${snapshot.totalPoints} 分。`, facts: { 本周积分: showWeek ? weekScore : '未询问', 本月积分: showMonth ? monthScore : '未询问', 累计总积分: snapshot.totalPoints } };
  },
  history({ store, jwcode, question, snapshot }) {
    let date = '';
    if (/昨天|昨日/.test(question)) date = shanghaiDate(new Date(Date.now() - 86400000));
    const matched = question.match(/(\d{1,2})月(\d{1,2})日/);
    if (matched) date = `${snapshot.date.slice(0, 4)}-${matched[1].padStart(2, '0')}-${matched[2].padStart(2, '0')}`;
    const records = Object.values(store.dailyPoints || {}).filter(item => item.jwcode === jwcode && item.date === date);
    const score = Math.round(records.reduce((sum, item) => sum + item.score, 0) * 100) / 100;
    const base = records.filter(item => item.ruleType === 'base').reduce((sum, item) => sum + item.score, 0);
    const activity = records.filter(item => item.ruleType === 'activity').reduce((sum, item) => sum + item.score, 0);
    return { text: records.length ? `${date} 你共获得 ${score} 分，其中基础行为分 ${base} 分、活动奖励分 ${activity} 分，共 ${records.length} 条计分记录。` : `${date} 暂时没有你的计分记录。`, facts: { 查询日期: date, 当日积分: score, 基础行为分: base, 活动奖励分: activity, 记录数: records.length } };
  },
  streak({ snapshot }) {
    return { text: `你当前连续学习 ${snapshot.streak} 天，共有 ${snapshot.student.joinDays} 天产生了积分记录。坚持每天完成学习任务，连续天数会继续增长。`, facts: { 连续学习天数: snapshot.streak, 有积分记录天数: snapshot.student.joinDays } };
  },
  channel({ store, jwcode, question }) {
    const names = (store.scoring?.baseChannels || []).map(item => item.name).filter(name => question.includes(name));
    const rows = names.map(name => {
      const records = Object.values(store.dailyPoints || {}).filter(item => item.jwcode === jwcode && item.channel === name);
      return { name, score: Math.round(records.reduce((sum, item) => sum + item.score, 0) * 100) / 100, days: new Set(records.map(item => item.date)).size };
    });
    return { text: rows.map(item => `${item.name}累计获得 ${item.score} 分，共有 ${item.days} 天计分记录`).join('；') + '。', facts: Object.fromEntries(rows.map(item => [`${item.name}积分`, item.score])) };
  },
  multiplier({ store, jwcode }) {
    const rules = (store.scoring?.rules || []).filter(rule => rule.enabled && rule.type === 'multiplier');
    const own = Object.values(store.dailyPoints || {}).filter(item => item.jwcode === jwcode && item.ruleType === 'base' && item.multiplier > 1);
    const extra = Math.round(own.reduce((sum, item) => sum + item.score - item.baseScore, 0) * 100) / 100;
    const lines = rules.map(rule => `${rule.name}：${rule.startDate} 至 ${rule.endDate || '长期'}，${rule.channel === 'all' ? '全部栏目' : rule.channel}${rule.keyword ? `且课程名含「${rule.keyword}」` : '全部课程'}，${rule.includeActivity ? '基础与活动分' : '基础分'} ×${rule.multiplier}`);
    return { text: `当前双倍计分组：\n${lines.join('\n')}\n你已有 ${own.length} 条基础积分记录享受翻倍，翻倍部分累计增加 ${extra} 分。是否包含活动分以各活动说明为准，多组重叠时不连乘。`, facts: { 翻倍规则: lines, 本人翻倍记录数: own.length, 翻倍增加积分: extra } };
  },
  level({ snapshot }) {
    const level = snapshot.level;
    const thresholds = snapshot.levelThresholds;
    return {
      text: `你现在是 Lv.${level.level}「${level.title}」，累计 ${snapshot.totalPoints} 分。${level.next ? `下一等级是「${level.next.title}」，需要 ${level.next.threshold} 分，还差 ${level.remaining} 分。` : '你已达到最高等级「百炼宗师」。'}等级门槛依次为 ${thresholds.join(' / ')} 分。`,
      facts: { 当前等级: `Lv.${level.level} ${level.title}`, 累计总积分: snapshot.totalPoints, 下一等级门槛: level.next ? level.next.threshold : '无', 还差: level.next ? `${level.remaining} 分` : '0 分' },
    };
  },
  rank({ snapshot }) {
    const rank = snapshot.rank, month = snapshot.monthRank;
    const rankText = rank.rank === '—' ? '当前还没有进入总榜' : `总榜第 ${rank.rank} 名`;
    const monthText = month.rank === '—' ? '本月暂未上榜' : `本月第 ${month.rank} 名`;
    return {
      text: `${rankText}（累计 ${rank.score} 分）${rank.gap ? `，距上一名 ${rank.gap} 分` : ''}。${monthText}，本月已得 ${month.score} 分。排行榜姓名脱敏展示，积分每日自动同步更新。`,
      facts: { 总榜排名: rank.rank, 总榜积分: rank.score, 距上一名: rank.gap || 0, 本月排名: month.rank, 本月积分: month.score },
    };
  },
  rewards({ store, snapshot, jwcode }) {
    const list = rewardsOf(store, jwcode, snapshot.totalPoints);
    if (!list.length) {
      return { text: `目前没有上架的奖励。你已领取 ${snapshot.claimedRewards} 项奖励，累计 ${snapshot.totalPoints} 分。`, facts: { 已上架奖励: 0, 累计总积分: snapshot.totalPoints } };
    }
    const claimable = list.filter(item => item.canClaim);
    const claimed = list.filter(item => item.claimed);
    const locked = list.filter(item => !item.claimed && !item.canClaim);
    const lines = [`你的累计积分 ${snapshot.totalPoints} 分，现有 ${list.length} 项奖励：`];
    if (claimable.length) lines.push(`可以领取：${claimable.map(item => `${item.name}（${item.points} 分解锁）`).join('；')}`);
    if (locked.length) lines.push(`未达成：${locked.map(item => `${item.name}（需 ${item.points} 分${item.remainingStock > 0 ? '' : '，库存已领完'}）`).join('；')}`);
    if (claimed.length) lines.push(`已领取：${claimed.map(item => assetName(item)).join('；')}`);
    lines.push('领取不消耗积分，同一奖励不能重复领取，去「奖励中心」即可操作。');
    return {
      text: lines.join('\n'),
      facts: { 累计总积分: snapshot.totalPoints, 可领取: claimable.map(item => `${item.name} 需 ${item.points} 分`), 未达标: locked.map(item => `${item.name} 需 ${item.points} 分`), 已领取: claimed.map(item => item.name) },
    };
  },
  ledger({ snapshot }) {
    const effective = snapshot.ledger.filter(item => Number(item.points) !== 0);
    if (!effective.length) return { text: `你目前还没有产生计分的记录（累计 ${snapshot.totalPoints} 分）。完成直播打卡、观看超时或送领航卡后，同步任务会在 12:00 与 24:00 入账。`, facts: { 积分记录: 0, 累计总积分: snapshot.totalPoints } };
    const rows = effective.slice(0, 5);
    return {
      text: `最近 ${rows.length} 条积分明细：\n${rows.map(item => `${item.date}　${item.title}　${signed(item.points)}（${item.live}）`).join('\n')}\n每条明细都能追溯到同步到的直播记录，合计 ${snapshot.totalPoints} 分。`,
      facts: { 明细条数: rows.length, 累计总积分: snapshot.totalPoints },
    };
  },
  task({ store, snapshot }) {
    const watchMinutes = Number(store.scoring?.watchMinutes || 0);
    return {
      text: `今天的任务进度：${channelProgress(snapshot)}。每个栏目 3 项基础任务——有效打卡 / 评论、送领航卡、观看严格超过 ${watchMinutes} 分钟，每项 1 分；活动场次另有活动分。任务状态由同步到的直播记录自动判定，页面每 30 秒刷新。`,
      facts: { 今日积分: snapshot.todayScore, 观看阈值: `${watchMinutes} 分钟`, 栏目进度: channelProgress(snapshot) },
    };
  },
  rule({ store }) {
    const scoring = store.scoring || {};
    return {
      text: `计分规则：只统计 ${scoring.startDate || '起算日'} 及以后的直播；财经壹眼（09:00–12:00）与易学久会（19:00–24:00）按开播时间归类，每栏目每天最多 3 个基础行为分——有效打卡 / 评论、送领航卡、观看严格超过 ${scoring.watchMinutes || 0} 分钟，各 1 分。活动规则（如领航粉丝群 20 点听课 +9 分）与翻倍活动由管理员配置，活动分是否翻倍以具体活动说明为准，同一天同一活动只计一次。`,
      facts: { 起算日期: scoring.startDate, 观看阈值: `${scoring.watchMinutes || 0} 分钟`, 每日基础分上限: '每栏目 3 分' },
    };
  },
  appeal({ snapshot }) {
    return {
      text: `如果某天的积分和你的实际情况不符，可以在「我的 → 积分申诉」提交，写明直播日期、栏目和原因（今日已入账 ${snapshot.todayScore} 分）。申诉会进入管理端审核列表，由管理员核实后决定是否补分——小AI 只能查询和解释，不能直接改分。`,
      facts: { 今日积分: snapshot.todayScore, 累计总积分: snapshot.totalPoints },
    };
  },
};

function assetName(item) {
  return item.claimedAt ? `${item.name}（${String(item.claimedAt).slice(0, 10)} 已领）` : item.name;
}

function composeAnswer(store, jwcode, question) {
  const blocked = blockedPatterns.find(item => item.pattern.test(question));
  if (blocked) return { answer: blocked.reason, blocked: true, intent: 'blocked', facts: {} };

  const otherCode = question.match(/\b\d{6,12}\b/);
  if (otherCode && otherCode[0] !== String(jwcode)) {
    return { answer: '我只能查询你本人（当前登录精网号）的数据，无法按其他精网号查询积分或奖励。', blocked: true, intent: 'blocked', facts: {} };
  }
  if (/你是|你是谁|什么模型|谁做的/.test(question)) {
    return { answer: '我是百炼小AI，只负责查询和解释你本人的积分、等级、排名、奖励、任务和翻倍活动。我的答案来自你的学习记录，不能修改任何数据。', blocked: true, intent: 'about', facts: {} };
  }
  if (/你会什么|能问什么|帮助|怎么用|能做什么/.test(question)) {
    return { answer: `你可以问我：今日、本周、本月或指定日期积分，连续学习天数，各栏目积分，等级与排名，任务进度，双倍活动，以及头像框和排名气泡。试试：${aiSuggestions.slice(0, 4).join('、')}。`, blocked: true, intent: 'help', facts: {} };
  }

  const matched = topicMatchers.filter(item => item.pattern.test(question)).map(item => item.intent);
  if (!matched.length || /天气|新闻|股票|基金|翻译|笑话|故事|菜谱|写代码|几点|星期几/.test(question)) {
    if (/^(你好|您好|hi|hello|在吗|嗨)/i.test(question)) {
      return { answer: `你好，我是百炼小AI。你可以问我：${aiSuggestions.join('、')}。`, blocked: false, intent: 'greeting', facts: {} };
    }
    return {
      answer: `这个问题超出我的范围了。我只负责查询你本人的学习积分、任务、等级、排名和奖励，可以试试：${aiSuggestions.slice(0, 4).join('、')}。`,
      blocked: true, intent: 'unknown', facts: {},
    };
  }

  const snapshot = getClientSnapshot(store, jwcode);
  if (!snapshot) return { answer: '还没有你的同步记录，请等同步任务补采完成后再问我。', blocked: true, intent: 'empty', facts: {} };

  // 已有更具体意图时不再重复播报总积分
  const detailed = matched.filter(intent => intent !== 'points');
  const usable = detailed.length ? detailed : matched;
  const order = ['today', 'period', 'history', 'multiplier', 'rewards', 'streak', 'channel', 'points', 'level', 'rank', 'ledger', 'task', 'rule', 'appeal'];
  const picked = order.filter(intent => usable.includes(intent)).slice(0, 2);
  const ctx = { store, snapshot, jwcode, question };
  const parts = picked.map(intent => handlers[intent](ctx));
  const facts = Object.assign({}, ...parts.map(part => part.facts));
  const answer = parts.map(part => part.text).join('\n').slice(0, MAX_ANSWER);
  return { answer, blocked: false, intent: picked.join('+'), facts };
}

function numbersIn(text) {
  return new Set(String(text).match(/\d+(?:\.\d+)?/g) || []);
}

function factsText(facts) {
  return Object.entries(facts).map(([label, value]) => `${label}：${Array.isArray(value) ? (value.join('、') || '无') : value}`).join('\n');
}

const systemPrompt = [
  '你是「百炼小AI」，百炼计划学员端客服助手，只负责查询学员本人的积分、等级、排名、奖励、任务、学习天数与翻倍活动。',
  '规则：',
  '1. 只能使用给定事实与参考回答里的信息，不得新增任何数字、日期、奖励名称。',
  '2. 不得承诺改分、补分、通过审核，也不得透露其他学员或管理端数据。',
  '3. 语气亲和、口语化，80 字以内，可用一两行分行，不要卖萌、不要表情符号。',
].join('\n');

async function polishWithModel(question, draft, facts) {
  const endpoint = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;
  if (!endpoint || !model) return null;
  const timeout = Math.max(1000, Number(process.env.AI_TIMEOUT_MS || 8000));
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.AI_API_KEY ? { Authorization: `Bearer ${process.env.AI_API_KEY}` } : {}) },
      body: JSON.stringify({
        model, temperature: 0.2, max_tokens: 260,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `学员问题：${question}\n\n可用事实：\n${factsText(facts)}\n\n参考回答（数字以此为准）：\n${draft}` },
        ],
      }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const text = String(payload?.choices?.[0]?.message?.content || '').replace(/\s+\n/g, '\n').trim().slice(0, MAX_ANSWER);
    if (!text) return null;
    // 防幻觉校验：润色后不允许出现参考回答与问题之外的新数字
    const allowed = new Set([...numbersIn(draft), ...numbersIn(question)]);
    for (const number of numbersIn(text)) if (!allowed.has(number)) return null;
    return text;
  } catch {
    return null;
  }
}

export function aiEngine() {
  return process.env.AI_BASE_URL && process.env.AI_MODEL
    ? { engine: 'model', model: process.env.AI_MODEL, fallback: 'rules' }
    : { engine: 'rules', model: null, fallback: 'rules' };
}

export async function askAI({ store, jwcode, question }) {
  const text = String(question || '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUESTION);
  if (text.length < 2) return { answer: '请说得具体一点，比如「我现在的总积分是多少」。', intent: 'empty', blocked: true, engine: 'rules', suggestions: aiSuggestions };
  const result = composeAnswer(store, jwcode, text);
  if (result.blocked) return { ...result, engine: 'rules', suggestions: aiSuggestions };
  const polished = await polishWithModel(text, result.answer, result.facts);
  return { ...result, answer: polished || result.answer, engine: polished ? 'model' : 'rules', suggestions: aiSuggestions };
}
