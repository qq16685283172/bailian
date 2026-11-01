import React, { useEffect, useState } from 'react';
import { Settings, Plus, RefreshCw, CalendarDays, Clock3, MessageSquare, Gift, ShieldCheck, Activity, Zap, Pencil, Trash2, X, CheckCircle2, CircleHelp, Trophy, Layers3 } from 'lucide-react';
import './scoring-rules.css';

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || '请求失败');
  return data;
}
const blankRule = (startDate, type = 'activity') => ({ type, name: '', enabled: true, platform: 'all', className: '', keyword: '', channel: type === 'multiplier' ? '财经壹眼' : '', liveStart: '', liveEnd: '', startDate, endDate: '', trigger: 'watch', watchMinutes: 0, points: 9, multiplier: type === 'multiplier' ? 2 : 1, priority: 0, stackWithBase: true });
const ruleScope = rule => [rule.platform === 'all' ? '精网 + 投教' : rule.platform === 'toujiao' ? '投教' : '精网', rule.className, rule.channel === 'all' ? '全部栏目' : rule.channel, rule.keyword && `标题含「${rule.keyword}」`, rule.liveStart && `开播 ${rule.liveStart}–${rule.liveEnd || '24:00'}`].filter(Boolean).join(' · ');

function RuleEditor({ initial, initialType = 'activity', startDate, onClose, onSave }) {
  const [rule, setRule] = useState(initial || blankRule(startDate, initialType));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setRule(prev => ({ ...prev, [key]: value }));
  const changeType = type => setRule(prev => ({ ...prev, type, channel: type === 'multiplier' ? (prev.channel || '财经壹眼') : prev.channel, className: type === 'multiplier' ? '' : prev.className, multiplier: type === 'multiplier' && prev.type !== 'multiplier' ? 2 : prev.multiplier }));
  const submit = async () => {
    if (!rule.name.trim()) return setError('请填写规则名称');
    if (!rule.className && !rule.channel && !rule.keyword) return setError('请至少设置班级、栏目或直播关键词中的一项');
    if (rule.type === 'multiplier' && !rule.channel) return setError('翻倍活动请选择全部栏目、财经壹眼或易学久会');
    if (rule.startDate && rule.endDate && rule.endDate < rule.startDate) return setError('执行结束日期不能早于开始日期');
    if (rule.type === 'activity' && rule.liveStart && rule.liveEnd && rule.liveEnd <= rule.liveStart) return setError('直播时段结束时间必须晚于开始时间');
    setSaving(true); setError('');
    try { await onSave(rule); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal scoring-editor"><button className="modal-close" onClick={onClose}><X/></button><h2 className="left-title">{initial?'编辑计分规则':'新建活动 / 多倍规则'}</h2><p className="left-sub">规则保存后立即按已同步的原始记录重算</p><fieldset className="rule-fields"><div className="rule-form-grid">
    <label className="full">规则名称<input value={rule.name} onChange={e=>set('name',e.target.value)} placeholder="例如：国庆学习周双倍积分"/></label>
    <label>规则类型<select value={rule.type} onChange={e=>changeType(e.target.value)}><option value="activity">活动固定加分</option><option value="multiplier">基础分多倍计算</option></select></label>
    <label>适用平台<select value={rule.platform} onChange={e=>set('platform',e.target.value)}><option value="all">精网 + 投教</option><option value="xxcg">仅精网</option><option value="toujiao">仅投教</option></select></label>
    <label>翻倍栏目<select value={rule.channel} onChange={e=>set('channel',e.target.value)}>{rule.type==='activity'&&<option value="">不限栏目</option>}{rule.type==='multiplier'&&<option value="all">全部栏目</option>}<option>财经壹眼</option><option>易学久会</option></select></label>
    {rule.type==='activity'?<><label>班级名称<input value={rule.className} onChange={e=>set('className',e.target.value)} placeholder="精确匹配，如：领航粉丝群"/></label><label>直播时段开始<input type="time" value={rule.liveStart} onChange={e=>set('liveStart',e.target.value)}/></label><label>直播时段结束（不含）<input type="time" value={rule.liveEnd} onChange={e=>set('liveEnd',e.target.value)}/></label></>:<div className="full multiplier-note">仅翻倍所选栏目的基础行为分，按直播开播日期判断执行区间；活动分不参与翻倍。</div>}
    <label className="full">直播名称关键词<input value={rule.keyword} onChange={e=>set('keyword',e.target.value)} placeholder={rule.type==='multiplier'?'例如：超级短线；不填则匹配栏目全部课程':'不填则匹配班级内全部直播'}/></label>
    <label>{rule.type==='multiplier'?'执行开始日期':'开始日期'}<input type="date" value={rule.startDate} onChange={e=>set('startDate',e.target.value)}/></label>
    <label>{rule.type==='multiplier'?'执行结束日期':'结束日期'}<input type="date" value={rule.endDate} onChange={e=>set('endDate',e.target.value)} placeholder="留空表示长期有效"/></label>
    {rule.type==='activity'?<><label>触发行为<select value={rule.trigger} onChange={e=>set('trigger',e.target.value)}><option value="watch">有效听课</option><option value="comment">有效打卡 / 评论</option><option value="gift">送出领航卡</option></select></label>{rule.trigger==='watch'&&<label>观看超过（分钟）<input type="number" min="0" value={rule.watchMinutes} onChange={e=>set('watchMinutes',e.target.value)}/></label>}<label>每次加积分<input type="number" min="0.1" step="0.5" value={rule.points} onChange={e=>set('points',e.target.value)}/></label><label>活动分倍数<input type="number" min="0.1" step="0.5" value={rule.multiplier} onChange={e=>set('multiplier',e.target.value)}/></label></>:<><label>基础分倍数<input type="number" min="0.1" step="0.5" value={rule.multiplier} onChange={e=>set('multiplier',e.target.value)}/></label><label>优先级（大者优先）<input type="number" value={rule.priority} onChange={e=>set('priority',e.target.value)}/></label></>}
  </div></fieldset><div className="rule-preview"><Zap/><div><strong>规则预览</strong><p>{ruleScope(rule)} · {rule.type==='activity'?`${rule.trigger==='watch'?`观看超过 ${rule.watchMinutes} 分钟`:rule.trigger==='comment'?'有效打卡':'送出领航卡'}，当日一次 +${Number(rule.points)*Number(rule.multiplier)} 分`:`基础分 × ${rule.multiplier}，${rule.startDate} 至 ${rule.endDate || '长期'}；同日取最高优先级`}</p></div></div>{error&&<div className="rule-form-error">{error}</div>}<label className="rule-enabled"><input type="checkbox" checked={rule.enabled} onChange={e=>set('enabled',e.target.checked)}/>保存后立即启用</label><div className="modal-actions"><button className="btn btn-outline" onClick={onClose}>取消</button><button className="btn btn-primary" disabled={saving} onClick={submit}><CheckCircle2/>{saving?'正在保存并重算':'保存并重算积分'}</button></div></div></div>;
}

export default function ScoringRules({ notify }) {
  const [config, setConfig] = useState(null);
  const [meta, setMeta] = useState(null);
  const [settings, setSettings] = useState({ startDate: '2026-06-24', watchMinutes: 20, giftNames: '领航卡、终身领航卡' });
  const [editing, setEditing] = useState(null);
  const [editorType, setEditorType] = useState('activity');
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const load = async () => {
    try { const result = await request('/api/scoring/config'); setConfig(result.scoring); setMeta(result.meta); setSettings({ startDate: result.scoring.startDate, watchMinutes: result.scoring.watchMinutes, giftNames: result.scoring.giftNames.join('、') }); }
    catch (error) { notify(error.message); }
  };
  useEffect(() => { load(); }, []);
  const saveSettings = async () => {
    setSaving(true);
    try { const result = await request('/api/scoring/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startDate: settings.startDate, watchMinutes: Number(settings.watchMinutes), giftNames: settings.giftNames.split(/[、,，]/) }) }); setConfig(result.scoring); setMeta(result.meta); notify('基础规则已保存，历史积分已重算'); }
    catch (error) { notify(error.message); }
    finally { setSaving(false); }
  };
  const saveRule = async rule => {
    const result = await request('/api/scoring/rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rule) });
    setConfig(result.scoring); setMeta(result.meta); setEditorOpen(false); setEditing(null); notify(`「${rule.name}」已生效，积分已重算`);
  };
  const toggleRule = async rule => { await saveRule({ ...rule, enabled: !rule.enabled }); };
  const removeRule = async rule => {
    if (!window.confirm(`确定删除「${rule.name}」并重新计算积分吗？`)) return;
    try { const result = await request(`/api/scoring/rules/${rule.id}`, { method: 'DELETE' }); setMeta(result.meta); setConfig({ ...config, rules: config.rules.filter(item=>item.id!==rule.id) }); notify('规则已删除，积分已重算'); }
    catch (error) { notify(error.message); }
  };
  const recalculate = async () => {
    setSaving(true);
    try { const result = await request('/api/scoring/recalculate', { method: 'POST' }); setMeta(result.meta); notify(`重算完成：${result.before} → ${result.after} 分`); }
    catch (error) { notify(error.message); }
    finally { setSaving(false); }
  };
  return <div className="page-stack scoring-page">
    <section className="scoring-overview"><div><Layers3/><span><strong>自动计分规则引擎</strong><p>原始行为只存一份，规则调整后可以反复重算，不重复抓取、不重复加分</p></span></div><button className="btn btn-outline" onClick={recalculate} disabled={saving}><RefreshCw className={saving?'spin':''}/>全量重算</button><button className="btn btn-outline" onClick={()=>{setEditing(null);setEditorType('multiplier');setEditorOpen(true)}}><Zap/>新建翻倍活动</button><button className="btn btn-primary" onClick={()=>{setEditing(null);setEditorType('activity');setEditorOpen(true)}}><Plus/>新建活动规则</button></section>
    <div className="scoring-metrics"><section className="panel"><span>计分起算日期</span><strong>{config?.startDate || '2026-06-24'}</strong><small>此前记录自动排除</small></section><section className="panel"><span>基础行为分</span><strong>{meta?.basePoints ?? '—'}<small>分</small></strong><small>两栏目跨平台去重</small></section><section className="panel"><span>活动奖励分</span><strong>{meta?.activityPoints ?? '—'}<small>分</small></strong><small>班级听课与临时活动</small></section><section className="panel"><span>重算后总积分</span><strong>{meta?.totalPoints ?? '—'}<small>分</small></strong><small>含多倍规则结果</small></section></div>
    <div className="scoring-layout"><div className="page-stack">
      <section className="panel base-rule-card"><div className="panel-heading"><div><h2>基础栏目计分</h2><p>按开播时间区间自动归类；同日同栏目，精网与投教的直播、重播只计一次</p></div><span className="status-tag success"><i/>自动生效</span></div><div className="base-channels">{(config?.baseChannels || [{name:'财经壹眼',time:'09:30',start:'09:00',end:'12:00'},{name:'易学久会',time:'20:00',start:'19:00',end:'24:00'}]).map(channel=><div key={channel.name}><span>{channel.start}–{channel.end}</span><strong>{channel.name}</strong><small>正常 {channel.time} 开播 · 每日最多 3 个基础行为分</small></div>)}</div><div className="base-behaviors"><div><MessageSquare/><strong>有效打卡 / 评论</strong><b>+1 分</b><small>过滤表情、刷屏与屏蔽内容</small></div><div><Clock3/><strong>观看超过阈值</strong><b>+1 分</b><small>刚好达到阈值不计分</small></div><div><Gift/><strong>送出领航卡</strong><b>+1 分</b><small>按配置识别礼物名称</small></div></div><div className="base-settings"><label>计分起算日期<input type="date" value={settings.startDate} onChange={e=>setSettings({...settings,startDate:e.target.value})}/></label><label>观看超过（分钟）<input type="number" min="1" value={settings.watchMinutes} onChange={e=>setSettings({...settings,watchMinutes:e.target.value})}/></label><label className="gift-names">有效礼物名称<input value={settings.giftNames} onChange={e=>setSettings({...settings,giftNames:e.target.value})}/></label><button className="btn btn-primary" disabled={saving} onClick={saveSettings}>保存并重算</button></div></section>
      <section className="panel custom-rules"><div className="panel-heading"><div><h2>活动与多倍规则</h2><p>活动分每天每规则只加一次；多倍规则不连乘，按优先级取一条</p></div><button className="text-link" onClick={()=>{setEditing(null);setEditorType('activity');setEditorOpen(true)}}><Plus/>添加</button></div><div className="table-scroll"><table><thead><tr><th>规则</th><th>匹配范围</th><th>计分方式</th><th>有效期</th><th>状态</th><th>操作</th></tr></thead><tbody>{config?.rules.map(rule=><tr key={rule.id}><td><div className={`rule-type-icon ${rule.type}`}>{rule.type==='activity'?<Activity/>:<Zap/>}</div><div><strong>{rule.name}</strong><small>{rule.builtIn?'内置规则':'自定义规则'}{rule.type==='multiplier'&&` · 优先级 ${rule.priority}`}</small></div></td><td>{ruleScope(rule)}</td><td><strong>{rule.type==='activity'?`+${Number(rule.points)*Number(rule.multiplier)} 分`:`× ${rule.multiplier}`}</strong><small className="cell-sub">{rule.type==='activity'?(rule.trigger==='watch'?`观看 > ${rule.watchMinutes} 分钟`:rule.trigger==='comment'?'有效打卡':'领航卡'):'基础分倍数'}</small></td><td>{rule.startDate}<small className="cell-sub">{rule.endDate||'长期有效'}</small></td><td><button className={`rule-switch ${rule.enabled?'on':''}`} onClick={()=>toggleRule(rule)}><i/>{rule.enabled?'已启用':'已停用'}</button></td><td><div className="row-actions"><button onClick={()=>{setEditing(rule);setEditorOpen(true)}}><Pencil/>编辑</button>{!rule.builtIn&&<button className="danger-link" onClick={()=>removeRule(rule)}><Trash2/>删除</button>}</div></td></tr>)}</tbody></table></div></section>
    </div><aside className="page-stack"><section className="panel special-rule"><Trophy/><span>内置班级活动</span><h2>领航粉丝群</h2><p>仅统计 20:00–21:00 开播的班级直播，不按财经壹眼或易学久会归类，也不限制直播标题</p><strong>只要听课 <b>+9</b> 分</strong><small>同一学员同一天仅加一次，多场班级重播不重复加分</small></section><section className="panel rule-explain"><h2>自动判分顺序</h2><div><span>1</span><p><strong>先归集原始行为</strong>按开播日期与栏目分组</p></div><div><span>2</span><p><strong>跨平台去重</strong>同人同日同栏目仅一次</p></div><div><span>3</span><p><strong>计算活动分</strong>每规则每日仅一次</p></div><div><span>4</span><p><strong>应用多倍规则</strong>基础分不重复连乘</p></div></section><section className="security-note"><ShieldCheck/><div><strong>规则调整可追溯</strong><p>{meta?.recalculatedAt?`最近重算：${new Date(meta.recalculatedAt).toLocaleString('zh-CN')}`:'保存规则后自动记录重算时间'}。原始听课记录不会因规则变化而删除。</p></div></section></aside></div>
    {editorOpen&&<RuleEditor initial={editing} initialType={editorType} startDate={config?.startDate||'2026-06-24'} onClose={()=>setEditorOpen(false)} onSave={saveRule}/>}
  </div>;
}
