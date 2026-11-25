// POST /api/voice-review — разбор звонка после его окончания.
// Находит ошибки ученика, запоминает факты о нём и частые ошибки для следующих звонков.
import { checkAuth } from './_lib/auth.js';
import { askGemini } from './_lib/gemini.js';
import { REVIEW_SYSTEM, trimTranscript, hasLearnerSpeech, transcriptText, normalizeReview } from './_lib/review.js';
import { loadMemory, saveMemory, mergeMemory } from './_lib/memory.js';

export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' });

  const turns = trimTranscript(req.body?.turns);
  // Ученик ничего не сказал — разбирать нечего, модель не тревожим
  if (!hasLearnerSpeech(turns)) return res.status(200).json({ fixes: [], summary: '' });

  let review;
  try {
    const raw = await askGemini({
      system: REVIEW_SYSTEM,
      contents: [{ role: 'user', parts: [{ text: transcriptText(turns) }] }],
      smartFirst: true, // объяснения важнее скорости
    });
    review = normalizeReview(raw);
  } catch (error) {
    console.log('[voice-review] Разбор звонка не удался:', error.message);
    return res.status(error.status || 500).json({ error: error.message });
  }

  // Память — не главное: если база не ответила, разбор всё равно отдаём
  try {
    await saveMemory(mergeMemory(await loadMemory(), review, Date.now()));
  } catch (error) {
    console.log('[voice-review] Не удалось обновить память:', error.message);
  }

  return res.status(200).json({ fixes: review.fixes, summary: review.summary });
}
