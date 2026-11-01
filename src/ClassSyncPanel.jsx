import React, { useEffect, useState } from 'react';
import { Users, RefreshCw, ChevronDown, CalendarDays, Play, UserRound, Building2, CheckCircle2, Clock3 } from 'lucide-react';

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || '请求失败');
  return data;
}

export default function ClassSyncPanel({ notify, running, classSource, scoring, onStarted }) {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState(() => localStorage.getItem('bailian-class-id') || '');
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(Boolean(classSource?.autoClassEnabled));
  const [saving, setSaving] = useState(false);
  const selected = classes.find(item => item.id === classId);
  const historyDays = Math.max(1, Math.ceil((Date.now() - new Date(`${scoring?.startDate || '2026-06-24'}T00:00:00+08:00`).getTime()) / 86400000));

  const loadClasses = async (refresh = false) => {
    setLoading(true);
    try {
      const result = await request(`/api/classes${refresh ? '?refresh=1' : ''}`);
      setClasses(result.list);
      const preferred = classSource?.autoClassId || classId;
      const next = result.list.some(item => item.id === preferred) ? preferred : result.list[0]?.id || '';
      setClassId(next);
      if (next) localStorage.setItem('bailian-class-id', next);
      if (refresh) notify(`已刷新，共读取 ${result.list.length} 个班级`);
    } catch (error) { notify(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadClasses(); }, []);
  useEffect(() => { setAuto(Boolean(classSource?.autoClassEnabled && classSource?.autoClassId === classId)); }, [classSource, classId]);

  const choose = value => {
    setClassId(value);
    localStorage.setItem('bailian-class-id', value);
  };
  const toggleAuto = async () => {
    if (!classId) return;
    setSaving(true);
    try {
      const result = await request('/api/classes/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classId, enabled: !auto }) });
      setAuto(result.autoClassEnabled);
      notify(result.autoClassEnabled ? `已将「${selected.name}」加入每日自动同步` : '已取消该班级的自动同步');
    } catch (error) { notify(error.message); }
    finally { setSaving(false); }
  };
  const sync = async () => {
    try {
      const result = await request('/api/classes/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classId, days }) });
      notify(result.message); onStarted();
    } catch (error) { notify(error.message); }
  };

  return <section className="panel class-sync-panel">
    <div className="class-sync-heading"><div className="class-sync-title"><span><Users/></span><div><h2>班级群定向补采</h2><p>只抓取所选班级的直播与听课数据，不影响其他班级</p></div></div><button className="text-link" onClick={()=>loadClasses(true)} disabled={loading}><RefreshCw className={loading?'spin':''}/>刷新班级</button></div>
    <div className="class-sync-body">
      <div className="class-picker"><label>选择班级</label><div><Users/><select value={classId} onChange={e=>choose(e.target.value)} disabled={loading||!classes.length}><option value="">{loading?'正在读取班级…':'请选择班级'}</option>{classes.map(item=><option value={item.id} key={item.id}>{item.name}（{item.members} 人）</option>)}</select><ChevronDown/></div></div>
      <div className="class-detail">{selected?<><div><span><Building2/>{selected.department||'未设置部门'} · {selected.shop||'未设置分组'}</span><span><UserRound/>负责人 {selected.manager||'未设置'}</span></div><small>班级 ID {selected.id} · {selected.state===1?'正常开放':'已停用'} · 成员 {selected.members} 人</small></>:<span>选择后显示班级信息</span>}</div>
      <label className="class-days"><CalendarDays/>补查范围<select value={days} onChange={e=>setDays(Number(e.target.value))}><option value={1}>最近 1 天</option><option value={7}>最近 7 天</option><option value={30}>最近 30 天</option><option value={90}>最近 90 天</option><option value={historyDays}>自 {scoring?.startDate || '2026-06-24'} 起</option></select></label>
      <button className="btn btn-primary class-sync-button" disabled={!selected||Boolean(running)} onClick={sync}><Play/>{running?'有任务进行中':'抓取该班数据'}</button>
    </div>
    <div className="class-sync-footer"><label className="auto-class-toggle"><input type="checkbox" checked={auto} disabled={!selected||saving} onChange={toggleAuto}/><span/><b>加入每日自动同步</b><small>每天 12:00 / 24:00 跟随频道任务执行</small></label><span className="class-dedup"><CheckCircle2/>同一直播跨来源只计一次</span></div>
  </section>;
}
