import React, { useState } from 'react';
import { X, UserRound, ShieldCheck, RefreshCw } from 'lucide-react';

export default function AccountModal({ onClose, onSubmit }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (!/^\d{6,12}$/.test(code)) return setError('请输入正确的精网号（6–12 位数字）');
    setLoading(true); setError('');
    try { await onSubmit(code); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal account-modal"><button className="modal-close" onClick={onClose}><X/></button><div className="modal-reward-icon"><UserRound/></div><h2>切换学习档案</h2><p>输入已产生同步听课记录的精网号</p><div className="form-field"><label>精网号</label><div className="points-input"><input autoFocus inputMode="numeric" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} onKeyDown={e=>e.key==='Enter'&&submit()} placeholder="请输入 6–12 位数字"/></div></div>{error&&<div className="account-error">{error}</div>}<div className="modal-tip"><ShieldCheck/> 切换只影响当前浏览器，不会修改学员档案。</div><div className="modal-actions"><button className="btn btn-outline" onClick={onClose}>取消</button><button className="btn btn-primary" disabled={loading||!code} onClick={submit}><RefreshCw className={loading?'spin':''}/>{loading?'正在读取':'查看我的数据'}</button></div></div></div>;
}
