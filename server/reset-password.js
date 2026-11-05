import { changePassword, hasCustomPassword, verifyPassword } from './auth.js';

const [jwcode = '', password = '', mode = 'reset'] = process.argv.slice(2);

if (!/^\d{6,12}$/.test(String(jwcode).trim())) {
  console.error('用法: node server/reset-password.js <精网号> <密码> [--check]');
  process.exit(1);
}

if (mode === '--check') {
  console.log(`${jwcode} 密码${verifyPassword(jwcode, password) ? '匹配' : '不匹配'}`);
  process.exit(0);
}

if (!password || String(password).length < 6) {
  console.error('新密码至少 6 位');
  process.exit(1);
}

const before = hasCustomPassword(jwcode) ? '自定义密码' : '初始密码 123456';
changePassword(jwcode, password);
console.log(`${jwcode} 密码已重置（原状态：${before}）`);
console.log('校验：' + (verifyPassword(jwcode, password) ? '通过' : '失败'));
