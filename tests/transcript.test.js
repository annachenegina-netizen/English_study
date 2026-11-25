// Тесты сборки текста разговора из кусков распознанной речи
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPiece, closeTurns, plainTurns } from '../js/call/transcript.js';

test('куски одной реплики склеиваются', () => {
  let t = addPiece([], 'user', 'I go');
  t = addPiece(t, 'user', ' to shop');
  assert.deepEqual(plainTurns(t), [{ role: 'user', text: 'I go to shop' }]);
});

test('кусок без пробела в начале отделяется пробелом', () => {
  let t = addPiece([], 'ai', 'Hello.');
  t = addPiece(t, 'ai', 'How are you?');
  assert.equal(plainTurns(t)[0].text, 'Hello. How are you?');
});

test('смена роли — новая реплика', () => {
  let t = addPiece([], 'ai', 'Hi');
  t = addPiece(t, 'user', 'Hello');
  assert.deepEqual(t.map((turn) => turn.role), ['ai', 'user']);
});

test('после closeTurns та же роль начинает новую реплику', () => {
  let t = addPiece([], 'ai', 'Hi');
  t = closeTurns(t);
  t = addPiece(t, 'ai', 'Next');
  assert.equal(t.length, 2);
});

test('plainTurns выкидывает пустые реплики', () => {
  let t = addPiece([], 'user', '   ');
  t = closeTurns(t);
  t = addPiece(t, 'ai', ' Hi ');
  assert.deepEqual(plainTurns(t), [{ role: 'ai', text: 'Hi' }]);
});

test('addPiece не меняет исходный массив', () => {
  const t = addPiece([], 'user', 'a');
  addPiece(t, 'user', 'b');
  assert.equal(t[0].text, 'a');
});
