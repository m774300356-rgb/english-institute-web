'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getLang } from '../../lib/i18n';
import { loadState, saveState, todayStr, daysBetween } from '../../lib/storage';

async function callAI(action, payload) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'AI error');
  return data.text;
}
function parseJSON(text) {
  const clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(clean);
}
function speak(text) {
  try {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.85;
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

const TABS = ['lesson', 'reading', 'history', 'vocab', 'review', 'speaking', 'mirror', 'story', 'stats'];
const LEVEL_ORDER = ['beginner', 'intermediate', 'advanced'];
const LEVEL_UP_THRESHOLD = 5;

export default function Dashboard() {
  const router = useRouter();
  const [state, setState] = useState(null);
  const [tab, setTab] = useState('lesson');

  useEffect(() => {
    const s = loadState();
    if (!s.placementDone) { router.replace('/onboarding'); return; }
    setState(s);
    setTab(s.lastTab && TABS.includes(s.lastTab) ? s.lastTab : 'lesson');
  }, [router]);

  function update(mutator) {
    setState((prev) => {
      const next = { ...prev };
      mutator(next);
      saveState(next);
      return next;
    });
  }

  function switchTab(name) {
    setTab(name);
    update((s) => { s.lastTab = name; });
  }

  if (!state) return <div className="wrap"><div className="loading"><div className="spinner"></div></div></div>;

  const t = getLang(state.lang).ui;
  const dir = getLang(state.lang).dir;

  return (
    <div className="wrap" dir={dir}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <div className="title-display" style={{ fontSize: 20 }}>{t.appName}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t.yourLevel}: {t['level' + capitalize(state.level)]}</div>
        </div>
        <div className="badge primary">🔥 {state.streak || 0}</div>
      </header>

      <nav className="tabs">
        {TABS.map((name) => (
          <button key={name} className={tab === name ? 'active' : ''} onClick={() => switchTab(name)}>
            {t[tabLabelKey(name)]}
          </button>
        ))}
      </nav>

      {tab === 'lesson' && <LessonTab state={state} update={update} t={t} />}
      {tab === 'reading' && <ReadingTab state={state} update={update} t={t} />}
      {tab === 'history' && <HistoryTab state={state} t={t} />}
      {tab === 'vocab' && <VocabTab state={state} t={t} />}
      {tab === 'review' && <ReviewTab state={state} update={update} t={t} />}
      {tab === 'speaking' && <SpeakingTab state={state} update={update} t={t} />}
      {tab === 'mirror' && <MirrorTab state={state} t={t} />}
      {tab === 'story' && <StoryTab state={state} update={update} t={t} />}
      {tab === 'stats' && <StatsTab state={state} t={t} />}
    </div>
  );
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : 'Beginner'; }
function tabLabelKey(name) {
  return { lesson: 'todayLesson', reading: 'reading', history: 'history', vocab: 'vocab', review: 'review', speaking: 'speaking', mirror: 'mirror', story: 'story', stats: 'stats' }[name];
}

// ---------------- Lesson Tab ----------------
function LessonTab({ state, update, t }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lesson = state.currentLesson;
  const canLevelUp = state.level !== 'advanced' && (state.lessonsAtLevel || 0) >= LEVEL_UP_THRESHOLD;

  async function generate() {
    setLoading(true); setError('');
    try {
      const excludeList = (state.wordBank || []).map((w) => w.word).join(', ');
      const raw = await callAI('daily_lesson', { lang: state.lang, level: state.level, excludeList });
      const data = parseJSON(raw);
      update((s) => {
        s.currentLesson = data;
        s.lessonHistory = s.lessonHistory || [];
        s.lessonHistory.push({ ...data, date: todayStr() });
        const today = todayStr();
        if (s.lastLessonDate !== today) {
          s.streak = s.lastLessonDate && daysBetween(s.lastLessonDate, today) === 1 ? (s.streak || 0) + 1 : 1;
          s.lastLessonDate = today;
          s.lessonsAtLevel = (s.lessonsAtLevel || 0) + 1;
        }
      });
    } catch (e) {
      setError(t.error);
    }
    setLoading(false);
  }

  function saveWord(w) {
    update((s) => {
      s.wordBank = s.wordBank || [];
      if (!s.wordBank.some((x) => x.word.toLowerCase() === w.word.toLowerCase())) {
        s.wordBank.push({ word: w.word, meaning: w.meaning, definition_en: w.definition_en, example_en: w.example_en, addedDate: todayStr(), status: 'new' });
      }
    });
  }

  let body;
  if (loading) {
    body = <div className="card loading"><div className="spinner"></div>{t.loading}</div>;
  } else if (!lesson) {
    body = (
      <div className="card">
        {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}
        <button className="btn-primary" onClick={generate}>{t.generate}</button>
      </div>
    );
  } else {
    body = (
      <div className="card">
        <h3 className="title-display" style={{ marginTop: 0, direction: 'ltr', textAlign: 'left' }}>{lesson.theme}</h3>
        {lesson.words.map((w, i) => {
          const saved = (state.wordBank || []).some((x) => x.word.toLowerCase() === w.word.toLowerCase());
          return (
            <div key={i} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', padding: '12px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ direction: 'ltr' }}>
                  <b className="title-display" style={{ fontSize: 19 }}>{w.word}</b>{' '}
                  <button onClick={() => speak(w.word)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}>🔊</button>{' '}
                  <i style={{ fontSize: 12, color: 'var(--accent)' }}>{w.partOfSpeech}</i>
                </span>
                <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{w.meaning}</span>
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', direction: 'ltr', textAlign: 'left', marginTop: 4 }}>{w.definition_en}</div>
              <div style={{ background: 'var(--surface-2)', borderInlineStart: '3px solid var(--accent)', padding: '8px 12px', marginTop: 6, direction: 'ltr', textAlign: 'left' }}>{w.example_en}</div>
              <button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => saveWord(w)} disabled={saved}>
                {saved ? t.saved : t.save}
              </button>
            </div>
          );
        })}
        <div className="card" style={{ background: 'var(--surface-2)', marginTop: 14 }}>
          <b>✍️</b> <span style={{ direction: 'ltr' }}>{lesson.writing_prompt_en}</span>
        </div>
        <div className="card" style={{ background: 'var(--surface-2)' }}>
          <b>🗣️</b> <span style={{ direction: 'ltr' }}>{lesson.speaking_prompt_en}</span>
        </div>
        <div className="btn-row">
          <button className="btn-ghost" onClick={generate}>{t.newOne}</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {canLevelUp && <LevelUpTest state={state} update={update} t={t} />}
      {body}
    </div>
  );
}

// ---------------- Level-up Test ----------------
function LevelUpTest({ state, update, t }) {
  const [stage, setStage] = useState('idle'); // idle | loading | quiz | done
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null); // 'passed' | 'failed'
  const [error, setError] = useState('');

  async function start() {
    setStage('loading'); setError('');
    try {
      const raw = await callAI('level_up_test', { lang: state.lang, level: state.level });
      const data = parseJSON(raw);
      setQuiz(data.questions);
      setAnswers({});
      setStage('quiz');
    } catch (e) {
      setError(t.error);
      setStage('idle');
    }
  }

  function submit() {
    let correct = 0;
    quiz.forEach((q, qi) => { if (answers[qi] === q.correctIndex) correct++; });
    const passed = correct / quiz.length >= 0.7;
    update((s) => {
      s.lessonsAtLevel = 0;
      if (passed) {
        const idx = LEVEL_ORDER.indexOf(s.level);
        if (idx >= 0 && idx < LEVEL_ORDER.length - 1) s.level = LEVEL_ORDER[idx + 1];
      }
    });
    setResult(passed ? 'passed' : 'failed');
    setStage('done');
  }

  if (stage === 'loading') {
    return <div className="card loading"><div className="spinner"></div>{t.loading}</div>;
  }

  if (stage === 'quiz' && quiz) {
    return (
      <div className="card">
        <b className="title-display" style={{ display: 'block', marginBottom: 10 }}>{t.levelUpTest}</b>
        {quiz.map((q, qi) => (
          <div className="quiz-q" key={qi}>
            <p style={{ fontSize: 15, direction: 'ltr', textAlign: 'left' }}>{qi + 1}. {q.question}</p>
            {q.options.map((opt, oi) => (
              <button
                key={oi}
                className={`quiz-opt ${answers[qi] === oi ? 'selected' : ''}`}
                style={{ direction: 'ltr', textAlign: 'left' }}
                onClick={() => setAnswers({ ...answers, [qi]: oi })}
              >{opt}</button>
            ))}
          </div>
        ))}
        <button className="btn-primary" onClick={submit} disabled={Object.keys(answers).length < quiz.length}>{t.submit}</button>
      </div>
    );
  }

  if (stage === 'done') {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <p style={{ margin: 0 }}>{result === 'passed' ? t.passed : t.notYetPassed}</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ background: 'var(--accent-soft)' }}>
      <b className="title-display" style={{ display: 'block', marginBottom: 6 }}>{t.levelUpTest}</b>
      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginTop: 0 }}>{t.levelUpDesc}</p>
      {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}
      <button className="btn-primary" onClick={start}>{t.levelUpTest}</button>
    </div>
  );
}

// ---------------- History Tab ----------------
function HistoryTab({ state, t }) {
  const [openKey, setOpenKey] = useState(null);
  const lessons = (state.lessonHistory || []).slice().reverse();
  const readings = (state.readingHistory || []).slice().reverse();

  if (!lessons.length && !readings.length) {
    return <div className="card empty"><p style={{ color: 'var(--muted)', textAlign: 'center' }}>{t.historyEmpty}</p></div>;
  }

  return (
    <div>
      {lessons.length > 0 && (
        <div className="card">
          <b className="title-display" style={{ display: 'block', marginBottom: 10 }}>{t.lessonsSection}</b>
          {lessons.map((l, i) => {
            const key = 'l' + i;
            const open = openKey === key;
            return (
              <div key={key} style={{ borderTop: i ? '1px solid var(--border)' : 'none', padding: '10px 0' }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                  onClick={() => setOpenKey(open ? null : key)}
                >
                  <span className="title-display" style={{ direction: 'ltr', textAlign: 'left' }}>{l.theme}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)', flexShrink: 0 }}>{l.date || ''}</span>
                </div>
                {open && (
                  <div style={{ marginTop: 8, direction: 'ltr', textAlign: 'left' }}>
                    {(l.words || []).map((w, wi) => (
                      <div key={wi} style={{ fontSize: 13.5, padding: '4px 0' }}>
                        <b>{w.word}</b> — <span style={{ color: 'var(--primary)' }}>{w.meaning}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {readings.length > 0 && (
        <div className="card">
          <b className="title-display" style={{ display: 'block', marginBottom: 10 }}>{t.readingSection}</b>
          {readings.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <span className="title-display" style={{ direction: 'ltr', textAlign: 'left' }}>{r.title}</span>
              <span className="badge primary">{r.correct}/{r.total}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Reading Tab ----------------
function ReadingTab({ state, update, t }) {
  const [stage, setStage] = useState(state.currentReading ? 'passage' : 'idle');
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState(state.currentQuizAnswers || {});
  const [graded, setGraded] = useState(false);
  const [popup, setPopup] = useState(null);
  const lesson = state.currentReading;

  async function generate() {
    setStage('loading'); setError('');
    try {
      const excludeList = (state.wordBank || []).map((w) => w.word).join(', ');
      const raw = await callAI('reading', { lang: state.lang, level: state.level, excludeList });
      const data = parseJSON(raw);
      update((s) => { s.currentReading = data; s.currentQuizAnswers = {}; });
      setAnswers({}); setGraded(false);
      setStage('passage');
    } catch (e) { setError(t.error); setStage('idle'); }
  }

  async function lookupWord(word) {
    setPopup({ word, loading: true });
    try {
      const raw = await callAI('word_lookup', { lang: state.lang, word, context: lesson.passage.slice(0, 300) });
      const data = parseJSON(raw);
      setPopup({ word, meaning: data.meaning, definition_en: data.definition_en, loading: false });
    } catch (e) {
      setPopup({ word, meaning: '', definition_en: '', loading: false, error: true });
    }
  }

  function saveWord(word, meaning, definition_en) {
    update((s) => {
      s.wordBank = s.wordBank || [];
      if (!s.wordBank.some((x) => x.word.toLowerCase() === word.toLowerCase())) {
        s.wordBank.push({ word, meaning, definition_en, example_en: '', addedDate: todayStr(), status: 'new' });
      }
    });
  }

  function grade() {
    let correct = 0;
    lesson.quiz.forEach((q, qi) => { if (answers[qi] === q.correctIndex) correct++; });
    update((s) => {
      s.readingStats = s.readingStats || { completed: 0, totalScore: 0 };
      s.readingStats.completed += 1;
      s.readingStats.totalScore += Math.round((correct / lesson.quiz.length) * 100);
      s.readingHistory = s.readingHistory || [];
      s.readingHistory.push({ title: lesson.title, correct, total: lesson.quiz.length, date: todayStr() });
      s.currentQuizAnswers = {};
    });
    setGraded(true);
  }

  if (stage === 'loading') return <div className="card loading"><div className="spinner"></div>{t.loading}</div>;

  if (stage === 'idle' || !lesson) {
    return (
      <div className="card">
        {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}
        <button className="btn-primary" onClick={generate}>{t.generate}</button>
      </div>
    );
  }

  const glossaryMap = {};
  (lesson.glossary || []).forEach((g) => { glossaryMap[g.word.toLowerCase()] = g; });

  const words = lesson.passage.split(/\n+/).map((para, pi) => (
    <p key={pi} style={{ direction: 'ltr', textAlign: 'left', lineHeight: 2 }}>
      {para.split(/(\s+)/).map((tok, ti) => {
        if (/^\s+$/.test(tok) || !tok) return tok;
        const clean = tok.replace(/[^A-Za-z']/g, '').toLowerCase();
        if (!clean) return tok;
        return (
          <span key={ti} style={{ cursor: 'pointer', borderBottom: '1px dotted var(--accent)' }}
            onClick={() => lookupWord(clean)}>{tok}</span>
        );
      })}
    </p>
  ));

  return (
    <div>
      <div className="card">
        <h3 className="title-display" style={{ marginTop: 0 }}>{lesson.title}</h3>
        {words}
        {stage === 'passage' && (
          <div className="btn-row">
            <button className="btn-primary" onClick={() => setStage('quiz')}>{t.continue}</button>
            <button className="btn-ghost" onClick={generate}>{t.newOne}</button>
          </div>
        )}
      </div>

      {stage === 'quiz' && (
        <div className="card">
          {lesson.quiz.map((q, qi) => (
            <div className="quiz-q" key={qi}>
              <p style={{ direction: 'ltr', textAlign: 'left' }}>{qi + 1}. {q.question}</p>
              {q.options.map((opt, oi) => (
                <button key={oi}
                  className={`quiz-opt ${answers[qi] === oi ? 'selected' : ''} ${graded && oi === q.correctIndex ? 'correct' : ''} ${graded && answers[qi] === oi && oi !== q.correctIndex ? 'wrong' : ''}`}
                  disabled={graded}
                  onClick={() => { const na = { ...answers, [qi]: oi }; setAnswers(na); update((s) => { s.currentQuizAnswers = na; }); }}
                  style={{ direction: 'ltr', textAlign: 'left' }}
                >{opt}</button>
              ))}
            </div>
          ))}
          {!graded ? (
            <div className="btn-row">
              <button className="btn-primary" onClick={grade} disabled={Object.keys(answers).length < lesson.quiz.length}>{t.submit}</button>
              <button className="btn-ghost" onClick={() => setStage('passage')}>{t.reading}</button>
            </div>
          ) : (
            <div className="btn-row">
              <button className="btn-primary" onClick={generate}>{t.newOne}</button>
            </div>
          )}
        </div>
      )}

      {popup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={(e) => { if (e.target === e.currentTarget) setPopup(null); }}>
          <div className="card" style={{ maxWidth: 300, textAlign: 'center' }}>
            <div style={{ direction: 'ltr' }}>
              <b className="title-display" style={{ fontSize: 22 }}>{popup.word}</b>{' '}
              <button onClick={() => speak(popup.word)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}>🔊</button>
            </div>
            {popup.loading ? <div style={{ padding: 16 }}><div className="spinner"></div></div> : (
              <>
                <div style={{ color: 'var(--primary)', fontWeight: 600, margin: '8px 0 2px' }}>{popup.meaning}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', direction: 'ltr', marginBottom: 14 }}>{popup.definition_en}</div>
                <div className="btn-row" style={{ justifyContent: 'center' }}>
                  <button className="btn-ghost" onClick={() => setPopup(null)}>×</button>
                  <button className="btn-primary" onClick={() => { saveWord(popup.word, popup.meaning, popup.definition_en); setPopup(null); }}>{t.save}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Vocab Tab ----------------
function VocabTab({ state, t }) {
  const words = state.wordBank || [];
  if (!words.length) return <div className="card">—</div>;
  return (
    <div className="card">
      {words.slice().reverse().map((w, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
          <div>
            <div className="title-display" style={{ direction: 'ltr' }}>{w.word}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{w.meaning}</div>
          </div>
          <span className={`badge ${w.status === 'mastered' ? 'primary' : ''}`}>{w.status}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------- Review Tab ----------------
function ReviewTab({ state, update, t }) {
  const [stage, setStage] = useState('idle');
  const [set, setSet] = useState(null);
  const [answers, setAnswers] = useState({});
  const [graded, setGraded] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    setStage('loading'); setError('');
    try {
      const words = (state.wordBank || []).filter((w) => w.status !== 'mastered').slice(0, 8);
      if (!words.length) throw new Error('no words');
      const raw = await callAI('review_quiz', { lang: state.lang, words: words.map((w) => ({ word: w.word, meaning: w.meaning })) });
      const data = parseJSON(raw);
      setSet(data.questions); setAnswers({}); setGraded(false);
      setStage('quiz');
    } catch (e) { setError(t.error); setStage('idle'); }
  }

  function grade() {
    let correct = 0;
    set.forEach((q, qi) => {
      const ok = answers[qi] === q.correctIndex;
      if (ok) correct++;
      update((s) => {
        const entry = (s.wordBank || []).find((x) => x.word.toLowerCase() === q.word.toLowerCase());
        if (entry) entry.status = ok ? 'mastered' : 'review';
      });
    });
    update((s) => {
      s.reviewStats = s.reviewStats || { completed: 0, totalScore: 0 };
      s.reviewStats.completed += 1;
      s.reviewStats.totalScore += Math.round((correct / set.length) * 100);
    });
    setGraded(true);
  }

  if (stage === 'loading') return <div className="card loading"><div className="spinner"></div>{t.loading}</div>;

  if (stage === 'idle') {
    return (
      <div className="card">
        {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}
        <button className="btn-primary" onClick={generate}>{t.generate}</button>
      </div>
    );
  }

  return (
    <div className="card">
      {set.map((q, qi) => (
        <div className="quiz-q" key={qi}>
          <p style={{ direction: 'ltr', textAlign: 'left' }}>{qi + 1}. {q.question}</p>
          {q.options.map((opt, oi) => (
            <button key={oi}
              className={`quiz-opt ${answers[qi] === oi ? 'selected' : ''} ${graded && oi === q.correctIndex ? 'correct' : ''} ${graded && answers[qi] === oi && oi !== q.correctIndex ? 'wrong' : ''}`}
              disabled={graded}
              onClick={() => setAnswers({ ...answers, [qi]: oi })}
              style={{ direction: 'ltr', textAlign: 'left' }}
            >{opt}</button>
          ))}
        </div>
      ))}
      {!graded ? (
        <button className="btn-primary" onClick={grade} disabled={Object.keys(answers).length < set.length}>{t.submit}</button>
      ) : (
        <button className="btn-primary" onClick={generate}>{t.newOne}</button>
      )}
    </div>
  );
}

// ---------------- Speaking Tab ----------------
function SpeakingTab({ state, update, t }) {
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const session = state.speakingSession;

  async function start() {
    setBusy(true);
    try {
      const words = (state.wordBank || []).slice(-5);
      const raw = await callAI('conversation_topic', { lang: state.lang, level: state.level, words });
      const data = parseJSON(raw);
      update((s) => {
        s.speakingSession = { topic: data.topic, words, messages: [{ role: 'assistant', content: data.opening_message_en }], startDate: todayStr() };
        s.speakingStats = s.speakingStats || { sessionsStarted: 0 };
        s.speakingStats.sessionsStarted += 1;
      });
    } catch (e) {}
    setBusy(false);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    update((s) => { s.speakingSession.messages.push({ role: 'user', content: text }); });
    setBusy(true);
    try {
      const raw = await callAI('chat', { lang: state.lang, level: state.level, topic: session.topic, words: session.words, turns: [...session.messages, { role: 'user', content: text }] });
      update((s) => { s.speakingSession.messages.push({ role: 'assistant', content: raw }); });
    } catch (e) {
      update((s) => { s.speakingSession.messages.push({ role: 'assistant', content: '...' }); });
    }
    setBusy(false);
  }

  if (!session) {
    return <div className="card"><button className="btn-primary" onClick={start} disabled={busy}>{t.generate}</button></div>;
  }

  return (
    <div className="card">
      <div style={{ fontSize: 12.5, color: 'var(--accent)', direction: 'ltr', marginBottom: 10 }}>📌 {session.topic}</div>
      <div className="chat-area">
        {session.messages.map((m, i) => <div key={i} className={`chat-msg ${m.role}`} style={{ direction: 'ltr' }}>{m.content}</div>)}
      </div>
      <div className="btn-row">
        <input className="field-input" style={{ direction: 'ltr' }} value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className="btn-primary" onClick={send} disabled={busy}>{t.continue}</button>
      </div>
      <button className="btn-ghost" style={{ marginTop: 10 }} onClick={() => update((s) => { s.speakingSession = null; })}>{t.newOne}</button>
    </div>
  );
}

// ---------------- Mirror Mode (Pronunciation Practice) ----------------
// ميزة ابتكارية: يتكلم المستخدم بالمايك، والمتصفح يحول كلامه لنص (Web Speech API — مجاني تماماً، بدون تكلفة سيرفر)
// ونقارنه بالكلمة المستهدفة، ونعطيه تلميح تحسين من الذكاء الاصطناعي فقط عند الحاجة.
function MirrorTab({ state, t }) {
  const [target, setTarget] = useState((state.wordBank && state.wordBank[state.wordBank.length - 1]?.word) || 'business');
  const [heard, setHeard] = useState('');
  const [listening, setListening] = useState(false);
  const [tip, setTip] = useState('');
  const [score, setScore] = useState(null);
  const recRef = useRef(null);

  function similarity(a, b) {
    a = a.toLowerCase().trim(); b = b.toLowerCase().trim();
    if (!a || !b) return 0;
    if (a === b) return 100;
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    let matches = 0;
    for (let i = 0; i < shorter.length; i++) if (shorter[i] === longer[i]) matches++;
    return Math.round((matches / longer.length) * 100);
  }

  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setTip('Speech recognition not supported in this browser.'); return; }
    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.onresult = async (e) => {
      const text = e.results[0][0].transcript;
      setHeard(text);
      const s = similarity(target, text);
      setScore(s);
      setListening(false);
      if (s < 85) {
        try {
          const raw = await callAI('pronunciation_tip', { lang: state.lang, target, heard: text });
          setTip(raw);
        } catch (e) { setTip(''); }
      } else {
        setTip('');
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    setHeard(''); setTip(''); setScore(null);
    rec.start();
  }

  return (
    <div className="card">
      <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>🪞 Mirror Mode — practice saying a word out loud, get an instant score.</p>
      <input className="field-input" style={{ direction: 'ltr', marginBottom: 12 }} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="word to practice" />
      <div className="btn-row">
        <button className="btn-primary" onClick={() => speak(target)}>{t.speak}</button>
        <button className="btn-primary" onClick={startListening} disabled={listening}>{listening ? '...' : t.recordAttempt}</button>
      </div>
      {score !== null && (
        <div style={{ marginTop: 14 }}>
          <div style={{ direction: 'ltr' }}>Heard: <b>{heard}</b></div>
          <div className="badge primary" style={{ marginTop: 6 }}>{t.pronunciationScore}: {score}%</div>
          {tip && <div className="error-box" style={{ marginTop: 10 }}>{tip}</div>}
        </div>
      )}
    </div>
  );
}

// ---------------- Story Tab ----------------
// ميزة ابتكارية: قصة أصلية تتقدم فصل بفصل، لكن الفصل التالي ما يفتح إلا بعد إنجاز
// مراجعة اليوم — يربط المتابعة القصصية (تحفيز طبيعي) بتثبيت الكلمات.
function StoryTab({ state, update, t }) {
  const [loading, setLoading] = useState(false);
  const chapters = state.storyChapters || [];
  const canUnlock = state.storyUnlockedToday || chapters.length === 0;

  async function nextChapter() {
    setLoading(true);
    try {
      const words = (state.wordBank || []).slice(-5);
      const previousSummary = chapters.length ? chapters[chapters.length - 1].summary : '';
      const raw = await callAI('story_chapter', { lang: state.lang, level: state.level, chapterNumber: chapters.length + 1, previousSummary, words });
      const data = parseJSON(raw);
      update((s) => {
        s.storyChapters = s.storyChapters || [];
        s.storyChapters.push({ text: data.chapter_text, summary: data.summary });
        s.storyUnlockedToday = false;
      });
    } catch (e) {}
    setLoading(false);
  }

  return (
    <div className="card">
      {chapters.map((c, i) => (
        <div key={i} style={{ borderTop: i ? '1px solid var(--border)' : 'none', padding: '12px 0', direction: 'ltr', textAlign: 'left', whiteSpace: 'pre-line' }}>
          <b>Chapter {i + 1}</b>
          <p>{c.text}</p>
        </div>
      ))}
      {loading ? <div className="loading"><div className="spinner"></div></div> : (
        canUnlock ? (
          <button className="btn-primary" onClick={nextChapter}>{t.unlockNext}</button>
        ) : (
          <div className="error-box">{t.storyLocked}</div>
        )
      )}
    </div>
  );
}

// ---------------- Stats Tab ----------------
function StatsTab({ state, t }) {
  const rs = state.readingStats || { completed: 0, totalScore: 0 };
  const revs = state.reviewStats || { completed: 0, totalScore: 0 };
  const speak = state.speakingStats || { sessionsStarted: 0 };
  const row = (label, value) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
      <span>{label}</span><span className="badge primary">{value}</span>
    </div>
  );
  return (
    <div className="card">
      {row(t.stats, '')}
      {row('Streak', state.streak || 0)}
      {row(t.vocab, (state.wordBank || []).length)}
      {row(t.reading, rs.completed)}
      {row(t.review, revs.completed)}
      {row(t.speaking, speak.sessionsStarted)}
    </div>
  );
}
