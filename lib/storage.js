// تخزين بسيط في متصفح كل زائر (localStorage). كل زائر بياناته منفصلة على جهازه.
// في مرحلة لاحقة (لو تبي حسابات مستخدمين تتبعهم بين الأجهزة) تقدر تستبدل هذا
// بقاعدة بيانات مثل Supabase — راجع README.md لتفاصيل الترقية.

const KEY = 'englishInstituteWeb_v1';

const DEFAULT_STATE = {
  lang: null,              // 'ar' | 'en' ...
  level: null,             // 'beginner' | 'intermediate' | 'advanced'
  placementDone: false,
  lessonsAtLevel: 0,       // عداد الدروس المنجزة بالمستوى الحالي (لتحديد وقت اختبار الترقية)
  streak: 0,
  lastLessonDate: null,
  currentLesson: null,
  lessonHistory: [],
  wordBank: [],
  currentReading: null,
  currentQuizAnswers: {},
  readingHistory: [],
  readingStats: { completed: 0, totalScore: 0 },
  reviewStats: { completed: 0, totalScore: 0 },
  speakingSession: null,
  speakingStats: { sessionsStarted: 0 },
  storyChapters: [],       // فصول القصة المستمرة المفتوحة
  storyUnlockedToday: false,
  lastTab: 'lesson',
};

export function loadState() {
  if (typeof window === 'undefined') return { ...DEFAULT_STATE };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...DEFAULT_STATE };
}

export function saveState(state) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {}
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
