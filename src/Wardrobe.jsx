import React, { useEffect, useState } from 'react';
import { Check, Flame, Gift, Palette, Shirt, Sparkles } from 'lucide-react';
import { DataState, useRemote } from './real-data';
import './wardrobe.css';

const groups = [
  { kind: 'avatarFrame', title: '头像框', subtitle: '翅膀与荣耀边框，可随时卸下', icon: Shirt, fallback: { id: 'default-avatar', name: '自然头像', description: '不显示头像框，保留原始头像。', styleKey: '', claimed: true } },
  { kind: 'rankBubble', title: '排名气泡', subtitle: '只装饰本人在榜单中的名次', icon: Sparkles, fallback: { id: 'default-bubble', name: '简约名次', description: '不显示特殊排名气泡。', styleKey: '', claimed: true } },
  { kind: 'theme', title: '界面主题', subtitle: '整套界面配色，随时恢复经典红金', icon: Palette, fallback: { id: 'default-theme', name: '经典红金', description: '百炼计划默认简约红金主题。', styleKey: '', claimed: true } },
];

function WardrobeVisual({ kind, item, name, rank }) {
  if (kind === 'avatarFrame') return <div className={`profile-avatar wardrobe-avatar ${item.styleKey}`}>{name}<span><Flame /></span></div>;
  if (kind === 'rankBubble') return <div className={`rank-bubble wardrobe-bubble ${item.styleKey}`}><strong>{rank}</strong></div>;
  return <div className={`theme-preview ${item.styleKey || 'theme-classic'}`}><div><i /><i /><i /></div><strong>百炼计划</strong><span>累计总积分</span><b>666</b></div>;
}

export default function Wardrobe({ clientData, onChanged, notify, go }) {
  const { data, loading, error, reload } = useRemote('/api/client/rewards');
  const [working, setWorking] = useState('');
  useEffect(() => { reload(); }, [clientData.claimedRewards]);
  const cosmetics = clientData.cosmetics || {};
  const select = async (kind, styleKey) => {
    setWorking(`${kind}:${styleKey}`);
    try {
      const response = await fetch('/api/client/cosmetics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, styleKey }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      await onChanged?.();
      notify(styleKey ? '装扮已穿戴，效果已生效' : '已恢复不穿戴状态');
    } catch (err) { notify(err.message); } finally { setWorking(''); }
  };
  return <div className="page-stack wardrobe-page">
    <section className="wardrobe-hero"><div className="wardrobe-current"><div className={`profile-avatar wardrobe-avatar ${cosmetics.avatarFrame || ''}`}>{clientData.student.name.slice(0, 1)}<span><Flame /></span></div><div className={`rank-bubble wardrobe-bubble ${cosmetics.rankBubble || ''}`}><strong>{clientData.rank.rank}</strong></div></div><div><span><Shirt />我的装扮</span><h2>穿喜欢的，也可以随时卸下</h2><p>头像框、排名气泡和主题分别保存，选择后立即生效。</p></div></section>
    <DataState loading={loading} error={error} onRetry={reload}>
      {groups.map(group => {
        const items = [group.fallback, ...(data?.list || []).filter(item => item.kind === group.kind)];
        const current = cosmetics[group.kind] || '';
        return <section className="wardrobe-section" key={group.kind}><div className="panel-heading"><div><h2><group.icon />{group.title}</h2><p>{group.subtitle}</p></div><span>{items.filter(item => item.claimed).length - 1} 件已拥有</span></div><div className="wardrobe-grid">{items.map(item => {
          const active = current === item.styleKey;
          const key = `${group.kind}:${item.styleKey}`;
          return <article className={`wardrobe-item ${active ? 'active' : ''} ${!item.claimed ? 'locked' : ''}`} key={item.id}><div className="wardrobe-visual"><WardrobeVisual kind={group.kind} item={item} name={clientData.student.name.slice(0, 1)} rank={clientData.rank.rank} />{active && <span className="wearing-mark"><Check />使用中</span>}</div><div className="wardrobe-item-info"><h3>{item.name}</h3><p>{item.description}</p>{item.claimed ? <button className={`btn ${active ? 'btn-outline' : 'btn-primary'}`} disabled={working === key || (active && !item.styleKey)} onClick={() => select(group.kind, active && item.styleKey ? '' : item.styleKey)}>{working === key ? '正在保存' : active && item.styleKey ? '卸下装扮' : active ? '当前默认' : item.styleKey ? '穿戴使用' : '恢复默认'}</button> : <button className="btn btn-outline" onClick={() => go('rewards')}><Gift />先到奖励中心领取</button>}</div></article>;
        })}</div></section>;
      })}
    </DataState>
  </div>;
}
