// Тесты разбора звонка
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trimTranscript, normalizeReview, hasLearnerSpeech } from '../api/_lib/review.js';

test('trimTranscript оставляет хвост в пределах лимита', () => {
  const turns = Array.from({ length: 100 }, (_, i) => ({ role: 'user', text: `phrase ${i} `.repeat(20) }));
  const out = trimTranscript(turns, 2000);
  assert.ok(out.map((t) => t.text).join('').length <= 2000);
  assert.equal(out.at(-1).text, turns.at(-1).text.slice(0, 600));
});

test('trimTranscript пропускает мусор', () => {
  const out = trimTranscript([{ role: 'user', text: 'hi' }, null, { role: 'x', text: 'a' }, { role: 'ai', text: 5 }]);
  assert.deepEqual(out, [{ role: 'user', text: 'hi' }, { role: 'ai', text: '5' }]);
});

test('normalizeReview чистит мусор', () => {
  const r = normalizeReview({
    fixes: [{ said: 'I go', corrected: '' }, { said: 'She work', corrected: 'She works', topic: 'ps', why: 'x' }],
    facts: ['a'], summary: 's',
  });
  assert.equal(r.fixes.length, 1);
  assert.equal(r.fixes[0].said, 'She work');
  assert.equal(r.fixes[0].topic, 'ps');
  assert.deepEqual(r.facts, ['a']);
});

test('normalizeReview ограничивает количество', () => {
  const r = normalizeReview({
    fixes: Array.from({ length: 20 }, () => ({ said: 'a', corrected: 'b' })),
    facts: Array.from({ length: 20 }, (_, i) => `f${i}`),
  });
  assert.equal(r.fixes.length, 15);
  assert.equal(r.facts.length, 10);
});

test('normalizeReview переживает пустой ответ', () => {
  assert.deepEqual(normalizeReview({}), { fixes: [], facts: [], summary: '' });
});

test('звонок без реплик ученика не разбирается', () => {
  assert.equal(hasLearnerSpeech([{ role: 'ai', text: 'Hi' }]), false);
  assert.equal(hasLearnerSpeech([{ role: 'user', text: 'Hi' }]), true);
});
