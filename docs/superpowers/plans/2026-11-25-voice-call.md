# Голосовой звонок с репетитором — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Раздел «Звонок»: голосовой разговор с ИИ-репетитором через Gemini Live, исправления на лету, разбор ошибок после звонка и память между звонками.

**Architecture:** Vercel-функция `/api/voice-token` собирает инструкцию репетитора (уровень + память из Upstash) и выдаёт временный ключ Google. Браузер сам открывает WebSocket к Gemini Live, шлёт микрофон 16 кГц PCM и играет ответ 24 кГц. После звонка `/api/voice-review` через существующий `askGemini` разбирает ошибки и обновляет память.

**Tech Stack:** статика без сборки (ES-модули), Vercel Functions (Node ≥ 20, встроенный `fetch`), Gemini Live API v1beta (raw WebSocket), Web Audio (`AudioWorklet`), Upstash Redis (REST), тесты — `node --test` без зависимостей.

**Spec:** `docs/superpowers/specs/2026-11-25-voice-call-design.md`

## Global Constraints

- Без библиотек и сборки; `package.json` получает только `"scripts": { "test": "node --test tests/" }`.
- Комментарии в коде — на русском; ошибки — `console.log('[модуль] понятное описание:', ...)`.
- Тексты для Влада — по-русски, без технических терминов.
- Модель: `process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live'`. Основной ключ `GEMINI_API_KEY` никогда не уходит в браузер.
- Временный ключ: `POST https://generativelanguage.googleapis.com/v1beta/auth_tokens`, `uses: 1`, `expireTime` = сейчас + 30 мин, `newSessionExpireTime` = сейчас + 1 мин.
- WebSocket: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=<token>`.
- Микрофон → `audio/pcm;rate=16000`, кусками ~100 мс; голос ИИ — PCM16 24000 Гц.
- Паузы: `END_SENSITIVITY_LOW`, `silenceDurationMs: 1200` (стартовые значения, подбираются в задаче 9).
- Ключ памяти в Upstash: `english-trainer:voice-memory`. Факты ≤ 30, резюме ≤ 5, в инструкцию — топ-5 тем ошибок, все факты, 3 последних резюме.
- В прогрессе хранятся итоги последних 5 звонков: `progress.calls`.
- Работа на ветке `voice-call`; коммиты под локальным `user.email` репозитория (уже `annachenegina@gmail.com`, проверить `git config user.email`). Пуш и деплой — только с разрешения Влада.

**Отступление от спека (решение при планировании):** во временном ключе зашивается только модель, а полная настройка сессии (`setup`) строится на сервере и отдаётся браузеру вместе с ключом. Иначе переподключение с `sessionResumption.handle` упирается в непроверенную механику `fieldMask`. Риск минимален: ключ одноразовый, живёт 30 минут, выдаётся только после пароля.

## Review Focus

1. **Эхо через динамик** — ИИ слышит свой же голос и перебивает сам себя. Ожидается: с `echoCancellation: true` звонок идёт без самоперебиваний. Проверка — чек-лист задачи 9.
2. **Новичок делает паузу посреди фразы** — ИИ не должен влезать через секунду. Проверка — чек-лист задачи 9 (подбор `silenceDurationMs`).
3. **Кончился бесплатный лимит / обрыв посреди звонка** — понятное сообщение по-русски, уже сказанное не теряется и его можно разобрать. Тест `describeClose` (задача 5) + шаг UI в задаче 8.
4. **Safari свернули или экран потух** — при возврате разговор продолжается с того же места. Тест `handleFrom` (задача 5) + чек-лист задачи 9.
5. **Звонок без единой фразы Влада или очень длинный звонок** — разбор не вызывает модель впустую и не падает на размере. Тесты `trimTranscript` и пустого разбора (задача 7).

---

### Task 1: Инструкция репетитора и настройка сессии

**Files:**
- Create: `api/_lib/live.js`
- Create: `tests/live.test.js`
- Modify: `package.json` (добавить `scripts.test`)

**Interfaces:**
- Consumes: `TEACHER_STYLE` из `api/_lib/gemini.js`.
- Produces:
  - `LIVE_MODEL: string`, `VOICE: string` (константа, стартовое значение `'Kore'`).
  - `buildTutorPrompt({ level, maxLevel, topics: string[], words: string[], memory: Memory }) -> string`
  - `buildSetup({ model, system, handle?: string }) -> object` — значение для `{ setup: ... }`.
  - Тип `Memory` = `{ mistakes: { [topic]: { count, example, last } }, facts: string[], summaries: { at, text }[] }` (определяется в задаче 2, здесь только читается).

- [ ] **Step 1: Создать ветку** — `git switch -c voice-call`; закоммитить спек и этот план: `git add docs && git commit -m "Дизайн и план голосового звонка"`.

- [ ] **Step 2: Написать падающие тесты** в `tests/live.test.js`:

```js
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
  assert.ok(s.inputAudioTranscription && s.outputAudioTranscription);
  assert.equal(s.tools[0].functionDeclarations[0].name, 'end_call');
  assert.deepEqual(buildSetup({ model: 'm', system: '' }).sessionResumption, {});
});
```

- [ ] **Step 3: Запустить** `npm test` — Expected: FAIL, `Cannot find module '../api/_lib/live.js'`.

- [ ] **Step 4: Реализовать `api/_lib/live.js`.**
  - `buildTutorPrompt` — по-английски, правила из раздела спека «Инструкция репетитору» дословно по смыслу (медленно, только пройденное, начинает сам, «смесь» исправлений, русский при «не понял», не торопить, `end_call` при прощании, не исправлять без 100% уверенности и не трогать понятное произношение) + `TEACHER_STYLE` для объяснений по-русски. Ошибки — топ-5 по `count` как `"{topic}: {example}"`, резюме — 3 последних по `at`.
  - `buildSetup` — `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName = VOICE` и `responseModalities` внутри `generationConfig`; `inputAudioTranscription: {}` и `outputAudioTranscription: {}` (дословный режим добавляется в задаче 3, если смок-тест подтвердит имя поля); `tools: [{ functionDeclarations: [{ name: 'end_call', description: 'Call after saying goodbye when the learner wants to finish.' }] }]`.

- [ ] **Step 5: Запустить** `npm test` — Expected: PASS.

- [ ] **Step 6: Commit** — `git add api/_lib/live.js tests/live.test.js package.json && git commit -m "Инструкция репетитора и настройка Live-сессии"`.

---

### Task 2: Память между звонками

**Files:**
- Create: `api/_lib/memory.js`
- Create: `tests/memory.test.js`

**Interfaces:**
- Consumes: `hasStore`, `getJson`, `setJson` из `api/_lib/store.js`.
- Produces:
  - `MEMORY_KEY = 'english-trainer:voice-memory'`
  - `emptyMemory() -> Memory`
  - `mergeMemory(memory: Memory, review: { fixes: Fix[], facts: string[], summary: string }, now: number) -> Memory` (чистая, не мутирует вход)
  - `loadMemory() -> Promise<Memory>` (нет базы или ошибка → `emptyMemory()` + `console.log`)
  - `saveMemory(memory) -> Promise<void>` (нет базы → ничего не делает)
  - `Fix` = результат `cleanFix` + `said: string`.

- [ ] **Step 1: Написать падающие тесты:**

```js
test('ошибки копятся по темам', () => {
  let m = emptyMemory();
  m = mergeMemory(m, { fixes: [{ topic: 'ps', said: 'She work', corrected: 'She works' }], facts: [], summary: '' }, 10);
  m = mergeMemory(m, { fixes: [{ topic: 'ps', said: 'He like', corrected: 'He likes' }], facts: [], summary: '' }, 20);
  assert.deepEqual(m.mistakes.ps, { count: 2, example: 'He like → He likes', last: 20 });
});
test('тема other и пустой corrected в память не идут', ...);      // mistakes остаётся {}
test('факты без повторов без учёта регистра, не больше 30, вытесняются старые', ...); // 32 факта → length 30, первые два ушли; 'lives in Gyumri' при наличии 'Lives in Gyumri' не добавляется
test('резюме — не больше 5, пустое не добавляется', ...);
test('mergeMemory не меняет исходный объект', ...);
```

- [ ] **Step 2: Запустить** `npm test` — Expected: FAIL (модуль не найден).
- [ ] **Step 3: Реализовать `api/_lib/memory.js`** по интерфейсу выше.
- [ ] **Step 4: Запустить** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Память репетитора: ошибки, факты, резюме"`.

---

### Task 3: `/api/voice-token` и смок-тест Live на реальном ключе

Проверяет пункты 1, 2, 6, 7 из раздела спека «Что проверить первым».

**Files:**
- Create: `api/voice-token.js`
- Create: `scripts/live-smoke.mjs` (служебный, не часть сайта)
- Modify: `api/_lib/live.js` (уточнения по результатам смок-теста)
- Modify: `.env.example` (строка `GEMINI_LIVE_MODEL=` с комментарием)

**Interfaces:**
- Consumes: `checkAuth`; `buildTutorPrompt`, `buildSetup`, `LIVE_MODEL` (задача 1); `loadMemory` (задача 2).
- Produces:
  - `createLiveToken(key: string, model: string) -> Promise<string>` в `api/_lib/live.js` — возвращает `name` из ответа Google; ошибки Google → `GeminiError` с русским текстом (429 → «Бесплатный лимит Google на сегодня исчерпан…»).
  - `POST /api/voice-token`, тело `{ level, maxLevel, topics, words, handle? }` → `200 { token, setup }`. Входные массивы режутся как в `api/chat.js` (topics ≤ 20, words ≤ 40).

- [ ] **Step 1: Реализовать `createLiveToken` и хендлер.** Тело запроса к Google: `{ uses: 1, expireTime, newSessionExpireTime, liveConnectConstraints: { model: 'models/<model>' } }`. Если Google ответит 400 на `liveConnectConstraints` — повторить с `bidiGenerateContentSetup: { model }`; оставить в коде тот вариант, что сработал, с комментарием.
- [ ] **Step 2: Написать `scripts/live-smoke.mjs`:** читает `GEMINI_API_KEY` из окружения → `createLiveToken` → `new WebSocket(url)` (глобальный в Node ≥ 22) → шлёт `{ setup: buildSetup(...) }` → ждёт `setupComplete` → шлёт `{ realtimeInput: { text: 'Start the call' } }` → печатает: пришло ли аудио (`inlineData`, `mimeType`), текст `outputTranscription`, `sessionResumptionUpdate.newHandle` → шлёт `{ realtimeInput: { text: 'Bye, I have to go' } }` → печатает, пришёл ли `toolCall` с `end_call` → закрывается. Ошибка закрытия — печатает `code` и `reason`.
- [ ] **Step 3: Запустить** `node --env-file=.env scripts/live-smoke.mjs` (ключ в `.env` кладёт Влад — попросить, если его нет).
  Expected: `setupComplete`, аудио `audio/pcm;rate=24000`, английский текст приветствия, непустой handle, `toolCall end_call`.
  Если `setup` отвергнут (закрытие 1007/1008 с текстом про поле) — перенести `responseModalities`/`speechConfig` из `generationConfig` в корень `setup` и повторить; поправить тест задачи 1 под рабочий вариант. Проверить поле дословной транскрипции (`inputAudioTranscription: { mode: 'VERBATIM' }`): принято — оставить в `buildSetup` и в тесте.
- [ ] **Step 4: Запустить** `npm test` — Expected: PASS.
- [ ] **Step 5: Записать результаты** (какие варианты полей сработали, лимиты модели из AI Studio, если Влад их сообщит) комментарием в начале `api/_lib/live.js`.
- [ ] **Step 6: Commit** — `git commit -m "Временный ключ Live и смок-тест на реальном ключе"`.

---

### Task 4: Звук: микрофон в PCM16 и воспроизведение

**Files:**
- Create: `js/call/pcm.js` (чистые функции, работают и в Node)
- Create: `js/call/mic-worklet.js` (AudioWorkletProcessor)
- Create: `js/call/audio.js` (микрофон и плеер, только браузер)
- Create: `tests/pcm.test.js`

**Interfaces:**
- Produces:
  - `downsample(input: Float32Array, fromRate: number, toRate: number) -> Float32Array` (усреднение по окну; `fromRate === toRate` → та же длина)
  - `floatToPcm16(input: Float32Array) -> Int16Array` (обрезка в [-1, 1], `-1 → -32768`, `1 → 32767`)
  - `pcm16ToFloat(input: Int16Array) -> Float32Array`
  - `int16ToBase64(Int16Array) -> string`, `base64ToInt16(string) -> Int16Array` (little-endian)
  - `startMic(context: AudioContext, onChunk: (base64: string) => void) -> Promise<{ stop(): void }>` — `getUserMedia` с `echoCancellation/noiseSuppression/autoGainControl: true`, worklet копит ~100 мс и шлёт `Float32Array`, дальше `downsample(…, context.sampleRate, 16000)` → PCM16 → base64.
  - `createPlayer(context: AudioContext) -> { play(base64: string): void, flush(): void, idle(): Promise<void> }` — буферы 24000 Гц планируются встык через `nextTime = max(nextTime, context.currentTime)`; `flush` останавливает все запланированные источники; `idle` резолвится, когда очередь доиграла.

- [ ] **Step 1: Написать падающие тесты** `tests/pcm.test.js`:

```js
test('48к → 16к: длина втрое меньше', () => assert.equal(downsample(new Float32Array(4800), 48000, 16000).length, 1600));
test('та же частота — без изменений', () => assert.equal(downsample(new Float32Array(10), 16000, 16000).length, 10));
test('PCM16 крайние значения и обрезка', () => assert.deepEqual([...floatToPcm16(new Float32Array([-1, 0, 1, 2]))], [-32768, 0, 32767, 32767]));
test('base64 туда-обратно', () => { const a = new Int16Array([1, -2, 32767, -32768]); assert.deepEqual([...base64ToInt16(int16ToBase64(a))], [...a]); });
test('PCM16 → float в пределах [-1, 1]', () => { const f = pcm16ToFloat(new Int16Array([-32768, 32767])); assert.ok(f[0] >= -1 && f[1] <= 1); });
```

- [ ] **Step 2: Запустить** `npm test` — Expected: FAIL.
- [ ] **Step 3: Реализовать `js/call/pcm.js`** (через `btoa`/`atob` и `Uint8Array` поверх буфера Int16Array — в Node ≥ 20 они глобальные).
- [ ] **Step 4: Запустить** `npm test` — Expected: PASS.
- [ ] **Step 5: Реализовать `mic-worklet.js` и `audio.js`** по интерфейсу. Проверка — в задаче 8.
- [ ] **Step 6: Commit** — `git commit -m "Звук для звонка: PCM16, микрофон, плеер"`.

---

### Task 5: Соединение с Gemini Live

**Files:**
- Create: `js/call/protocol.js` (чистые функции)
- Create: `js/call/live.js` (WebSocket, только браузер)
- Create: `tests/protocol.test.js`

**Interfaces:**
- Consumes: `api()` из `js/api.js`; `POST /api/voice-token` (задача 3).
- Produces:
  - `parseMessage(msg: object) -> Event[]`, где `Event` — один из:
    `{ type: 'ready' }`, `{ type: 'audio', data }`, `{ type: 'heard', text }` (inputTranscription), `{ type: 'said', text }` (outputTranscription), `{ type: 'interrupted' }`, `{ type: 'turnEnd' }`, `{ type: 'handle', handle }`, `{ type: 'goAway' }`, `{ type: 'endCall', id }`.
  - `handleFrom(update: { newHandle?, resumable? }, current: string | null) -> string | null` — новый handle только если `resumable !== false` и `newHandle` непустой.
  - `describeClose(code: number, reason: string) -> string | null` — `null` для штатного 1000; `reason` с `quota`/`RESOURCE_EXHAUSTED`/код 429 → «Бесплатный лимит Google на сегодня исчерпан. Попробуй позже.»; прочее → «Связь прервалась. Переподключаюсь…».
  - `class LiveCall` в `live.js`: `constructor({ knowledge, onEvent, onStatus })`, `start(): Promise<void>`, `sendAudio(base64)`, `pause()`, `resume(): Promise<void>`, `stop()`. Внутри: при каждом подключении — новый ключ через `/api/voice-token` с последним `handle`; `goAway` или неожиданный обрыв → переподключение с handle (не более 3 попыток подряд, потом `onStatus({ error })`); на `endCall` — ответить `toolResponse` и передать событие наверх; сообщения WebSocket могут прийти `Blob` — читать через `await data.text()`.

- [ ] **Step 1: Написать падающие тесты** `tests/protocol.test.js`:

```js
test('аудио и текст из одного сообщения', () => {
  const ev = parseMessage({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAA', mimeType: 'audio/pcm;rate=24000' } }] }, outputTranscription: { text: 'Hi' } } });
  assert.deepEqual(ev, [{ type: 'audio', data: 'AAA' }, { type: 'said', text: 'Hi' }]);
});
test('перебивание и конец хода', ...);           // { serverContent: { interrupted: true } } → [{type:'interrupted'}]; turnComplete → turnEnd
test('setupComplete, goAway, handle, end_call', ...); // toolCall.functionCalls[{id:'1',name:'end_call'}] → {type:'endCall', id:'1'}
test('handleFrom не берёт неприменимый handle', () => {
  assert.equal(handleFrom({ newHandle: 'B', resumable: false }, 'A'), 'A');
  assert.equal(handleFrom({ newHandle: 'B' }, 'A'), 'B');
  assert.equal(handleFrom({ newHandle: '' }, null), null);
});
test('describeClose', () => {
  assert.equal(describeClose(1000, ''), null);
  assert.match(describeClose(1011, 'RESOURCE_EXHAUSTED: quota'), /лимит/);
  assert.match(describeClose(1006, ''), /Переподключаюсь/);
});
```

- [ ] **Step 2: Запустить** `npm test` — Expected: FAIL.
- [ ] **Step 3: Реализовать `js/call/protocol.js`.**
- [ ] **Step 4: Запустить** `npm test` — Expected: PASS.
- [ ] **Step 5: Реализовать `js/call/live.js`** по интерфейсу.
- [ ] **Step 6: Commit** — `git commit -m "Соединение с Gemini Live с переподключением"`.

---

### Task 6: Текст разговора

**Files:**
- Create: `js/call/transcript.js`
- Create: `tests/transcript.test.js`

**Interfaces:**
- Produces:
  - `addPiece(turns: Turn[], role: 'user' | 'ai', text: string) -> Turn[]` — если последний ход той же роли и не закрыт, дописывает текст (с пробелом там, где его нет); иначе новый ход. `Turn = { role, text, open: boolean }`.
  - `closeTurns(turns) -> Turn[]` — все ходы `open: false` (на `turnEnd` и `interrupted`).
  - `plainTurns(turns) -> { role, text }[]` — без пустых, с `trim()`.

- [ ] **Step 1: Тесты:** куски `'I go'`, `' to shop'` склеиваются в один ход `'I go to shop'`; смена роли — новый ход; после `closeTurns` та же роль — новый ход; `plainTurns` выкидывает пустые и пробельные.
- [ ] **Step 2: Запустить** `npm test` — Expected: FAIL.
- [ ] **Step 3: Реализовать.**
- [ ] **Step 4: Запустить** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Сборка текста разговора"`.

---

### Task 7: `/api/voice-review` — разбор ошибок и обновление памяти

**Files:**
- Create: `api/voice-review.js`
- Create: `api/_lib/review.js` (чистые функции)
- Create: `tests/review.test.js`

**Interfaces:**
- Consumes: `checkAuth`; `askGemini`, `TEACHER_STYLE`, `cleanFix` (`api/_lib/gemini.js`); `loadMemory`, `saveMemory`, `mergeMemory` (задача 2).
- Produces:
  - `trimTranscript(turns: { role, text }[], maxChars = 12000) -> { role, text }[]` — оставляет последние ходы, суммарно ≤ `maxChars`; каждый ход ≤ 600 символов.
  - `REVIEW_SYSTEM: string` — инструкция разбора (правила «не придирайся» из `api/check.js`, учёт распознанной речи, формат JSON `{ "fixes": [{ "said", "corrected", "literal", "why", "pattern", "examples", "topic" }], "facts": [], "summary": "" }`, `TEACHER_STYLE`).
  - `normalizeReview(raw: object) -> { fixes: Fix[], facts: string[], summary: string }` — `fixes` через `cleanFix` + `said`, без пустых `corrected`; ≤ 15 ошибок, ≤ 10 фактов.
  - `POST /api/voice-review`, тело `{ turns }` → `200 { fixes, summary }`. Нет ни одной реплики `user` → `200 { fixes: [], summary: '' }` без вызова Gemini и без записи памяти.

- [ ] **Step 1: Тесты:**

```js
test('trimTranscript оставляет хвост в пределах лимита', () => {
  const turns = Array.from({ length: 100 }, (_, i) => ({ role: 'user', text: `phrase ${i} `.repeat(20) }));
  const out = trimTranscript(turns, 2000);
  assert.ok(out.map((t) => t.text).join('').length <= 2000);
  assert.equal(out.at(-1).text, turns.at(-1).text.slice(0, 600));
});
test('normalizeReview чистит мусор', () => {
  const r = normalizeReview({ fixes: [{ said: 'I go', corrected: '' }, { said: 'She work', corrected: 'She works', topic: 'ps', why: 'x' }], facts: ['a'], summary: 's' });
  assert.equal(r.fixes.length, 1);
  assert.equal(r.fixes[0].said, 'She work');
});
test('normalizeReview переживает пустой ответ', () => assert.deepEqual(normalizeReview({}), { fixes: [], facts: [], summary: '' }));
```

- [ ] **Step 2: Запустить** `npm test` — Expected: FAIL.
- [ ] **Step 3: Реализовать `api/_lib/review.js` и `api/voice-review.js`.** Хендлер: `askGemini({ system: REVIEW_SYSTEM, contents: [{ role: 'user', parts: [{ text: <ходы как "Learner: …" / "Tutor: …"> }] }], smartFirst: true })` → `normalizeReview` → `saveMemory(mergeMemory(await loadMemory(), review, Date.now()))` (ошибка памяти не роняет ответ, только `console.log`) → `{ fixes, summary }`.
- [ ] **Step 4: Запустить** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Разбор звонка и обновление памяти"`.

---

### Task 8: Раздел «Звонок»

**Files:**
- Create: `js/views/call.js`
- Modify: `js/main.js` (маршрут `call` → `renderCall`; в `refresh()` не перерисовывать раздел `call`)
- Modify: `index.html` (пункт меню `<a href="#/call">Звонок</a>` после «Чат»)
- Modify: `js/store.js` (`calls: []` в `emptyProgress`; `addCall(call)` — последние 5, `touchStreak`, `save`)
- Modify: `css/style.css` (стили экранов звонка в стиле существующих)

**Interfaces:**
- Consumes: `LiveCall` (задача 5), `startMic`/`createPlayer` (задача 4), `addPiece`/`closeTurns`/`plainTurns` (задача 6), `POST /api/voice-review` (задача 7), `fixDetails` из `js/dom.js`, `knowledge`, `touchStreak` из `js/store.js`.
- Produces: `renderCall(root: HTMLElement): void`; `addCall({ at: number, summary: string, fixes: Fix[], turns: { role, text }[] }): void`.

- [ ] **Step 1: Экран «Готов»** — по макету из спека: подсказка «Положи телефон рядом, экран не блокируй», кнопка «📞 Начать», ниже список прошлых звонков из `state.progress.calls` (дата + резюме, по нажатию — экран «Итоги» этого звонка).
- [ ] **Step 2: Старт** — в обработчике нажатия: `new AudioContext()` и `resume()`, `startMic`, `createPlayer(context)`, `navigator.wakeLock?.request('screen')` (нет — показать подсказку «не блокируй экран»), `new LiveCall(...).start()`; после `ready` отправить текст «Start the call». Нет доступа к микрофону → «Разреши доступ к микрофону в настройках Safari».
- [ ] **Step 3: Экран «Идёт звонок»** — таймер, текст разговора (`addPiece` на `heard`/`said`, `closeTurns` на `turnEnd`/`interrupted`), строка состояния «слушаю… / говорит… / переподключаюсь…», кнопка «Завершить». `audio` → `player.play`, `interrupted` → `player.flush`.
- [ ] **Step 4: Фон и возврат** — `visibilitychange` hidden → `call.pause()` (микрофон на паузе, сокет закрыт); visible → `call.resume()` и повторный запрос wake lock. Обработчики снимаются при уходе из раздела.
- [ ] **Step 5: Завершение** — по кнопке или `endCall` (после `await player.idle()`): `call.stop()`, остановить микрофон, снять wake lock, `context.close()`. Экран «Разбираю ошибки» → `POST /api/voice-review` с `plainTurns(turns)` → экран «Итоги»: резюме, ошибки через `fixDetails(fix, fix.said)`, свёрнутый текст разговора → `addCall`. Ошибка разбора → текст разговора и кнопка «Разобрать ещё раз». Фатальная ошибка связи (`onStatus({ error })`) → показать её текст и сразу перейти к завершению с уже собранным текстом.
- [ ] **Step 6: Проверка в браузере на компьютере** — `npx vercel dev` (или превью-деплой с разрешения Влада), открыть `#/call` в Chrome: звонок стартует, ИИ здоровается голосом, текст идёт, перебивание работает, «Bye» завершает звонок, появляются итоги, в Upstash обновился `english-trainer:voice-memory`. `npm test` — PASS.
- [ ] **Step 7: Commit** — `git commit -m "Раздел «Звонок»"`.

---

### Task 9: Проверка на iPhone и подстройка

**Files:**
- Modify: `api/_lib/live.js` (значения `silenceDurationMs`, чувствительности, `VOICE`)
- Modify: `README.md` (раздел «Звонок» в «Как устроено», строки про `api/_lib/live.js`, `api/voice-*.js`, `GEMINI_LIVE_MODEL` в таблице «Где что лежит»)

- [ ] **Step 1: Превью-деплой** ветки на Vercel — только с разрешения Влада.
- [ ] **Step 2: Чек-лист вместе с Владом на iPhone** (Safari и сайт с экрана «Домой»), звонок ≥ 12 минут, телефон лежит рядом:
  - ИИ не перебивает сам себя своим эхом (Review Focus 1);
  - не влезает в паузы посреди фразы (Review Focus 2) — иначе поднять `silenceDurationMs` шагами по 300 мс;
  - экран не гаснет; свернул Safari на 30 секунд и вернулся — разговор продолжается с того же места (Review Focus 4);
  - переподключение около 10-й минуты незаметно;
  - в итогах видны настоящие ошибки Влада, а не «исправленные» распознаванием;
  - голос понятный и не быстрый — иначе сменить `VOICE`;
  - мелкие ошибки поправляются незаметно, повторная — с остановкой и объяснением по-русски.
- [ ] **Step 3: Если эхо не лечится настройками** — остановиться и вынести Владу решение про запасной режим «держи, чтобы говорить».
- [ ] **Step 4: Обновить README.**
- [ ] **Step 5: Commit** — `git commit -m "Подстройка звонка по проверке на iPhone, README"`. Пуш в `main` — только по слову Влада.
