// Маленькие помощники для работы со страницей.

// Создаёт элемент: h('button', { class: 'btn', onclick: fn }, 'Текст')
// Текст вставляется безопасно (не как HTML). Для своего HTML есть атрибут html.
export function h(tag, attrs, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') element.className = value;
    else if (key === 'html') element.innerHTML = value;
    else if (key.startsWith('on')) element.addEventListener(key.slice(2), value);
    else element.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    element.append(child.nodeType ? child : String(child));
  }
  return element;
}

// Произносит английский текст встроенным голосом браузера
export function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

// Кнопка с динамиком
export function speakButton(text) {
  return h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Прослушать', onclick: () => speak(text) }, '🔊');
}

// Исправленное предложение, в котором подсвечены слова, которых не было у ученика
function highlighted(corrected, original) {
  const normalize = (word) => word.toLowerCase().replace(/[^a-z']/g, '');
  const had = (original || '').split(/\s+/).map(normalize);
  return corrected.split(/\s+/).flatMap((word) => {
    const index = had.indexOf(normalize(word));
    if (index >= 0) {
      had.splice(index, 1); // каждое слово ученика засчитываем один раз
      return [word, ' '];
    }
    return [h('mark', null, word), ' '];
  });
}

// Разбор ошибки: как правильно → почему → шаблон → два примера.
// fix — { corrected, why, pattern, examples }, original — что написал ученик.
export function fixDetails(fix, original) {
  return [
    h('div', { class: 'result-fix' }, ...highlighted(fix.corrected, original), speakButton(fix.corrected)),
    fix.why || fix.explanation ? h('p', null, fix.why || fix.explanation) : null,
    fix.pattern ? h('div', { class: 'pattern' }, fix.pattern) : null,
    fix.examples?.length
      ? h('ul', { class: 'examples' }, fix.examples.map((example) =>
          h('li', null, h('b', null, example.en), example.ru ? ` — ${example.ru}` : '')))
      : null,
  ];
}

// Блок с результатом проверки от ИИ
export function resultBox(result, original) {
  if (result.correct) {
    return h('div', { class: 'result ok' }, h('div', { class: 'result-title' }, '✓ Верно'));
  }
  return h('div', { class: 'result bad' },
    h('div', { class: 'result-title' }, '✗ Есть ошибка'),
    ...fixDetails(result, original),
  );
}
