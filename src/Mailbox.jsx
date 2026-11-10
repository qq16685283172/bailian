import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { DataState, formatTime, useRemote } from './real-data';
import './mailbox.css';

export default function Mailbox({ notify, onChanged, onAction }) {
  const { data, loading, error, reload } = useRemote('/api/mailbox');
  const [openId, setOpenId] = useState('');

  const open = async item => {
    setOpenId(openId === item.id ? '' : item.id);
    if (!item.read) {
      try {
        await fetch(`/api/mailbox/${item.id}/read`, { method: 'POST' });
        onChanged && onChanged();
        reload();
      } catch { /* 忽略 */ }
    }
  };

  const readAll = async () => {
    try {
      await fetch('/api/mailbox/read-all', { method: 'POST' });
      onChanged && onChanged();
      reload();
      notify && notify('已全部标为已读');
    } catch {
      notify && notify('操作失败，请稍后再试');
    }
  };

  return <div className="page-stack mailbox-page">
    <section className="panel mailbox-head">
      <div>
        <h2>消息邮箱</h2>
        <p>公告与系统通知都放在这里，不再自动弹窗。左侧菜单「邮箱」上的小红点表示有未读消息。</p>
      </div>
      <div className="mailbox-head-actions">
        <span className="mailbox-unread">未读 {data ? data.unread : 0}</span>
        <button className="btn btn-outline" onClick={readAll}>全部已读</button>
      </div>
    </section>

    <DataState loading={loading} error={error} onRetry={reload} empty={!loading && !error && !data?.list.length ? '还没有消息。' : ''}>
      <div className="mailbox-list">
        {data?.list.map(item => <article key={item.id} className={`panel mailbox-item ${item.read ? 'read' : 'unread'}`}>
          <button className="mailbox-item-head" onClick={() => open(item)}>
            <span className="mailbox-dot" />
            <span className="mailbox-title">{item.title}</span>
            {item.claimed && <em className="mailbox-tag"><CheckCircle2 />已领取</em>}
            <time>{formatTime(item.publishedAt)}</time>
          </button>
          {openId === item.id && <div className="mailbox-body">
            <p>{item.content}</p>
            {item.actions?.length > 0 && <div className="mailbox-actions">
              {item.actions.map(action => <button
                key={action.label}
                className="btn btn-primary"
                disabled={action.type === 'claim' && item.claimed}
                onClick={() => onAction && onAction({ ...action, noticeId: item.id })}
              >{action.type === 'claim' && item.claimed ? '已领取' : action.label}</button>)}
            </div>}
          </div>}
        </article>)}
      </div>
    </DataState>
  </div>;
}
