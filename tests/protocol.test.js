// Тесты разбора сообщений Gemini Live
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage, handleFrom, describeClose } from '../js/call/protocol.js';

test('аудио и текст из одного сообщения', () => {
  const ev = parseMessage({ serverContent: {
    modelTurn: { parts: [{ inlineData: { data: 'AAA', mimeType: 'audio/pcm;rate=24000' } }] },
    outputTranscription: { text: 'Hi' },
  } });
  assert.deepEqual(ev, [{ type: 'audio', data: 'AAA' }, { type: 'said', text: 'Hi' }]);
});

test('речь ученика', () => {
  assert.deepEqual(parseMessage({ serverContent: { inputTranscription: { text: 'I go' } } }), [{ type: 'heard', text: 'I go' }]);
});

test('перебивание и конец хода', () => {
  assert.deepEqual(parseMessage({ serverContent: { interrupted: true } }), [{ type: 'interrupted' }]);
  assert.deepEqual(parseMessage({ serverContent: { turnComplete: true } }), [{ type: 'turnEnd' }]);
});

test('setupComplete, goAway, handle, end_call', () => {
  assert.deepEqual(parseMessage({ setupComplete: {} }), [{ type: 'ready' }]);
  assert.deepEqual(parseMessage({ goAway: { timeLeft: '5s' } }), [{ type: 'goAway' }]);
  assert.deepEqual(parseMessage({ sessionResumptionUpdate: { newHandle: 'H', resumable: true } }),
    [{ type: 'handle', update: { newHandle: 'H', resumable: true } }]);
  assert.deepEqual(parseMessage({ toolCall: { functionCalls: [{ id: '1', name: 'end_call', args: {} }] } }),
    [{ type: 'endCall', id: '1' }]);
});

test('незнакомое сообщение — без событий', () => {
  assert.deepEqual(parseMessage({ usageMetadata: {} }), []);
});

test('handleFrom не берёт неприменимый handle', () => {
  assert.equal(handleFrom({ newHandle: 'B', resumable: false }, 'A'), 'A');
  assert.equal(handleFrom({ newHandle: 'B' }, 'A'), 'B');
  assert.equal(handleFrom({ newHandle: '' }, null), null);
});

test('describeClose', () => {
  assert.equal(describeClose(1000, ''), null);
  assert.match(describeClose(1011, 'RESOURCE_EXHAUSTED: quota'), /лимит/);
  assert.match(describeClose(1008, 'Quota exceeded'), /лимит/);
  assert.match(describeClose(1006, ''), /Переподключаюсь/);
});
