// Тесты соединения со звонком (LiveCall) на поддельном WebSocket и поддельном сервере
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ---------- Подделки ----------

class FakeSocket {
  static OPEN = 1;
  static all = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.closedByUs = false;
    FakeSocket.all.push(this);
  }
  open() { this.readyState = 1; this.onopen?.(); }
  emit(obj) { this.onmessage?.({ data: new TextEncoder().encode(JSON.stringify(obj)).buffer }); }
  serverClose(code, reason = '') { this.readyState = 3; this.onclose?.({ code, reason }); }
  close() { this.closedByUs = true; this.readyState = 3; }
  send(raw) { this.sent.push(JSON.parse(raw)); }
}
globalThis.WebSocket = FakeSocket;

// Запросы к /api/voice-token: каждый ждёт, пока тест на него ответит
let requests = [];
let autoAnswer = true;
globalThis.fetch = (path, options) => new Promise((resolve, reject) => {
  const request = {
    body: JSON.parse(options.body),
    ok: () => resolve({ ok: true, status: 200, json: async () => ({ token: 't', setup: { model: 'm' } }) }),
    fail: () => reject(new TypeError('network')),
  };
  requests.push(request);
  if (autoAnswer) request.ok();
});

const { LiveCall } = await import('../js/call/live.js');

const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const openSockets = () => FakeSocket.all.filter((socket) => !socket.closedByUs && socket.readyState !== 3);

// Все созданные звонки — чтобы остановить их таймеры после каждого теста
const calls = [];

function makeCall() {
  const events = [];
  const statuses = [];
  const call = new LiveCall({
    knowledge: { level: 1 },
    onEvent: (event) => events.push(event),
    onStatus: (status) => statuses.push(status),
  });
  calls.push(call);
  return { call, events, statuses };
}

async function startReady() {
  const made = makeCall();
  await made.call.start();
  await settle();
  const socket = FakeSocket.all.at(-1);
  socket.open();
  socket.emit({ setupComplete: {} });
  return { ...made, socket };
}

afterEach(() => {
  for (const call of calls.splice(0)) call.stop();
});

beforeEach(() => {
  FakeSocket.all = [];
  requests = [];
  autoAnswer = true;
});

// ---------- Тесты ----------

test('сообщения разбираются сразу, по порядку (бинарные кадры)', async () => {
  const { socket, events } = await startReady();
  assert.equal(socket.binaryType, 'arraybuffer');
  assert.equal(events[0].type, 'ready');
});

test('Google закрыл соединение кодом 1000 — переподключаемся, а не молчим', async () => {
  const { socket } = await startReady();
  socket.serverClose(1000);
  await settle();
  assert.equal(FakeSocket.all.length, 2);
});

test('Google не принял настройку — звонок завершается с причиной, без повторов', async () => {
  const { socket, statuses } = await startReady();
  socket.serverClose(1007, 'Invalid JSON payload');
  await settle();
  assert.equal(FakeSocket.all.length, 1);
  assert.equal(statuses.at(-1).state, 'ended');
  assert.match(statuses.at(-1).error, /Invalid JSON payload/);
});

test('пауза и возврат во время повтора не оставляют второго соединения', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { call, socket } = await startReady();
    autoAnswer = false;
    socket.serverClose(1006);       // обрыв → переподключение
    await settle();
    requests.at(-1).fail();         // ключ не получен → повтор по таймеру
    await settle();
    call.pause();                   // Safari свернули
    call.resume();                  // и вернули: новый запрос ключа
    await settle();
    mock.timers.tick(5000);         // таймер старого повтора не должен сработать
    await settle();
    for (const request of requests.slice(1)) request.ok();
    await settle();
    assert.equal(openSockets().length, 1);
  } finally {
    mock.timers.reset();
  }
});

test('без связи звонок ждёт дольше 6 секунд — переход с Wi-Fi на сотовую его не роняет', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { socket, statuses } = await startReady();
    autoAnswer = false;
    socket.serverClose(1006);
    for (let second = 0; second < 10; second++) {
      await settle();
      for (const request of requests) request.fail();
      await settle();
      mock.timers.tick(1000);
    }
    assert.notEqual(statuses.at(-1).state, 'ended');
  } finally {
    mock.timers.reset();
  }
});

// Google не даёт продолжить разговор вторым соединением, пока первое открыто
// («session is already connected to an existing client», проверено 26.11.2026).
// Поэтому сначала закрываем старое, потом открываем новое.
test('goAway: новое соединение открывается только после закрытия старого', async () => {
  const { socket } = await startReady();
  socket.emit({ sessionResumptionUpdate: { newHandle: 'H1', resumable: true } });
  socket.emit({ goAway: { timeLeft: '10s' } });
  assert.equal(socket.closedByUs, true, 'старое закрыто до запроса нового');
  await settle();
  assert.equal(requests.at(-1).body.handle, 'H1');
  assert.equal(FakeSocket.all.length, 2);
});

test('goAway посреди ответа ИИ: переключение после того, как он договорит', async () => {
  const { socket } = await startReady();
  socket.emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AA' } }] } } });
  socket.emit({ goAway: { timeLeft: '10s' } });
  await settle();
  assert.equal(socket.closedByUs, false, 'ИИ ещё говорит — не обрываем');
  assert.equal(FakeSocket.all.length, 1);
  socket.emit({ serverContent: { turnComplete: true } });
  assert.equal(socket.closedByUs, true);
  await settle();
  assert.equal(FakeSocket.all.length, 2);
});

// Google рвёт соединение ровно через 10 минут кодом 1011, часто БЕЗ goAway (проверено 26.11.2026).
// Поэтому на 9-й минуте переключаемся сами — в паузе, а не посреди фразы ИИ.
test('на 9-й минуте соединение меняется само, не дожидаясь обрыва от Google', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { socket } = await startReady();
    mock.timers.tick(9 * 60 * 1000);
    assert.equal(socket.closedByUs, true);
    await settle();
    assert.equal(FakeSocket.all.length, 2);
  } finally {
    mock.timers.reset();
  }
});

test('речь ученика во время переключения не теряется — уходит в новое соединение', async () => {
  const { call, socket } = await startReady();
  socket.emit({ goAway: { timeLeft: '10s' } });
  call.sendAudio('SAID-DURING-SWITCH');
  await settle();
  const next = FakeSocket.all[1];
  next.open();
  next.emit({ setupComplete: {} });
  assert.ok(next.sent.some((m) => m.realtimeInput?.audio?.data === 'SAID-DURING-SWITCH'));
});

test('end_call: ответ функции не отправляется — иначе ИИ говорит «The call has been ended»', async () => {
  const { socket, events } = await startReady();
  socket.emit({ toolCall: { functionCalls: [{ id: '1', name: 'end_call', args: {} }] } });
  assert.ok(events.some((e) => e.type === 'endCall'));
  assert.ok(!socket.sent.some((m) => m.toolResponse));
});
