import React, { useEffect, useState } from 'react';
import { Activity, Award, BadgeCheck, Bell, CalendarDays, Check, CheckCircle2, ChevronRight, CircleHelp, Clock3, FileText, Flame, Gift, Home, LayoutDashboard, ListChecks, LockKeyhole, LogOut, Medal, Megaphone, Menu, MessageSquare, Play, RefreshCw, Settings, ShieldCheck, Shirt, Star, Ticket, Trophy, UserRound, Users, X } from 'lucide-react';
import { BehaviorAnalytics, OperationsAnalytics } from './Analytics';
import SyncCenter from './SyncCenter';
import ScoringRules from './ScoringRules';
import { Login, PasswordModal } from './Login';
import { AdminDashboard, AuditPage, RewardsAdmin, StudentsPage } from './RealAdmin';
import RewardsPage from './Rewards';
import Wardrobe from './Wardrobe';
import { AnnouncementModal, AnnouncementsAdmin } from './Announcements';
import FeedbackWall from './FeedbackWall';
import BailianAi from './BailianAi';
import HeroCanvas from './HeroCanvas';
import AnimatedNumber from './AnimatedNumber';
import { DataState, downloadCsv, formatTime, useRemote } from './real-data';
import './client-live.css';

const clientNav = [
  { id: 'home', label: '首页', icon: Home }, { id: 'tasks', label: '任务中心', icon: ListChecks },
  { id: 'ranking', label: '排行榜', icon: Trophy }, { id: 'rewards', label: '奖励中心', icon: Gift }, { id: 'wardrobe', label: '我的装扮', icon: Shirt }, { id: 'feedback', label: '反馈墙', icon: MessageSquare }, { id: 'profile', label: '我的', icon: UserRound },
];
const adminNav = [
  { id: 'dashboard', label: '数据总览', icon: LayoutDashboard }, { id: 'sync', label: '数据同步', icon: RefreshCw },
  { id: 'behavior', label: '行为分析', icon: Activity }, { id: 'operations', label: '运营分析', icon: Activity },
  { id: 'students', label: '学员管理', icon: Users }, { id: 'rewardsAdmin', label: '奖励管理', icon: Gift },
  { id: 'announcements', label: '公告管理', icon: Megaphone }, { id: 'feedbackAdmin', label: '反馈管理', icon: MessageSquare }, { id: 'audit', label: '积分审核', icon: ShieldCheck }, { id: 'rules', label: '规则配置', icon: Settings },
];
const pageNames = {
  home: ['学员首页', '每天进步一点，终会百炼成钢'], tasks: ['任务中心', '看清今日进度，不漏掉每一分'], ranking: ['排行榜', '每一份坚持，都值得被看见'], rewards: ['奖励中心', '成长有收获，坚持有回响'], wardrobe: ['我的装扮', '自由穿戴头像框、排名气泡和界面主题'], profile: ['个人中心', '我的学习档案与成长记录'], feedback: ['反馈墙', '只收弘历软件优化改进建议，经频道商讨后决定是否修改'],
  dashboard: ['数据总览', '指标来自同步与积分记录'], sync: ['听课数据同步', '定时补采、增量去重、自动计分，全过程可追溯'], behavior: ['学员行为分析', '从学习行为中识别参与情况'], operations: ['运营分析', '从数据观察计划运行情况'], students: ['学员管理', '管理学员档案与积分'], rewardsAdmin: ['奖励管理', '配置奖励、库存与领取记录'], announcements: ['公告管理', '发布、编辑和停用学员端通知'], feedbackAdmin: ['反馈管理', '标记反馈是否已解决'], audit: ['积分审核', '每一次调整都有依据、有留痕'], rules: ['规则配置', '统一积分规则，公开透明可追溯'],
};

function Brand({ admin }) {
  return <div className="brand"><div className="brand-mark"><Flame size={25}/></div><div><strong>百炼计划</strong><span>{admin?'运营管理平台':'BAI LIAN PLAN'}</span></div></div>;
}

function ProgressRing({ value, max = 6 }) {
  const radius = 27, circumference = 2 * Math.PI * radius;
  return <div className="progress-ring"><svg viewBox="0 0 70 70"><circle cx="35" cy="35" r={radius} className="ring-bg"/><circle cx="35" cy="35" r={radius} className="ring-value" strokeDasharray={circumference} strokeDashoffset={circumference*(1-Math.min(value,max)/max)}/></svg><strong>{value}<span>/{max}</span></strong></div>;
}

function TaskBoard({ clientData, expanded, notify }) {
  const definitions = [
    { name: '有效打卡 / 评论', hint: '来自评论同步', icon: MessageSquare },
    { name: '送领航卡', hint: '来自礼物同步', icon: Ticket },
    { name: `观看超 ${clientData.watchMinutes} 分钟`, hint: '严格超过阈值才计分', icon: Clock3 },
  ];
  return <div className={`task-board ${expanded?'expanded':''}`}>{clientData.channels.map(channel=>{
    const values = clientData.tasks[channel.id] || [false,false,false];
    return <div className="channel-row" key={channel.id}><div className="channel-info"><div className={`channel-icon ${channel.tone}`}><Play/></div><div><div className="channel-name">{channel.name}<span className="live-status">{channel.status}</span></div><p>正常 {channel.time} 开播</p></div></div><div className="task-actions">{definitions.map((task,index)=><button key={task.name} className={`task-action ${values[index]?'done':''}`} onClick={()=>notify(values[index]?`「${task.name}」已确认完成`:'任务由直播记录自动更新，页面每 30 秒刷新')}><span className="task-check">{values[index]?<Check/>:<task.icon/>}</span><span><strong>{task.name}</strong>{expanded&&<small>{values[index]?'已完成，+1 基础行为分':task.hint}</small>}</span>{!values[index]&&<ChevronRight/>}</button>)}</div><div className="channel-score"><strong>{values.filter(Boolean).length}</strong><span>/ 3 分</span></div></div>;
  })}</div>;
}

function ClientHome({ clientData, go, notify }) {
  const person = clientData.student, level = clientData.level, reward = clientData.nextReward;
  return <><section className="hero"><HeroCanvas/><div className="hero-pattern"/><div className="hero-copy"><div className="eyebrow"><Flame/>连续学习 {clientData.streak} 天</div><h1>{person.name}，<span>继续加油</span></h1><p>{clientData.date} · 今日积分根据学习记录自动更新</p><div className="hero-score"><div><strong><AnimatedNumber value={clientData.todayScore}/></strong><span>今日积分</span></div><div className="hero-total-score"><strong><AnimatedNumber value={clientData.totalPoints}/></strong><span>累计总积分</span></div><ProgressRing value={clientData.todayBaseScore}/></div></div><div className="hero-mascot"><div className="mascot-mark"><Flame/></div><strong>百炼成钢</strong><span>点滴积累 · 步步进阶</span></div></section><div className="home-grid"><div className="page-stack"><section className="panel task-panel"><div className="panel-heading"><div><h2>今日学习任务</h2><p>有效打卡、观看和领航卡均由同步记录判定</p></div><button className="text-link" onClick={()=>go('tasks')}>任务详情 <ChevronRight/></button></div><TaskBoard clientData={clientData} notify={notify}/></section><section className="panel ranking-preview"><div className="panel-heading"><div><h2>我的排名</h2><p>按积分实时计算</p></div><button className="text-link" onClick={()=>go('ranking')}>查看排行榜 <ChevronRight/></button></div><div className="rank-cards"><div><Trophy/><span>总榜排名</span><strong>{clientData.rank.rank}</strong><small>{clientData.rank.gap?`距上一名 ${clientData.rank.gap} 分`:'积分排名'}</small></div><div><Medal/><span>本月排名</span><strong>{clientData.monthRank.rank}</strong><small>本月积分 {clientData.monthRank.score}</small></div><div><Award/><span>成长等级</span><strong>Lv.{level.level}</strong><small>{level.title}</small></div></div></section></div><aside className="page-stack"><section className="panel level-widget"><div className="panel-heading"><h2>成长等级</h2><span>Lv.{level.level}</span></div><div className="level-badge"><span>{level.name}</span><strong>{level.title}</strong><small>累计 {clientData.totalPoints} 分</small></div><div className="level-progress"><div><i style={{width:`${level.progress}%`}}/></div><span>{level.next?`距 ${level.next.title} 还需 ${level.remaining} 分`:'已达到最高等级'}</span></div></section><section className="panel next-reward"><div className="panel-heading"><h2>奖励进度</h2><Gift/></div>{reward?<><span>{reward.type}</span><h3>{reward.name}</h3><p>{reward.description}</p><div className="reward-progress"><div><i style={{width:`${Math.min(100,clientData.totalPoints/reward.points*100||0)}%`}}/></div><small>{clientData.totalPoints} / {reward.points} 分 · 剩余库存 {reward.remainingStock}</small></div><button className="btn btn-outline" onClick={()=>go('rewards')}>进入奖励中心</button></>:<><h3>暂无未领取奖励</h3><p>已领取 {clientData.claimedRewards} 项奖励</p><button className="btn btn-outline" onClick={()=>go('rewards')}>查看领取记录</button></>}</section></aside></div></>;
}

function TasksPage({ clientData, notify }) {
  return <div className="page-stack"><div className="summary-banner"><div><span>{clientData.date}</span><h2>今日总积分（基础分 + 活动分 + 调整分）</h2><p>数据每日自动同步更新</p></div><div><strong>{clientData.todayScore}</strong><span>今日积分</span></div></div><div className="task-summary-grid"><section className="panel"><span>基础行为分</span><strong>{clientData.todayBaseScore}</strong></section><section className="panel"><span>活动奖励分</span><strong>{clientData.todayActivityScore}</strong></section><section className="panel"><span>人工调整分</span><strong>{clientData.todayAdjustmentScore}</strong></section><section className="panel"><span>累计总积分</span><strong>{clientData.totalPoints}</strong></section></div><section className="panel task-panel"><div className="panel-heading"><div><h2>两档栏目 · 六项基础任务</h2><p>同日同栏目跨平台重复直播只计一次</p></div></div><TaskBoard clientData={clientData} expanded notify={notify}/></section></div>;
}

function RankRow({ row, own, cosmetics, showScore }) {
  const bubble = own && cosmetics?.rankBubble ? cosmetics.rankBubble : '';
  return <tr className={own?'rank-me':''}><td><span className={`rank-bubble ${bubble}`}><strong>{row.rank}</strong></span></td><td>{row.avatar} {row.name}{own?'（我）':''}</td><td>{row.title}</td><td>{row.branch}</td>{showScore&&<td><strong>{row.score}</strong></td>}</tr>;
}

function RankingPage({ canExport, cosmetics }) {
  const [period, setPeriod] = useState('周榜');
  const { data, loading, error, reload } = useRemote(`/api/client/ranking?period=${encodeURIComponent(period)}`);
  const exportRanking = () => downloadCsv(`ranking-${period}.csv`, [{key:'rank',label:'排名'},{key:'name',label:'学员'},{key:'title',label:'等级'},{key:'branch',label:'分部'},{key:'score',label:'积分'}], data?.list||[]);
  return <div className="page-stack"><div className="ranking-hero"><div><span><Trophy/>积分排行榜</span><h2>每一份坚持，都值得被看见</h2><p>姓名脱敏展示，积分自动更新</p></div><div><small>我的排名</small><strong>{data?.me.rank??'—'}</strong><span>{data?.me.score??0} 分</span></div></div><div className="real-data-note"><div className="tabs">{['日榜','周榜','月榜','总榜'].map(item=><button key={item} className={period===item?'active':''} onClick={()=>setPeriod(item)}>{item}</button>)}</div>{canExport&&<button className="btn btn-outline" onClick={exportRanking}>导出当前榜单</button>}</div><DataState loading={loading} error={error} onRetry={reload} empty={!loading&&!error&&!data?.list.length?'当前周期还没有积分记录。':''}><section className="panel"><div className="table-scroll"><table className="rank-table"><thead><tr><th>排名</th><th>学员</th><th>等级</th><th>分部</th>{canExport&&<th>积分</th>}</tr></thead><tbody>{data?.list.map(row=><RankRow key={row.rank} row={row} own={row.rank===data.me.rank} cosmetics={cosmetics} showScore={canExport}/>)}{data?.me && typeof data.me.rank==='number' && data.me.rank>10 && <RankRow row={data.me} own cosmetics={cosmetics} showScore={canExport}/>}</tbody></table></div></section></DataState></div>;
}

function ProfilePage({ go, clientData, onLogout, onAppeal }) {
  const [detail, setDetail] = useState(false);
  const person = clientData.student, level = clientData.level;
  return <div className="profile-layout"><div className="page-stack"><section className="panel profile-card"><div className={`profile-avatar ${clientData.cosmetics?.avatarFrame||''}`}>{person.name[0]}<span><Flame/></span></div><div className="profile-name"><h2>{person.name}<span>Lv.{level.level} {level.title}</span></h2><p>精网号：{person.jwcode} · {person.dept}</p><small><BadgeCheck/>共有 {person.joinDays} 天积分记录</small></div><button className="btn btn-outline" onClick={onLogout}><LogOut/>退出登录</button></section><section className="panel level-card"><div className="panel-heading"><div><h2>我的成长等级</h2><p>累计积分决定等级，等级只升不降</p></div><strong>{clientData.totalPoints}<small> / {level.next?.threshold||'最高等级'}</small></strong></div><div className="level-road">{['铁砧','淬火','锻打','成型','开刃','精钢','宗师'].map((name,index)=><div className={index<level.level?'reached':index===level.level?'next':''} key={name}><span>{index<level.level?<Check/>:index+1}</span><strong>{name}</strong><small>{clientData.levelThresholds[index]}分</small></div>)}</div></section><section className="panel ledger-panel"><div className="panel-heading"><h2>积分明细</h2><button className="text-link" onClick={()=>setDetail(!detail)}>{detail?'收起':'全部明细'}<ChevronRight/></button></div>{clientData.ledger.slice(0,detail?30:5).map((item,index)=><div className="ledger-row" key={`${item.date}-${index}`}><div className="ledger-icon">{item.points>=0?'+':'−'}</div><div><strong>{item.title}</strong><small>{item.live} · {item.date}</small></div><b>{item.points>0?'+':''}{item.points}</b></div>)}{!clientData.ledger.length&&<p className="real-empty-line">暂无积分记录</p>}</section></div><aside className="page-stack"><section className="panel profile-menu"><button onClick={()=>go('rewards')}><Gift/><span>我的奖励</span><ChevronRight/></button><button onClick={onAppeal}><FileText/><span>积分申诉</span><ChevronRight/></button></section></aside></div>;
}

function Modal({ children, onClose }) {
  return <div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><div className="modal"><button className="modal-close" onClick={onClose}><X/></button>{children}</div></div>;
}

function AdjustModal({ student, onClose, onSaved }) {
  const [kind, setKind] = useState('补分'); const [points, setPoints] = useState('1'); const [reason, setReason] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/students/${student.id}/adjustments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ points: (kind==='补分'?1:-1)*Number(points), reason }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message);
      onSaved(result.item);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  return <Modal onClose={onClose}><h2>积分调整申请</h2><p>{student.name} · {student.id} · 当前 {student.score} 分</p><div className="mini-toggle"><button className={kind==='补分'?'active':''} onClick={()=>setKind('补分')}>补分</button><button className={kind==='扣分'?'active':''} onClick={()=>setKind('扣分')}>扣分</button></div><div className="form-field"><label>调整积分</label><input type="number" min="1" max="1000" value={points} onChange={event=>setPoints(event.target.value)}/></div><div className="form-field"><label>原因</label><textarea value={reason} onChange={event=>setReason(event.target.value)} placeholder="请填写可供审核追溯的实际原因"/></div>{error&&<p className="form-error">{error}</p>}<button className="btn btn-primary" disabled={saving||reason.trim().length<2} onClick={submit}>{saving?'正在提交':'提交审核'}</button></Modal>;
}

function AppealModal({ onClose, onSaved }) {
  const [points, setPoints] = useState('1'); const [reason, setReason] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/client/appeals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ points: Number(points), reason }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message);
      onSaved(result.item);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  return <Modal onClose={onClose}><h2>提交积分申诉</h2><p>申请将写入审核列表，由 3 开头管理员审核后入账。</p><div className="form-field"><label>申请补回积分</label><input type="number" min="1" max="1000" value={points} onChange={event=>setPoints(event.target.value)}/></div><div className="form-field"><label>实际情况</label><textarea value={reason} onChange={event=>setReason(event.target.value)} placeholder="请说明直播日期、栏目和积分异常原因"/></div>{error&&<p className="form-error">{error}</p>}<button className="btn btn-primary" disabled={saving||reason.trim().length<2} onClick={submit}>{saving?'正在提交':'提交申诉'}</button></Modal>;
}

export default function App() {
  const [mode, setMode] = useState('client'); const [page, setPage] = useState('home'); const [modal, setModal] = useState(null); const [toast, setToast] = useState(''); const [mobileMenu, setMobileMenu] = useState(false);
  const [auth, setAuth] = useState(null); const [authLoading, setAuthLoading] = useState(true); const [jwcode, setJwcode] = useState(''); const [clientData, setClientData] = useState(null); const [clientError, setClientError] = useState('');
  const nav = mode==='client'?clientNav:adminNav;
  const [title, subtitle] = pageNames[page] || pageNames.home;
  const notify = text => { setToast(text); clearTimeout(window.__toastTimer); window.__toastTimer=setTimeout(()=>setToast(''),3000); };
  const go = target => { setPage(target); setMobileMenu(false); window.scrollTo({top:0,behavior:'smooth'}); };
  const switchMode = () => { if(mode==='client'&&auth?.role!=='admin')return; const next=mode==='client'?'admin':'client';setMode(next);setPage(next==='client'?'home':'dashboard');setMobileMenu(false); };
  const completeLogin = user => { setAuth(user);setJwcode(user.jwcode);localStorage.setItem('bailian-jwcode',user.jwcode);setClientData(null);setClientError('');const next=user.role==='admin'?'admin':'client';setMode(next);setPage(next==='admin'?'dashboard':'home');if(user.defaultPassword)setModal({type:'password'}); };
  const logout = async () => { try{await fetch('/api/auth/logout',{method:'POST'})}catch{}setAuth(null);setClientData(null);setClientError('');setMode('client');setPage('home');setModal(null);setMobileMenu(false); };
  const currentDate = new Date();
  const closeAnnouncement = () => { if(modal?.noticeKey)sessionStorage.setItem(modal.noticeKey,modal.latestId);setModal(null); };
  const openAnnouncements = async () => { try{const response=await fetch('/api/announcements/active');const result=await response.json();if(result.list?.length)setModal({type:'announcement',items:result.list,noticeKey:`bailian-notice-${auth.jwcode}`,latestId:result.list[0].id});else notify('暂时没有新公告');}catch{notify('公告读取失败，请稍后再试');} };
  // 公告里的动作按钮：跳转页面 / 打开小AI / 领取补偿
  const handleNoticeAction = async action => {
    if(!action)return;
    if(action.type==='page'){ closeAnnouncement(); go(action.target); return; }
    if(action.type==='feedback'){ closeAnnouncement(); go('feedback'); return; }
    if(action.type==='ai'){ closeAnnouncement(); window.dispatchEvent(new CustomEvent('bailian:open-ai')); return; }
    if(action.type==='claim'){
      try{
        const response=await fetch(`/api/announcements/${action.noticeId}/claim`,{method:'POST'});
        const result=await response.json();
        if(!response.ok){ notify(result.message||'领取失败'); return; }
        notify(`领取成功，+ ${result.points} 分`);
        refreshClient();
        closeAnnouncement();
      }catch{ notify('领取失败，请稍后再试'); }
    }
  };

  useEffect(()=>{
    let active=true;
    fetch('/api/auth/me').then(response=>response.json()).then(result=>{if(!active)return;if(result.authenticated){setAuth(result.user);setJwcode(result.user.jwcode);const next=result.user.role==='admin'?'admin':'client';setMode(next);setPage(next==='admin'?'dashboard':'home')}else setAuth(null)}).catch(()=>active&&setAuth(null)).finally(()=>active&&setAuthLoading(false));
    return()=>{active=false};
  },[]);

  useEffect(()=>{
    if(!auth||auth.defaultPassword)return;
    let active=true;
    const noticeKey=`bailian-notice-${auth.jwcode}`;
    fetch('/api/announcements/active').then(response=>response.json()).then(result=>{
      if(active&&result.list?.length&&sessionStorage.getItem(noticeKey)!==result.list[0].id)setModal(current=>current||{type:'announcement',items:result.list,noticeKey,latestId:result.list[0].id});
    }).catch(()=>{});
    return()=>{active=false};
  },[auth?.jwcode,auth?.defaultPassword]);

  useEffect(()=>{
    if(mode!=='client'||!auth||!jwcode)return;
    let active=true;
    const load=async()=>{try{const response=await fetch(`/api/client/${encodeURIComponent(jwcode)}`);if(response.status===401){if(active)setAuth(null);return}const result=await response.json();if(!response.ok)throw new Error(result.message||'学员数据读取失败');if(active){setClientData(result);setClientError('')}}catch(error){if(active)setClientError(error.message)}};
    load();const timer=setInterval(load,30000);const onFocus=()=>load();window.addEventListener('focus',onFocus);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',onFocus)};
  },[jwcode,mode,auth]);

  const refreshClient = async () => { if(!jwcode)return;try{const response=await fetch(`/api/client/${encodeURIComponent(jwcode)}`);if(response.status===401){setAuth(null);return}const result=await response.json();if(!response.ok)throw new Error(result.message);setClientData(result);setClientError('')}catch(error){setClientError(error.message);notify(error.message)} };

  if(authLoading)return <div className="auth-boot"><Flame/><span>正在验证登录状态…</span></div>;
  if(!auth)return <Login onLogin={completeLogin}/>;

  let content;
  if(mode==='client'){
    if(!clientData)content=<DataState loading={!clientError} error={clientError} onRetry={refreshClient}/>;
    else if(page==='home')content=<ClientHome clientData={clientData} go={go} notify={notify}/>;
    else if(page==='tasks')content=<TasksPage clientData={clientData} notify={notify}/>;
    else if(page==='ranking')content=<RankingPage canExport={auth.role==='admin'} cosmetics={clientData.cosmetics}/>;
    else if(page==='rewards')content=<RewardsPage notify={notify} onChanged={refreshClient}/>;
    else if(page==='wardrobe')content=<Wardrobe clientData={clientData} notify={notify} onChanged={refreshClient} go={go}/>;
    else if(page==='feedback')content=<FeedbackWall notify={notify}/>;
    else content=<ProfilePage go={go} clientData={clientData} onLogout={logout} onAppeal={()=>setModal({type:'appeal'})}/>;
  }else{
    if(page==='dashboard')content=<AdminDashboard go={go}/>;
    else if(page==='sync')content=<SyncCenter notify={notify}/>;
    else if(page==='behavior')content=<BehaviorAnalytics/>;
    else if(page==='operations')content=<OperationsAnalytics/>;
    else if(page==='students')content=<StudentsPage onAdjust={student=>setModal({type:'adjust',student})}/>;
    else if(page==='rewardsAdmin')content=<RewardsAdmin notify={notify}/>;
    else if(page==='announcements')content=<AnnouncementsAdmin notify={notify}/>;
    else if(page==='feedbackAdmin')content=<FeedbackWall notify={notify} admin/>;
    else if(page==='audit')content=<AuditPage notify={notify}/>;
    else content=<ScoringRules notify={notify}/>;
  }

  return <div className={`app ${mode} ${mode==='client'?(clientData?.cosmetics?.theme||''):''}`}>{mobileMenu&&<div className="sidebar-mask" onClick={()=>setMobileMenu(false)}/>}<aside className={`sidebar ${mobileMenu?'mobile-open':''}`}><Brand admin={mode==='admin'}/><div className="side-section-label">{mode==='client'?'学习成长':'工作台'}</div><nav>{nav.map(item=><button key={item.id} className={page===item.id?'active':''} onClick={()=>go(item.id)}><item.icon/>{mode==='client'&&item.id==='rewards'&&clientData?.pendingRewards>0&&<i className="nav-dot"/>}<span>{item.label}</span></button>)}</nav><div className="side-bottom">{auth.role==='admin'&&<button onClick={switchMode}><RefreshCw/><span>{mode==='client'?'进入管理端':'返回学员端'}</span></button>}{mode==='admin'&&<button onClick={()=>setModal({type:'password'})}><LockKeyhole/><span>修改密码</span></button>}<button onClick={logout}><LogOut/><span>退出登录</span></button><div className="side-user"><div>{(clientData?.student.name||auth.name)[0]}</div><span><strong>{clientData?.student.name||auth.name}</strong><small>{mode==='client'?`精网号 ${jwcode}`:`管理员 · ${auth.jwcode}`}</small></span></div></div></aside><main className="main"><header className="topbar"><button className="mobile-menu-btn" onClick={()=>setMobileMenu(true)}><Menu/></button><div><h1>{title}</h1><p>{subtitle}</p></div><div className="top-actions"><button className="notification-btn" onClick={()=>mode==='admin'?go('announcements'):openAnnouncements()}><Bell/></button><div className="top-date"><CalendarDays/><span>{currentDate.toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'})}<small>{currentDate.toLocaleDateString('zh-CN',{weekday:'long'})}</small></span></div>{auth.role==='admin'&&<button className={`btn btn-${mode==='client'?'outline':'soft'}`} onClick={switchMode}><RefreshCw/>{mode==='client'?'管理端':'学员端'}</button>}</div></header><div className="content">{content}</div><footer className="footer"><span>百炼计划 · 让每一次学习都有成长</span></footer></main>{mode==='client'&&<nav className="mobile-bottom-nav">{clientNav.map(item=><button key={item.id} className={page===item.id?'active':''} onClick={()=>go(item.id)}><item.icon/>{item.id==='rewards'&&clientData?.pendingRewards>0&&<i className="nav-dot"/>}<span>{item.label==='任务中心'?'任务':item.label==='奖励中心'?'奖励':item.label==='排行榜'?'排行':item.label==='我的装扮'?'装扮':item.label}</span></button>)}</nav>}{mode==='client'&&<BailianAi userName={clientData?.student.name||auth.name} pendingRewards={clientData?.pendingRewards||0}/>}{toast&&<div className="toast"><CheckCircle2/>{toast}</div>}{modal?.type==='password'&&<PasswordModal onClose={()=>setModal(null)} onSaved={message=>{setModal(null);setAuth(previous=>previous?{...previous,defaultPassword:false}:previous);notify(message)}}/>}{modal?.type==='adjust'&&<AdjustModal student={modal.student} onClose={()=>setModal(null)} onSaved={item=>{setModal(null);notify(`调整申请 ${item.id} 已保存，等待审核`)}}/>}{modal?.type==='appeal'&&<AppealModal onClose={()=>setModal(null)} onSaved={item=>{setModal(null);notify(`申诉 ${item.id} 已提交，等待管理员审核`)}}/>}{modal?.type==='announcement'&&<AnnouncementModal items={modal.items} onClose={closeAnnouncement} onAction={handleNoticeAction}/>}</div>;
}
