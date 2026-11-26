// POST /api/voice-token — начало (или продолжение) звонка.
// Собирает инструкцию репетитору с учётом уровня и памяти и выдаёт временный ключ Google.
// Браузер с этим ключом сам подключается к Gemini Live: Vercel не умеет держать долгое соединение.
import { checkAuth } from './_lib/auth.js';
import { LIVE_MODEL, buildTutorPrompt, buildSetup, createLiveToken } from './_lib/live.js';
import { loadMemory } from './_lib/memory.js';

export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.log('[voice-token] В настройках Vercel не задана переменная GEMINI_API_KEY');
    return res.status(500).json({ error: 'На сервере не задан GEMINI_API_KEY' });
  }

  const body = req.body || {};
  // handle — ключ продолжения разговора после переподключения
  const handle = typeof body.handle === 'string' ? body.handle.slice(0, 2000) : '';

  try {
    const system = buildTutorPrompt({
      level: Number(body.level) || 1,
      maxLevel: Number(body.maxLevel) || 6,
      topics: (Array.isArray(body.topics) ? body.topics : []).slice(0, 20).map(String),
      words: (Array.isArray(body.words) ? body.words : []).slice(0, 40).map(String),
      memory: await loadMemory(),
      mode: body.mode === 'savage' ? 'savage' : 'normal', // «без башки» или обычный
    });
    const setup = buildSetup({ model: LIVE_MODEL, system, handle });
    // Настройка действует, только если зашита в сам ключ. Браузер всё равно отправит её первым
    // сообщением — этого требует протокол, — но Google возьмёт ту, что в ключе.
    const token = await createLiveToken(key, setup);
    return res.status(200).json({ token, setup });
  } catch (error) {
    console.log('[voice-token] Звонок не начался:', error.message);
    return res.status(error.status || 500).json({ error: error.message });
  }
}
