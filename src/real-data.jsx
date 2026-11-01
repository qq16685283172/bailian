import React, { useEffect, useState } from 'react';
import { CircleAlert, RefreshCw } from 'lucide-react';

export function useRemote(url) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState(previous => ({ ...previous, loading: true, error: '' }));
    fetch(url, { signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '数据读取失败');
      setState({ data: result, loading: false, error: '' });
    }).catch(error => {
      if (error.name !== 'AbortError') setState({ data: null, loading: false, error: error.message });
    });
    return () => controller.abort();
  }, [url, version]);
  return { ...state, reload: () => setVersion(value => value + 1) };
}

export function DataState({ loading, error, empty, children, onRetry }) {
  if (loading) return <section className="panel real-state"><RefreshCw className="spin"/><strong>正在加载数据</strong><p>数据每日自动同步更新。</p></section>;
  if (error) return <section className="panel real-state error"><CircleAlert/><strong>数据读取失败</strong><p>{error}</p>{onRetry&&<button className="btn btn-outline" onClick={onRetry}>重新读取</button>}</section>;
  if (empty) return <section className="panel real-state"><strong>暂无记录</strong><p>{empty}</p></section>;
  return children;
}

export function RealMetric({ icon: Icon, label, value, suffix = '', note, tone = 'red' }) {
  return <section className={`panel metric-card ${tone}`}><div className="metric-icon"><Icon/></div><div><span>{label}</span><strong>{Number(value || 0).toLocaleString()}<small>{suffix}</small></strong>{note&&<p>{note}</p>}</div></section>;
}

export function RealTrend({ data, lines, height = 260 }) {
  const width = 760, top = 20, bottom = 38, left = 45, right = 15;
  const max = Math.max(1, ...data.flatMap(item=>lines.map(line=>Number(item[line.key])||0)));
  const x = index => left + (data.length<=1?0:index/(data.length-1)*(width-left-right));
  const y = value => top + (1-(Number(value)||0)/max)*(height-top-bottom);
  return <div className="real-trend"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="数据趋势图">{[0,.25,.5,.75,1].map(rate=><g key={rate}><line x1={left} x2={width-right} y1={y(max*rate)} y2={y(max*rate)} stroke="#eee7de" strokeDasharray="3 3"/><text x={left-7} y={y(max*rate)+3} textAnchor="end" fontSize="9" fill="#9a8e82">{Math.round(max*rate)}</text></g>)}{data.map((item,index)=>(index%Math.max(1,Math.ceil(data.length/7))===0||index===data.length-1)&&<text key={item.date} x={x(index)} y={height-12} textAnchor="middle" fontSize="9" fill="#9a8e82">{item.date?.slice(5)}</text>)}{lines.map(line=><g key={line.key}><polyline fill="none" stroke={line.color} strokeWidth="2.4" points={data.map((item,index)=>`${x(index)},${y(item[line.key])}`).join(' ')}/>{data.map((item,index)=><circle key={item.date} cx={x(index)} cy={y(item[line.key])} r="2.6" fill={line.color}><title>{`${item.date} · ${line.name}：${item[line.key]}`}</title></circle>)}</g>)}</svg><div className="real-trend-legend">{lines.map(line=><span key={line.key}><i style={{background:line.color}}/>{line.name}</span>)}</div></div>;
}

export function downloadCsv(filename, columns, rows) {
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const content = `\uFEFF${[columns.map(column=>column.label), ...rows.map(row=>columns.map(column=>row[column.key]))].map(row=>row.map(escape).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

export function formatTime(value) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
}
