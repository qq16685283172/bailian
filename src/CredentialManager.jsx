import React, { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, RefreshCw, CheckCircle2, CircleAlert, Eye, EyeOff, Link2, X } from 'lucide-react';
import './credentials.css';

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || '请求失败');
  return data;
}

export default function CredentialManager({ notify, onUpdated }) {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState('');
  const [listUrl, setListUrl] = useState('');
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    try { const result = await request('/api/credentials'); setItems(result.list); }
    catch (err) { notify(err.message); }
  };
  useEffect(() => { load(); }, []);
  const open = platform => { setEditing(platform); setListUrl(''); setError(''); setVisible(false); };
  const save = async () => {
    setSaving(true); setError('');
    try {
      const result = await request(`/api/credentials/${editing}/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listUrl }) });
      await request(`/api/credentials/${editing}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listUrl }) });
      notify(`新令牌已保存，${result.message}`);
      setEditing(''); setListUrl(''); await load(); onUpdated();
    } catch (err) { setError(`${err.message}。旧凭证未被替换，请修正后重试。`); }
    finally { setSaving(false); }
  };
  return <section className="panel credential-panel">
    <div className="credential-heading"><div><KeyRound/><span><strong>数据源凭证管理</strong><small>令牌失效后，粘贴新的完整直播列表链接并测试，无需修改配置文件</small></span></div><span><ShieldCheck/>完整令牌不会回显</span></div>
    <div className="credential-list">{items.map(item=><div className="credential-item" key={item.platform}>
      <div className={`credential-platform-icon ${item.platform}`}><Link2/></div>
      <div className="credential-info"><strong>{item.name}<span className={item.configured?'configured':''}>{item.configured?'已配置':'未配置'}</span></strong><small>{item.configured?`${item.maskedToken} · 频道 ${item.channelId}`:'请配置包含 token 与 pd_id 的直播列表链接'}</small></div>
      <div className="credential-meta"><span>{item.storage}</span><small>{item.activeSync?'当前自动同步数据源':'仅保存与测试，未启用自动同步'}</small></div>
      <button className="btn btn-outline" onClick={()=>open(item.platform)}><RefreshCw/>{item.configured?'更新令牌':'配置令牌'}</button>
    </div>)}</div>
    {editing&&<div className="credential-editor"><div><strong>更新{items.find(item=>item.platform===editing)?.name}凭证</strong><button onClick={()=>setEditing('')}><X/></button></div><label>完整直播列表链接<div className="credential-input"><input type={visible?'text':'password'} autoComplete="off" value={listUrl} onChange={e=>setListUrl(e.target.value)} placeholder="粘贴包含 token 和 pd_id 的完整链接"/><button onClick={()=>setVisible(!visible)}>{visible?<EyeOff/>:<Eye/>}</button></div></label><p>保存后立即调用接口测试；精网后续同步任务会自动使用新令牌。</p>{error&&<div className="credential-error"><CircleAlert/>{error}</div>}<div className="credential-actions"><button className="btn btn-outline" onClick={()=>setEditing('')}>取消</button><button className="btn btn-primary" disabled={saving||!listUrl.trim()} onClick={save}>{saving?<RefreshCw className="spin"/>:<CheckCircle2/>}{saving?'正在保存并测试':'保存并测试'}</button></div></div>}
  </section>;
}
