// Тесты инструкции репетитора и настройки Live-сессии
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTutorPrompt, buildSetup } from '../api/_lib/live.js';

const memory = {
  mistakes: {
    ps: { count: 5, example: 'She work → She works', last: 1 },
    be: { count: 1, example: 'I happy → I am happy', last: 1 },
    to_verb: { count: 3, example: 'I want eat → I want to eat', last: 1 },
  },
  facts: ['Works as a CRM marketer'],
  summaries: [1, 2, 3, 4].map((n) => ({ at: n, text: `talk ${n}` })),
};

test('инструкция содержит уровень, темы, слова, факты', () => {
  const p = buildTutorPrompt({ level: 2, maxLevel: 6, topics: ['to be'], words: ['want'], memory });
  for (const s of ['2 of 6', 'to be', 'want', 'Works as a CRM marketer', 'end_call']) assert.ok(p.includes(s), s);
});

test('частые ошибки идут по убыванию, резюме — три последних', () => {
  const p = buildTutorPrompt({ level: 1, maxLevel: 6, topics: [], words: [], memory });
  assert.ok(p.indexOf('She work') < p.indexOf('I want eat'));
  assert.ok(!p.includes('talk 1') && p.includes('talk 4'));
});

test('пустая память не ломает инструкцию', () => {
  const p = buildTutorPrompt({ level: 1, maxLevel: 6, topics: [], words: [], memory: { mistakes: {}, facts: [], summaries: [] } });
  assert.ok(p.length > 200);
});

test('настройка сессии', () => {
  const s = buildSetup({ model: 'gemini-3.8-live', system: 'SYS', handle: 'H1' });
  assert.equal(s.model, 'models/gemini-3.8-live');
  assert.deepEqual(s.generationConfig.responseModalities, ['AUDIO']);
  assert.equal(s.systemInstruction.parts[0].text, 'SYS');
  assert.equal(s.sessionResumption.handle, 'H1');
  assert.deepEqual(s.contextWindowCompression, { slidingWindow: {} });
  assert.equal(s.realtimeInputConfig.automaticActivityDetection.endOfSpeechSensitivity, 'END_SENSITIVITY_LOW');
  assert.equal(s.realtimeInputConfig.automaticActivityDetection.silenceDurationMs, 1200);
  assert.equal(s.inputAudioTranscription.mode, 'VERBATIM');
  assert.ok(s.outputAudioTranscription);
  assert.equal(s.tools[0].functionDeclarations[0].name, 'end_call');
  assert.deepEqual(buildSetup({ model: 'm', system: '' }).sessionResumption, {});
});
