// Раздел «Слова»: показываем слово → ученик составляет с ним предложение → ИИ проверяет.
import { h, speakButton, resultBox } from '../dom.js';
import { api } from '../api.js';
import { nextWord, recordWord, wordTotals } from '../store.js';

export function renderWords(root) {
  const next = nextWord();
  const totals = wordTotals();
  root.append(h('p', { class: 'muted small' }, `Выучено слов: ${totals.learned} из ${totals.total}`));

  if (next.empty === 'no-words') {
    root.append(h('section', { class: 'card center' },
      h('h2', null, 'Слова этого уровня выучены'),
      h('p', { class: 'muted' }, 'Новые откроются на следующем уровне — для этого пройди темы по грамматике. Повторения придут сами, когда подойдёт срок.'),
      h('a', { class: 'btn', href: '#/grammar' }, 'К грамматике'),
    ));
    return;
  }

  renderCard(root, next.word, next.review);
}

function rerender(root) {
  root.replaceChildren();
  renderWords(root);
}

function renderCard(root, [word, ru, example], review) {
  const feedback = h('div');
  const input = h('textarea', {
    class: 'input', rows: 2, placeholder: 'Твоё предложение на английском',
    autocapitalize: 'sentences', autocomplete: 'off', spellcheck: 'false',
  });
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Проверить');

  // На повторении слово спрятано: надо вспомнить его по переводу
  const hidden = h('div', { class: 'word-hidden' },
    h('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => {
      hidden.replaceChildren(h('div', { class: 'word-en' }, word, ' ', speakButton(word)));
    } }, 'Не помню — показать слово'),
  );

  // Пример спрятан, чтобы не подсматривать. Открывается по кнопке.
  const exampleBox = h('div', { class: 'word-hidden' },
    h('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => {
      exampleBox.replaceChildren(h('div', { class: 'example' }, example, ' ', speakButton(example)));
    } }, 'Показать пример'),
  );

  const head = review
    ? [
        h('div', { class: 'tag' }, 'Повторение'),
        h('div', { class: 'word-ru big' }, ru),
        hidden,
        h('p', { class: 'muted' }, 'Вспомни слово и составь с ним новое предложение.'),
      ]
    : [
        h('div', { class: 'tag new' }, 'Новое слово'),
        h('div', { class: 'word-en' }, word, ' ', speakButton(word)),
        h('div', { class: 'word-ru' }, ru),
        exampleBox,
        h('p', { class: 'muted' }, 'Составь своё предложение с этим словом.'),
      ];

  const form = h('form', {
    onsubmit: async (event) => {
      event.preventDefault();
      const answer = input.value.trim();
      if (!answer) return;

      submit.disabled = true;
      submit.textContent = 'Проверяю…';
      feedback.replaceChildren();

      try {
        const result = await api('/api/check', { method: 'POST', body: { mode: 'word', word, ru, answer } });
        recordWord(word, result.correct);
        feedback.replaceChildren(
          resultBox(result, answer),
          result.correct
            ? h('button', { class: 'btn', type: 'button', onclick: () => rerender(root) }, 'Дальше')
            : h('p', { class: 'muted' }, 'Исправь предложение и проверь ещё раз.'),
        );
        if (result.correct) {
          submit.hidden = true;
          input.disabled = true;
        }
      } catch (error) {
        feedback.replaceChildren(h('div', { class: 'error' }, error.message));
      } finally {
        submit.disabled = false;
        submit.textContent = 'Проверить';
      }
    },
  }, input, submit);

  root.append(h('section', { class: 'card' }, ...head, form, feedback));
}
