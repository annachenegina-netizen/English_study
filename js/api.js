// Запросы к нашему серверу (/api/...). К каждому прикладываем хеш пароля.
const TOKEN_KEY = 'et_token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* приватный режим — живём без сохранения */ }
}

// Превращает пароль в sha256-хеш, чтобы не хранить и не слать его в открытом виде
export async function hashPassword(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function api(path, { method = 'GET', body, token } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token ?? getToken()}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Нет связи с сервером. Проверь интернет.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Ошибка сервера ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}
