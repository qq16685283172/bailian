import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBehaviorAnalytics, getDashboard, getOperationsAnalytics, getStudents, memo } from './admin.js';
import { buildStudentWorkbook } from './export.js';
import { shanghaiDate } from './client.js';
import { rebuildDailyPoints } from './scoring.js';
import { loadStore, saveStore } from './store.js';

const id = prefix => `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const text = (value, max = 200) => String(value || '').trim().slice(0, max);
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
const materialsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'materials');

function audit(store, req, action, target, detail = '') {
  store.auditLogs.unshift({ id: id('log'), action, target, detail, actor: req.auth.user.jwcode, actorName: req.auth.user.name, createdAt: new Date().toISOString() });
  store.auditLogs = store.auditLogs.slice(0, 1000);
}

function rewardView(store, reward, jwcode = '') {
  const claims = Object.values(store.rewardClaims).filter(item => item.rewardId === reward.id);
  const own = claims.find(item => item.jwcode === jwcode);
  const remainingStock = Math.max(0, Number(reward.stock || 0) - claims.length);
  return { ...reward, claimedCount: claims.length, remainingStock, claimed: Boolean(own), claimedAt: own?.createdAt || null, claimId: own?.id || null };
}

function adjustmentInput(req, res, student, source) {
  const rawPoints = Number(req.body?.points);
  const points = source === 'appeal' ? Math.abs(rawPoints) : rawPoints;
  const reason = text(req.body?.reason, 500);
  if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 1000) {
    res.status(400).json({ message: '调整积分需为 -1000 至 1000 之间的非零整数' });
    return null;
  }
  if (reason.length < 2) {
    res.status(400).json({ message: '请填写调整原因' });
    return null;
  }
  return { id: id('adj'), jwcode: student.jwcode, studentName: student.name, points, reason, source, status: 'pending', effectiveDate: shanghaiDate(), requestedBy: req.auth.user.jwcode, requestedByName: req.auth.user.name, createdAt: new Date().toISOString() };
}

function describeFilters(query = {}) {
  const parts = [];
  if (query.query) parts.push(`搜索「${query.query}」`);
  if (query.dept) parts.push(`分部=${query.dept}`);
  if (query.status) parts.push(`状态=${query.status === 'active' ? '近7天活跃' : '待跟进'}`);
  return parts.length ? parts.join('；') : '';
}

export function registerBusinessRoutes(app, requireAdmin) {
  app.get('/api/analytics/dashboard', requireAdmin, (req, res) => res.json(memo(`dashboard:${req.query.period || 7}`, (store) => getDashboard(store, req.query.period))));
  app.get('/api/analytics/behavior', requireAdmin, (req, res) => res.json(memo(`behavior:${req.query.period || 7}:${text(req.query.dept, 100)}`, (store) => getBehaviorAnalytics(store, req.query.period, text(req.query.dept, 100)))));
  app.get('/api/analytics/operations', requireAdmin, (req, res) => res.json(memo(`operations:${req.query.period || 7}:${text(req.query.dept, 100)}`, (store) => getOperationsAnalytics(store, req.query.period, text(req.query.dept, 100)))));

  app.get('/api/students', requireAdmin, (req, res) => {
    const { all, ...result } = getStudents(loadStore(), req.query);
    res.json(result);
  });

  app.get('/api/students/export', requireAdmin, async (req, res, next) => {
    try {
      const result = getStudents(loadStore(), { ...req.query, pageSize: 100 });
      const stamp = shanghaiDate();
      if (req.query.format !== 'csv') {
        const buffer = await buildStudentWorkbook(result.all, { generatedAt: new Date().toLocaleString('zh-CN', { hour12: false }), filters: describeFilters(req.query) });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="bailian-students-${stamp}.xlsx"`);
        return res.send(buffer);
      }
    const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = [['精网号', '姓名', '分部', '门店', '等级', '累计积分', '今日积分', '状态', '最近学习得分日期'], ...result.all.map(row => [row.id, row.name, row.dept, row.shop, row.level, row.score, row.today, row.status === 'active' ? '近7天活跃' : '待跟进', row.lastLearning || '无记录'])];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="bailian-students-${stamp}.csv"`);
      res.send(`\uFEFF${rows.map(row => row.map(escape).join(',')).join('\r\n')}`);
    } catch (error) { next(error); }
  });

  app.post('/api/students/:jwcode/adjustments', requireAdmin, (req, res) => {
    const store = loadStore();
    const student = store.students[req.params.jwcode];
    if (!student) return res.status(404).json({ message: '学员不存在' });
    const adjustment = adjustmentInput(req, res, student, 'admin');
    if (!adjustment) return;
    store.pointAdjustments[adjustment.id] = adjustment;
    audit(store, req, '创建积分调整', adjustment.id, `${student.jwcode} ${pointsLabel(adjustment.points)}：${adjustment.reason}`);
    saveStore(store);
    res.status(201).json({ item: adjustment });
  });

  app.get('/api/adjustments', requireAdmin, (req, res) => {
    const status = text(req.query.status, 20);
    const list = Object.values(loadStore().pointAdjustments).filter(item => !status || item.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ list, pending: list.filter(item => item.status === 'pending').length });
  });

  app.post('/api/adjustments/:id/review', requireAdmin, (req, res) => {
    const store = loadStore();
    const item = store.pointAdjustments[req.params.id];
    if (!item) return res.status(404).json({ message: '调整申请不存在' });
    if (item.status !== 'pending') return res.status(409).json({ message: '该申请已完成审核' });
    const decision = req.body?.decision;
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ message: '审核决定不正确' });
    item.status = decision;
    item.reviewedBy = req.auth.user.jwcode;
    item.reviewedByName = req.auth.user.name;
    item.reviewedAt = new Date().toISOString();
    audit(store, req, decision === 'approved' ? '审核通过并入账' : '审核驳回', item.id, `${item.jwcode} ${pointsLabel(item.points)}`);
    const meta = decision === 'approved' ? rebuildDailyPoints(store) : store.scoringMeta;
    saveStore(store);
    res.json({ item, meta });
  });

  app.get('/api/rewards', requireAdmin, (req, res) => {
    const store = loadStore();
    const list = Object.values(store.rewards).map(item => rewardView(store, item)).sort((a, b) => a.points - b.points);
    const recentClaims = Object.values(store.rewardClaims).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20).map(claim => ({ ...claim, studentName: store.students[claim.jwcode]?.name || claim.jwcode, rewardName: store.rewards[claim.rewardId]?.name || '奖励已删除' }));
    res.json({ list, recentClaims });
  });

  app.post('/api/rewards', requireAdmin, (req, res) => {
    const store = loadStore();
    const name = text(req.body?.name, 100);
    const points = Number(req.body?.points);
    const stock = Number(req.body?.stock);
    if (!name) return res.status(400).json({ message: '请填写奖励名称' });
    if (!Number.isInteger(points) || points < 0 || points > 1000000) return res.status(400).json({ message: '领取门槛需为非负整数' });
    if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) return res.status(400).json({ message: '库存需为非负整数' });
    const previous = store.rewards[req.body?.id] || {};
    const styleKey = ['avatar-frame-quench', 'avatar-frame-master', 'rank-bubble-gold', 'rank-bubble-red', 'theme-cute', 'theme-tech'].includes(req.body?.styleKey) ? req.body.styleKey : '';
    const type = text(req.body?.type, 30) || '学习权益';
    const kind = type === '学习兑换' ? 'material' : styleKey.startsWith('avatar-frame') ? 'avatarFrame' : styleKey.startsWith('rank-bubble') ? 'rankBubble' : styleKey.startsWith('theme-') ? 'theme' : '';
    const category = ['等级奖励', '兑换奖励'].includes(type) ? '装扮奖励' : '学习奖励';
    const reward = { ...previous, id: previous.id || id('reward'), name, description: text(req.body?.description, 300), type, category, points, stock, styleKey, kind, fileUrl: type === '学习兑换' ? previous.fileUrl || '' : '', enabled: req.body?.enabled !== false, createdAt: previous.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    store.rewards[reward.id] = reward;
    audit(store, req, previous.id ? '编辑奖励' : '新建奖励', reward.id, name);
    saveStore(store);
    res.status(previous.id ? 200 : 201).json({ item: rewardView(store, reward) });
  });

  app.post('/api/rewards/:id/material', requireAdmin, express.raw({ type: ['application/pdf', 'application/octet-stream'], limit: '20mb' }), (req, res) => {
    const store = loadStore();
    const reward = store.rewards[req.params.id];
    if (!reward || reward.type !== '学习兑换') return res.status(404).json({ message: '学习兑换奖励不存在' });
    if (!Buffer.isBuffer(req.body) || req.body.length < 5 || req.body.subarray(0, 5).toString() !== '%PDF-') return res.status(400).json({ message: '请上传有效的PDF文件，大小不超过20MB' });
    fs.mkdirSync(materialsDir, { recursive: true });
    const fileName = `${path.basename(reward.id)}.pdf`;
    fs.writeFileSync(path.join(materialsDir, fileName), req.body);
    reward.kind = 'material';
    reward.category = '学习奖励';
    reward.fileUrl = fileName;
    reward.updatedAt = new Date().toISOString();
    audit(store, req, '上传学习资料', reward.id, reward.name);
    saveStore(store);
    res.json({ item: rewardView(store, reward), message: 'PDF资料已上传' });
  });

  app.get('/api/client/rewards', (req, res) => {
    const store = loadStore();
    const jwcode = req.auth.user.jwcode;
    const totalPoints = store.students[jwcode]?.totalPoints || 0;
    const claimedIds = new Set(Object.values(store.rewardClaims).filter(item => item.jwcode === jwcode).map(item => item.rewardId));
    const list = Object.values(store.rewards).filter(item => item.enabled || claimedIds.has(item.id)).map(item => {
      const view = rewardView(store, item, jwcode);
      return { ...view, canClaim: item.enabled && !view.claimed && totalPoints >= item.points && view.remainingStock > 0 && (item.kind !== 'material' || Boolean(item.fileUrl)) };
    }).sort((a, b) => a.points - b.points);
    res.json({ list, totalPoints });
  });

  app.post('/api/client/rewards/:id/claim', (req, res) => {
    const store = loadStore();
    const jwcode = req.auth.user.jwcode;
    const reward = store.rewards[req.params.id];
    if (!reward || !reward.enabled) return res.status(404).json({ message: '奖励不存在或未上架' });
    const view = rewardView(store, reward, jwcode);
    if (view.claimed) return res.status(409).json({ message: '该奖励已领取，请勿重复操作' });
    if ((store.students[jwcode]?.totalPoints || 0) < reward.points) return res.status(400).json({ message: '当前积分尚未达到领取门槛' });
    if (view.remainingStock <= 0) return res.status(400).json({ message: '奖励库存已领完' });
    if (reward.kind === 'material' && !reward.fileUrl) return res.status(400).json({ message: '管理员尚未上传PDF资料' });
    const claim = { id: id('RC'), jwcode, rewardId: reward.id, status: 'claimed', createdAt: new Date().toISOString() };
    store.rewardClaims[claim.id] = claim;
    audit(store, req, '领取奖励', claim.id, reward.name);
    saveStore(store);
    res.status(201).json({ claim, reward: rewardView(store, reward, jwcode) });
  });

  app.get('/api/client/rewards/:id/download', (req, res) => {
    const store = loadStore();
    const jwcode = req.auth.user.jwcode;
    const reward = store.rewards[req.params.id];
    if (!reward || reward.kind !== 'material' || !reward.fileUrl) return res.status(404).json({ message: '学习资料不存在' });
    const claimed = Object.values(store.rewardClaims).some(item => item.jwcode === jwcode && item.rewardId === reward.id);
    if (!claimed) return res.status(403).json({ message: '请先领取该学习奖励，再下载资料' });
    const fileName = path.basename(reward.fileUrl);
    const filePath = path.join(materialsDir, fileName);
    if (path.extname(fileName).toLowerCase() !== '.pdf' || !fs.existsSync(filePath)) return res.status(404).json({ message: 'PDF文件尚未上传或已被移除' });
    res.download(filePath, `${reward.name}.pdf`);
  });

  app.post('/api/client/cosmetics', (req, res) => {
    const store = loadStore();
    const jwcode = req.auth.user.jwcode;
    const kind = text(req.body?.kind, 20);
    const styleKey = text(req.body?.styleKey, 40);
    if (!['avatarFrame', 'rankBubble', 'theme'].includes(kind)) return res.status(400).json({ message: '装扮类型不正确' });
    if (styleKey) {
      const reward = Object.values(store.rewards).find(item => item.kind === kind && item.styleKey === styleKey);
      const claimed = reward && Object.values(store.rewardClaims).some(item => item.jwcode === jwcode && item.rewardId === reward.id);
      if (!claimed) return res.status(403).json({ message: '请先到奖励中心领取该装扮' });
    }
    const selection = { ...(store.cosmeticSelections[jwcode] || {}), [kind]: styleKey || null };
    store.cosmeticSelections[jwcode] = selection;
    saveStore(store);
    res.json({ ok: true, selection });
  });

  app.get('/api/announcements/active', (req, res) => {
    const list = (loadStore().announcements || []).filter(item => item.enabled).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    res.json({ list });
  });

  app.get('/api/announcements', requireAdmin, (req, res) => {
    const list = [...(loadStore().announcements || [])].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    res.json({ list });
  });

  app.post('/api/announcements', requireAdmin, (req, res) => {
    const store = loadStore();
    const title = text(req.body?.title, 100);
    const content = text(req.body?.content, 2000);
    if (!title || !content) return res.status(400).json({ message: '请填写公告标题和内容' });
    const index = (store.announcements || []).findIndex(item => item.id === req.body?.id);
    const previous = index >= 0 ? store.announcements[index] : {};
    const announcement = { ...previous, id: previous.id || id('notice'), title, content, enabled: req.body?.enabled !== false, important: Boolean(req.body?.important), publishedAt: previous.publishedAt || new Date().toISOString() };
    if (index >= 0) store.announcements[index] = announcement; else store.announcements.unshift(announcement);
    audit(store, req, previous.id ? '编辑公告' : '发布公告', announcement.id, title);
    saveStore(store);
    res.status(previous.id ? 200 : 201).json({ item: announcement });
  });

  app.post('/api/client/appeals', (req, res) => {
    const store = loadStore();
    const student = store.students[req.auth.user.jwcode];
    if (!student) return res.status(404).json({ message: '学员档案不存在' });
    const adjustment = adjustmentInput(req, res, student, 'appeal');
    if (!adjustment) return;
    store.pointAdjustments[adjustment.id] = adjustment;
    audit(store, req, '提交积分申诉', adjustment.id, `${pointsLabel(adjustment.points)}：${adjustment.reason}`);
    saveStore(store);
    res.status(201).json({ item: adjustment });
  });
}

function pointsLabel(points) {
  return `${points > 0 ? '+' : ''}${points} 分`;
}
