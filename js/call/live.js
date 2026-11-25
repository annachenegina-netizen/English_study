// Соединение с Gemini Live на время звонка. Только для браузера.
// Ключ на каждое подключение берём у нашего сервера (/api/voice-token): основной ключ Gemini в браузер не попадает.
// Google закрывает соединение примерно раз в 10 минут — тогда переподключаемся с ключом продолжения (handle),
// и разговор идёт дальше с того же места.
import { api } from '../api.js';
import { parseMessage, handleFrom, describeClose, QUOTA_MESSAGE } from './protocol.js';

const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
const MAX_RETRIES = 3; // сколько раз подряд пробуем переподключиться после обрыва

export class LiveCall {
  // knowledge — уровень, темы и слова ученика (из store.knowledge())
  // onEvent(event) — события из protocol.parseMessage; у ready есть поле resumed
  // onStatus({ state, error }) — state: connecting | live | reconnecting | paused | ended
  constructor({ knowledge, onEvent, onStatus }) {
    this.knowledge = knowledge;
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.socket = null;
    this.ready = false;
    this.handle = null;
    this.retries = 0;
    this.paused = false;
    this.stopped = false;
  }

  async start() {
    this.onStatus({ state: 'connecting' });
    await this.connect();
  }

  async connect() {
    this.ready = false;
    // Для переподключения сервер вставит handle в настройку сессии
    const { token, setup } = await api('/api/voice-token', {
      method: 'POST',
      body: { ...this.knowledge, handle: this.handle || undefined },
    });
    if (this.stopped || this.paused) return;

    const socket = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(token)}`);
    this.socket = socket;
    socket.onopen = () => socket.send(JSON.stringify({ setup }));
    socket.onmessage = (event) => this.receive(socket, event.data);
    socket.onclose = (event) => this.closed(socket, event);
    socket.onerror = () => console.log('[live] Ошибка соединения с Gemini');
  }

  async receive(socket, data) {
    // Google может прислать сообщение как текст или как Blob
    const raw = typeof data === 'string' ? data : await data.text();
    let msg;
    try { msg = JSON.parse(raw); } catch {
      console.log('[live] Непонятное сообщение от Gemini:', raw.slice(0, 200));
      return;
    }
    if (socket !== this.socket) return; // сообщение от старого соединения

    for (const event of parseMessage(msg)) {
      if (event.type === 'ready') {
        this.ready = true;
        this.retries = 0;
        this.onStatus({ state: 'live' });
        event.resumed = Boolean(this.handle);
      } else if (event.type === 'handle') {
        this.handle = handleFrom(event.update, this.handle);
        continue;
      } else if (event.type === 'goAway') {
        console.log('[live] Google скоро закроет соединение — переподключаюсь заранее');
        this.reconnect();
        continue;
      } else if (event.type === 'endCall') {
        this.send({ toolResponse: { functionResponses: [{ id: event.id, name: 'end_call', response: { ok: true } }] } });
      }
      this.onEvent(event);
    }
  }

  closed(socket, event) {
    if (socket !== this.socket || this.stopped || this.paused) return;
    this.ready = false;
    const message = describeClose(event.code, event.reason);
    console.log(`[live] Соединение закрыто: код ${event.code}, причина: ${event.reason || 'нет'}`);
    if (!message) return;
    if (message === QUOTA_MESSAGE) return this.fail(message);
    this.reconnect();
  }

  // Закрыть текущее соединение и открыть новое с продолжением разговора
  async reconnect() {
    if (this.stopped || this.paused) return;
    if (this.retries >= MAX_RETRIES) return this.fail('Связь не восстановилась. Проверь интернет и начни звонок заново.');
    this.retries++;
    this.onStatus({ state: 'reconnecting' });
    this.dropSocket();
    try {
      await this.connect();
    } catch (error) {
      console.log('[live] Не удалось переподключиться:', error.message);
      if (error.status === 429) return this.fail(error.message);
      setTimeout(() => this.reconnect(), 1000 * this.retries);
    }
  }

  fail(message) {
    this.stopped = true;
    this.dropSocket();
    this.onStatus({ state: 'ended', error: message });
  }

  dropSocket() {
    const socket = this.socket;
    this.socket = null;
    this.ready = false;
    if (socket) {
      socket.onclose = null;
      socket.onmessage = null;
      try { socket.close(1000); } catch { /* уже закрыт */ }
    }
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
    this.dropSocket();
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
    this.dropSocket();
  }
}
