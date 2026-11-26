// Проверка звонка ГОЛОСОМ на настоящем ключе: отправляем запись речи как с микрофона.
// Запуск: node --env-file=.env scripts/live-smoke-audio.mjs путь/к/речи.wav
// WAV — 16 кГц, 16 бит, моно (например, синтез речи Windows).
// Проверяет: принимает ли Google звук 16 кГц, понимает ли конец фразы по паузе, что распознаёт
// (дословно ли, с ошибками ученика), и продолжается ли разговор после переподключения с ключом продолжения.
import { readFile } from 'node:fs/promises';
import { LIVE_MODEL, buildSetup, buildTutorPrompt, createLiveToken } from '../api/_lib/live.js';
import { emptyMemory } from '../api/_lib/memory.js';

const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
const CHUNK = 3200; // 100 мс звука: 16 000 отсчётов × 2 байта / 10
const key = process.env.GEMINI_API_KEY;
const wavPath = process.argv[2];
if (!key || !wavPath) {
  console.log('[audio-smoke] Нужны GEMINI_API_KEY в .env и путь к WAV');
  process.exit(1);
}

// Достаём из WAV сами отсчёты (блок data)
function pcmFromWav(buffer) {
  let offset = 12;
  while (offset < buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'data') return buffer.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size;
  }
  throw new Error('В WAV нет блока data');
}

const pcm = pcmFromWav(await readFile(wavPath));
const system = buildTutorPrompt({ level: 1, maxLevel: 6, topics: [], words: [], memory: emptyMemory(), mode: process.env.SMOKE_MODE });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Одно соединение: ждёт сообщения по условию
async function open(handle) {
  const setup = buildSetup({ model: LIVE_MODEL, system, handle });
  const token = await createLiveToken(key, setup);
  const socket = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(token)}`);
  const state = { heard: '', said: '', handle: '', turns: 0, waiters: [] };
  socket.addEventListener('open', () => socket.send(JSON.stringify({ setup })));
  socket.addEventListener('close', (event) => console.log(`[audio-smoke] Соединение закрыто: ${event.code} ${event.reason || ''}`));
  socket.addEventListener('message', async (event) => {
    const raw = typeof event.data === 'string' ? event.data : await new Response(event.data).text();
    const msg = JSON.parse(raw);
    const content = msg.serverContent;
    if (content?.inputTranscription?.text) state.heard += content.inputTranscription.text;
    if (content?.outputTranscription?.text) state.said += content.outputTranscription.text;
    if (msg.sessionResumptionUpdate?.newHandle) state.handle = msg.sessionResumptionUpdate.newHandle;
    if (msg.setupComplete) state.ready = true;
    if (content?.turnComplete) state.turns++;
    for (const waiter of [...state.waiters]) waiter();
  });
  const until = (check, ms = 30000) => new Promise((resolve, reject) => {
    if (check()) return resolve();
    const timer = setTimeout(() => reject(new Error('не дождался ответа')), ms);
    const waiter = () => {
      if (!check()) return;
      clearTimeout(timer);
      state.waiters.splice(state.waiters.indexOf(waiter), 1);
      resolve();
    };
    state.waiters.push(waiter);
  });
  const send = (message) => socket.send(JSON.stringify(message));
  await until(() => state.ready);
  return { socket, state, until, send };
}

// 1. Приветствие, потом фраза голосом
const first = await open();
first.send({ realtimeInput: { text: '(The learner has joined the call. Greet him and ask your first simple question about his life.)' } });
await first.until(() => first.state.turns >= 1);
console.log(`[audio-smoke] ИИ: ${first.state.said.trim()}`);
first.state.said = '';

console.log(`[audio-smoke] Отправляю речь: ${(pcm.length / 32000).toFixed(1)} с`);
for (let i = 0; i < pcm.length; i += CHUNK) {
  first.send({ realtimeInput: { audio: { data: pcm.subarray(i, i + CHUNK).toString('base64'), mimeType: 'audio/pcm;rate=16000' } } });
  await sleep(100); // в реальном темпе, как микрофон
}
// Тишина после фразы — по ней Google понимает, что ученик договорил
const silence = Buffer.alloc(CHUNK).toString('base64');
const started = Date.now();
let answeredAfter = null;
for (let i = 0; i < 40 && first.state.turns < 2; i++) {
  first.send({ realtimeInput: { audio: { data: silence, mimeType: 'audio/pcm;rate=16000' } } });
  if (answeredAfter === null && first.state.said) answeredAfter = Date.now() - started;
  await sleep(100);
}
await first.until(() => first.state.turns >= 2);
console.log(`[audio-smoke] Распознано (что «сказал» ученик): «${first.state.heard.trim()}»`);
console.log(`[audio-smoke] ИИ ответил через ~${answeredAfter ?? '?'} мс тишины: ${first.state.said.trim()}`);
const handle = first.state.handle;
first.socket.close(1000);

// 2. Новое соединение с ключом продолжения — помнит ли разговор
await sleep(500);
const second = await open(handle);
second.send({ realtimeInput: { text: 'What did I buy yesterday? Answer in one short sentence.' } });
await second.until(() => second.state.turns >= 1);
console.log(`[audio-smoke] После переподключения ИИ: ${second.state.said.trim()}`);
second.socket.close(1000);
setTimeout(() => process.exit(0), 300);
