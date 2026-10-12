// Раздел «Слова»: показываем слово → ученик составляет с ним предложение → ИИ проверяет.
import { h, speakButton, resultBox } from '../dom.js';
import { api } from '../api.js';
import { nextWord, recordWord, markKnown, wordTotals } from '../store.js';

export function renderWords(root) {
  const next = nextWord();
  const totals = wordTotals();
  root.append(h('p', { class: 'muted small' }, `Выучено слов: ${totals.learned} из ${totals.total}`));

  if (next.empty === 'no-words') {
    root.append(h('section', { class: 'card center' },
      h('h2', null, 'Все слова пройдены'),
      h('p', { class: 'muted' }, 'Новых слов в списке больше нет. Повторения придут сами, когда подойдёт срок.'),
      h('a', { class: 'btn', href: '#/chat' }, 'Пойти в чат'),
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
        h('div', { class: 'example' }, example, ' ', speakButton(example)),
        h('p', { class: 'muted' }, 'Составь своё предложение с этим словом. Не копируй пример.'),
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

  // Знакомое слово можно пролистнуть, не составляя предложение
  const skip = review ? null : h('button', { class: 'btn ghost', type: 'button', onclick: () => {
    markKnown(word);
    rerender(root);
  } }, 'Уже знаю — дальше');

  root.append(h('section', { class: 'card' }, ...head, form, feedback, skip));
}
