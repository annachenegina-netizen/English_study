// Разбор сообщений Gemini Live в простые события для экрана звонка. Чистые функции.

export const QUOTA_MESSAGE = 'Бесплатный лимит Google на сегодня исчерпан. Попробуй позже.';

// Одно сообщение от Google → список событий:
// ready — настройка принята; audio — кусок голоса ИИ; said — текст того, что сказал ИИ;
// heard — текст того, что сказал ученик; interrupted — ученик перебил; turnEnd — ИИ договорил;
// handle — новый ключ продолжения; goAway — Google скоро закроет соединение; endCall — ИИ завершает звонок
export function parseMessage(msg) {
  const events = [];
  if (msg.setupComplete) events.push({ type: 'ready' });

  const content = msg.serverContent;
  if (content) {
    for (const part of content.modelTurn?.parts || []) {
      if (part.inlineData?.data) events.push({ type: 'audio', data: part.inlineData.data });
    }
    if (content.outputTranscription?.text) events.push({ type: 'said', text: content.outputTranscription.text });
    if (content.inputTranscription?.text) events.push({ type: 'heard', text: content.inputTranscription.text });
    if (content.interrupted) events.push({ type: 'interrupted' });
    if (content.turnComplete) events.push({ type: 'turnEnd' });
  }

  if (msg.sessionResumptionUpdate) events.push({ type: 'handle', update: msg.sessionResumptionUpdate });
  if (msg.goAway) events.push({ type: 'goAway' });
  for (const call of msg.toolCall?.functionCalls || []) {
    if (call.name === 'end_call') events.push({ type: 'endCall', id: call.id });
  }
  return events;
}

// Какой ключ продолжения хранить: новый — только если Google говорит, что с этого места можно продолжить
export function handleFrom(update, current) {
  if (update?.resumable === false || !update?.newHandle) return current;
  return update.newHandle;
}

// Что делать, если Google закрыл соединение (свои закрытия мы сюда не передаём):
// { action: 'reconnect' } — переподключиться; { action: 'fail', message } — завершить звонок с причиной.
// Код 1000 — тоже повод переподключиться: раз закрыли не мы, разговор оборвался.
export function closeAction(code, reason) {
  if (/quota|RESOURCE_EXHAUSTED|429/i.test(reason || '')) return { action: 'fail', message: QUOTA_MESSAGE };
  // Google ещё не отпустил прошлое соединение (например, после сворачивания Safari) — через секунду получится
  if (/already connected/i.test(reason || '')) return { action: 'reconnect' };
  // 1007 и 1008 — Google не принял то, что мы прислали. Повтор не поможет.
  if (code === 1007 || code === 1008) {
    return { action: 'fail', message: `Google не принял настройки звонка: ${reason || `код ${code}`}` };
  }
  return { action: 'reconnect' };
}
