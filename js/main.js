// Точка входа: вход по паролю, переключение разделов.
import { h } from './dom.js';
import { api, getToken, setToken, hashPassword } from './api.js';
import { pull } from './store.js';
import { renderHome } from './views/home.js';
import { renderWords } from './views/words.js';
import { renderGrammarList, renderTopic } from './views/grammar.js';
import { renderChat } from './views/chat.js';
import { renderStatus } from './views/status.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');

// ---------- Разделы ----------

function route() {
  const [, section = 'home', param] = location.hash.split('/');
  const view = h('main', { class: `view view-${section}` });

  if (section === 'words') renderWords(view);
  else if (section === 'grammar' && param) renderTopic(view, param);
  else if (section === 'grammar') renderGrammarList(view);
  else if (section === 'chat') renderChat(view);
  else if (section === 'status') renderStatus(view);
  else renderHome(view);

  app.replaceChildren(view);
  window.scrollTo(0, 0);

  for (const link of nav.querySelectorAll('a')) {
    const active = link.getAttribute('href') === `#/${section}` || (section === 'home' && link.getAttribute('href') === '#/home');
    link.classList.toggle('active', active);
  }
}

// ---------- Вход ----------

function showLogin(message) {
  nav.hidden = true;
  const input = h('input', { class: 'input', type: 'password', placeholder: 'Пароль', autocomplete: 'current-password' });
  const button = h('button', { class: 'btn', type: 'submit' }, 'Войти');
  const error = h('div', { class: 'error' }, message || '');

  app.replaceChildren(h('main', { class: 'view login' },
    h('h1', null, 'English Trainer'),
    h('p', { class: 'muted' }, 'Слова, грамматика и разговор — по уровням.'),
    h('form', {
      onsubmit: async (event) => {
        event.preventDefault();
        if (!input.value) return;
        button.disabled = true;
        error.textContent = '';
        try {
          setToken(await hashPassword(input.value));
          await pull(); // если пароль неверный — здесь будет ошибка 401
          start();
        } catch (err) {
          setToken('');
          error.textContent = err.message;
          button.disabled = false;
        }
      },
    }, input, button, error),
  ));
  input.focus();
}

function start() {
  nav.hidden = false;
  if (!location.hash) location.hash = '#/home';
  route();
}

window.addEventListener('hashchange', () => { if (getToken()) route(); });

// Вернулся во вкладку (например, после занятий на телефоне) — подтягиваем свежий прогресс
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !getToken()) return;
  try {
    const changed = await pull();
    // Чат и открытый урок не перерисовываем, чтобы не сбить ввод
    const section = location.hash.split('/')[1];
    if (changed && (section === 'home' || !section)) route();
  } catch (error) {
    console.log('[main] Не удалось обновить прогресс:', error.message);
  }
});

async function boot() {
  if (!getToken()) return showLogin();
  try {
    await pull();
    start();
  } catch (error) {
    if (error.status === 401) {
      setToken('');
      return showLogin('Пароль изменился — войди заново.');
    }
    // Сервер недоступен — работаем с тем, что сохранено в браузере
    console.log('[main] Сервер недоступен, открываю сохранённый прогресс:', error.message);
    start();
  }
}

boot();
