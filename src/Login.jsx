import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Flame, LockKeyhole, ShieldCheck, UserRound, X } from 'lucide-react';
import './auth.css';

export function Login({ onLogin }) {
  const [jwcode, setJwcode] = useState(() => localStorage.getItem('bailian-jwcode') || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isAdmin = jwcode.startsWith('3');
  const isStudent = jwcode.startsWith('5');

  const submit = async event => {
    event.preventDefault();
    setError('');
    if (!/^\d{6,12}$/.test(jwcode)) return setError('请输入 6–12 位精网号');
    if (!['3', '5'].includes(jwcode[0])) return setError('仅支持 3 或 5 开头的精网号登录');
    if (isAdmin && !password) return setError('管理员账号需要输入密码');
    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jwcode, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '登录失败');
      onLogin(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return <main className="auth-page">
    <div className="auth-pattern"/>
    <section className="auth-intro">
      <div className="auth-brand"><span><Flame/></span><div><strong>百炼计划</strong><small>BAI LIAN PLAN</small></div></div>
      <div className="auth-intro-copy"><span className="auth-kicker"><ShieldCheck/>统一身份认证</span><h1>每天进步一点，<br/>终会百炼成钢。</h1><p>一个精网号，连接你的学习任务、积分成长与运营管理。</p></div>
      <div className="auth-role-list"><div><span>5</span><p><strong>学员账号</strong><small>5 开头精网号，免密登录</small></p><CheckCircle2/></div><div><span>3</span><p><strong>管理员账号</strong><small>3 开头精网号，密码认证后进入管理端</small></p><LockKeyhole/></div></div>
      <small className="auth-copyright">百炼计划 · 让每一次学习都有成长</small>
    </section>
    <section className="auth-form-side">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-card-icon"><UserRound/></div>
        <span className="auth-welcome">欢迎回来</span><h2>登录百炼计划</h2><p className="auth-subtitle">使用已同步的精网号登录</p>
        <label className="auth-field"><span>精网号</span><div className="auth-input"><UserRound/><input value={jwcode} onChange={event=>{setJwcode(event.target.value.replace(/\D/g,'').slice(0,12));setPassword('');setError('')}} inputMode="numeric" autoComplete="username" placeholder="请输入精网号" maxLength={12} autoFocus/></div></label>
        {isAdmin&&<label className="auth-field"><span>管理员密码</span><div className="auth-input"><LockKeyhole/><input type={showPassword?'text':'password'} value={password} onChange={event=>setPassword(event.target.value)} autoComplete="current-password" placeholder="请输入管理员密码"/><button type="button" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?'隐藏密码':'显示密码'}>{showPassword?<EyeOff/>:<Eye/>}</button></div></label>}
        <div className={`auth-account-hint ${isAdmin?'admin':''}`}>{isAdmin?<><ShieldCheck/>管理员账号 · 密码验证后进入管理端</>:isStudent?<><CheckCircle2/>学员账号 · 无需密码，登录后隐藏管理端</>:<><UserRound/>5 开头学员免密 · 3 开头管理员验证</>}</div>
        {error&&<div className="auth-error" role="alert">{error}</div>}
        <button className="auth-submit" disabled={loading}>{loading?'正在验证…':'登录'}{!loading&&<ArrowRight/>}</button>
        <p className="auth-help">精网号未同步或无法登录时，请联系管理员。</p>
      </form>
    </section>
  </main>;
}

export function PasswordModal({ onClose, onSaved }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async event => {
    event.preventDefault();
    if (newPassword.length < 6) return setError('新密码至少 6 位');
    if (newPassword !== confirmPassword) return setError('两次输入的新密码不一致');
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '密码修改失败');
      onSaved(result.message);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  return <div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><form className="modal password-modal" onSubmit={submit}><button type="button" className="modal-close" onClick={onClose}><X/></button><div className="password-modal-icon"><LockKeyhole/></div><h2>修改管理员密码</h2><p>修改后，其他已登录会话将自动退出。</p><label>当前密码<input type="password" value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)} autoComplete="current-password" required/></label><label>新密码<input type="password" value={newPassword} onChange={event=>setNewPassword(event.target.value)} autoComplete="new-password" minLength={6} maxLength={64} required/></label><label>确认新密码<input type="password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={6} maxLength={64} required/></label>{error&&<div className="auth-error">{error}</div>}<button className="auth-submit" disabled={saving}>{saving?'正在保存…':'保存新密码'}</button></form></div>;
}
