// Соединение с Gemini Live на время звонка. Только для браузера.
// Ключ на каждое подключение берём у нашего сервера (/api/voice-token): основной ключ Gemini в браузер не попадает.
// Google закрывает соединение примерно раз в 10 минут и заранее предупреждает (goAway).
// Тогда мы открываем новое соединение рядом со старым, с ключом продолжения (handle),
// и переключаемся, когда оно готово и ИИ договорил, — разговор не обрывается.
import { api } from '../api.js';
import { parseMessage, handleFrom, closeAction } from './protocol.js';

const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
// Сколько раз подряд пробуем переподключиться после обрыва. Паузы 1, 2, 4, 8, 8 с — всего около 23 с:
// хватает, чтобы пережить переход с Wi-Fi на сотовую связь.
const MAX_RETRIES = 5;
const retryDelay = (attempt) => Math.min(1000 * 2 ** (attempt - 1), 8000);
const decoder = new TextDecoder();

export class LiveCall {
  // knowledge — уровень, темы и слова ученика (из store.knowledge())
  // onEvent(event) — события из protocol.parseMessage; у ready есть поле resumed
  // onStatus({ state, error }) — state: connecting | live | reconnecting | paused | ended
  constructor({ knowledge, onEvent, onStatus }) {
    this.knowledge = knowledge;
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.socket = null;      // рабочее соединение
    this.next = null;        // новое соединение, которое готовим после goAway
    this.nextReady = false;
    this.ready = false;      // рабочее соединение приняло настройку
    this.speaking = false;   // ИИ сейчас говорит — не переключаем соединение посреди фразы
    this.handle = null;
    this.retries = 0;
    this.retryTimer = null;
    this.paused = false;
    this.stopped = false;
    // Номера попыток подключения: ответ на устаревшую попытку (например, до паузы) выбрасываем
    this.attempt = 0;
    this.mainAttempt = 0;
    this.nextAttempt = 0;
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

  // Открывает рабочее соединение (первое или после обрыва)
  async connect() {
    clearTimeout(this.retryTimer);
    const id = this.mainAttempt = ++this.attempt;
    this.ready = false;
    let data;
    try {
      data = await this.fetchToken();
    } catch (error) {
      if (id !== this.mainAttempt) return; // попытка уже не нужна — ошибку не поднимаем
      throw error;
    }
    if (id !== this.mainAttempt || this.stopped || this.paused) return;
    this.socket = this.createSocket(data);
  }

  // goAway: готовим новое соединение рядом со старым
  async prepareNext() {
    if (this.nextAttempt || this.next) return;
    const id = this.nextAttempt = ++this.attempt;
    try {
      const data = await this.fetchToken();
      if (id !== this.nextAttempt || this.stopped || this.paused) return;
      this.next = this.createSocket(data);
    } catch (error) {
      // Не вышло — старое соединение закроется, и сработает обычное переподключение
      console.log('[live] Не удалось заранее открыть новое соединение:', error.message);
      if (id === this.nextAttempt) this.nextAttempt = 0;
    }
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
    const raw = typeof data === 'string' ? data : decoder.decode(data);
    let msg;
    try { msg = JSON.parse(raw); } catch {
      console.log('[live] Непонятное сообщение от Gemini:', raw.slice(0, 200));
      return;
    }
    const events = parseMessage(msg);

    // От нового соединения ждём только готовности — до переключения разговор идёт по старому
    if (socket === this.next) {
      if (events.some((event) => event.type === 'ready')) {
        this.nextReady = true;
        this.trySwap();
      }
      return;
    }
    if (socket !== this.socket) return; // сообщение от старого, уже закрытого соединения

    for (const event of events) {
      if (event.type === 'ready') {
        this.ready = true;
        this.retries = 0;
        this.onStatus({ state: 'live' });
        event.resumed = Boolean(this.handle);
      } else if (event.type === 'handle') {
        this.handle = handleFrom(event.update, this.handle);
        continue;
      } else if (event.type === 'goAway') {
        console.log('[live] Google скоро закроет соединение — готовлю новое заранее');
        this.prepareNext();
        continue;
      } else if (event.type === 'audio') {
        this.speaking = true;
      } else if (event.type === 'turnEnd' || event.type === 'interrupted') {
        this.speaking = false;
      }
      // end_call: ответ функции не отправляем — иначе ИИ говорит «The call has been ended».
      // Звонок всё равно закрывается на нашей стороне.
      this.onEvent(event);
      if (event.type === 'turnEnd' || event.type === 'interrupted') this.trySwap();
    }
  }

  // Переключение на новое соединение: оно готово и ИИ не говорит
  trySwap() {
    if (!this.next || !this.nextReady || this.speaking) return;
    const old = this.socket;
    this.socket = this.next;
    this.next = null;
    this.nextReady = false;
    this.nextAttempt = 0;
    this.ready = true;
    this.retries = 0;
    quietClose(old);
    console.log('[live] Переключился на новое соединение');
  }

  closed(socket, event) {
    if (this.stopped || this.paused) return;
    // Не открылось новое соединение — не страшно, старое ещё работает
    if (socket === this.next) {
      this.next = null;
      this.nextReady = false;
      this.nextAttempt = 0;
      return;
    }
    if (socket !== this.socket) return;

    console.log(`[live] Соединение закрыто: код ${event.code}, причина: ${event.reason || 'нет'}`);
    this.ready = false;
    this.socket = null;
    this.speaking = false;

    // Новое соединение уже открыто — сразу переходим на него
    if (this.next) {
      this.socket = this.next;
      this.next = null;
      this.nextAttempt = 0;
      if (this.nextReady) {
        this.nextReady = false;
        this.ready = true;
      }
      return;
    }
    this.nextAttempt = 0;

    const result = closeAction(event.code, event.reason);
    if (result.action === 'fail') return this.fail(result.message);
    this.reconnect();
  }

  // Открыть новое рабочее соединение с продолжением разговора
  async reconnect() {
    if (this.stopped || this.paused) return;
    if (this.retries >= MAX_RETRIES) return this.fail('Связь не восстановилась. Проверь интернет и начни звонок заново.');
    this.retries++;
    this.onStatus({ state: 'reconnecting' });
    this.dropSockets();
    try {
      await this.connect();
    } catch (error) {
      console.log('[live] Не удалось переподключиться:', error.message);
      if (this.stopped || this.paused) return;
      if (error.status === 429) return this.fail(error.message);
      this.retryTimer = setTimeout(() => this.reconnect(), retryDelay(this.retries));
    }
  }

  fail(message) {
    this.stopped = true;
    this.cancelAll();
    this.onStatus({ state: 'ended', error: message });
  }

  // Закрыть все соединения и забыть недоделанные попытки
  cancelAll() {
    clearTimeout(this.retryTimer);
    this.mainAttempt = 0;
    this.nextAttempt = 0;
    this.dropSockets();
  }

  dropSockets() {
    quietClose(this.socket);
    quietClose(this.next);
    this.socket = null;
    this.next = null;
    this.nextReady = false;
    this.ready = false;
    this.speaking = false;
  }

  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  // Кусок звука с микрофона (base64 PCM16 16 кГц)
  sendAudio(base64) {
    if (this.ready) this.send({ realtimeInput: { audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } } });
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
    try {
      await this.connect();
    } catch (error) {
      console.log('[live] Не удалось продолжить звонок:', error.message);
      this.reconnect();
    }
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
