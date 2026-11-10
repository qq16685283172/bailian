import React, { useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { DataState, formatTime, useRemote } from './real-data';
import './feedback.css';

export default function FeedbackWall({ notify, admin }) {
  const { data, loading, error, reload } = useRemote('/api/feedback');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [replyFor, setReplyFor] = useState('');
  const [replyText, setReplyText] = useState('');

  const submit = async event => {
    event.preventDefault();
    if (sending || draft.trim().length < 5) return;
    setSending(true);
    try {
      const response = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: draft.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '提交失败');
      setDraft('');
      reload();
      notify && notify('反馈已提交，感谢你的建议');
    } catch (err) {
      notify && notify(err.message);
    } finally {
      setSending(false);
    }
  };

  const resolve = async id => {
    const response = await fetch(`/api/feedback/${id}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reply: replyText }) });
    const result = await response.json();
    if (!response.ok) return notify && notify(result.message || '操作失败');
    setReplyFor('');
    setReplyText('');
    reload();
    notify && notify('已标记为已解决');
  };

  return <div className="page-stack feedback-page">
    <section className="panel feedback-intro">
      <div>
        <h2>反馈墙</h2>
        <p>这里只收「弘历软件优化改进」相关的建议。每条反馈经过频道统一商讨后再决定是否修改，管理员会把进度更新为「已解决」。</p>
      </div>
      <span className="feedback-count">{data ? `${data.list.length} 条` : ''}</span>
    </section>

    {!admin && <section className="panel feedback-form">
      <form onSubmit={submit}>
        <textarea value={draft} maxLength={500} placeholder="希望改进什么？例如：任务中心的说明能不能写得更清楚一点。" onChange={event => setDraft(event.target.value)} />
        <div className="feedback-form-foot">
          <span>{draft.length}/500</span>
          <button className="btn btn-primary" disabled={sending || draft.trim().length < 5}><Send />{sending ? '提交中' : '提交反馈'}</button>
        </div>
      </form>
    </section>}

    <DataState loading={loading} error={error} onRetry={reload} empty={!loading && !error && !data?.list.length ? '还没有人反馈，来写第一条吧。' : ''}>
      <div className="feedback-list">
        {data?.list.map(item => <article className={`panel feedback-item ${item.status}`} key={item.id}>
          <header>
            <span className={`status-tag ${item.status === 'resolved' ? 'success' : 'warning'}`}>{item.status === 'resolved' ? '已解决' : '待处理'}</span>
            <strong>{item.name}</strong>
            {item.mine && <em>我的</em>}
            <time>{formatTime(item.createdAt)}</time>
          </header>
          <p>{item.content}</p>
          {item.status === 'resolved' && <div className="feedback-reply">
            <CheckCircle2 />
            <span>{item.reply || '经过商讨，相关问题已处理'}{item.resolvedBy ? ` · ${item.resolvedBy}` : ''}</span>
          </div>}
          {admin && item.status !== 'resolved' && (replyFor === item.id
            ? <div className="feedback-resolve">
                <input value={replyText} maxLength={300} placeholder="处理说明（可留空）" onChange={event => setReplyText(event.target.value)} />
                <button className="btn btn-outline" onClick={() => { setReplyFor(''); setReplyText(''); }}>取消</button>
                <button className="btn btn-primary" onClick={() => resolve(item.id)}>确认解决</button>
              </div>
            : <button className="btn btn-outline feedback-resolve-btn" onClick={() => { setReplyFor(item.id); setReplyText(''); }}>标记已解决</button>)}
        </article>)}
      </div>
    </DataState>
  </div>;
}
