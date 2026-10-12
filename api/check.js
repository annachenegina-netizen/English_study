// POST /api/check — проверка одного предложения ученика.
// mode: 'word'      — предложение с заданным словом (раздел «Слова»)
// mode: 'translate' — перевод русского предложения (раздел «Грамматика»)
import { checkAuth } from './_lib/auth.js';
import { askGemini, TEACHER_STYLE, cleanFix } from './_lib/gemini.js';

const MAX_LENGTH = 300;

const SYSTEM = `
Ты проверяешь одно английское предложение русскоязычного ученика уровня A1-A2.

Верни строго JSON:
{"correct": true/false, "corrected": "...", "why": "...", "pattern": "...", "examples": [{"en": "...", "ru": "..."}, {"en": "...", "ru": "..."}], "topic": "...", "rule": "..."}

- correct: true, если так может сказать носитель языка и задание выполнено.

ГЛАВНОЕ ПРАВИЛО: не придирайся. Ложная ошибка хуже пропущенной — она учит неправильному.
Ставь correct: false, только если уверен на 100%, что носитель так не скажет. Сомневаешься — correct: true.
НЕ считай ошибкой:
- заглавные и строчные буквы, точку в конце, дефисы, написание брендов ("coca cola" = "Coca-Cola");
- простое или "детское" предложение — простое не значит неправильное;
- отсутствие a/the перед напитками, едой и веществами: "I want coffee", "I want coca cola", "I like tea", "I need water" — всё верно;
- отсутствие a/the перед именами, городами, странами, языками;
- то, что можно сказать и по-другому. Верных вариантов много — принимай любой.
Перед ответом проверь себя: "А это точно ошибка? Говорят ли так носители?" Если говорят — correct: true.
- corrected: правильный вариант на английском. Меняй как можно меньше слов ученика. Если всё верно — повтори его предложение.
- Если correct: true — why, pattern, topic, rule пустые строки, examples пустой массив. Ничего не объясняй.

${TEACHER_STYLE}
`.trim();

function clean(value) {
  return String(value || '').trim().slice(0, MAX_LENGTH);
}

export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' });

  const mode = req.body?.mode;
  const answer = clean(req.body?.answer);
  if (!answer) return res.status(400).json({ error: 'Пустой ответ' });

  let task;
  if (mode === 'word') {
    task = [
      `Задание: составить любое предложение со словом "${clean(req.body.word)}" (значение: ${clean(req.body.ru)}).`,
      'Слово можно ставить в любую форму. Если слова в предложении нет — correct: false.',
      `Предложение ученика: ${answer}`,
    ].join('\n');
  } else if (mode === 'translate') {
    task = [
      `Тема урока: ${clean(req.body.topic)}.`,
      `Задание: перевести на английский: "${clean(req.body.ru)}"`,
      'Засчитывай любой верный перевод с тем же смыслом, не только дословный.',
      `Перевод ученика: ${answer}`,
    ].join('\n');
  } else {
    return res.status(400).json({ error: 'Неизвестный режим проверки' });
  }

  try {
    const result = await askGemini({
      system: SYSTEM,
      contents: [{ role: 'user', parts: [{ text: task }] }],
    });
    return res.status(200).json({ correct: Boolean(result.correct), ...cleanFix(result) });
  } catch (error) {
    console.log('[check] Проверка не удалась:', error.message);
    return res.status(error.status || 500).json({ error: error.message });
  }
}
