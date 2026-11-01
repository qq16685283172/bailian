import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw, CheckCircle2, CircleAlert, Clock3, CalendarDays, Database, Users,
  Radio, Award, Play, ShieldCheck, Download, ChevronRight, CircleHelp, Activity,
  MessageSquare, Gift, Eye, Server, ListChecks, ArrowUpRight, RotateCcw
} from 'lucide-react';
import './sync.css';
import ClassSyncPanel from './ClassSyncPanel';
import './class-sync.css';
import CredentialManager from './CredentialManager';

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || '请求失败');
  return data;
}
const timeText = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '尚未同步';
const runStatus = { success: '成功', partial: '部分成功', failed: '失败', running: '进行中' };

export default function SyncCenter({ notify }) {
  const [status, setStatus] = useState(null);
  const [runs, setRuns] = useState([]);
  const [lives, setLives] = useState([]);
  const [scoring, setScoring] = useState(null);
  const [days, setDays] = useState(2);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('courses');
  const historyDays = Math.max(1, Math.ceil((Date.now() - new Date(`${scoring?.startDate || '2026-06-24'}T00:00:00+08:00`).getTime()) / 86400000));

  const load = useCallback(async () => {
    try {
      const [nextStatus, nextRuns, nextLives, nextScoring] = await Promise.all([
        request('/api/sync/status'), request('/api/sync/runs'), request('/api/lives'), request('/api/scoring/config'),
      ]);
      setStatus(nextStatus); setRuns(nextRuns.list); setLives(nextLives.list); setScoring(nextScoring.scoring); setError('');
      return nextStatus;
    } catch (err) { setError(err.message); return null; }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!status?.running) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [status?.running, load]);

  const testConnection = async () => {
    setTesting(true);
    try { const result = await request('/api/sync/test', { method: 'POST' }); notify(result.message); }
    catch (err) { notify(err.message); }
    finally { setTesting(false); }
  };
  const startSync = async () => {
    try {
      const result = await request('/api/sync/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days }) });
      notify(result.message); await load();
    } catch (err) { notify(err.message); }
  };

  const running = status?.running;
  const lastRun = status?.lastRun;
  return <div className="page-stack sync-page">
    {error && <div className="sync-error"><CircleAlert/><div><strong>同步服务未连接</strong><p>{error}。请使用 npm run dev 同时启动页面和同步服务。</p></div><button onClick={load}><RotateCcw/>重新连接</button></div>}
    <section className="sync-hero">
      <div className={`sync-hero-icon ${running ? 'running' : ''}`}><RefreshCw/></div>
      <div className="sync-hero-copy"><span><i/>{running ? '正在同步听课数据' : status?.configured ? '自动同步已开启' : '等待配置数据源'}</span><h2>{running ? running.currentCourse : '听课记录定时补采'}</h2><p>{running ? `已处理 ${running.processed} / ${running.total} 场直播，请保持同步服务运行` : '每天自动检查遗漏与延迟数据，去重后写入百炼积分记录'}</p></div>
      <div className="next-sync"><Clock3/><div><span>下次自动同步</span><strong>{status?.nextRun || '—'}</strong><small>{status?.timeZone || 'Asia/Shanghai'} · 补查近 {status?.lookbackDays || 2} 天</small></div></div>
    </section>

    <div className="sync-metrics">
      <section className="panel"><Database/><div><span>已同步直播</span><strong>{status?.totals.lives || 0}<small>场</small></strong></div></section>
      <section className="panel"><Users/><div><span>听课学员</span><strong>{status?.totals.students || 0}<small>人</small></strong></div></section>
      <section className="panel"><ListChecks/><div><span>去重听课记录</span><strong>{status?.totals.attendance || 0}<small>条</small></strong></div></section>
      <section className="panel"><Award/><div><span>累计有效行为分</span><strong>{status?.totals.points || 0}<small>分</small></strong></div></section>
    </div>

    <section className="panel sync-control"><div><h2>手动补采</h2><p>用于补充历史遗漏；重复执行不会重复计分</p></div><label>补查范围<select value={days} onChange={e=>setDays(Number(e.target.value))}><option value={1}>最近 1 天</option><option value={2}>最近 2 天</option><option value={7}>最近 7 天</option><option value={31}>最近 31 天</option><option value={historyDays}>自 {scoring?.startDate || '2026-06-24'} 起</option></select></label><button className="btn btn-outline" disabled={testing||!status?.configured} onClick={testConnection}><Activity/>{testing?'正在测试':'测试连接'}</button><button className="btn btn-primary" disabled={Boolean(running)||!status?.configured} onClick={startSync}><RefreshCw className={running?'spin':''}/>{running?'同步进行中':'立即补采'}</button></section>

    <CredentialManager notify={notify} onUpdated={load}/>

    <ClassSyncPanel notify={notify} running={running} classSource={status?.classSource} scoring={scoring} onStarted={load}/>

    <div className="sync-content-grid">
      <section className="panel sync-records"><div className="panel-heading"><div className="tabs"><button className={tab==='courses'?'active':''} onClick={()=>setTab('courses')}>课程同步记录</button><button className={tab==='logs'?'active':''} onClick={()=>setTab('logs')}>任务运行日志</button></div><button className="text-link" onClick={load}><RefreshCw/>刷新</button></div>
        {tab==='courses'?<div className="table-scroll"><table><thead><tr><th>直播课程</th><th>栏目归属</th><th>观看记录</th><th>评论 / 领航卡</th><th>最近同步</th><th>状态</th></tr></thead><tbody>{lives.slice(0,10).map(live=><tr key={live.id}><td><div className="sync-course"><span><Play/></span><div><strong>{live.name}</strong><small>{live.startTime} · ID {live.id}</small>{live.className&&<span className="sync-course-class">来源：{live.className}</span>}</div></div></td><td><span className="sync-channel">{live.channel}</span></td><td><strong>{live.attendanceCount||0}</strong> 条<small className="cell-sub">{live.participantCount||0} 人去重</small></td><td>{live.commentCount||0} / {live.giftCount||0}</td><td>{timeText(live.syncedAt)}</td><td><span className={`sync-state ${live.status}`}><i/>{live.status==='success'?'已同步':'同步失败'}</span></td></tr>)}</tbody></table>{!lives.length&&<div className="sync-empty"><Database/><strong>暂无课程同步记录</strong><p>点击「立即补采」获取已结束直播的听课数据</p></div>}</div>:
        <div className="sync-run-list">{runs.map(run=><div className="sync-run" key={run.id}><div className={`run-icon ${run.status}`}>{run.status==='success'?<CheckCircle2/>:<CircleAlert/>}</div><div className="run-main"><strong>{run.source==='class'?'班级定向补采':run.trigger.startsWith('schedule')?'定时自动同步':'手动补采'}<span>{runStatus[run.status]}</span></strong><p>{run.className&&`${run.className} · `}{timeText(run.startedAt)} · 补查近 {run.days} 天 · 用时 {run.durationSeconds||0} 秒</p>{run.errors?.length>0&&<small>{run.errors[0].name||'任务'}：{run.errors[0].message}</small>}</div><div className="run-stats"><span><b>{run.courses}</b> 场课程</span><span><b>{run.attendance}</b> 条观看</span><span><b>+{run.newRecords}</b> 条新增</span></div></div>)}{!runs.length&&<div className="sync-empty"><Clock3/><strong>暂无运行日志</strong></div>}</div>}
      </section>
      <aside className="sync-side">
        <section className="panel sync-rules"><div className="panel-heading"><h2>自动计分口径</h2><ShieldCheck/></div><div><Eye/><span><strong>观看超过 {scoring?.watchMinutes ?? '—'} 分钟</strong><small>严格超过配置阈值才计分</small></span><b>+1</b></div><div><MessageSquare/><span><strong>至少 1 条有效评论</strong><small>过滤表情、刷屏与屏蔽内容</small></span><b>+1</b></div><div><Gift/><span><strong>送出{scoring?.giftNames?.join(' / ') || '有效礼物'}</strong><small>每张记录可追溯，当日仅一次</small></span><b>+1</b></div><p>仅{scoring?.baseChannels?.map(item=>item.name).join('、') || '已配置栏目'}计算基础分，每栏目每天最多 3 分；活动与多倍积分另计。</p></section>
        <section className="panel sync-schedule"><h2>调度与数据安全</h2><div><CalendarDays/><span><strong>{status?.schedule?.join(' / ') || '—'}</strong><small>服务器本地持续运行，无需打开网页</small></span></div><div><Database/><span><strong>增量去重保存</strong><small>直播 ID + 精网号作为唯一键</small></span></div><div><ShieldCheck/><span><strong>不保存聊天正文</strong><small>仅保存有效评论数量与计分结果</small></span></div></section>
      </aside>
    </div>
    <div className="sync-last-run"><span>上次任务：{lastRun?`${timeText(lastRun.startedAt)} · ${runStatus[lastRun.status]} · 新增 ${lastRun.newRecords} 条`:'尚未执行'}</span><button onClick={()=>setTab('logs')}>查看同步日志 <ChevronRight/></button></div>
  </div>;
}
