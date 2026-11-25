// Тест запроса временного ключа для звонка
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenRequestBody } from '../api/_lib/live.js';

test('временный ключ: одно подключение, 30 минут жизни, минута на старт, только наша модель', () => {
  const now = Date.UTC(2026, 10, 25, 12, 0, 0);
  const body = tokenRequestBody('gemini-3.8-live', now);
  assert.equal(body.uses, 1);
  assert.equal(body.expireTime, '2026-11-25T12:30:00.000Z');
  assert.equal(body.newSessionExpireTime, '2026-11-25T12:01:00.000Z');
  assert.equal(body.liveConnectConstraints.model, 'models/gemini-3.8-live');
});
