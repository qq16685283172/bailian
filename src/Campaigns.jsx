import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Flame, ImagePlus, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { DataState, formatTime, useRemote } from './real-data';
import './campaigns.css';

const CTA_TARGETS = [
  { value: 'rewards', label: '奖励中心' },
  { value: 'tasks', label: '任务中心' },
  { value: 'ranking', label: '排行榜' },
  { value: 'wardrobe', label: '我的装扮' },
  { value: 'feedback', label: '反馈墙' },
  { value: 'mailbox', label: '邮箱' },
];

const statusOf = item => {
  const now = Date.now();
  if (item.enabled === false) return { key: 'off', text: '已停用' };
  if (item.startAt && new Date(item.startAt).getTime() > now) return { key: 'soon', text: '即将开始' };
  if (item.endAt && new Date(item.endAt).getTime() < now) return { key: 'end', text: '已结束' };
  return { key: 'live', text: '进行中' };
};

function countdown(item) {
  if (!item.endAt) return '';
  const diff = new Date(item.endAt).getTime() - Date.now();
  if (diff <= 0) return '';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `还剩 ${days} 天 ${hours} 小时`;
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `还剩 ${hours} 小时 ${minutes} 分`;
}

function Banner({ item, tall }) {
  return <div className={`campaign-banner ${tall ? 'tall' : ''}`}>
    {item.image ? <img src={item.image} alt={item.title} /> : <div className="campaign-banner-fallback"><Sparkles /></div>}
    <div className="campaign-banner-mask" />
    <div className="campaign-banner-text">
      <span className={`campaign-badge ${statusOf(item).key}`}>{statusOf(item).text}</span>
      <h3>{item.title}</h3>
      {item.subtitle && <p>{item.subtitle}</p>}
    </div>
  </div>;
}

export function CampaignsPage({ go, notify }) {
  const { data, loading, error, reload } = useRemote('/api/campaigns/active');
  const [detail, setDetail] = useState(null);
  const list = data?.list || [];
  const hero = list[0];
  const rest = list.slice(1);

  return <div className="page-stack campaigns-page">
    <DataState loading={loading} error={error} onRetry={reload} empty={!loading && !error && !list.length ? '当前没有进行中的活动，敬请期待。' : ''}>
      {hero && <section className="campaign-hero" onClick={() => setDetail(hero)} role="button" tabIndex={0}>
        <Banner item={hero} tall />
        <div className="campaign-hero-foot">
          <div>
            <strong>{hero.title}</strong>
            <span>{hero.subtitle || '点击查看活动详情'}</span>
          </div>
          <div className="campaign-hero-right">
            {countdown(hero) && <em><CalendarClock />{countdown(hero)}</em>}
            <button className="btn btn-primary" onClick={event => { event.stopPropagation(); setDetail(hero); }}>查看活动</button>
          </div>
        </div>
      </section>}

      {rest.length > 0 && <section className="campaign-grid">
        {rest.map(item => <article className="campaign-card" key={item.id} onClick={() => setDetail(item)} role="button" tabIndex={0}>
          <Banner item={item} />
          <div className="campaign-card-foot">
            <strong>{item.title}</strong>
            <span>{item.subtitle || '点击查看'}</span>
          </div>
        </article>)}
      </section>}

      {detail && <div className="campaign-detail-mask" onClick={() => setDetail(null)}>
        <section className="campaign-detail" onClick={event => event.stopPropagation()}>
          <button className="campaign-detail-close" onClick={() => setDetail(null)} aria-label="关闭"><X /></button>
          <Banner item={detail} tall />
          <div className="campaign-detail-body">
            <div className="campaign-detail-meta">
              <span className={`campaign-badge ${statusOf(detail).key}`}>{statusOf(detail).text}</span>
              {countdown(detail) && <em><CalendarClock />{countdown(detail)}</em>}
              {detail.endAt && <time>截止 {formatTime(detail.endAt)}</time>}
            </div>
            <p>{detail.content || '活动详情待补充。'}</p>
            {detail.ctaLabel && detail.ctaTarget && <button className="btn btn-primary campaign-cta" onClick={() => { setDetail(null); go(detail.ctaTarget); }}>{detail.ctaLabel}</button>}
          </div>
        </section>
      </div>}
    </DataState>
  </div>;
}

async function toDataUrl(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  const scale = Math.max(1280 / image.width, 720 / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  ctx.drawImage(image, (1280 - width) / 2, (720 - height) / 2, width, height);
  return canvas.toDataURL('image/jpeg', 0.86);
}

export function CampaignsAdmin({ notify }) {
  const { data, loading, error, reload } = useRemote('/api/campaigns');
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);

  const openNew = () => setEditor({ title: '', subtitle: '', content: '', image: '', startAt: '', endAt: '', ctaLabel: '', ctaTarget: '', enabled: true });

  const pickImage = async event => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const image = await toDataUrl(file);
      setEditor(current => ({ ...current, image }));
    } catch {
      notify && notify('图片读取失败，请换一张');
    }
  };

  const save = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editor) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '保存失败');
      setEditor(null);
      reload();
      notify && notify('活动已保存');
    } catch (err) {
      notify && notify(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async item => {
    const response = await fetch(`/api/campaigns/${item.id}/toggle`, { method: 'POST' });
    const result = await response.json();
    if (!response.ok) return notify && notify(result.message || '操作失败');
    reload();
    notify && notify(result.enabled ? '活动已启用' : '活动已停用');
  };

  return <div className="page-stack campaigns-admin">
    <div className="real-data-note">
      <div><strong>活动管理</strong><p>封面建议 16:9，上传后会自动裁切压缩；学员端只在活动时间内看到</p></div>
      <button className="btn btn-primary" onClick={openNew}><Plus />新建活动</button>
    </div>

    <DataState loading={loading} error={error} onRetry={reload} empty={!loading && !error && !data?.list.length ? '还没有活动，点「新建活动」创建第一个。' : ''}>
      <div className="campaign-admin-grid">
        {data?.list.map(item => <section className="panel campaign-admin-card" key={item.id}>
          <div className="campaign-admin-thumb">{item.image ? <img src={item.image} alt={item.title} /> : <Sparkles />}</div>
          <div className="campaign-admin-body">
            <div className="campaign-admin-head">
              <strong>{item.title}</strong>
              <span className={`campaign-badge ${statusOf(item).key}`}>{statusOf(item).text}</span>
            </div>
            <p>{item.subtitle || '未填写副标题'}</p>
            <small>{item.startAt ? formatTime(item.startAt) : '不限开始'} — {item.endAt ? formatTime(item.endAt) : '不限结束'}</small>
            <div className="campaign-admin-actions">
              <button className="btn btn-outline" onClick={() => setEditor({ ...item })}><Pencil />编辑</button>
              <button className="btn btn-outline" onClick={() => toggle(item)}>{item.enabled === false ? '启用' : '停用'}</button>
            </div>
          </div>
        </section>)}
      </div>
    </DataState>

    {editor && <div className="modal-backdrop"><form className="modal campaign-editor" onSubmit={save}>
      <button type="button" className="modal-close" onClick={() => setEditor(null)}><X /></button>
      <h2>{editor.id ? '编辑活动' : '新建活动'}</h2>

      <label>活动名称<input value={editor.title} maxLength={60} onChange={event => setEditor({ ...editor, title: event.target.value })} required /></label>
      <label>副标题<input value={editor.subtitle} maxLength={80} onChange={event => setEditor({ ...editor, subtitle: event.target.value })} /></label>

      <div className="campaign-upload">
        <span>活动封面（16:9）</span>
        <div className="campaign-upload-box">
          {editor.image ? <img src={editor.image} alt="封面预览" /> : <div className="campaign-upload-empty"><ImagePlus /><small>点击上传，自动裁切为 16:9</small></div>}
          <input type="file" accept="image/*" onChange={pickImage} />
        </div>
        {editor.image && <button type="button" className="btn btn-outline" onClick={() => setEditor({ ...editor, image: '' })}><Trash2 />移除封面</button>}
      </div>

      <div className="campaign-time-row">
        <label>开始时间<input type="datetime-local" value={editor.startAt ? String(editor.startAt).slice(0, 16) : ''} onChange={event => setEditor({ ...editor, startAt: event.target.value })} /></label>
        <label>结束时间<input type="datetime-local" value={editor.endAt ? String(editor.endAt).slice(0, 16) : ''} onChange={event => setEditor({ ...editor, endAt: event.target.value })} /></label>
      </div>

      <label>活动说明<textarea value={editor.content} maxLength={2000} rows={6} onChange={event => setEditor({ ...editor, content: event.target.value })} placeholder="活动规则、奖励内容、参与方式…" /></label>

      <div className="campaign-time-row">
        <label>按钮文字<input value={editor.ctaLabel} maxLength={20} onChange={event => setEditor({ ...editor, ctaLabel: event.target.value })} placeholder="例如：去奖励中心" /></label>
        <label>按钮跳转<select value={editor.ctaTarget} onChange={event => setEditor({ ...editor, ctaTarget: event.target.value })}>
          <option value="">不显示按钮</option>
          {CTA_TARGETS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select></label>
      </div>

      <label className="check-label"><input type="checkbox" checked={editor.enabled !== false} onChange={event => setEditor({ ...editor, enabled: event.target.checked })} />立即启用</label>
      <button className="btn btn-primary" disabled={saving}>{saving ? '保存中' : '保存活动'}</button>
    </form></div>}
  </div>;
}
