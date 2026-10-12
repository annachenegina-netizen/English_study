// Прогресс ученика: хранение, синхронизация с сервером и расчёт уровня.
import { WORD_LEVELS } from './data/words.js';
import { TOPICS, TOPIC_NAMES_EN } from './data/grammar.js';
import { api } from './api.js';

const STORAGE_KEY = 'et_progress';
const DAY = 24 * 60 * 60 * 1000;

// Через сколько дней слово вернётся на повторение. Индекс — «ступень» слова.
export const INTERVALS = [0, 1, 3, 7, 14, 30];
export const MAX_LEVEL = WORD_LEVELS.length;
export const NEW_WORDS_PER_DAY = 7;
const CHAT_LIMIT = 40; // сколько сообщений чата храним

function emptyProgress() {
  return {
    updatedAt: 0,
    words: {},      // { want: { stage: 2, due: 1760000000000 } }
    grammar: {},    // { be: { done: true } }
    chat: [],       // [{ role: 'ai' | 'user', text, fix }]
    streak: { last: '', count: 0 },
    day: { date: '', newCount: 0 },
  };
}

function readLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...emptyProgress(), ...saved } : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

// Общее состояние. sync — подключена ли база на сервере.
// version — версия сайта на сервере; outdated — на сервере уже новее, чем открыто во вкладке
export const state = { progress: readLocal(), sync: false, version: '', outdated: false };

// Дата в виде 2026-10-12 по местному времени
function dateKey(date = new Date()) {
  return date.toLocaleDateString('sv');
}

// ---------- Сохранение и синхронизация ----------

let pushTimer = null;

// Вызывается после любого изменения прогресса
export function save() {
  state.progress.updatedAt = Date.now();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress)); } catch { /* нет места или приватный режим */ }

  // Отправляем на сервер не на каждый чих, а через полторы секунды тишины
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 1500);
}

async function push() {
  try {
    await api('/api/progress', { method: 'PUT', body: { progress: state.progress } });
  } catch (error) {
    console.log('[store] Не удалось отправить прогресс на сервер:', error.message);
  }
}

// Забирает прогресс с сервера. Побеждает тот, что изменён позже.
// Возвращает true, если локальный прогресс заменился серверным.
export async function pull() {
  const data = await api('/api/progress');
  state.sync = Boolean(data.sync);
  // Первая версия, которую увидели, — та, что сейчас открыта. Пришла другая — вышло обновление.
  if (data.version) {
    if (!state.version) state.version = data.version;
    else if (state.version !== data.version) state.outdated = true;
  }
  const remote = data.progress;

  if (remote && (remote.updatedAt || 0) > (state.progress.updatedAt || 0)) {
    state.progress = { ...emptyProgress(), ...remote };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress)); } catch { /* не страшно */ }
    return true;
  }
  if (state.sync && state.progress.updatedAt) push();
  return false;
}

// ---------- Серия дней ----------

// Отмечает, что сегодня была активность
export function touchStreak() {
  const today = dateKey();
  const streak = state.progress.streak;
  if (streak.last === today) return;
  const yesterday = dateKey(new Date(Date.now() - DAY));
  streak.count = streak.last === yesterday ? streak.count + 1 : 1;
  streak.last = today;
}

// Серия для показа: если вчера и сегодня не занимался — она сгорела
export function currentStreak() {
  const { last, count } = state.progress.streak;
  const yesterday = dateKey(new Date(Date.now() - DAY));
  return last === dateKey() || last === yesterday ? count : 0;
}

// ---------- Уровни ----------

export function isLearned(word) {
  return (state.progress.words[word]?.stage || 0) >= 1;
}

// Сколько сделано на уровне. Уровень закрыт, когда выучено 80% слов и пройдены обе темы.
export function levelStats(level) {
  const words = WORD_LEVELS[level - 1];
  const topics = TOPICS.filter((topic) => topic.level === level);
  const learned = words.filter((word) => isLearned(word[0])).length;
  const topicsDone = topics.filter((topic) => state.progress.grammar[topic.id]?.done).length;
  const wordsNeeded = Math.ceil(words.length * 0.8);
  return {
    words: words.length,
    learned,
    wordsNeeded,
    topics: topics.length,
    topicsDone,
    complete: learned >= wordsNeeded && topicsDone === topics.length,
  };
}

// Текущий уровень — первый незакрытый
export function currentLevel() {
  for (let level = 1; level <= MAX_LEVEL; level++) {
    if (!levelStats(level).complete) return level;
  }
  return MAX_LEVEL;
}

// Все уровни пройдены?
export function allComplete() {
  return levelStats(MAX_LEVEL).complete && currentLevel() === MAX_LEVEL;
}

// ---------- Слова ----------

function todayCounter() {
  const today = dateKey();
  if (state.progress.day.date !== today) state.progress.day = { date: today, newCount: 0 };
  return state.progress.day;
}

// Слова, доступные на текущем уровне
function availableWords() {
  return WORD_LEVELS.slice(0, currentLevel()).flat();
}

export function dueCount() {
  const now = Date.now();
  return availableWords().filter((word) => {
    const saved = state.progress.words[word[0]];
    return saved && saved.stage >= 1 && saved.due <= now;
  }).length;
}

// Следующее слово: сначала повторения, потом новые (в пределах дневной нормы).
// extra — сколько новых слов сверх нормы ученик попросил в этой сессии.
export function nextWord(extra = 0) {
  const now = Date.now();
  const pool = availableWords();

  const due = pool
    .filter((word) => {
      const saved = state.progress.words[word[0]];
      return saved && saved.stage >= 1 && saved.due <= now;
    })
    .sort((a, b) => state.progress.words[a[0]].due - state.progress.words[b[0]].due);
  if (due.length) return { word: due[0], review: true };

  const fresh = pool.find((word) => !isLearned(word[0]));
  if (!fresh) return { empty: 'no-words' };
  if (todayCounter().newCount >= NEW_WORDS_PER_DAY + extra) return { empty: 'day-limit' };
  return { word: fresh, review: false };
}

// Записывает результат по слову и двигает его по ступеням повторения
export function recordWord(word, correct) {
  const saved = state.progress.words[word] || { stage: 0, due: 0 };
  const wasNew = saved.stage === 0;

  if (correct) {
    saved.stage = Math.min(saved.stage + 1, INTERVALS.length - 1);
    saved.due = Date.now() + INTERVALS[saved.stage] * DAY;
    if (wasNew) todayCounter().newCount += 1;
  } else if (!wasNew) {
    // Ошибся на повторении — откатываем на ступень назад и спросим снова в этой же сессии
    saved.stage = Math.max(1, saved.stage - 1);
    saved.due = Date.now();
  }

  state.progress.words[word] = saved;
  touchStreak();
  save();
}

// ---------- Грамматика ----------

export function completeTopic(id) {
  state.progress.grammar[id] = { done: true };
  touchStreak();
  save();
}

// ---------- Чат ----------

export function addChatMessage(message) {
  state.progress.chat.push(message);
  state.progress.chat = state.progress.chat.slice(-CHAT_LIMIT);
  if (message.role === 'user') touchStreak();
  save();
}

export function clearChat() {
  state.progress.chat = [];
  save();
}

// Что ученик уже знает — отправляем в чат, чтобы ИИ не выходил за эти рамки
export function knowledge() {
  const learned = Object.keys(state.progress.words).filter(isLearned);
  // Берём случайные 30 слов, чтобы в разных диалогах всплывали разные
  const words = learned.sort(() => Math.random() - 0.5).slice(0, 30);
  const topics = TOPICS.filter((topic) => state.progress.grammar[topic.id]?.done).map((topic) => TOPIC_NAMES_EN[topic.id]);
  return { level: currentLevel(), maxLevel: MAX_LEVEL, words, topics };
}
