// Тесты сохранения звонков в прогрессе
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Прогресс пытается отправиться на сервер — отвечаем «ок», чтобы не шуметь
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });

const { state, addCall, updateCall, setCallMode } = await import('../js/store.js');

test('характер репетитора запоминается в прогрессе', () => {
  setCallMode('savage');
  assert.equal(state.progress.callMode, 'savage');
  setCallMode('normal');
  assert.equal(state.progress.callMode, 'normal');
});

test('звонок сохраняется сразу после окончания, ещё до разбора', () => {
  state.progress.calls = [];
  addCall({ at: 1, turns: [{ role: 'user', text: 'I go' }], fixes: [], summary: '', reviewed: false });
  assert.equal(state.progress.calls.length, 1);
  assert.equal(state.progress.calls[0].reviewed, false);
});

test('после разбора звонок дополняется итогами, текст разговора остаётся', () => {
  state.progress.calls = [];
  addCall({ at: 2, turns: [{ role: 'user', text: 'I go' }], fixes: [], summary: '', reviewed: false });
  updateCall(2, { fixes: [{ said: 'I go', corrected: 'I went' }], summary: 'Talked', reviewed: true });
  const [call] = state.progress.calls;
  assert.equal(call.summary, 'Talked');
  assert.equal(call.reviewed, true);
  assert.equal(call.turns[0].text, 'I go');
});

test('хранятся только последние 5 звонков', () => {
  state.progress.calls = [];
  for (let i = 1; i <= 7; i++) addCall({ at: i, turns: [], fixes: [], summary: '' });
  assert.deepEqual(state.progress.calls.map((call) => call.at), [3, 4, 5, 6, 7]);
});
