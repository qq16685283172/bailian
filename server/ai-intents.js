/**
 * 百炼小AI · 意图库与轻量语义匹配
 *
 * 目标：不依赖外部模型，也能把「我这周得了几分」和「本周积分」对上。
 * 做法：
 *   1. 同义词归一（积分/分数/得分 → 积分）
 *   2. 字符二元组 Dice 相似度（中文短句比较稳，不需要分词）
 *   3. 关键词命中率兜底
 * 输出候选列表，由调用方决定「直接回答」还是「让用户选」。
 */

// 同义词组：第一个是规范词
const SYNONYM_GROUPS = [
  ['积分', ['分数', '得分', '总分', '总积分', 'points', '分']],
  ['排名', ['排行', '名次', '榜单', '榜', '第几', '排第几']],
  ['奖励', ['奖品', '礼品', '权益', '兑换', '领取', '库存', '礼包']],
  ['装扮', ['头像框', '气泡', '主题', '皮肤', '外观']],
  ['听课', ['观看', '学习', '上课', '看课', '听讲', '看直播']],
  ['连续', ['坚持', '不间断', '连着']],
  ['双倍', ['翻倍', '加倍', '多倍', '倍数']],
  ['今天', ['今日', '当天']],
  ['本周', ['这周', '这一周', '本星期', '这星期', '一周']],
  ['本月', ['这个月', '当月', '这月']],
  ['明细', ['记录', '流水', '来源', '怎么来', '为什么', '怎么算出来']],
  ['规则', ['怎么算', '如何计算', '计分标准', '算法', '评判']],
  ['申诉', ['有误', '不对', '漏了', '少了', '纠错', '有问题']],
  ['任务', ['打卡', '完成情况', '进度', '还没做']],
  ['等级', ['级别', '段位', '称号', '升级']],
  ['同步', ['更新', '刷新', '最新数据', '什么时候']],
  ['栏目', ['频道', '财经壹眼', '易学久会']],
];

const FULLWIDTH = /[\uFF01-\uFF5E]/g;
const PUNCT = /[\s，,。.！!？?、；;：:"'“”‘’()（）\[\]【】<>《》~`!@#$%^&*_+=|\\/-]+/g;
// 只去掉不影响意图的口语词，保留「多少/怎么/为什么」这类语义词
const FILLERS = /(请问|帮我|帮忙|我想问|想问|看一下|看看|一下|我|你|他|她|的|了|吗|呢|啊|呀|吧|哦|嗯)/g;

function toHalfWidth(text) {
  return String(text || '').replace(FULLWIDTH, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

/** 归一化：全角转半角 → 去标点 → 去口语词 → 同义词替换为规范词 */
export function canon(text) {
  let s = toHalfWidth(text).toLowerCase().replace(PUNCT, ' ').replace(FILLERS, ' ');
  for (const [basic, words] of SYNONYM_GROUPS) {
    for (const word of words) {
      if (!word) continue;
      s = s.split(word).join(` ${basic} `);
    }
  }
  return s.replace(/\s+/g, ' ').trim();
}

function bigrams(text) {
  const s = String(text || '').replace(/\s+/g, '');
  const set = new Set();
  if (!s) return set;
  if (s.length === 1) { set.add(s); return set; }
  for (let i = 0; i < s.length - 1; i += 1) set.add(s.slice(i, i + 2));
  return set;
}

/** Dice 系数，0–1 */
export function similarity(a, b) {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let overlap = 0;
  for (const gram of A) if (B.has(gram)) overlap += 1;
  return (2 * overlap) / (A.size + B.size);
}

export const INTENTS = [
  {
    id: 'points', title: '我的总积分', handler: 'points',
    examples: ['我现在的总积分是多少', '我有多少积分', '我现在多少分', '查一下我的积分', '我的总分是多少'],
    keywords: ['总积分', '我的积分', '多少分'],
  },
  {
    id: 'today', title: '今天的积分', handler: 'today',
    examples: ['我今天得了多少分', '今天积分多少', '今日得分', '今天学了什么'],
    keywords: ['今天', '今日', '当天'],
  },
  {
    id: 'period', title: '本周 / 本月积分', handler: 'period',
    examples: ['本周和本月各得多少分', '这周得了多少分', '这个月多少积分', '这个月呢', '本周积分情况', '本月怎么样'],
    keywords: ['本周', '本月', '这周', '这个月'],
  },
  {
    id: 'history', title: '某一天的积分', handler: 'history',
    examples: ['6月24日我得了多少分', '昨天得了多少分', '指定日期的积分'],
    keywords: ['昨天', '前一天', '日'],
  },
  {
    id: 'streak', title: '连续学习天数', handler: 'streak',
    examples: ['连续学习多少天了', '我坚持了几天', '学习天数', '连着学了多久'],
    keywords: ['连续', '坚持', '天'],
  },
  {
    id: 'channel', title: '栏目积分', handler: 'channel',
    examples: ['财经壹眼得了多少分', '易学久会多少分', '各栏目积分', '频道得分', '帮我看下财经壹眼', '我在财经壹眼拿了多少'],
    keywords: ['栏目', '频道', '财经壹眼', '易学久会'],
  },
  {
    id: 'multiplier', title: '双倍积分活动', handler: 'multiplier',
    examples: ['我有哪些双倍积分', '什么时候翻倍', '双倍活动有哪些', '哪几天加倍'],
    keywords: ['双倍', '翻倍', '活动'],
  },
  {
    id: 'level', title: '等级与升级', handler: 'level',
    examples: ['我是什么等级', '离下一级还差多少分', '怎么升级', '我的等级是多少'],
    keywords: ['等级', '级别', '升级', '差多少'],
  },
  {
    id: 'rank', title: '排名', handler: 'rank',
    examples: ['我排第几名', '我的排名是多少', '排行榜位置', '我在第几'],
    keywords: ['排名', '名次', '第几'],
  },
  {
    id: 'rewards', title: '奖励与领取', handler: 'rewards',
    examples: ['有什么头像框和气泡可以领', '我能领什么奖励', '奖励怎么兑换', '还能领什么'],
    keywords: ['奖励', '领取', '兑换'],
  },
  {
    id: 'cosmetics', title: '我的装扮', handler: 'cosmetics',
    examples: ['我的头像框是什么', '我有哪些装扮', '我的气泡', '装扮怎么换'],
    keywords: ['装扮', '头像框', '气泡', '主题'],
  },
  {
    id: 'ledger', title: '积分明细', handler: 'ledger',
    examples: ['我的积分明细', '这些分怎么来的', '为什么少了分', '最近的积分记录'],
    keywords: ['明细', '记录', '怎么来'],
  },
  {
    id: 'task', title: '今日任务进度', handler: 'task',
    examples: ['今天任务完成了吗', '打卡情况', '任务进度怎么样', '今天还要做什么'],
    keywords: ['任务', '打卡', '进度'],
  },
  {
    id: 'rule', title: '计分规则', handler: 'rule',
    examples: ['积分怎么算的', '计分规则是什么', '几分算满分', '怎么才能得分'],
    keywords: ['规则', '怎么算', '计分'],
  },
  {
    id: 'appeal', title: '积分申诉', handler: 'appeal',
    examples: ['我的分不对', '积分漏了怎么办', '我要申诉', '分数有误'],
    keywords: ['申诉', '不对', '漏了'],
  },
  {
    id: 'sync', title: '数据什么时候更新', handler: 'sync',
    examples: ['数据什么时候更新', '积分多久同步一次', '为什么我的记录还没出来', '最近同步时间'],
    keywords: ['同步', '更新', '多久'],
  },
];

const CANON_INTENTS = INTENTS.map((intent) => ({
  ...intent,
  canonExamples: intent.examples.map(canon),
  // 同义词归一后会出现重复关键词，去重避免命中率被稀释
  canonKeywords: [...new Set(intent.keywords.map(canon).filter(Boolean))],
}));

export function intentById(id) {
  return INTENTS.find((item) => item.id === id) || null;
}

/**
 * 返回按得分排序的候选意图。
 * score = 0.68 × 示例句最高相似度 + 0.32 × 关键词命中率
 */
export function matchIntents(question, limit = 4) {
  const q = canon(question);
  if (!q) return [];
  const scored = CANON_INTENTS.map((intent) => {
    let best = 0;
    for (const example of intent.canonExamples) {
      const score = similarity(q, example);
      if (score > best) best = score;
    }
    const hits = intent.canonKeywords.filter((word) => word && q.includes(word)).length;
    const keywordScore = intent.canonKeywords.length ? hits / intent.canonKeywords.length : 0;
    return {
      id: intent.id,
      title: intent.title,
      handler: intent.handler,
      example: intent.examples[0],
      score: Math.round((0.68 * best + 0.32 * keywordScore) * 1000) / 1000,
    };
  });
  return scored.sort((a, b) => b.score - a.score).filter((item) => item.score >= 0.12).slice(0, limit);
}
