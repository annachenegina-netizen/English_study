// Раздел «Чат»: ИИ задаёт вопросы, ученик отвечает, ошибки разбираются под его сообщением.
import { h, speakButton, fixDetails } from '../dom.js';
import { api } from '../api.js';
import { state, addChatMessage, clearChat, knowledge } from '../store.js';

export function renderChat(root) {
  const list = h('div', { class: 'messages' });
  const status = h('div', { class: 'muted small center' });
  const input = h('textarea', {
    class: 'input', rows: 1, placeholder: 'Ответь на английском',
    autocapitalize: 'sentences', autocomplete: 'off', spellcheck: 'false',
  });
  const send = h('button', { class: 'btn', type: 'submit' }, '→');
  let busy = false;

  function bubble(message) {
    if (message.role === 'ai') {
      return h('div', { class: 'msg ai' }, message.text, ' ', speakButton(message.text));
    }
    return h('div', { class: 'msg-wrap' },
      h('div', { class: 'msg user' }, message.text),
      message.fix
        ? h('div', { class: 'msg-fix' }, ...fixDetails(message.fix, message.text))
        : null,
    );
  }

  function draw() {
    list.replaceChildren(...state.progress.chat.map(bubble));
    window.scrollTo(0, document.body.scrollHeight);
  }

  // Просит у ИИ следующую реплику. Заодно получает разбор последнего сообщения ученика.
  async function askAi() {
    busy = true;
    send.disabled = true;
    status.textContent = 'Печатает…';
    try {
      const history = state.progress.chat.map(({ role, text }) => ({ role, text }));
      const data = await api('/api/chat', { method: 'POST', body: { history, ...knowledge() } });

      const last = state.progress.chat.at(-1);
      if (data.fix && last?.role === 'user') last.fix = data.fix;
      addChatMessage({ role: 'ai', text: data.reply });
      status.textContent = '';
    } catch (error) {
      status.replaceChildren(
        h('span', { class: 'error' }, error.message), ' ',
        h('button', { class: 'btn ghost small-btn', type: 'button', onclick: askAi }, 'Повторить'),
      );
    } finally {
      busy = false;
      send.disabled = false;
      draw();
    }
  }

  const form = h('form', {
    class: 'chat-form',
    onsubmit: (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text || busy) return;
      input.value = '';
      addChatMessage({ role: 'user', text });
      draw();
      askAi();
    },
  }, input, send);

  // Enter отправляет, Shift+Enter — новая строка
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  root.append(
    h('div', { class: 'chat-head' },
      h('span', { class: 'muted small' }, 'Вопросы строятся на том, что ты прошёл'),
      h('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => {
        if (busy) return;
        clearChat();
        draw();
        askAi();
      } }, 'Новый диалог'),
    ),
    list, status, form,
  );

  draw();
  // Пустой чат или последнее слово за учеником — пусть ИИ продолжит
  const last = state.progress.chat.at(-1);
  if (!last || last.role === 'user') askAi();
}
