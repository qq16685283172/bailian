import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(dirname, 'data', 'auth.json');
const cookieName = 'bailian_session';
const sessionHours = Math.max(1, Number(process.env.AUTH_SESSION_HOURS || 168));
const sessionMs = sessionHours * 60 * 60 * 1000;
const sessions = new Map();

function readAccounts() {
  try {
    return JSON.parse(fs.readFileSync(authFile, 'utf8')).accounts || {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function writeAccounts(accounts) {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  const temporary = `${authFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ accounts }, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, authFile);
  try { fs.chmodSync(authFile, 0o600); } catch {}
}

export function hasCustomPassword(jwcode) {
  return Boolean(readAccounts()[jwcode]);
}

export function verifyPassword(jwcode, password) {
  const account = readAccounts()[jwcode];
  if (!account) return String(password) === '123456';
  const candidate = crypto.scryptSync(String(password), account.salt, 64);
  const expected = Buffer.from(account.hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export function changePassword(jwcode, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const accounts = readAccounts();
  accounts[jwcode] = { salt, hash, updatedAt: new Date().toISOString() };
  writeAccounts(accounts);
}

function tokenFromRequest(req) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const item of cookies) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() !== cookieName) continue;
    try { return decodeURIComponent(item.slice(separator + 1).trim()); } catch { return ''; }
  }
  return '';
}

export function createSession(user) {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { user, expiresAt: Date.now() + sessionMs });
  return token;
}

export function getSession(req) {
  const token = tokenFromRequest(req);
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { ...session, token };
}

function writeCookie(req, res, token, maxAge) {
  const secure = process.env.NODE_ENV === 'production' && (req.secure || req.headers['x-forwarded-proto'] === 'https');
  res.setHeader('Set-Cookie', `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
}

export function startSession(req, res, user) {
  const token = createSession(user);
  writeCookie(req, res, token, Math.floor(sessionMs / 1000));
}

export function endSession(req, res) {
  const token = tokenFromRequest(req);
  if (token) sessions.delete(token);
  writeCookie(req, res, '', 0);
}

export function revokeOtherSessions(jwcode, currentToken) {
  for (const [token, session] of sessions) {
    if (session.user.jwcode === jwcode && token !== currentToken) sessions.delete(token);
  }
}

export function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ message: '登录已过期，请重新登录' });
  req.auth = session;
  next();
}

export function requireAdmin(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ message: '请先使用 3 开头管理员精网号登录' });
  if (!session.user.jwcode.startsWith('3')) return res.status(403).json({ message: '5 开头学员账号无权访问管理端' });
  req.auth = session;
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) if (session.expiresAt <= now) sessions.delete(token);
}, 60 * 60 * 1000).unref();
