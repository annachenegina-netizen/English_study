// Тесты памяти репетитора: слияние итогов звонка с тем, что уже запомнено
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyMemory, mergeMemory } from '../api/_lib/memory.js';

const review = (extra) => ({ fixes: [], facts: [], summary: '', ...extra });

test('ошибки копятся по темам', () => {
  let m = emptyMemory();
  m = mergeMemory(m, review({ fixes: [{ topic: 'ps', said: 'She work', corrected: 'She works' }] }), 10);
  m = mergeMemory(m, review({ fixes: [{ topic: 'ps', said: 'He like', corrected: 'He likes' }] }), 20);
  assert.deepEqual(m.mistakes.ps, { count: 2, example: 'He like → He likes', last: 20 });
});

test('тема other и пустой corrected в память не идут', () => {
  const m = mergeMemory(emptyMemory(), review({
    fixes: [{ topic: 'other', said: 'a', corrected: 'b' }, { topic: 'ps', said: 'a', corrected: '' }],
  }), 1);
  assert.deepEqual(m.mistakes, {});
});

test('факты без повторов без учёта регистра, не больше 30, вытесняются старые', () => {
  const many = Array.from({ length: 32 }, (_, i) => `fact ${i}`);
  let m = mergeMemory(emptyMemory(), review({ facts: many }), 1);
  assert.equal(m.facts.length, 30);
  assert.equal(m.facts[0], 'fact 2');
  m = mergeMemory(emptyMemory(), review({ facts: ['Lives in Gyumri'] }), 1);
  m = mergeMemory(m, review({ facts: ['lives in gyumri '] }), 2);
  assert.deepEqual(m.facts, ['Lives in Gyumri']);
});

test('резюме — не больше 5, пустое не добавляется', () => {
  let m = emptyMemory();
  for (let i = 1; i <= 7; i++) m = mergeMemory(m, review({ summary: `talk ${i}` }), i);
  m = mergeMemory(m, review({ summary: '  ' }), 8);
  assert.equal(m.summaries.length, 5);
  assert.deepEqual(m.summaries.at(-1), { at: 7, text: 'talk 7' });
});

test('mergeMemory не меняет исходный объект', () => {
  const m = emptyMemory();
  const before = JSON.stringify(m);
  mergeMemory(m, review({ fixes: [{ topic: 'ps', said: 'a', corrected: 'b' }], facts: ['x'], summary: 's' }), 1);
  assert.equal(JSON.stringify(m), before);
});
