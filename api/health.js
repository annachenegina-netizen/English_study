// GET /api/health — диагностика: спрашивает каждую модель Gemini и показывает,
// кто ответил, за сколько и с какой ошибкой. Нужна, чтобы не гадать, почему «висит».
import { checkAuth } from './_lib/auth.js';
import { modelList } from './_lib/gemini.js';
import { hasStore } from './_lib/store.js';

const TIMEOUT = 15000;

async function ping(model, key) {
  const started = Date.now();
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Reply with JSON: {"ok": true}' }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 200 },
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const raw = await response.text();
    let message = '';
    try { message = JSON.parse(raw).error?.message || ''; } catch { /* тело не JSON — не страшно */ }
    return { model, ok: response.ok, status: response.status, ms: Date.now() - started, message };
  } catch (error) {
    const timedOut = error.name === 'TimeoutError';
    return {
      model,
      ok: false,
      status: timedOut ? 'таймаут' : 'нет связи',
      ms: Date.now() - started,
      message: timedOut ? `Молчит дольше ${TIMEOUT / 1000} секунд` : error.message,
    };
  }
}

export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'На сервере не задан GEMINI_API_KEY' });

  // Все модели спрашиваем одновременно, чтобы не ждать их по очереди
  const models = await Promise.all(modelList().map((model) => ping(model, key)));
  return res.status(200).json({ models, sync: hasStore });
}
