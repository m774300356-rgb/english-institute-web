'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LANGS, getLang } from '../../lib/i18n';
import { loadState, saveState } from '../../lib/storage';

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

function stripFences(text) {
  return text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
}

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState('language'); // language | intro | quiz | grading | done
  const [langCode, setLangCode] = useState('ar');
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');
  const t = getLang(langCode).ui;
  const dir = getLang(langCode).dir;

  function chooseLanguage(code) {
    setLangCode(code);
    setStep('intro');
  }

  async function startPlacement() {
    setStep('quizLoading');
    setError('');
    try {
      const raw = await callAI('placement_quiz', { lang: langCode });
      const parsed = JSON.parse(stripFences(raw));
      setQuiz(parsed.questions);
      setAnswers({});
      setStep('quiz');
    } catch (e) {
      setError(t.error);
      setStep('quizError');
    }
  }

  function finishPlacement() {
    // نحسب مستوى تقريبي من إجابات الاختبار حسب صعوبة الأسئلة الصحيحة.
    let correctCount = 0;
    let hardestCorrect = 'beginner';
    const order = { beginner: 1, intermediate: 2, advanced: 3 };
    quiz.forEach((q, qi) => {
      const isRight = answers[qi] === q.correctIndex;
      if (isRight) {
        correctCount++;
        const d = q.difficulty || 'beginner';
        if ((order[d] || 1) > (order[hardestCorrect] || 1)) hardestCorrect = d;
      }
    });
    let level = 'beginner';
    const ratio = correctCount / quiz.length;
    if (ratio >= 0.8) level = 'advanced';
    else if (ratio >= 0.5) level = 'intermediate';
    else level = 'beginner';

    const state = loadState();
    state.lang = langCode;
    state.level = level;
    state.placementDone = true;
    state.lessonsAtLevel = 0;
    saveState(state);
    setStep('done');
    setTimeout(() => router.replace('/dashboard'), 1200);
  }

  return (
    <div className="wrap" dir={dir}>
      {step === 'language' && (
        <div className="card">
          <h1 className="title-display" style={{ fontSize: 24, marginTop: 0 }}>معهدي / My Institute</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>اختر لغتك — Choose your language</p>
          <div className="btn-row" style={{ marginTop: 16 }}>
            {Object.values(LANGS).map((l) => (
              <button key={l.code} className="btn-primary" onClick={() => chooseLanguage(l.code)}>
                {l.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'intro' && (
        <div className="card">
          <h2 className="title-display" style={{ marginTop: 0 }}>{t.placementTitle}</h2>
          <p style={{ color: 'var(--ink-soft)', fontSize: 14 }}>{t.placementDesc}</p>
          <button className="btn-primary" onClick={startPlacement}>{t.startPlacement}</button>
        </div>
      )}

      {step === 'quizLoading' && (
        <div className="card loading">
          <div className="spinner"></div>
          {t.loading}
        </div>
      )}

      {step === 'quizError' && (
        <div className="card">
          <div className="error-box">{error}</div>
          <div className="btn-row"><button className="btn-primary" onClick={startPlacement}>{t.retry}</button></div>
        </div>
      )}

      {step === 'quiz' && quiz && (
        <div className="card">
          <h2 className="title-display" style={{ marginTop: 0 }}>{t.placementTitle}</h2>
          {quiz.map((q, qi) => (
            <div className="quiz-q" key={qi}>
              <p style={{ fontSize: 15, direction: 'ltr', textAlign: 'left' }}>{qi + 1}. {q.question}</p>
              {q.options.map((opt, oi) => (
                <button
                  key={oi}
                  className={`quiz-opt ${answers[qi] === oi ? 'selected' : ''}`}
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  onClick={() => setAnswers({ ...answers, [qi]: oi })}
                >
                  {opt}
                </button>
              ))}
            </div>
          ))}
          <div className="btn-row">
            <button
              className="btn-primary"
              disabled={Object.keys(answers).length < quiz.length}
              onClick={finishPlacement}
            >
              {t.submit}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="card loading">
          <div className="spinner"></div>
          {t.continue}...
        </div>
      )}
    </div>
  );
}
