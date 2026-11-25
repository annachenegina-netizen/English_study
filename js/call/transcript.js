// Текст разговора: Google присылает распознанную речь кусками, здесь они собираются в реплики.
// Реплика — { role: 'user' | 'ai', text, open }. open — реплика ещё продолжается.

// Добавляет кусок текста: дописывает к открытой реплике того же собеседника или начинает новую.
// Ищем не только последнюю реплику: распознанная речь ученика часто приходит с опозданием,
// когда ИИ уже начал отвечать, — её конец должен попасть в ту же фразу ученика.
export function addPiece(turns, role, text) {
  const index = turns.findLastIndex((turn) => turn.open && turn.role === role);
  if (index >= 0) {
    const turn = turns[index];
    // Куски иногда приходят без пробела между словами или предложениями
    const glue = !turn.text || /^\s/.test(text) || /\s$/.test(turn.text) ? '' : ' ';
    return turns.map((item, i) => (i === index ? { ...turn, text: turn.text + glue + text } : item));
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
