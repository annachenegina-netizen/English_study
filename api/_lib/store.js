// Хранилище прогресса: Upstash Redis через обычные HTTP-запросы (без библиотек).
// Vercel сам добавляет адрес и токен в переменные, когда подключаешь базу.
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// Если базы нет — сервис всё равно работает, просто прогресс живёт только в браузере
export const hasStore = Boolean(url && token);

// Одна команда Redis, например ['GET', 'progress']
async function command(args) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    console.log('[store] Redis ответил ошибкой:', response.status, data.error);
    throw new Error('Не удалось обратиться к базе');
  }
  return data.result;
}

export async function getJson(key) {
  const raw = await command(['GET', key]);
  return raw ? JSON.parse(raw) : null;
}

export async function setJson(key, value) {
  await command(['SET', key, JSON.stringify(value)]);
}
