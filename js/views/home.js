// Главная: уровень, прогресс и что делать дальше.
import { h } from '../dom.js';
import { state, currentLevel, levelStats, currentStreak, dueCount, allComplete, MAX_LEVEL } from '../store.js';

function bar(label, done, total) {
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return h('div', { class: 'bar-row' },
    h('div', { class: 'bar-label' }, h('span', null, label), h('span', null, `${done} из ${total}`)),
    h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: `width:${percent}%` })),
  );
}

export function renderHome(root) {
  const level = currentLevel();
  const stats = levelStats(level);
  const streak = currentStreak();
  const due = dueCount();

  root.append(
    h('section', { class: 'card hero' },
      h('div', { class: 'hero-top' },
        h('div', null,
          h('div', { class: 'muted' }, 'Твой уровень'),
          h('div', { class: 'hero-level' }, `${level} из ${MAX_LEVEL}`),
        ),
        h('div', { class: 'streak' }, h('span', { class: 'streak-num' }, String(streak)), ' дн. подряд'),
      ),
      bar('Слова', Math.min(stats.learned, stats.wordsNeeded), stats.wordsNeeded),
      bar('Темы грамматики', stats.topicsDone, stats.topics),
      h('p', { class: 'muted small' },
        allComplete()
          ? 'Все уровни пройдены. Повторяй слова и практикуйся в чате.'
          : 'Закрой обе полоски — откроется следующий уровень.'),
    ),

    h('a', { class: 'card link-card', href: '#/words' },
      h('div', { class: 'link-title' }, 'Слова'),
      h('div', { class: 'muted' }, due ? `Пора повторить: ${due}` : 'Новые слова и предложения с ними'),
    ),
    h('a', { class: 'card link-card', href: '#/grammar' },
      h('div', { class: 'link-title' }, 'Грамматика'),
      h('div', { class: 'muted' }, 'Правило коротко и сразу практика'),
    ),
    h('a', { class: 'card link-card', href: '#/chat' },
      h('div', { class: 'link-title' }, 'Чат'),
      h('div', { class: 'muted' }, 'Разговор на том, что ты уже прошёл'),
    ),

    h('p', { class: 'muted small center' },
      state.sync ? 'Прогресс сохраняется на сервере' : 'База не подключена — прогресс хранится только в этом браузере'),
    h('p', { class: 'small center' }, h('a', { href: '#/status' }, 'Проверка ИИ')),
  );
}
