// Память репетитора между звонками: частые ошибки, факты об ученике, о чём говорили.
// Лежит в Upstash отдельным ключом, а не внутри прогресса: прогресс браузер
// перезаписывает целиком, и память бы затиралась.
import { hasStore, getJson, setJson } from './store.js';

export const MEMORY_KEY = 'english-trainer:voice-memory';

const MAX_FACTS = 30;
const MAX_SUMMARIES = 5;

export function emptyMemory() {
  return { mistakes: {}, facts: [], summaries: [] };
}

// Сравниваем факты без учёта регистра и пробелов по краям
const sameFact = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Добавляет итоги звонка к памяти. Исходный объект не меняет.
// review — { fixes: [{ topic, said, corrected }], facts: [строки], summary }, now — время в мс
export function mergeMemory(memory, review, now) {
  const result = {
    mistakes: { ...(memory?.mistakes || {}) },
    facts: [...(memory?.facts || [])],
    summaries: [...(memory?.summaries || [])],
  };

  // Ошибки: считаем по темам справочника, запоминаем последний пример
  for (const fix of review.fixes || []) {
    if (!fix.corrected || !fix.topic || fix.topic === 'other') continue;
    const old = result.mistakes[fix.topic];
    result.mistakes[fix.topic] = {
      count: (old?.count || 0) + 1,
      example: `${fix.said} → ${fix.corrected}`,
      last: now,
    };
  }

  // Факты: без повторов, новые в конец, самые старые вытесняются
  for (const raw of review.facts || []) {
    const fact = String(raw || '').trim();
    if (fact && !result.facts.some((known) => sameFact(known, fact))) result.facts.push(fact);
  }
  result.facts = result.facts.slice(-MAX_FACTS);

  // Резюме разговоров: последние несколько
  const summary = String(review.summary || '').trim();
  if (summary) result.summaries.push({ at: now, text: summary });
  result.summaries = result.summaries.slice(-MAX_SUMMARIES);

  return result;
}

// Читает память из базы. Нет базы или она сломалась — звонок идёт без памяти.
export async function loadMemory() {
  if (!hasStore) return emptyMemory();
  try {
    return { ...emptyMemory(), ...(await getJson(MEMORY_KEY)) };
  } catch (error) {
    console.log('[memory] Не удалось прочитать память, звоню без неё:', error.message);
    return emptyMemory();
  }
}

export async function saveMemory(memory) {
  if (!hasStore) return;
  await setJson(MEMORY_KEY, memory);
}
