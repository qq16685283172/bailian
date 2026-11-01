import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'credentials.json');
const platforms = {
  xxcg: { name: '精网 · 开直播', host: 'mp.xxcg.com', env: 'LIVE_LIST_URL', active: true },
  toujiao: { name: '投教原创', host: 'toujiao.hlquant.com', env: 'TOUJIAO_LIST_URL', active: false },
};

function readSaved() {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return {}; }
}

export function getListUrl(platform = 'xxcg') {
  if (!platforms[platform]) throw new Error('不支持的数据平台');
  return readSaved()[platform]?.listUrl || process.env[platforms[platform].env] || '';
}

export function saveListUrl(platform, listUrl) {
  if (!platforms[platform]) throw new Error('不支持的数据平台');
  const url = new URL(String(listUrl || '').trim());
  const config = platforms[platform];
  if (url.protocol !== 'https:' || url.hostname !== config.host) throw new Error(`链接域名必须是 ${config.host}`);
  if (!url.pathname.includes('/creator/')) throw new Error('请提供创作者后台的完整链接');
  if (!url.searchParams.get('token')) throw new Error('链接中缺少 token');
  if (!url.searchParams.get('pd_id')) throw new Error('请提供直播列表链接，链接中需包含 pd_id');
  const saved = readSaved();
  saved[platform] = { listUrl: url.toString(), updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(saved), 'utf8');
  fs.renameSync(temp, file);
  return credentialStatus(platform);
}

export function credentialStatus(platform) {
  const config = platforms[platform];
  if (!config) throw new Error('不支持的数据平台');
  const saved = readSaved()[platform];
  const listUrl = saved?.listUrl || process.env[config.env] || '';
  let token = '', channelId = '';
  try { const url = new URL(listUrl); token = url.searchParams.get('token') || ''; channelId = url.searchParams.get('pd_id') || ''; } catch {}
  return {
    platform, name: config.name, configured: Boolean(token), activeSync: config.active, channelId,
    maskedToken: token ? `${token.slice(0, 4)}${'•'.repeat(12)}${token.slice(-4)}` : '',
    updatedAt: saved?.updatedAt || null, storage: saved ? '本地凭证库' : token ? '环境变量' : '未配置',
  };
}

export function allCredentialStatus() {
  return Object.keys(platforms).map(credentialStatus);
}
