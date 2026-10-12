// Хранилище прогресса: Upstash Redis через обычные HTTP-запросы (без библиотек).
// Vercel сам добавляет адрес и токен в переменные, когда подключаешь базу.
// Ищем переменную по окончанию имени: Vercel может добавить к имени свою приставку
function findEnv(...endings) {
  for (const ending of endings) {
    const name = Object.keys(process.env).find((key) => key.endsWith(ending));
    if (name && process.env[name]) return process.env[name];
  }
  return '';
}

const url = findEnv('KV_REST_API_URL', 'REDIS_REST_URL');
// Именно KV_REST_API_TOKEN: есть ещё ..._READ_ONLY_TOKEN, он только для чтения и нам не подходит
const token = findEnv('KV_REST_API_TOKEN', 'REDIS_REST_TOKEN');

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
