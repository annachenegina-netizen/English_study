// Проверка Gemini Live на настоящем ключе — без браузера и микрофона.
// Запуск: node --env-file=.env scripts/live-smoke.mjs
// Что проверяет: выдаётся ли временный ключ, принимает ли Google нашу настройку сессии,
// приходит ли голос и текст, приходит ли ключ продолжения, вызывает ли ИИ end_call на прощание.
import { LIVE_MODEL, buildSetup, buildTutorPrompt, createLiveToken } from '../api/_lib/live.js';
import { emptyMemory } from '../api/_lib/memory.js';

const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.log('[smoke] Нет GEMINI_API_KEY в .env');
  process.exit(1);
}

const system = buildTutorPrompt({ level: 1, maxLevel: 6, topics: [], words: [], memory: emptyMemory() });
// Дополнительные поля настройки можно передать через SMOKE_SETUP_PATCH='{"...": ...}' — для подбора формата
const patch = process.env.SMOKE_SETUP_PATCH ? JSON.parse(process.env.SMOKE_SETUP_PATCH) : {};
const setup = { ...buildSetup({ model: LIVE_MODEL, system }), ...patch };

console.log(`[smoke] Модель: ${LIVE_MODEL}`);
const token = await createLiveToken(key, LIVE_MODEL);
console.log('[smoke] Временный ключ получен');

const report = { audioChunks: 0, mimeTypes: new Set(), said: '', handle: '', endCall: false };
let step = 'setup';
const socket = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(token)}`);
const send = (message) => socket.send(JSON.stringify(message));
const timer = setTimeout(() => { console.log(`[smoke] Нет ответа 40 с на шаге «${step}»`); socket.close(); }, 40000);

socket.addEventListener('open', () => send({ setup }));

socket.addEventListener('message', async (event) => {
  const raw = typeof event.data === 'string' ? event.data : await new Response(event.data).text();
  const msg = JSON.parse(raw);

  if (msg.setupComplete) {
    console.log('[smoke] Настройка принята (setupComplete)');
    step = 'приветствие';
    send({ realtimeInput: { text: 'Start the call' } });
  }
  for (const part of msg.serverContent?.modelTurn?.parts || []) {
    if (part.inlineData) {
      report.audioChunks++;
      report.mimeTypes.add(part.inlineData.mimeType);
    }
  }
  if (msg.serverContent?.outputTranscription?.text) report.said += msg.serverContent.outputTranscription.text;
  if (msg.sessionResumptionUpdate?.newHandle) report.handle = msg.sessionResumptionUpdate.newHandle;

  if (msg.toolCall) {
    for (const call of msg.toolCall.functionCalls || []) {
      console.log(`[smoke] ИИ вызвал функцию ${call.name}`);
      if (call.name === 'end_call') report.endCall = true;
      send({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { ok: true } }] } });
    }
    if (report.endCall) finish();
  }

  if (msg.serverContent?.turnComplete) {
    console.log(`[smoke] ИИ сказал: ${report.said.trim()}`);
    report.said = '';
    if (step === 'приветствие') {
      step = 'прощание';
      send({ realtimeInput: { text: 'Sorry, I have to go. Bye!' } });
    } else if (step === 'прощание' && !report.endCall) {
      // Функцию могут вызвать чуть позже конца реплики — даём пару секунд
      setTimeout(finish, 3000);
    }
  }
});

socket.addEventListener('close', (event) => {
  clearTimeout(timer);
  if (step !== 'готово') console.log(`[smoke] Соединение закрыто: код ${event.code}, причина: ${event.reason || 'нет'}`);
});
socket.addEventListener('error', () => console.log('[smoke] Ошибка WebSocket'));

function finish() {
  if (step === 'готово') return;
  step = 'готово';
  console.log('[smoke] Итог:', {
    аудиоКусков: report.audioChunks,
    форматЗвука: [...report.mimeTypes],
    ключПродолжения: report.handle ? 'есть' : 'нет',
    endCall: report.endCall,
  });
  socket.close(1000);
}
