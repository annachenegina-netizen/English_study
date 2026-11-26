// Раздел «Звонок»: голосовой разговор с ИИ-репетитором.
// Экраны: «Готов» → «Идёт звонок» → «Разбираю ошибки» → «Итоги».
import { h, fixDetails } from '../dom.js';
import { api } from '../api.js';
import { state, knowledge, addCall, updateCall } from '../store.js';
import { startMic, createPlayer } from '../call/audio.js';
import { LiveCall } from '../call/live.js';
import { addPiece, closeTurns, plainTurns } from '../call/transcript.js';

// Текущий звонок — чтобы завершить его, если Влад ушёл в другой раздел
let active = null;

export function leaveCall() {
  if (active) active.finish();
}

// Идёт ли сейчас звонок — пока идёт, не предлагаем перезагрузить страницу
export function callInProgress() {
  return Boolean(active);
}

export function renderCall(root) {
  showReady(root);
}

// Заменяет содержимое экрана. Пустые места (null) пропускает — replaceChildren вывел бы их текстом «null».
function fill(root, ...children) {
  root.replaceChildren(...children.filter((child) => child != null));
}

// ---------- Экран «Готов» ----------

function showReady(root, error) {
  const calls = [...(state.progress.calls || [])].reverse();
  fill(root,
    h('h1', null, 'Звонок'),
    h('div', { class: 'card call-start' },
      h('p', null, 'Разговор голосом на английском. Положи телефон рядом и занимайся своими делами — экран не блокируй.'),
      h('p', { class: 'muted small' }, 'Чтобы закончить, скажи «bye» или нажми «Завершить».'),
      error ? h('p', { class: 'error' }, error) : null,
      h('button', { class: 'btn call-btn', type: 'button', onclick: () => startCall(root) }, '📞 Начать'),
    ),
    calls.length ? h('h2', null, 'Прошлые звонки') : null,
    ...calls.map((call) => h('button', { class: 'card call-past', type: 'button', onclick: () => showResult(root, call) },
      h('div', { class: 'muted small' }, formatDate(call.at), ' · ',
        call.reviewed === false ? 'не разобран' : `ошибок: ${call.fixes?.length || 0}`),
      h('div', null, call.summary || 'Без резюме'),
    )),
  );
}

// ---------- Сам звонок ----------

async function startCall(root) {
  // Звук на iPhone разрешается только прямо по нажатию — создаём его до любых ожиданий
  const context = new AudioContext();
  context.resume();

  let turns = [];
  let greeted = false;
  let finished = false;
  let wakeLock = null;
  let mic = null;
  const startedAt = Date.now();

  const status = h('div', { class: 'call-status' }, 'Подключаюсь…');
  const timer = h('span', { class: 'call-timer' }, '00:00');
  const list = h('div', { class: 'messages' });
  const resumeBtn = h('button', { class: 'btn', type: 'button', hidden: true, onclick: () => wake() }, 'Продолжить звонок');
  const endBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => finish() }, 'Завершить');
  const hint = h('p', { class: 'muted small', hidden: true }, 'Не блокируй экран — иначе звонок прервётся.');

  fill(root,
    h('div', { class: 'call-head' }, h('span', { class: 'call-dot' }), h('b', null, 'Идёт звонок'), timer),
    hint, list,
    h('div', { class: 'call-bar' }, status, resumeBtn, endBtn),
  );

  const tick = setInterval(() => { timer.textContent = formatDuration(Date.now() - startedAt); }, 1000);

  const draw = () => {
    // Прокручиваем вниз, только если Влад и так внизу — иначе он не сможет перечитать начало
    const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 80;
    list.replaceChildren(...plainTurns(turns).map((turn) =>
      h('div', { class: turn.role === 'ai' ? 'msg ai' : 'msg-wrap' },
        turn.role === 'ai' ? turn.text : h('div', { class: 'msg user' }, turn.text))));
    if (atBottom) window.scrollTo(0, document.body.scrollHeight);
  };

  const player = createPlayer(context);

  // Завершение по прощанию: ждём, пока ИИ договорит и доиграет звук
  let ending = false;
  let endTimer = null;
  const endAfterGoodbye = () => {
    clearTimeout(endTimer);
    player.idle().then(() => finish());
  };

  const live = new LiveCall({
    knowledge: knowledge(),
    onEvent(event) {
      if (event.type === 'ready' && !greeted) {
        greeted = true;
        live.sendText('(The learner has joined the call. Greet him and ask your first simple question about his life.)'); // ИИ здоровается первым
      } else if (event.type === 'ready' && !event.resumed) {
        // Связь восстановилась, но без продолжения — ИИ не помнит разговор. Даём ему конец разговора, чтобы не молчал.
        const recent = plainTurns(turns).slice(-4).map((turn) => `${turn.role === 'ai' ? 'Tutor' : 'Learner'}: ${turn.text}`).join(' / ');
        live.sendText(`(The connection dropped and was restored. Recent talk: ${recent || 'nothing yet'}. Continue the conversation naturally.)`);
      } else if (event.type === 'audio') {
        player.play(event.data);
        status.textContent = 'Говорит…';
      } else if (event.type === 'said') {
        turns = addPiece(turns, 'ai', event.text);
        draw();
      } else if (event.type === 'heard') {
        turns = addPiece(turns, 'user', event.text);
        draw();
      } else if (event.type === 'interrupted') {
        player.flush();
        turns = closeTurns(turns);
        status.textContent = 'Слушаю…';
      } else if (event.type === 'turnEnd') {
        turns = closeTurns(turns);
        if (ending) return endAfterGoodbye();
        // «Слушаю…» — когда голос ИИ действительно доиграл
        player.idle().then(() => { if (!finished) status.textContent = 'Слушаю…'; });
      } else if (event.type === 'endCall') {
        // ИИ вызывает завершение посреди прощания — дожидаемся конца его реплики.
        // Страховка: если конец реплики не придёт, завершаем через 8 секунд.
        ending = true;
        endTimer = setTimeout(endAfterGoodbye, 8000);
      }
    },
    onStatus({ state: callState, error }) {
      if (callState === 'live') status.textContent = 'Слушаю…';
      if (callState === 'reconnecting') status.textContent = 'Переподключаюсь…';
      if (callState === 'paused') status.textContent = 'На паузе';
      if (callState === 'ended' && error) finish(error);
    },
  });

  // Экран не гаснет, пока идёт звонок
  async function keepAwake() {
    try {
      const lock = await navigator.wakeLock.request('screen');
      // Звонок закончился, пока ждали разрешения, — сразу отпускаем экран
      if (finished) return lock.release().catch(() => {});
      wakeLock = lock;
    } catch (error) {
      console.log('[call] Не получилось запретить экрану гаснуть:', error.message);
      hint.hidden = false;
    }
  }

  // Вернулись в Safari после сворачивания
  async function wake() {
    if (finished) return;
    await context.resume().catch(() => {});
    // iPhone может не дать звук без нажатия — тогда просим нажать кнопку
    if (context.state !== 'running') {
      resumeBtn.hidden = false;
      return;
    }
    resumeBtn.hidden = true;
    // iOS могла отобрать микрофон (звонок, Siri, другое приложение) — включаем заново
    if (mic && !mic.alive()) {
      mic.stop();
      try {
        mic = await startMic(context, (chunk) => live.sendAudio(chunk));
      } catch (error) {
        console.log('[call] Микрофон не включился заново:', error.name, error.message);
        return finish('Микрофон отключился, звонок завершён.');
      }
      if (finished) return mic.stop();
    }
    mic?.setMuted(false);
    if (finished) return;
    keepAwake();
    live.resume();
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') {
      mic?.setMuted(true);
      player.flush();
      live.pause();
    } else {
      wake();
    }
  }

  async function finish(error) {
    if (finished) return;
    finished = true;
    active = null;
    clearInterval(tick);
    clearTimeout(endTimer);
    document.removeEventListener('visibilitychange', onVisibility);
    live.stop();
    mic?.stop();
    wakeLock?.release().catch(() => {});
    context.close().catch(() => {});

    const said = plainTurns(turns);
    if (!said.some((turn) => turn.role === 'user')) return showReady(root, error);
    // Сохраняем разговор сразу: если разбор не удастся, его можно будет разобрать позже
    const call = { at: startedAt, turns: said, fixes: [], summary: '', reviewed: false };
    addCall(call);
    review(root, call, error);
  }

  active = { finish };
  document.addEventListener('visibilitychange', onVisibility);
  if ('wakeLock' in navigator) keepAwake();
  else hint.hidden = false;

  try {
    mic = await startMic(context, (chunk) => live.sendAudio(chunk));
  } catch (error) {
    console.log('[call] Микрофон не включился:', error.name, error.message);
    if (finished) return; // звонок уже завершили, пока включался микрофон
    finished = true;
    active = null;
    clearInterval(tick);
    document.removeEventListener('visibilitychange', onVisibility);
    wakeLock?.release().catch(() => {});
    context.close().catch(() => {});
    const message = error.name === 'NotAllowedError'
      ? 'Разреши доступ к микрофону в настройках Safari и попробуй ещё раз.'
      : 'Не получилось включить микрофон.';
    return showReady(root, message);
  }
  // Пока включался микрофон, звонок завершили (кнопка или уход из раздела) — выключаем его
  if (finished) return mic.stop();

  try {
    await live.start();
  } catch (error) {
    console.log('[call] Звонок не начался:', error.message);
    finish(error.message);
  }
}

// ---------- Разбор и итоги ----------

// call — сохранённый звонок ({ at, turns, ... }); после разбора дополняется итогами
async function review(root, call, callError) {
  fill(root,
    h('h1', null, 'Звонок окончен'),
    callError ? h('p', { class: 'error' }, callError) : null,
    h('p', { class: 'muted' }, 'Разбираю ошибки…'),
  );
  try {
    const data = await api('/api/voice-review', { method: 'POST', body: { turns: call.turns } });
    const result = { summary: data.summary || '', fixes: data.fixes || [], reviewed: true };
    updateCall(call.at, result);
    showResult(root, { ...call, ...result }, callError);
  } catch (error) {
    console.log('[call] Разбор не удался:', error.message);
    fill(root,
      h('h1', null, 'Звонок окончен'),
      h('p', { class: 'error' }, error.message),
      h('p', { class: 'muted small' }, 'Разговор сохранён — разобрать можно и позже, из списка прошлых звонков.'),
      h('button', { class: 'btn', type: 'button', onclick: () => review(root, call, callError) }, 'Разобрать ещё раз'),
      transcript(call.turns, true),
    );
  }
}

function showResult(root, call, callError) {
  // Звонок сохранён, но ещё не разобран (разбор не удался)
  if (call.reviewed === false) {
    return fill(root,
      h('h1', null, 'Звонок не разобран'),
      h('div', { class: 'muted small' }, formatDate(call.at)),
      h('button', { class: 'btn', type: 'button', onclick: () => review(root, call) }, 'Разобрать ошибки'),
      transcript(call.turns, true),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => showReady(root) }, 'Назад'),
    );
  }
  fill(root,
    h('h1', null, 'Итоги звонка'),
    h('div', { class: 'muted small' }, formatDate(call.at)),
    callError ? h('p', { class: 'error' }, callError) : null,
    call.summary ? h('p', null, call.summary) : null,
    h('h2', null, call.fixes.length ? `Ошибки: ${call.fixes.length}` : 'Ошибок не нашёл 👍'),
    ...call.fixes.map((fix) => h('div', { class: 'card call-fix' },
      h('div', { class: 'muted small' }, 'Ты сказал: ', h('b', null, fix.said)),
      ...fixDetails(fix, fix.said),
    )),
    transcript(call.turns, false),
    h('button', { class: 'btn', type: 'button', onclick: () => showReady(root) }, 'Новый звонок'),
  );
}

// Полный текст разговора, по умолчанию свёрнут
function transcript(turns, open) {
  return h('details', { class: 'card call-transcript', open },
    h('summary', null, 'Весь разговор'),
    ...turns.map((turn) => h('p', null, h('b', null, turn.role === 'ai' ? 'AI: ' : 'Ты: '), turn.text)),
  );
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatDate(at) {
  return new Date(at).toLocaleString('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}
