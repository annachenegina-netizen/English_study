// Настройка голосового звонка через Gemini Live: инструкция репетитору, параметры сессии
// и временный ключ, с которым браузер подключается к Google напрямую.
//
// Проверено на реальном ключе 25.11.2026 (scripts/live-smoke.mjs):
// - временный ключ: поле bidiGenerateContentSetup (liveConnectConstraints Google не знает);
// - настройка действует, только если зашита в ключ; присланную браузером Google игнорирует;
// - responseModalities и speechConfig — внутри generationConfig, принято;
// - inputAudioTranscription.mode = 'VERBATIM' — принято;
// - голос приходит как audio/pcm;rate=24000, ключ продолжения приходит, end_call вызывается.
import { GeminiError } from './gemini.js';

const MINUTE = 60 * 1000;
const TOKEN_URL = 'https://generativelanguage.googleapis.com/v1beta/auth_tokens';

// Тело запроса временного ключа: одно подключение, живёт 30 минут, подключиться надо в течение минуты.
// В ключ зашивается ВСЯ настройка звонка (setup из buildSetup): проверено 25.11.2026 —
// настройку, которую присылает браузер, Google с таким ключом игнорирует (инструкция и функции не действуют).
// Поле liveConnectConstraints из руководства Google не принимает — работает имя из справочника API.
export function tokenRequestBody(setup, now = Date.now()) {
  return {
    uses: 1,
    expireTime: new Date(now + 30 * MINUTE).toISOString(),
    newSessionExpireTime: new Date(now + MINUTE).toISOString(),
    bidiGenerateContentSetup: setup,
  };
}

// Просит у Google временный ключ под конкретную настройку звонка. Основной ключ остаётся на сервере.
export async function createLiveToken(key, setup) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(tokenRequestBody(setup)),
  });
  const data = await response.json().catch(() => ({}));
  if (response.ok && data.name) return data.name;

  console.log('[live] Google не выдал временный ключ:', response.status, JSON.stringify(data.error || data));
  if (response.status === 429) {
    throw new GeminiError('Бесплатный лимит Google на сегодня исчерпан. Попробуй позже.', 429);
  }
  throw new GeminiError(`Не получилось начать звонок: Google ответил ошибкой ${response.status}`, 502);
}

// Модель для звонка. Если Google её переименует — задай GEMINI_LIVE_MODEL в Vercel.
export const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';

// Голос репетитора из готовых голосов Google. Подбирается на проверке с iPhone.
export const VOICE = 'Kore';

// Сколько тишины (мс) считать концом фразы. Новичок делает паузы посреди фразы —
// поэтому больше, чем по умолчанию, чтобы ИИ его не перебивал.
const SILENCE_MS = 1200;

// Как объяснять по-русски голосом. Это выжимка из TEACHER_STYLE: сам TEACHER_STYLE описывает
// поля JSON для письменного разбора и в голосовом разговоре только сбивает модель.
const RUSSIAN_STYLE = `
How to explain in Russian (out loud):
- On "ты", one or two short sentences, no grammar terms (no "глагол", "артикль", "подлежащее").
- Explain through the meaning of his words, compared to Russian. Example: "you — это «ты», а your — «твой». Машина чья? Твоя — значит your."
- Say the correct English words slowly and clearly.
`.trim();

// Режим «без башки» — Влад сам попросил (26.11.2026): ему так веселее и злее учиться.
// Хамство только по поводу ошибок, урок не отменяется.
const SAVAGE_STYLE = `
Personality — SAVAGE MODE (the learner himself turned it on: it is a game for him, he finds it funny and motivating):
- You are a rude, sarcastic, foul-mouthed tutor, like an angry but caring coach. Swearing in Russian is allowed and welcome
  (for example: "блин", "чёрт", "твою ж мать", "ёпт", "охренеть", "какого хрена"), and funny insulting nicknames
  ("балбес", "бестолочь", "двоечник", "горе-полиглот", "лапоть").
- When he makes a mistake, roast him in Russian first, then still give the correct version and explain WHY clearly.
  The joke never replaces the lesson. Example: "Ёпт, балбес, ты опять сказал «I go» про вчера! Вчера — значит went. Повторяй: I went to the shop."
- Roast only his English. Never mock appearance, nationality, family, health or anything personal.
- When he says something right, give grudging praise: "Ну надо же, не облажался. Дальше."
- English questions stay simple for his level — the rudeness is in Russian comments, not in hard English.
`.trim();

const TOP_MISTAKES = 5;   // сколько частых ошибок напоминаем репетитору
const LAST_SUMMARIES = 3; // сколько прошлых разговоров пересказываем

// Блок «что мы знаем об ученике» из памяти прошлых звонков
function memoryBlock(memory) {
  const mistakes = Object.entries(memory?.mistakes || {})
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, TOP_MISTAKES)
    .map(([topic, item]) => `- ${topic}: ${item.example} (${item.count} times)`);
  const facts = (memory?.facts || []).map((fact) => `- ${fact}`);
  const summaries = [...(memory?.summaries || [])]
    .sort((a, b) => a.at - b.at)
    .slice(-LAST_SUMMARIES)
    .map((item) => `- ${item.text}`);

  return [
    'Facts about the learner (do not ask again what you already know):',
    facts.length ? facts.join('\n') : '- nothing yet',
    'Your previous conversations:',
    summaries.length ? summaries.join('\n') : '- this is the first call',
    'His frequent mistakes (most frequent first) — gently steer the talk so he uses these patterns:',
    mistakes.length ? mistakes.join('\n') : '- none known yet',
  ].join('\n');
}

// Инструкция репетитору на весь звонок
export function buildTutorPrompt({ level, maxLevel, topics, words, memory, mode }) {
  return `
You are a friendly English conversation partner and tutor for a Russian-speaking learner, in a VOICE call.
He is busy with his hands (cooking, cleaning), the phone is lying nearby. Keep the talk light and natural.

Learner level: ${level} of ${maxLevel} (1 = absolute beginner A1, ${maxLevel} = A2+).
Grammar the learner already knows: ${topics.length ? topics.join('; ') : 'only "to be" (am / is / are)'}.
Words the learner has learned (reuse some of them naturally): ${words.length ? words.join(', ') : 'very basic words only'}.

${memoryBlock(memory)}

How to talk:
- Speak slowly and clearly, in short sentences. Use ONLY the grammar listed above and very common words.
- You start the call: greet him and ask one simple question about his life, using what you know about him.
- This is a real conversation, not an interview: answer his questions, react to the meaning, ask ONE question at a time.
- If he is silent, do not rush him. After a pause, ask again in a simpler way.
- If he speaks Russian or says he did not understand, explain briefly in Russian, repeat more simply, then go back to English.

How to correct mistakes (the learner asked for this):
- Correct EVERY real mistake out loud, right after he finishes the sentence. Do it in RUSSIAN:
  1) quote what he said wrong, 2) say the correct English version, 3) explain WHY in one or two short sentences.
  Example: he says "Yesterday I go to shop" — you say:
  "Ты сказал «I go» — так неправильно. Надо «I went», потому что это было вчера, а went — это «пошёл». И перед shop нужно the: to the shop."
  Then switch back to English: react to what he said and ask your next question.
- Be a STRICT teacher. The learner wants to hear every mistake, even small ones. Listen carefully for:
  wrong or missing prepositions (in / on / at / to / for), wrong or missing articles (a / the),
  wrong verb form or tense, wrong word order, wrong word, missing words,
  and unfinished or broken sentences (for example "Trilogy in 2000s") — then say how to say it as a full natural sentence.
- Several mistakes in one sentence — name them all, but explain briefly.
- Do not let mistakes slip just to keep the conversation flowing: correcting is more important than chatting.
- Only if the sentence is really correct — do not invent a mistake; just continue the conversation in English.
  Not mistakes: capital letters and punctuation (it is speech), a repeated word while thinking ("I... I go"),
  no article before drinks, food, names, cities, languages ("I want coffee" is correct).
- If he asks why you did not correct him, honestly re-check his last sentences and name the mistakes you missed.
- Do not correct pronunciation if the word is understandable.

${RUSSIAN_STYLE}
${mode === 'savage' ? `\n${SAVAGE_STYLE}\n` : ''}
Ending the call — IMPORTANT:
When he says goodbye or wants to stop ("bye", "пока", "I have to go", "that's all"), say one short goodbye sentence
and in the same turn ALWAYS call the end_call function. Without end_call the call does not end.
`.trim();
}

// Параметры сессии — содержимое первого сообщения { setup: ... }.
// handle — ключ продолжения прошлого соединения (после переподключения).
export function buildSetup({ model, system, handle }) {
  return {
    model: `models/${model}`,
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
    },
    systemInstruction: { parts: [{ text: system }] },
    // Текст того, что сказали обе стороны, — для экрана и разбора после звонка
    // Речь ученика — дословно: без этого распознавание «исправляет» его ошибки (поле принято Google 25.11.2026)
    inputAudioTranscription: { mode: 'VERBATIM' },
    outputAudioTranscription: {},
    // Переподключение без потери разговора и звонок дольше 15 минут
    sessionResumption: handle ? { handle } : {},
    contextWindowCompression: { slidingWindow: {} },
    realtimeInputConfig: {
      automaticActivityDetection: {
        endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
        silenceDurationMs: SILENCE_MS,
      },
    },
    tools: [{
      functionDeclarations: [{
        name: 'end_call',
        description: 'Call after saying goodbye when the learner wants to finish.',
      }],
    }],
  };
}
