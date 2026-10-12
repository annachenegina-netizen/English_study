// Раздел «Грамматика»: список тем и сам урок (объяснение → сборка предложений → перевод).
import { h, speakButton, resultBox } from '../dom.js';
import { api } from '../api.js';
import { TOPICS } from '../data/grammar.js';
import { state, currentLevel, completeTopic, MAX_LEVEL } from '../store.js';

// ---------- Список тем ----------

export function renderGrammarList(root) {
  const level = currentLevel();

  for (let l = 1; l <= MAX_LEVEL; l++) {
    const locked = l > level;
    const items = TOPICS.filter((topic) => topic.level === l).map((topic) => {
      const done = state.progress.grammar[topic.id]?.done;
      if (locked) {
        return h('div', { class: 'topic locked' }, h('span', null, topic.title), h('span', null, '🔒'));
      }
      return h('a', { class: `topic ${done ? 'done' : ''}`, href: `#/grammar/${topic.id}` },
        h('span', null, topic.title),
        h('span', null, done ? '✓' : '→'),
      );
    });
    root.append(h('section', { class: 'card' },
      h('div', { class: 'tag' }, `Уровень ${l}`),
      ...items,
    ));
  }
}

// ---------- Урок ----------

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function renderTopic(root, id) {
  const topic = TOPICS.find((item) => item.id === id);
  if (!topic || topic.level > currentLevel()) {
    location.hash = '#/grammar';
    return;
  }

  // Очередь заданий. Ошибся в переводе — задание уходит в конец и вернётся ещё раз.
  const queue = [
    ...topic.order.map((task) => ({ type: 'order', ...task })),
    ...topic.translate.map((ru) => ({ type: 'translate', ru })),
  ];
  const total = queue.length;
  const area = h('div');

  root.append(
    h('a', { class: 'back', href: '#/grammar' }, '← Все темы'),
    h('section', { class: 'card' },
      h('h2', null, topic.title),
      h('div', { class: 'rule', html: topic.html }),
    ),
    area,
  );

  function showNext() {
    area.replaceChildren();
    if (!queue.length) {
      completeTopic(topic.id);
      area.append(h('section', { class: 'card center' },
        h('h2', null, 'Тема пройдена'),
        h('p', { class: 'muted' }, 'Теперь эта грамматика будет встречаться в чате.'),
        h('a', { class: 'btn', href: '#/grammar' }, 'К списку тем'),
        h('a', { class: 'btn ghost', href: '#/chat' }, 'Попробовать в чате'),
      ));
      return;
    }
    const task = queue[0];
    const left = h('div', { class: 'muted small' }, `Осталось заданий: ${queue.length} из ${total}`);
    const card = task.type === 'order' ? orderTask(task) : translateTask(task);
    area.append(h('section', { class: 'card' }, left, card));
  }

  // Задание 1: собрать предложение из перемешанных слов. Проверяем сами, ИИ не нужен.
  function orderTask(task) {
    const words = task.en.split(' ');
    let pool = shuffle(words.map((text, index) => ({ text, index })));
    // Если случайно перемешалось в правильный порядок — мешаем ещё раз
    if (pool.map((chip) => chip.text).join(' ') === task.en && words.length > 1) pool = pool.reverse();
    let picked = [];

    const answerRow = h('div', { class: 'chips answer' });
    const poolRow = h('div', { class: 'chips' });
    const feedback = h('div');
    const checkButton = h('button', { class: 'btn', type: 'button' }, 'Проверить');

    function draw() {
      answerRow.replaceChildren(...picked.map((chip) =>
        h('button', { class: 'chip', type: 'button', onclick: () => {
          picked = picked.filter((item) => item !== chip);
          pool.push(chip);
          draw();
        } }, chip.text)));
      poolRow.replaceChildren(...pool.map((chip) =>
        h('button', { class: 'chip', type: 'button', onclick: () => {
          pool = pool.filter((item) => item !== chip);
          picked.push(chip);
          draw();
        } }, chip.text)));
      checkButton.disabled = pool.length > 0;
    }

    checkButton.addEventListener('click', () => {
      const answer = picked.map((chip) => chip.text).join(' ');
      if (answer === task.en) {
        feedback.replaceChildren(
          h('div', { class: 'result ok' },
            h('div', { class: 'result-title' }, '✓ Верно'),
            h('div', { class: 'result-fix' }, task.en, ' ', speakButton(task.en)),
          ),
          h('button', { class: 'btn', type: 'button', onclick: () => { queue.shift(); showNext(); } }, 'Дальше'),
        );
        checkButton.hidden = true;
      } else {
        feedback.replaceChildren(h('div', { class: 'result bad' },
          h('div', { class: 'result-title' }, '✗ Порядок не тот'),
          h('p', null, 'Посмотри на правило выше и переставь слова. Нажми на слово, чтобы убрать его.'),
        ));
      }
    });

    draw();
    return h('div', null,
      h('p', { class: 'muted' }, 'Собери предложение:'),
      h('div', { class: 'task-ru' }, task.ru),
      answerRow, poolRow, checkButton, feedback,
    );
  }

  // Задание 2: перевести предложение. Проверяет ИИ и объясняет ошибку.
  function translateTask(task) {
    const feedback = h('div');
    const input = h('textarea', {
      class: 'input', rows: 2, placeholder: 'Перевод на английский',
      autocapitalize: 'sentences', autocomplete: 'off', spellcheck: 'false',
    });
    const submit = h('button', { class: 'btn', type: 'submit' }, 'Проверить');

    const form = h('form', {
      onsubmit: async (event) => {
        event.preventDefault();
        const answer = input.value.trim();
        if (!answer) return;

        submit.disabled = true;
        submit.textContent = 'Проверяю…';
        feedback.replaceChildren();

        try {
          const result = await api('/api/check', {
            method: 'POST',
            body: { mode: 'translate', topic: topic.title, ru: task.ru, answer },
          });
          queue.shift();
          if (!result.correct) queue.push(task); // вернётся в конце
          submit.hidden = true;
          input.disabled = true;
          feedback.replaceChildren(
            resultBox(result),
            h('button', { class: 'btn', type: 'button', onclick: showNext }, 'Дальше'),
          );
        } catch (error) {
          feedback.replaceChildren(h('div', { class: 'error' }, error.message));
        } finally {
          submit.disabled = false;
          submit.textContent = 'Проверить';
        }
      },
    }, input, submit);

    return h('div', null,
      h('p', { class: 'muted' }, 'Переведи на английский:'),
      h('div', { class: 'task-ru' }, task.ru),
      form, feedback,
    );
  }

  showNext();
}
