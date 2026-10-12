// Страница диагностики: какие модели ИИ сейчас отвечают и как быстро.
import { h } from '../dom.js';
import { api } from '../api.js';

export function renderStatus(root) {
  const box = h('div', null, h('p', { class: 'muted' }, 'Спрашиваю все модели, это до 15 секунд…'));
  root.append(
    h('a', { class: 'back', href: '#/home' }, '← На главную'),
    h('section', { class: 'card' },
      h('h2', null, 'Проверка ИИ'),
      h('p', { class: 'muted small' }, 'Сервис идёт по списку сверху вниз и берёт первую модель, которая ответила.'),
      box,
    ),
  );

  api('/api/health').then((data) => {
    box.replaceChildren(
      ...data.models.map((item, index) => h('div', { class: 'topic' },
        h('span', null,
          h('b', null, `${index + 1}. ${item.model}`),
          h('br'),
          h('span', { class: 'muted small' },
            item.ok ? `отвечает за ${(item.ms / 1000).toFixed(1)} с` : `ошибка ${item.status}: ${item.message}`),
        ),
        h('span', { class: item.ok ? 'status-ok' : 'status-bad' }, item.ok ? '✓' : '✗'),
      )),
      h('p', { class: 'muted small' }, data.sync ? 'База подключена.' : 'База не подключена.'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { root.replaceChildren(); renderStatus(root); } }, 'Проверить ещё раз'),
    );
  }).catch((error) => {
    box.replaceChildren(h('div', { class: 'error' }, error.message));
  });
}
