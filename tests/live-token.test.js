// Тест запроса временного ключа для звонка
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenRequestBody, buildSetup } from '../api/_lib/live.js';

test('временный ключ: одно подключение, 30 минут жизни, минута на старт', () => {
  const now = Date.UTC(2026, 10, 25, 12, 0, 0);
  const body = tokenRequestBody(buildSetup({ model: 'gemini-3.8-live', system: 'SYS' }), now);
  assert.equal(body.uses, 1);
  assert.equal(body.expireTime, '2026-11-25T12:30:00.000Z');
  assert.equal(body.newSessionExpireTime, '2026-11-25T12:01:00.000Z');
});

test('вся настройка звонка зашита в ключ: настройку из браузера Google игнорирует', () => {
  const setup = buildSetup({ model: 'gemini-3.8-live', system: 'SYS', handle: 'H1' });
  const body = tokenRequestBody(setup);
  assert.deepEqual(body.bidiGenerateContentSetup, setup);
});
