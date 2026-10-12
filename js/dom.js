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

// Блок с результатом проверки от ИИ: верно/неверно, исправление, объяснение
export function resultBox(result) {
  return h('div', { class: `result ${result.correct ? 'ok' : 'bad'}` },
    h('div', { class: 'result-title' }, result.correct ? '✓ Верно' : '✗ Есть ошибка'),
    !result.correct && result.corrected
      ? h('div', { class: 'result-fix' }, result.corrected, ' ', speakButton(result.corrected))
      : null,
    result.explanation ? h('p', null, result.explanation) : null,
    result.tip ? h('p', { class: 'result-tip' }, 'В живой речи: ', h('b', null, result.tip)) : null,
  );
}
