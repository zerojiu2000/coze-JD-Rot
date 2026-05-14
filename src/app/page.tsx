'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

type Mode = 'jd' | 'gap' | 'hello' | 'interview';

interface ModeConfig {
  id: Mode;
  label: string;
  title: string;
  icon: string;
  desc: string;
}

const MODES: ModeConfig[] = [
  { id: 'jd', label: 'JD匹配度评分', title: 'JD 与简历匹配度', icon: '📊', desc: '分析你与目标岗位的匹配程度' },
  { id: 'gap', label: '简历差距分析', title: '简历与目标岗位差距', icon: '🔍', desc: '找出简历与JD的核心差距' },
  { id: 'hello', label: '打招呼话术', title: '打招呼 / 投递话术', icon: '💬', desc: '生成转行专属打招呼文案' },
  { id: 'interview', label: '面试题预测', title: '面试题预测', icon: '🎯', desc: '基于JD预测高频面试题' },
];

/* ---------- 简易 Markdown → HTML ---------- */
function renderMarkdown(text: string): string {
  let html = text;
  // 标题
  html = html.replace(/^#### (.+)$/gm, '<h4 class="md-h4">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');
  // 粗体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // 斜体
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
  // 有序列表
  html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<li class="md-oli"><span class="oli-num">$1.</span> $2</li>');
  // 无序列表
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li class="md-uli">$1</li>');
  // 合并连续 li
  html = html.replace(/(<li class="md-oli">[\s\S]*?<\/li>)/g, '$1');
  html = html.replace(/(<li class="md-uli">[\s\S]*?<\/li>)/g, '$1');
  // 水平线
  html = html.replace(/^---+$/gm, '<hr class="md-hr" />');
  // 段落：把非标签行用 p 包裹
  html = html.replace(/^(?!<[holu]|<hr|<strong|<em|<code)(.+)$/gm, '<p class="md-p">$1</p>');
  // 换行
  html = html.replace(/\n{2,}/g, '\n');
  return html;
}

export default function Home() {
  const [activeMode, setActiveMode] = useState<Mode>('jd');
  const [answerText, setAnswerText] = useState('');
  const [thinkingText, setThinkingText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // 表单值
  const [jdText, setJdText] = useState('');
  const [resumeSummary, setResumeSummary] = useState('');
  const [targetJd, setTargetJd] = useState('');
  const [currentResume, setCurrentResume] = useState('');
  const [helloCompany, setHelloCompany] = useState('');
  const [helloHighlights, setHelloHighlights] = useState('');
  const [interviewJd, setInterviewJd] = useState('');

  // 自动滚动到底部
  useEffect(() => {
    if (resultRef.current) {
      resultRef.current.scrollTop = resultRef.current.scrollHeight;
    }
  }, [answerText, thinkingText]);

  const buildPrompt = useCallback(
    (mode: Mode): { prompt: string; error: string } => {
      switch (mode) {
        case 'jd': {
          if (!jdText.trim() || !resumeSummary.trim()) {
            return { prompt: '', error: '请同时填写 JD 与简历要点。' };
          }
          return {
            prompt: `【任务：JD匹配度评分】\n\n【职位描述 JD】\n${jdText}\n\n【我的简历要点】\n${resumeSummary}\n\n请根据以上信息给出匹配度分析（0-100分），并详细说明匹配的优势和不足，最后给出针对性的改进建议。`,
            error: '',
          };
        }
        case 'gap': {
          if (!targetJd.trim() || !currentResume.trim()) {
            return { prompt: '', error: '请填写目标 JD 与当前简历。' };
          }
          return {
            prompt: `【任务：简历差距分析】\n\n【目标岗位 JD】\n${targetJd}\n\n【当前简历】\n${currentResume}\n\n请详细分析简历与目标JD的核心差距，按优先级列出缺失的技能/经验，并给出可执行的简历修改方向和补充建议。`,
            error: '',
          };
        }
        case 'hello': {
          if (!helloHighlights.trim()) {
            return { prompt: '', error: '请至少填写亮点 / 匹配点。' };
          }
          return {
            prompt: `【任务：打招呼 / 投递话术生成】\n\n【公司与岗位（可选）】\n${helloCompany || '（未填写）'}\n\n【我的亮点与匹配点】\n${helloHighlights}\n\n请生成3个不同风格的打招呼/投递话术，要求：\n1. 简洁真诚，非群发感\n2. 突出核心匹配点\n3. 语气自然，适合职场沟通\n4. 每个话术控制在50-80字`,
            error: '',
          };
        }
        case 'interview': {
          if (!interviewJd.trim()) {
            return { prompt: '', error: '请填写 JD 或关键词。' };
          }
          return {
            prompt: `【任务：面试题预测】\n\n【岗位 JD 或关键词】\n${interviewJd}\n\n请基于JD内容预测10个高频面试题，按以下分类：\n1. 基础能力题（3题）\n2. 专业技能题（5题）\n3. 场景/项目题（2题）\n每题简要说明考察重点，并给出回答思路提示。`,
            error: '',
          };
        }
      }
    },
    [jdText, resumeSummary, targetJd, currentResume, helloCompany, helloHighlights, interviewJd]
  );

  const handleSubmit = useCallback(async () => {
    const { prompt, error } = buildPrompt(activeMode);
    if (error) {
      setAnswerText(error);
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setIsThinking(false);
    setAnswerText('');
    setThinkingText('');
    setShowThinking(false);

    try {
      const response = await fetch('/api/coze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: '请求失败' }));
        setAnswerText(`分析失败: ${errData.error || `HTTP ${response.status}`}`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setAnswerText('无法读取响应流');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';
      let fullAnswer = '';
      let fullThinking = '';
      let hasThinking = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed === '') {
            currentEvent = '';
            continue;
          }

          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.slice('event:'.length).trim();
            continue;
          }

          if (trimmed.startsWith('data:')) {
            const raw = trimmed.slice('data:'.length).trim();
            if (raw === '[DONE]') continue;

            try {
              const data = JSON.parse(raw);
              if (currentEvent === 'thinking' && data.content) {
                hasThinking = true;
                fullThinking += data.content;
                setThinkingText(fullThinking);
                setIsThinking(true);
              } else if (currentEvent === 'answer' && data.content) {
                fullAnswer += data.content;
                setAnswerText(fullAnswer);
                // 收到正式回答后，思考过程完成
                if (isThinking) setIsThinking(false);
              } else if (currentEvent === 'answer_done') {
                setIsThinking(false);
              } else if (currentEvent === 'error') {
                setAnswerText(fullAnswer || `错误: ${data.message || '未知错误'}`);
              }
            } catch {
              // skip
            }
          }
        }
      }

      if (hasThinking) {
        setShowThinking(true);
      }
      if (!fullAnswer) {
        setAnswerText('（未获取到回复，请重试）');
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setAnswerText('网络请求失败，请检查网络连接后重试。');
    } finally {
      setIsLoading(false);
      setIsThinking(false);
      abortRef.current = null;
    }
  }, [activeMode, buildPrompt, isThinking]);

  const handleModeChange = (mode: Mode) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setActiveMode(mode);
    setAnswerText('');
    setThinkingText('');
    setIsLoading(false);
    setIsThinking(false);
    setShowThinking(false);
  };

  const activeConfig = MODES.find((m) => m.id === activeMode)!;

  const hasResult = answerText || (isLoading && thinkingText);

  return (
    <div className="app-shell">
      {/* 顶栏 */}
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-icon">🎯</span>
          <span className="topbar-title">求职雷达</span>
        </div>
        <div className="topbar-badge">AI 驱动</div>
      </header>

      <div className="main-layout">
        {/* 左侧功能导航 */}
        <aside className="sidebar">
          <div className="sidebar-label">功能模块</div>
          <nav className="sidebar-nav">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`nav-item${activeMode === mode.id ? ' active' : ''}`}
                onClick={() => handleModeChange(mode.id)}
              >
                <span className="nav-icon">{mode.icon}</span>
                <span className="nav-text">
                  <span className="nav-label">{mode.label}</span>
                  <span className="nav-desc">{mode.desc}</span>
                </span>
              </button>
            ))}
          </nav>
        </aside>

        {/* 右侧内容 */}
        <div className="content-area">
          {/* 输入表单 */}
          <div className="form-card">
            <div className="form-header">
              <span className="form-icon">{activeConfig.icon}</span>
              <h2 className="form-title">{activeConfig.title}</h2>
            </div>

            {/* JD 匹配度 */}
            {activeMode === 'jd' && (
              <div className="form-body">
                <div className="field">
                  <label htmlFor="jd-text">职位描述（JD）</label>
                  <textarea id="jd-text" placeholder="粘贴招聘JD内容，例如：招聘AI产品经理，要求..." value={jdText} onChange={(e) => setJdText(e.target.value)} rows={4} />
                </div>
                <div className="field">
                  <label htmlFor="resume-summary">你的简历要点 / 经历摘要</label>
                  <textarea id="resume-summary" placeholder="填写你的背景，例如：5年客户运营，做过Coze智能体..." value={resumeSummary} onChange={(e) => setResumeSummary(e.target.value)} rows={4} />
                </div>
              </div>
            )}

            {/* 简历差距 */}
            {activeMode === 'gap' && (
              <div className="form-body">
                <div className="field">
                  <label htmlFor="target-jd">目标岗位 JD</label>
                  <textarea id="target-jd" placeholder="粘贴招聘JD内容，例如：招聘AI产品经理，要求..." value={targetJd} onChange={(e) => setTargetJd(e.target.value)} rows={4} />
                </div>
                <div className="field">
                  <label htmlFor="current-resume">当前简历内容</label>
                  <textarea id="current-resume" placeholder="填写你的背景，例如：5年客户运营，做过Coze智能体..." value={currentResume} onChange={(e) => setCurrentResume(e.target.value)} rows={4} />
                </div>
              </div>
            )}

            {/* 打招呼话术 */}
            {activeMode === 'hello' && (
              <div className="form-body">
                <div className="field">
                  <label htmlFor="hello-company">公司与岗位（可选）</label>
                  <input type="text" id="hello-company" placeholder="例如：某某科技 · 前端工程师" value={helloCompany} onChange={(e) => setHelloCompany(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="hello-highlights">你的亮点 / 匹配点</label>
                  <textarea id="hello-highlights" placeholder="技能栈、项目成果、与 JD 的契合点..." value={helloHighlights} onChange={(e) => setHelloHighlights(e.target.value)} rows={4} />
                </div>
              </div>
            )}

            {/* 面试题预测 */}
            {activeMode === 'interview' && (
              <div className="form-body">
                <div className="field">
                  <label htmlFor="interview-jd">岗位 JD 或技术栈关键词</label>
                  <textarea id="interview-jd" placeholder="粘贴招聘JD内容，例如：招聘AI产品经理，要求..." value={interviewJd} onChange={(e) => setInterviewJd(e.target.value)} rows={4} />
                </div>
              </div>
            )}

            <div className="form-actions">
              <button
                type="button"
                className="submit-btn"
                onClick={handleSubmit}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span className="btn-spinner" />
                    {isThinking ? 'AI 正在思考...' : '正在生成分析...'}
                  </>
                ) : (
                  <>开始分析</>
                )}
              </button>
            </div>
          </div>

          {/* 结果区域 */}
          <div className={`result-card${hasResult ? ' has-result' : ''}`}>
            <div className="result-header">
              <span className="result-label">分析结果</span>
              {answerText && !isLoading && (
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => navigator.clipboard.writeText(answerText)}
                >
                  复制
                </button>
              )}
            </div>

            <div className="result-scroll" ref={resultRef}>
              {!hasResult && (
                <div className="result-empty">
                  <div className="empty-icon">📋</div>
                  <p>选择功能并输入内容，点击「开始分析」</p>
                  <p className="empty-sub">AI 将为你生成专属分析报告</p>
                </div>
              )}

              {/* 思考过程（可折叠） */}
              {showThinking && thinkingText && (
                <details className="thinking-block">
                  <summary className="thinking-toggle">
                    <span className="thinking-icon">💭</span>
                    AI 思考过程
                  </summary>
                  <div className="thinking-content">{thinkingText}</div>
                </details>
              )}

              {/* 正在思考的提示 */}
              {isThinking && !answerText && (
                <div className="thinking-indicator">
                  <span className="thinking-dots">
                    <span /><span /><span />
                  </span>
                  AI 正在深度思考中...
                </div>
              )}

              {/* 正式回答 */}
              {answerText && (
                <div
                  className="answer-body"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(answerText) }}
                />
              )}

              {/* 打字光标 */}
              {isLoading && answerText && <span className="typing-cursor" />}
            </div>
          </div>
        </div>
      </div>

      <footer className="app-footer">
        由 Coze AI 驱动 · 求职雷达
      </footer>
    </div>
  );
}
