export const welfareAnnouncement = { id: 'notice-20261029-welfare-ai', title: '百炼新计划福利与百炼小AI上线', content: '10月16日至19日积分翻倍已按新规则重新核算，领航群和AI课程专属回馈已计入。\n全体学员已发放30分百炼新计划奖励，可在积分明细中查看。\n奖励中心现已分为装扮奖励和学习奖励，学习资料领取后可直接下载PDF。\n百炼小AI正式上线，可查询积分、等级、排名、任务、双倍活动与奖励。', publishedAt: '2026-10-29T12:00:00.000Z', enabled: true, important: true };

export function applyOctoberWelfare(store) {
  const groupMembers = new Set();
  const courseParticipants = new Set();
  for (const record of Object.values(store.attendance)) {
    const live = store.lives[record.liveId];
    if (!live) continue;
    if (String(live.classId) === '3723' || live.className === '领航粉丝群') groupMembers.add(record.jwcode);
    if (String(record.liveId) === '92324' || String(live.name || '').includes('AI时代开启智能投资新纪元')) courseParticipants.add(record.jwcode);
  }
  const createdAt = '2026-10-29T12:00:00.000Z';
  for (const jwcode of groupMembers) {
    const id = `welfare-group-${jwcode}`;
    store.welfareGrants[id] = { id, jwcode, date: '2026-10-16', points: 6, title: '加入领航粉丝群', evidence: '领航粉丝群课程记录（班级ID 3723）', createdAt };
  }
  for (const jwcode of courseParticipants) {
    const id = `welfare-ai-course-${jwcode}`;
    store.welfareGrants[id] = { id, jwcode, date: '2026-10-16', points: 6, title: '预约《AI时代开启 智能投资新纪元》课程', evidence: '课程 92324 已同步参与名单', createdAt };
  }
  for (const jwcode of Object.keys(store.students)) {
    const id = `adj-bailian-new-2026-${jwcode}`;
    store.pointAdjustments[id] = { id, jwcode, studentName: store.students[jwcode].name, points: 30, reason: '百炼新计划奖励', source: 'welfare', status: 'approved', effectiveDate: '2026-10-29', requestedBy: 'system', requestedByName: '百炼计划', createdAt, reviewedAt: createdAt };
  }
  if (!store.announcements.some(item => item.id === welfareAnnouncement.id)) store.announcements.push({ ...welfareAnnouncement });
  return { groupMembers: groupMembers.size, courseParticipants: courseParticipants.size, allStudents: Object.keys(store.students).length };
}
