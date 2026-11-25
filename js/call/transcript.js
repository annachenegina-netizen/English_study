// Текст разговора: Google присылает распознанную речь кусками, здесь они собираются в реплики.
// Реплика — { role: 'user' | 'ai', text, open }. open — реплика ещё продолжается.

// Добавляет кусок текста: дописывает к открытой реплике того же собеседника или начинает новую
export function addPiece(turns, role, text) {
  const last = turns.at(-1);
  if (last && last.open && last.role === role) {
    // Куски иногда приходят без пробела между словами или предложениями
    const glue = !last.text || /^\s/.test(text) || /\s$/.test(last.text) ? '' : ' ';
    return [...turns.slice(0, -1), { ...last, text: last.text + glue + text }];
  }
  return [...turns, { role, text, open: true }];
}

// ИИ договорил или его перебили — все реплики закончены
export function closeTurns(turns) {
  return turns.map((turn) => (turn.open ? { ...turn, open: false } : turn));
}

// Чистый текст разговора для разбора и сохранения
export function plainTurns(turns) {
  return turns
    .map(({ role, text }) => ({ role, text: text.trim() }))
    .filter((turn) => turn.text);
}
