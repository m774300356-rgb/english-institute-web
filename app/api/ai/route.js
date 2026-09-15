import Anthropic from '@anthropic-ai/sdk';

// هذا الملف يشتغل على السيرفر فقط — مفتاح الـ API ما يظهر أبداً للمتصفح.
// كل طلب من الواجهة يجي هنا، نبني منه برومبت مناسب، ونرجع الرد.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function langName(langCode) {
  return langCode === 'en' ? 'English' : 'Arabic';
}

function buildPrompt(action, payload) {
  const explainLang = langName(payload.lang || 'ar');
  const level = payload.level || 'beginner';

  switch (action) {
    case 'placement_quiz':
      return `Create a short 5-question English placement quiz to estimate a learner's level (beginner, intermediate, or advanced). Mix grammar, vocabulary, and one short reading-comprehension question. Each question has 4 options and one correct answer. Explanations/labels should be understandable to someone whose native language is ${explainLang}, but the English content itself (questions about English) stays in English where it's testing English. Respond with ONLY valid JSON, no markdown fences: {"questions":[{"question":"string","options":["a","b","c","d"],"correctIndex":0,"difficulty":"beginner|intermediate|advanced"}]}`;

    case 'daily_lesson':
      return `You are an English tutor. The learner's level is ${level}. Their native/explanation language is ${explainLang}. Their already-known words: ${payload.excludeList || 'none yet'}.
Generate a daily micro-lesson with exactly 5 new vocabulary words appropriate for a ${level} learner, each with: the English word, part of speech, a meaning in ${explainLang}, a simple English definition (max 15 words), and one natural example sentence. Also include a short writing prompt and a short speaking prompt in English using 2-3 of today's words.
Respond with ONLY valid JSON, no markdown fences: {"theme":"string","words":[{"word":"string","partOfSpeech":"string","meaning":"string in ${explainLang}","definition_en":"string","example_en":"string"}],"writing_prompt_en":"string","speaking_prompt_en":"string"}`;

    case 'reading':
      return `You are an English reading tutor. The learner's level is ${level}, their explanation language is ${explainLang}. Their known words: ${payload.excludeList || 'none yet'}.
Write ONE short reading passage (100-160 words) in English at a ${level} level on a general or business topic. Include a glossary of 8-12 words likely unfamiliar to this learner (meaning in ${explainLang}, simple English definition), and 4 multiple-choice comprehension questions (4 options each).
Respond with ONLY valid JSON, no markdown fences: {"title":"string","passage":"string with \\n\\n between paragraphs","glossary":[{"word":"string lowercase","meaning":"string","definition_en":"string"}],"quiz":[{"question":"string","options":["a","b","c","d"],"correctIndex":0}]}`;

    case 'word_lookup':
      return `Give a short meaning in ${explainLang} and a simple English definition (max 12 words) for the English word or short phrase "${payload.word}" as used in this context: "${payload.context || ''}". Respond ONLY JSON: {"meaning":"string","definition_en":"string"}`;

    case 'review_quiz': {
      const words = payload.words || [];
      return `Here is a list of English words a learner has saved, with meanings in ${explainLang}:
${JSON.stringify(words)}
Create ONE review question per word (same order), mixing "meaning" type (pick the correct ${explainLang} meaning, 4 options) and "fillblank" type (a sentence with a blank, 4 word options).
Respond with ONLY valid JSON: {"questions":[{"type":"meaning|fillblank","word":"string","question":"string","options":["a","b","c","d"],"correctIndex":0}]}`;
    }

    case 'level_up_test':
      return `Create a short 6-question test to check if a ${level} English learner (explanation language: ${explainLang}) is ready to move up to the next level. Mix grammar, vocabulary, and reading comprehension, slightly harder than typical ${level} material. 4 options each.
Respond with ONLY valid JSON: {"questions":[{"question":"string","options":["a","b","c","d"],"correctIndex":0}]}`;

    case 'chat': {
      // payload.turns: [{role, content}] — نبني تعليمات المحادثة ونضيفها كأول رسالة.
      const wordList = (payload.words || []).map(w => w.word).join(', ');
      const hidden = `You are a friendly, patient English conversation partner for a ${level} learner. Their explanation language is ${explainLang}. Keep replies short (2-4 sentences), simple, end with one engaging question. Gently correct one clear grammar mistake at a time, briefly, then continue. Try to naturally create chances for them to use these target words: ${wordList}. Topic: ${payload.topic || 'general conversation'}. Never break character.`;
      return [{ role: 'user', content: hidden }, ...(payload.turns || [])];
    }

    case 'conversation_topic':
      return `Invent one engaging English conversation topic for a ${level} learner (explanation language: ${explainLang}), ideally business or entrepreneurship related. Write a short warm opening message (2-3 sentences) in English ending with a question. Try to hint at using one of these words if natural: ${(payload.words || []).map(w => w.word).join(', ')}.
Respond with ONLY valid JSON: {"topic":"string","opening_message_en":"string"}`;

    case 'story_chapter':
      return `Continue an original, wholesome, entirely invented short story (never based on any existing real book or media) written for a ${level} English learner, explanation language ${explainLang}. This is chapter ${payload.chapterNumber || 1}. ${payload.previousSummary ? `Story so far (your own words, a short summary): ${payload.previousSummary}` : 'This is the first chapter — invent an engaging premise suited to an entrepreneurship/business adventure theme.'}
Naturally use these vocabulary words if possible: ${(payload.words || []).map(w => w.word).join(', ')}.
Write 120-180 English words for this chapter, simple ${level}-level language, ending on a small cliffhanger. Also give a one-sentence summary of this chapter (for continuity next time) in English.
Respond with ONLY valid JSON: {"chapter_text":"string","summary":"string"}`;

    case 'pronunciation_tip':
      return `A ${level} English learner tried to say the word or phrase "${payload.target}" and it was heard (via speech recognition) as "${payload.heard}". In ${explainLang}, give one short, encouraging, specific tip (max 2 sentences) to improve their pronunciation of "${payload.target}", based on the difference between target and what was heard. Respond with plain text only, no JSON.`;

    default:
      throw new Error('Unknown action: ' + action);
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { action, payload } = body;
    if (!action) {
      return Response.json({ ok: false, error: 'missing action' }, { status: 400 });
    }

    const built = buildPrompt(action, payload || {});
    const messages = Array.isArray(built) ? built : [{ role: 'user', content: built }];

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1500,
      messages,
    });

    const text = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    return Response.json({ ok: true, text });
  } catch (e) {
    console.error('AI route error:', e);
    return Response.json({ ok: false, error: String(e && e.message ? e.message : e) }, { status: 500 });
  }
}
