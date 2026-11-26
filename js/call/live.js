// Соединение с Gemini Live на время звонка. Только для браузера.
// Ключ на каждое подключение берём у нашего сервера (/api/voice-token): основной ключ Gemini в браузер не попадает.
// Google закрывает соединение примерно раз в 10 минут и заранее предупреждает (goAway).
// Тогда дожидаемся, пока ИИ договорит, закрываем старое соединение и открываем новое с ключом продолжения (handle).
// Открыть новое, пока старое ещё живо, нельзя: Google отвечает «session is already connected to an existing client»
// (проверено 26.11.2026). Речь ученика за эти 1-2 секунды копится и уходит в новое соединение.
import { api } from '../api.js';
import { parseMessage, handleFrom, closeAction } from './protocol.js';

const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
// Сколько раз подряд пробуем переподключиться после обрыва. Паузы 0, 1, 2, 4, 8 с — всего около 15 с,
// плюс время на сами попытки: хватает, чтобы пережить переход с Wi-Fi на сотовую связь.
const MAX_RETRIES = 5;
const retryDelay = (attempt) => (attempt <= 1 ? 0 : Math.min(1000 * 2 ** (attempt - 2), 8000));
// Google рвёт соединение ровно через 10 минут (кодом 1011, часто без goAway — проверено 26.11.2026).
// Меняем его сами на 9-й минуте, в паузе между репликами, чтобы ИИ не обрывался на полуслове.
const SWITCH_AFTER = 9 * 60 * 1000;
const MAX_PENDING_AUDIO = 50; // до 5 секунд речи (куски по 100 мс), пока переключаемся
const decoder = new TextDecoder();

export class LiveCall {
  // knowledge — уровень, темы и слова ученика (из store.knowledge())
  // onEvent(event) — события из protocol.parseMessage; у ready есть поле resumed
  // onStatus({ state, error }) — state: connecting | live | reconnecting | paused | ended
  constructor({ knowledge, onEvent, onStatus }) {
    this.knowledge = knowledge;
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.socket = null;
    this.ready = false;          // соединение приняло настройку
    this.everReady = false;      // звонок хоть раз начался — с этого момента копим речь при переключениях
    this.speaking = false;       // ИИ сейчас говорит — не переключаем соединение посреди фразы
    this.switchPending = false;  // Google предупредил о закрытии — переключимся, когда ИИ договорит
    this.pendingAudio = [];      // речь ученика, сказанная, пока соединения нет
    this.handle = null;
    this.retries = 0;
    this.retryTimer = null;
    this.ageTimer = null;     // плановая смена соединения на 9-й минуте
    this.paused = false;
    this.stopped = false;
    // Номер попытки подключения: ответ на устаревшую попытку (например, до паузы) выбрасываем
    this.attempt = 0;
  }

  async start() {
    this.onStatus({ state: 'connecting' });
    await this.connect();
  }

  // Ключ для нового соединения. Сервер вставит handle в настройку, чтобы разговор продолжился.
  fetchToken() {
    return api('/api/voice-token', {
      method: 'POST',
      body: { ...this.knowledge, handle: this.handle || undefined },
    });
  }

  async connect() {
    clearTimeout(this.retryTimer);
    const id = ++this.attempt;
    this.ready = false;
    let data;
    try {
      data = await this.fetchToken();
    } catch (error) {
      if (id !== this.attempt) return; // попытка уже не нужна — ошибку не поднимаем
      throw error;
    }
    if (id !== this.attempt || this.stopped || this.paused) return;
    this.socket = this.createSocket(data);
  }

  createSocket({ token, setup }) {
    const socket = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(token)}`);
    // Бинарные кадры разбираем сразу и по порядку (Blob читался бы асинхронно и мог перепутать порядок)
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => socket.send(JSON.stringify({ setup }));
    socket.onmessage = (event) => this.receive(socket, event.data);
    socket.onclose = (event) => this.closed(socket, event);
    socket.onerror = () => console.log('[live] Ошибка соединения с Gemini');
    return socket;
  }

  receive(socket, data) {
    if (socket !== this.socket) return; // сообщение от старого, уже закрытого соединения
    const raw = typeof data === 'string' ? data : decoder.decode(data);
    let msg;
    try { msg = JSON.parse(raw); } catch {
      console.log('[live] Непонятное сообщение от Gemini:', raw.slice(0, 200));
      return;
    }

    for (const event of parseMessage(msg)) {
      if (event.type === 'ready') {
        this.ready = true;
        this.everReady = true;
        this.retries = 0;
        this.onStatus({ state: 'live' });
        event.resumed = Boolean(this.handle);
        this.flushAudio();
        clearTimeout(this.ageTimer);
        this.ageTimer = setTimeout(() => this.planSwitch(), SWITCH_AFTER);
      } else if (event.type === 'handle') {
        this.handle = handleFrom(event.update, this.handle);
        continue;
      } else if (event.type === 'goAway') {
        console.log('[live] Google скоро закроет соединение');
        this.planSwitch();
        continue;
      } else if (event.type === 'audio') {
        this.speaking = true;
      } else if (event.type === 'turnEnd' || event.type === 'interrupted') {
        this.speaking = false;
      }
      // end_call: ответ функции не отправляем — иначе ИИ говорит «The call has been ended».
      // Звонок всё равно закрывается на нашей стороне.
      this.onEvent(event);
      if (this.switchPending && (event.type === 'turnEnd' || event.type === 'interrupted')) this.switchNow();
      if (socket !== this.socket) return; // переключились — остальное из этого сообщения уже не нужно
    }
  }

  // Пора менять соединение: сразу, если ИИ молчит, иначе — когда договорит
  planSwitch() {
    if (this.stopped || this.paused || !this.socket) return;
    this.switchPending = true;
    if (!this.speaking) this.switchNow();
  }

  // Плановое переключение: закрыть старое соединение и сразу открыть новое с продолжением
  switchNow() {
    this.switchPending = false;
    console.log('[live] Переключаюсь на новое соединение');
    this.dropSocket();
    this.tryConnect();
  }

  closed(socket, event) {
    if (this.stopped || this.paused || socket !== this.socket) return;
    console.log(`[live] Соединение закрыто: код ${event.code}, причина: ${event.reason || 'нет'}`);
    this.socket = null;
    this.ready = false;
    this.speaking = false;
    this.switchPending = false;

    const result = closeAction(event.code, event.reason);
    if (result.action === 'fail') return this.fail(result.message);
    this.reconnect();
  }

  // Переподключение после обрыва: первая попытка сразу, дальше с растущими паузами
  reconnect() {
    if (this.stopped || this.paused) return;
    if (this.retries >= MAX_RETRIES) return this.fail('Связь не восстановилась. Проверь интернет и начни звонок заново.');
    this.retries++;
    this.onStatus({ state: 'reconnecting' });
    this.dropSocket();
    const delay = retryDelay(this.retries);
    if (delay) this.retryTimer = setTimeout(() => this.tryConnect(), delay);
    else this.tryConnect();
  }

  async tryConnect() {
    try {
      await this.connect();
    } catch (error) {
      console.log('[live] Не удалось подключиться:', error.message);
      if (this.stopped || this.paused) return;
      if (error.status === 429) return this.fail(error.message);
      this.reconnect();
    }
  }

  fail(message) {
    this.stopped = true;
    this.cancelAll();
    this.onStatus({ state: 'ended', error: message });
  }

  // Закрыть соединение и забыть недоделанные попытки
  cancelAll() {
    clearTimeout(this.retryTimer);
    this.attempt++;
    this.pendingAudio = [];
    this.switchPending = false;
    this.dropSocket();
  }

  dropSocket() {
    clearTimeout(this.ageTimer);
    quietClose(this.socket);
    this.socket = null;
    this.ready = false;
    this.speaking = false;
  }

  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  // Кусок звука с микрофона (base64 PCM16 16 кГц).
  // Нет соединения посреди звонка — копим, чтобы сказанное во время переключения не пропало.
  sendAudio(base64) {
    if (this.ready) return this.sendAudioNow(base64);
    if (!this.everReady || this.paused || this.stopped) return;
    this.pendingAudio.push(base64);
    if (this.pendingAudio.length > MAX_PENDING_AUDIO) this.pendingAudio.shift();
  }

  sendAudioNow(base64) {
    this.send({ realtimeInput: { audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } } });
  }

  flushAudio() {
    const pending = this.pendingAudio;
    this.pendingAudio = [];
    for (const chunk of pending) this.sendAudioNow(chunk);
  }

  sendText(text) {
    if (this.ready) this.send({ realtimeInput: { text } });
  }

  // Страница ушла в фон: закрываем соединение, но помним, где остановились
  pause() {
    if (this.stopped) return;
    this.paused = true;
    this.cancelAll();
    this.onStatus({ state: 'paused' });
  }

  async resume() {
    if (this.stopped || !this.paused) return;
    this.paused = false;
    this.retries = 0;
    this.onStatus({ state: 'reconnecting' });
    await this.tryConnect();
  }

  stop() {
    this.stopped = true;
    this.cancelAll();
  }
}

// Закрыть соединение так, чтобы его закрытие не считалось обрывом
function quietClose(socket) {
  if (!socket) return;
  socket.onclose = null;
  socket.onmessage = null;
  try { socket.close(1000); } catch { /* уже закрыт */ }
}
