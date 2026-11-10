import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, Sparkles, X } from 'lucide-react';
import './bailian-ai.css';

const opening = '你好，我是百炼小AI。可以查今日、本周、本月或指定日期积分，也能问连续学习、排名、双倍活动、头像框和排名气泡。';
const defaultSuggestions = ['我有多少积分', '本周和本月各得多少分', '离下一级还差多少分', '连续学习多少天了', '财经壹眼得了多少分', '数据什么时候更新'];
const tipPhrases = ['又不会的就点击我', '积分、排名、翻倍都能问我', '今天学到哪了？我帮你算算', '有疑问，随时点我'];

export default function BailianAi({ userName, pendingRewards = 0 }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState(defaultSuggestions);
  const [messages, setMessages] = useState([{ role: 'ai', text: opening }]);
  const [tipVisible, setTipVisible] = useState(false);
  const [tipIndex, setTipIndex] = useState(-1);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (open) return undefined;
    const hideTimer = { current: null };
    const showTip = () => {
      setTipIndex(index => (index + 1) % tipPhrases.length);
      setTipVisible(true);
      hideTimer.current = setTimeout(() => setTipVisible(false), 8000);
    };
    const first = setTimeout(showTip, 6000);
    const loop = setInterval(showTip, 32000);
    return () => {
      clearTimeout(first);
      clearInterval(loop);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    fetch('/api/ai/status').then(response => response.json()).then(result => {
      if (active && Array.isArray(result.suggestions) && result.suggestions.length) setSuggestions(result.suggestions);
    }).catch(() => {});
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending, open]);

  const ask = async (question, intentId) => {
    const text = String(question ?? draft).trim();
    if (!text || sending) return;
    setMessages(list => [...list, { role: 'me', text }]);
    setDraft('');
    setSending(true);
    try {
      const response = await fetch('/api/ai/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(intentId ? { question: text, intent: intentId } : { question: text }) });
      let result = null;
      try { result = await response.json(); } catch { result = null; }
      const reply = response.status === 401
        ? '登录已过期，请重新登录后再问我。'
        : response.status === 404 || !result
          ? '小AI 暂时未连接成功，请稍后再试。'
          : response.ok
            ? result.answer
            : (result.message || '小AI 暂时无法回答，请稍后再试。');
      setMessages(list => [...list, { role: 'ai', text: reply, choices: result && Array.isArray(result.choices) ? result.choices : null }]);
    } catch {
      setMessages(list => [...list, { role: 'ai', text: '连不上服务，请确认网络连接后再问一次。' }]);
    } finally {
      setSending(false);
    }
  };

  const submit = event => {
    event.preventDefault();
    ask();
  };

  if (!open) {
    const tipText = tipIndex === 0 ? tipPhrases[0] : pendingRewards > 0 && tipIndex === 1 ? `有 ${pendingRewards} 个奖励还没领取` : tipPhrases[tipIndex];
    return <div className="ai-launcher">
      {tipVisible && <button className="ai-tip" onClick={() => setOpen(true)}><Sparkles />{tipText}</button>}
      <button className="ai-fab" onClick={() => setOpen(true)} aria-label="打开百炼小AI"><Bot /><span>百炼小AI</span>{pendingRewards > 0 && <i className="ai-fab-dot" />}</button>
    </div>;
  }

  return <section className="ai-panel" aria-label="百炼小AI">
    <header className="ai-head">
      <div className="ai-avatar"><Bot /><i /></div>
      <div><strong>百炼小AI</strong><small>你的学习成长助手</small></div>
      <button onClick={() => setOpen(false)} aria-label="收起小AI"><X /></button>
    </header>
    <div className="ai-topic-bar"><Sparkles />积分 · 排名 · 任务 · 双倍 · 装扮</div>
    <div className="ai-body" ref={scrollRef} aria-live="polite">
      {messages.map((item, index) => <div className={`ai-message-row ${item.role}`} key={index}>
        {item.role === 'ai' && <div className="ai-msg-avatar"><Bot /></div>}
        <div className={`ai-msg ${item.role}`}>
          {item.text}
          {item.role === 'ai' && item.choices && item.choices.length > 0 && <span className="ai-choices">
            {item.choices.map(choice => <button key={choice.id} onClick={() => ask(choice.title, choice.id)}>{choice.title}</button>)}
          </span>}
        </div>
        {item.role === 'me' && <div className="ai-msg-avatar me">{String(userName || '我').slice(0, 1)}</div>}
      </div>)}
      {sending && <div className="ai-message-row ai"><div className="ai-msg-avatar"><Bot /></div><div className="ai-msg ai typing"><i /><i /><i /></div></div>}
      {!sending && suggestions.length > 0 && <div className="ai-suggestion-block"><span>你可以这样问</span><div className="ai-chips">{suggestions.slice(0, 6).map(item => <button key={item} onClick={() => ask(item)}>{item}</button>)}</div></div>}
    </div>
    <form className="ai-input" onSubmit={submit}>
      <input value={draft} maxLength={200} placeholder="输入问题，例如：6月24日得了多少分" onChange={event => setDraft(event.target.value)} />
      <button type="submit" disabled={sending || !draft.trim()} aria-label="发送"><Send /></button>
    </form>
    <footer className="ai-foot"><Sparkles />{userName ? `${userName} · ` : ''}回答仅依据你的学习记录</footer>
  </section>;
}
