// GET  /api/progress — отдать сохранённый прогресс (заодно это проверка пароля при входе)
// PUT  /api/progress — сохранить прогресс
import { checkAuth } from './_lib/auth.js';
import { hasStore, getJson, setJson } from './_lib/store.js';

const KEY = 'english-trainer:progress';
const MAX_SIZE = 300_000; // защита от случайной записи чего-то огромного
// Номер версии сайта: Vercel сам кладёт сюда хеш коммита при каждом деплое
const VERSION = process.env.VERCEL_GIT_COMMIT_SHA || 'dev';

export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      const progress = hasStore ? await getJson(KEY) : null;
      return res.status(200).json({ progress, sync: hasStore, version: VERSION });
    }

    if (req.method === 'PUT') {
      const progress = req.body?.progress;
      if (!progress || typeof progress !== 'object') {
        return res.status(400).json({ error: 'Нет данных прогресса' });
      }
      if (JSON.stringify(progress).length > MAX_SIZE) {
        return res.status(413).json({ error: 'Прогресс слишком большой' });
      }
      if (hasStore) await setJson(KEY, progress);
      return res.status(200).json({ ok: true, sync: hasStore });
    }

    return res.status(405).json({ error: 'Метод не поддерживается' });
  } catch (error) {
    console.log('[progress] Сломалось при работе с базой:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
