// POST /api/chat — разговорная практика.
// ИИ задаёт вопрос, ученик отвечает, ИИ исправляет ответ и задаёт следующий вопрос.
import { checkAuth } from './_lib/auth.js';
import { askGemini, TEACHER_STYLE, cleanFix } from './_lib/gemini.js';

const MAX_MESSAGES = 12; // сколько последних реплик отправляем модели — экономим токены
const MAX_LENGTH = 400;

function buildSystem({ level, maxLevel, topics, words }) {
  return `
You are a friendly English conversation partner for a Russian-speaking learner.

Learner level: ${level} of ${maxLevel} (1 = absolute beginner A1, ${maxLevel} = A2+).
Grammar the learner already knows: ${topics.length ? topics.join('; ') : 'only "to be" (am / is / are)'}.
Words the learner has learned (reuse some of them naturally): ${words.length ? words.join(', ') : 'very basic words only'}.

Rules for your reply:
- Use ONLY the grammar listed above and very common everyday words. Never use structures the learner has not studied.
- This is a real two-way conversation, not an interview. If the learner asks YOU a question (even with mistakes, e.g. "why you ask me?"), ANSWER it first in one short honest sentence. Never ignore the learner's question.
- Then ask ONE new question that follows from what the learner just said. Two or three short sentences maximum.
- Every sentence you write must be natural, correct English that makes sense. Do not write strange phrases just to reuse a learned word.
- React to the meaning: if the learner says something sad or negative ("I don't have friends at work"), respond to that, do not say "That is good".
- Start with very simple questions. Make each next question a little harder than the previous one, but stay inside the known grammar.
- Talk about everyday life and work: job, day, plans, city, food, hobbies, colleagues.
- If the conversation has not started yet, just greet the learner and ask the first simple question.

Also check the learner's LAST message and return strictly JSON:
{"reply": "your reaction and next question in English", "fix": null}
or, if the last message has a mistake:
{"reply": "...", "fix": {"corrected": "the correct English sentence", "why": "...", "pattern": "...", "examples": [{"en": "...", "ru": "..."}, {"en": "...", "ru": "..."}], "topic": "...", "rule": "..."}}

- fix is null when the message is correct (ignore capital letters and final punctuation) or when there is no learner message yet.
- Do NOT nitpick. A false correction is worse than a missed one. Use fix only when you are 100% sure a native speaker would not say it. If in doubt, fix is null.
- Never correct: capitalization, punctuation, brand spelling, simple-but-correct sentences, a missing article before drinks, food, names, cities, languages ("I want coffee", "I like tea" are correct).
- fix.corrected: change as few of the learner's words as possible.
- If the learner wrote in Russian, put the English version into fix.corrected and continue the conversation.

Правила для полей fix.why, fix.pattern, fix.examples, fix.topic, fix.rule:
${TEACHER_STYLE}
`.trim();
}

export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' });

  const body = req.body || {};
  const history = Array.isArray(body.history) ? body.history.slice(-MAX_MESSAGES) : [];

  // Gemini требует, чтобы диалог начинался с реплики пользователя
  const contents = [{ role: 'user', parts: [{ text: 'Start the conversation.' }] }];
  for (const message of history) {
    contents.push({
      role: message.role === 'user' ? 'user' : 'model',
      parts: [{ text: String(message.text || '').slice(0, MAX_LENGTH) }],
    });
  }

  const system = buildSystem({
    level: Number(body.level) || 1,
    maxLevel: Number(body.maxLevel) || 6,
    topics: (Array.isArray(body.topics) ? body.topics : []).slice(0, 20).map(String),
    words: (Array.isArray(body.words) ? body.words : []).slice(0, 40).map(String),
  });

  try {
    // В чате важнее ум, чем скорость: сначала пробуем модели посильнее
    const result = await askGemini({ system, contents, temperature: 0.7, smartFirst: true });
    const fix = result.fix && result.fix.corrected
      ? cleanFix(result.fix)
      : null;
    return res.status(200).json({ reply: String(result.reply || ''), fix });
  } catch (error) {
    console.log('[chat] Ответ в чате не получен:', error.message);
    return res.status(error.status || 500).json({ error: error.message });
  }
}
