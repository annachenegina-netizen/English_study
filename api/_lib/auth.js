// Проверка пароля. Браузер присылает не сам пароль, а его sha256-хеш
// в заголовке Authorization. Сравниваем с хешем пароля из настроек Vercel.
import { createHash, timingSafeEqual } from 'node:crypto';

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// Возвращает true, если пароль верный. Иначе сама отправляет ответ с ошибкой.
export function checkAuth(req, res) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    console.log('[auth] В настройках Vercel не задана переменная APP_PASSWORD');
    res.status(500).json({ error: 'На сервере не задан APP_PASSWORD' });
    return false;
  }

  const header = req.headers.authorization || '';
  const got = header.replace(/^Bearer\s+/i, '');
  // Хешируем ещё раз обе стороны, чтобы строки были одной длины для timingSafeEqual
  const a = Buffer.from(sha256(sha256(password)));
  const b = Buffer.from(sha256(got));

  if (!timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Неверный пароль' });
    return false;
  }
  return true;
}
