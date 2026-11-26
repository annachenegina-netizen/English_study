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

test('каждую ошибку разбирает вслух по-русски, а не поправляет незаметно', () => {
  const p = buildTutorPrompt({ level: 1, maxLevel: 6, topics: [], words: [], memory: { mistakes: {}, facts: [], summaries: [] } });
  assert.ok(p.includes('EVERY real mistake'));
  assert.ok(p.includes('Ты сказал'));
  assert.ok(!p.includes('do NOT stop'));
});

test('строгий репетитор: предлоги, a/the, обрывки фраз — без «только если уверен на 100%»', () => {
  const p = buildTutorPrompt({ level: 1, maxLevel: 6, topics: [], words: [], memory: { mistakes: {}, facts: [], summaries: [] } });
  for (const s of ['prepositions', 'articles', 'unfinished']) assert.ok(p.includes(s), s);
  assert.ok(!p.includes('100% sure'));
});

test('режим «без башки»: хамит и матерится, но объяснение остаётся; обычный режим — без этого', () => {
  const empty = { mistakes: {}, facts: [], summaries: [] };
  const savage = buildTutorPrompt({ level: 1, maxLevel: 6, topics: [], words: [], memory: empty, mode: 'savage' });
  const normal = buildTutorPrompt({ level: 1, maxLevel: 6, topics: [], words: [], memory: empty });
  assert.ok(savage.includes('SAVAGE MODE'));
  assert.ok(savage.includes('still give the correct version'));
  assert.ok(savage.includes('ни бе ни ме'), 'пример стёба от Влада');
  assert.ok(savage.includes('count'), 'считает одинаковые ошибки');
  assert.ok(savage.includes('хуеплёт'), 'расширенный словарь мата');
  assert.ok(savage.includes('NEVER repeat'), 'не повторяется');
  // Обороты из словаря pohuy (github.com/smixs/pohuy, MIT), переложенные на ошибки в английском
  for (const s of ['хуй ночевал', 'хуй проссышь', 'понеслась пизда по кочкам', 'хуенитив', 'smixs/pohuy']) assert.ok(savage.includes(s), s);
  assert.ok(!normal.includes('SAVAGE MODE'));
});

test('репетитор знает цель ученика — работа в американской компании; в «без башки» периодически стебётся над ней', () => {
  const empty = { mistakes: {}, facts: [], summaries: [] };
  const normal = buildTutorPrompt({ level: 1, maxLevel: 6, topics: [], words: [], memory: empty });
  const savage = buildTutorPrompt({ level: 1, maxLevel: 6, topics: [], words: [], memory: empty, mode: 'savage' });
  assert.ok(normal.includes('job in the USA'));
  assert.ok(savage.includes('job in the USA'));
  assert.ok(savage.includes('From time to time'), 'напоминает о цели периодически, а не в каждой фразе');
});

test('звонок без лимита: ИИ сам не прощается, end_call только по явной просьбе ученика', () => {
  const p = buildTutorPrompt({ level: 1, maxLevel: 6, topics: [], words: [], memory: { mistakes: {}, facts: [], summaries: [] } });
  assert.ok(p.includes('no time limit'));
  assert.ok(p.includes('NEVER say goodbye or call end_call on your own'));
});

test('по-русски только поправка, разговор и вопросы — по-английски', () => {
  for (const mode of ['normal', 'savage']) {
    const p = buildTutorPrompt({ level: 1, maxLevel: 6, topics: [], words: [], memory: { mistakes: {}, facts: [], summaries: [] }, mode });
    assert.ok(p.includes('Russian is ONLY for'), mode);
    assert.ok(p.includes('end EVERY reply with a question in English'), mode);
  }
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
  // Влад говорит по-английски и по-русски — без подсказки «Что?» распознавалось как испанское «¿Qué?»
  assert.deepEqual(s.inputAudioTranscription.languageCodes, ['en-US', 'ru-RU']);
  assert.ok(s.outputAudioTranscription);
  assert.equal(s.tools[0].functionDeclarations[0].name, 'end_call');
  assert.deepEqual(buildSetup({ model: 'm', system: '' }).sessionResumption, {});
});
