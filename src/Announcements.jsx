import React, { useState } from 'react';
import { BellRing, CheckCircle2, Megaphone, Pencil, Plus, X } from 'lucide-react';
import { DataState, formatTime, useRemote } from './real-data';
import './announcements.css';

export function AnnouncementModal({ items, onClose, onAction }) {
  return <div className="announcement-backdrop"><section className="announcement-modal" role="dialog" aria-modal="true" aria-label="百炼计划公告">
    <header className="announcement-head"><div className="announcement-bell"><BellRing /><i /></div><div><span>百炼公告 · 新通知</span><h2>有一份重要消息请查收</h2></div><button onClick={onClose} aria-label="关闭公告"><X /></button></header>
    <div className="announcement-list">{items.map((item, index) => <article className="announcement-article" key={item.id}><div className="announcement-meta"><span>{item.important ? '重要通知' : '计划通知'}</span><time>{formatTime(item.publishedAt)}</time></div><h3>{item.title}</h3><p>{item.content}</p>{item.actions?.length > 0 && <div className="announcement-actions">{item.actions.map(action => <button key={action.label} className="btn btn-primary" onClick={() => onAction && onAction({ ...action, noticeId: item.id })}>{action.label}</button>)}</div>}{index < items.length - 1 && <hr />}</article>)}</div>
    <footer className="announcement-foot"><span><CheckCircle2 />阅读后本次登录不再自动提醒</span><button className="btn btn-primary" onClick={onClose}>我知道了</button></footer>
  </section></div>;
}

export function AnnouncementsAdmin({ notify }) {
  const { data, loading, error, reload } = useRemote('/api/announcements');
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const save = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch('/api/announcements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editor) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setEditor(null);
      reload();
      notify('公告已保存并同步到学员端');
    } catch (err) { notify(err.message); } finally { setSaving(false); }
  };
  const toggle = async item => {
    const response = await fetch('/api/announcements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...item, enabled: !item.enabled }) });
    const result = await response.json();
    if (!response.ok) return notify(result.message);
    notify(item.enabled ? '公告已停用' : '公告已启用');
    reload();
  };
  return <div className="page-stack announcements-admin"><div className="real-data-note"><div><strong>公告管理</strong><p>启用中的公告会在学员登录后弹出</p></div><button className="btn btn-primary" onClick={() => setEditor({ title: '', content: '', enabled: true, important: true })}><Plus />发布公告</button></div>
    <DataState loading={loading} error={error} onRetry={reload} empty={!loading && !error && !data?.list.length ? '暂无公告，请点击发布公告。' : ''}><div className="announcement-admin-list">{data?.list.map(item => <section className="panel announcement-admin-card" key={item.id}><div className="announcement-admin-icon"><Megaphone /></div><div><span>{item.important ? '重要公告' : '普通公告'} · {formatTime(item.publishedAt)}</span><h3>{item.title}</h3><p>{item.content}</p></div><div className="announcement-admin-actions"><span className={`status-tag ${item.enabled ? 'success' : ''}`}>{item.enabled ? '展示中' : '已停用'}</span><button className="btn btn-outline" onClick={() => setEditor(item)}><Pencil />编辑</button><button className="btn btn-outline" onClick={() => toggle(item)}>{item.enabled ? '停用' : '启用'}</button></div></section>)}</div></DataState>
    {editor && <div className="modal-backdrop"><form className="modal announcement-editor" onSubmit={save}><button type="button" className="modal-close" onClick={() => setEditor(null)}><X /></button><h2>{editor.id ? '编辑公告' : '发布新公告'}</h2><label>公告标题<input value={editor.title} maxLength={100} onChange={event => setEditor({ ...editor, title: event.target.value })} required /></label><label>公告内容<textarea value={editor.content} maxLength={2000} rows={8} onChange={event => setEditor({ ...editor, content: event.target.value })} required /></label><label className="check-label"><input type="checkbox" checked={editor.important} onChange={event => setEditor({ ...editor, important: event.target.checked })} />标记为重要通知</label><label className="check-label"><input type="checkbox" checked={editor.enabled} onChange={event => setEditor({ ...editor, enabled: event.target.checked })} />保存后立即在学员端展示</label><button className="btn btn-primary" disabled={saving}>{saving ? '正在保存' : '保存公告'}</button></form></div>}
  </div>;
}
