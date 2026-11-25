// Разбор звонка: ошибки ученика, новые факты о нём и короткое резюме разговора.
import { TEACHER_STYLE, cleanFix } from './gemini.js';

const MAX_TURN = 600;   // символов в одной реплике
const MAX_FIXES = 15;
const MAX_FACTS = 10;

// Оставляет конец разговора, чтобы запрос к модели не раздувался на длинных звонках
export function trimTranscript(turns, maxChars = 12000) {
  const clean = (Array.isArray(turns) ? turns : [])
    .filter((turn) => turn && (turn.role === 'user' || turn.role === 'ai'))
    .map((turn) => ({ role: turn.role, text: String(turn.text ?? '').slice(0, MAX_TURN) }));

  const result = [];
  let total = 0;
  for (let i = clean.length - 1; i >= 0; i--) {
    total += clean[i].text.length;
    if (total > maxChars) break;
    result.unshift(clean[i]);
  }
  return result;
}

// Говорил ли ученик хоть что-то — иначе разбирать нечего
export function hasLearnerSpeech(turns) {
  return turns.some((turn) => turn.role === 'user' && turn.text.trim());
}

export const REVIEW_SYSTEM = `
Ты разбираешь запись голосового разговора русскоязычного ученика (уровень A1-A2) с репетитором английского.
Реплики ученика — "Learner:", реплики репетитора — "Tutor:". Это распознанная речь, а не текст.

Верни строго JSON:
{"fixes": [{"said": "...", "corrected": "...", "literal": "...", "why": "...", "pattern": "...", "examples": [{"en": "...", "ru": "..."}, {"en": "...", "ru": "..."}], "topic": "..."}], "facts": ["..."], "summary": "..."}

fixes — ошибки в репликах ученика (только Learner, реплики Tutor не проверяй):
- said — фраза ученика как есть, corrected — исправленная, меняй как можно меньше его слов.
- ГЛАВНОЕ ПРАВИЛО: не придирайся. Ложная ошибка хуже пропущенной. Добавляй ошибку, только если уверен на 100%, что носитель так не скажет.
- Это устная речь: НЕ считай ошибкой пунктуацию, заглавные буквы, повторы и запинки ("I... I go"), незаконченные фразы, слова-паразиты.
- Если слово похоже на огрех распознавания речи (бессмыслица вместо понятного слова) — не считай это ошибкой.
- Не считай ошибкой отсутствие a/the перед напитками, едой, именами, городами, языками.
- Одна и та же ошибка несколько раз — укажи один раз.
- Фразы по-русски не исправляй.
- Нет ошибок — пустой массив.

facts — новые факты об ученике из разговора, коротко на английском ("Works as a CRM marketer", "Has a cat"). Только то, что он сам сказал. Нет фактов — пустой массив.

summary — 1-2 предложения на английском: о чём говорили.

${TEACHER_STYLE}
`.trim();

// Реплики → текст для модели
export function transcriptText(turns) {
  return turns.map((turn) => `${turn.role === 'user' ? 'Learner' : 'Tutor'}: ${turn.text}`).join('\n');
}

// Приводит ответ модели в порядок: без пустых исправлений и с ограничением количества
export function normalizeReview(raw) {
  const fixes = (Array.isArray(raw?.fixes) ? raw.fixes : [])
    .filter((fix) => fix && fix.corrected)
    .slice(0, MAX_FIXES)
    .map((fix) => ({ said: String(fix.said || ''), ...cleanFix(fix) }));
  const facts = (Array.isArray(raw?.facts) ? raw.facts : [])
    .map((fact) => String(fact || '').trim())
    .filter(Boolean)
    .slice(0, MAX_FACTS);
  return { fixes, facts, summary: String(raw?.summary || '').trim() };
}
