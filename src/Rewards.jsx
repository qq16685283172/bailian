import React, { useState } from 'react';
import { Award, Check, Download, FileText, Gift, X } from 'lucide-react';
import { DataState, formatTime, useRemote } from './real-data';

function RewardVisual({ reward }) {
  if (reward.kind === 'avatarFrame') return <div className={`cosmetic-preview avatar-preview ${reward.styleKey}`}><span>炼</span><small>头像框</small></div>;
  if (reward.kind === 'rankBubble') return <div className="bubble-preview"><span>我的排名</span><div className={`rank-bubble ${reward.styleKey}`}><strong>8</strong></div><small>排名气泡</small></div>;
  if (reward.kind === 'theme') return <div className="bubble-preview"><div className={`theme-preview ${reward.styleKey}`}><div><i /><i /><i /></div><strong>百炼计划</strong><span>累计总积分</span><b>666</b></div><small>界面主题</small></div>;
  if (reward.kind === 'material') return <div className="material-preview"><FileText /><strong>PDF</strong><small>学习资料</small></div>;
  return <div className="reward-icon"><Gift /></div>;
}

export default function RewardsPage({ notify, onChanged }) {
  const [kind, setKind] = useState('学习奖励');
  const [target, setTarget] = useState(null);
  const [success, setSuccess] = useState(null);
  const [working, setWorking] = useState(false);
  const { data, loading, error, reload } = useRemote('/api/client/rewards');
  const list = data?.list.filter(item => item.category === kind) || [];
  const claim = async () => {
    setWorking(true);
    try {
      const response = await fetch(`/api/client/rewards/${target.id}/claim`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setSuccess({ claim: result.claim, reward: target });
      setTarget(null);
      reload();
      onChanged?.();
    } catch (err) { notify(err.message); } finally { setWorking(false); }
  };
  const actionLabel = reward => ['兑换奖励', '学习兑换'].includes(reward.type) ? '确认兑换' : '确认领取';
  return <div className="page-stack rewards-page">
    <section className="reward-banner"><div><span><Gift />成长奖励</span><h2>每一分坚持，都有回响</h2><p>当前累计 <strong>{data?.totalPoints ?? 0}</strong> 分 · 达到门槛即可领取，兑换不减少积分</p></div><div className="reward-banner-medal"><Award /></div></section>
    <div className="reward-filter-row"><div className="tabs reward-kind-tabs">{[['学习奖励', '学习奖励'], ['装扮奖励', '装扮奖励']].map(([value, label]) => <button key={value} className={kind === value ? 'active' : ''} onClick={() => setKind(value)}>{label}</button>)}</div><span>学习资料优先展示，装扮可自由穿戴</span></div>
    <DataState loading={loading} error={error} onRetry={reload} empty={!loading && !error && !list.length ? (kind === '学习奖励' ? '学习资料正在准备中，可以先到「装扮奖励」看看。' : '暂时还没有装扮奖励。') : ''}>
      <div className="rewards-grid">{list.map(reward => <section className={`panel reward-card ${!reward.canClaim && !reward.claimed ? 'locked' : ''}`} key={reward.id}>
        <div className="reward-card-top"><RewardVisual reward={reward} /><span className="reward-type">{reward.type}</span>{reward.claimed && <span className="claimed-stamp"><Check />已领取</span>}</div>
        <div className="reward-info"><span className="points-threshold">{reward.points} 积分解锁 · 不扣分</span><h3>{reward.name}</h3><p>{reward.description || '奖励说明未填写'}</p><small>{reward.kind === 'material' ? `PDF学习资料 · 已有 ${reward.claimedCount} 人领取` : reward.kind ? `长期有效 · 已有 ${reward.claimedCount} 人领取` : `剩余库存 ${reward.remainingStock} · 已领取 ${reward.claimedCount}`}</small>
          {reward.claimed ? <div className="claimed-detail"><strong>{reward.kind === 'material' ? '资料已解锁' : reward.kind ? '已拥有，可去穿戴' : '领取成功'}</strong><span>{formatTime(reward.claimedAt)}</span>{reward.kind === 'material' && <a className="btn btn-primary material-download" href={`/api/client/rewards/${reward.id}/download`} download><Download />下载PDF</a>}</div> : <button className="btn btn-primary" disabled={!reward.canClaim} onClick={() => setTarget(reward)}>{reward.canClaim ? actionLabel(reward) : reward.kind === 'material' && !reward.fileUrl ? '资料待上传' : data.totalPoints < reward.points ? `还差 ${reward.points - data.totalPoints} 分` : reward.remainingStock <= 0 ? '库存已领完' : '暂不可领取'}</button>}
        </div>
      </section>)}</div>
    </DataState>
    {target && <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={() => setTarget(null)}><X /></button><RewardVisual reward={target} /><h2>{['兑换奖励', '学习兑换'].includes(target.type) ? '确认兑换奖励？' : '确认领取奖励？'}</h2><p>{target.name}</p><div className="modal-tip">只验证累计积分门槛，不会扣减积分。{target.kind === 'material' ? '领取后可随时下载PDF学习资料。' : target.kind ? '领取后装扮自动生效。' : '每个账号限领一次，不可重复领取。'}</div><div className="modal-actions"><button className="btn btn-outline" onClick={() => setTarget(null)}>取消</button><button className="btn btn-primary" disabled={working} onClick={claim}>{working ? '正在领取' : actionLabel(target)}</button></div></div></div>}
    {success && <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={() => setSuccess(null)}><X /></button><div className="success-burst"><Check /></div><h2>{['兑换奖励', '学习兑换'].includes(success.reward.type) ? '兑换成功' : '领取成功'}</h2><p>{success.reward.name}{success.reward.kind === 'material' ? '已解锁，现在可以下载PDF。' : success.reward.kind ? '已领取成功，可到「我的装扮」穿戴，积分未减少。' : ''}</p>{success.reward.kind === 'material' && <a className="btn btn-primary material-download" href={`/api/client/rewards/${success.reward.id}/download`} download><Download />下载PDF</a>}<button className="btn btn-outline" onClick={() => setSuccess(null)}>完成</button></div></div>}
  </div>;
}
