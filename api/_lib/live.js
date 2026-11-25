// Настройка голосового звонка через Gemini Live: инструкция репетитору и параметры сессии.
import { TEACHER_STYLE } from './gemini.js';

// Модель для звонка. Если Google её переименует — задай GEMINI_LIVE_MODEL в Vercel.
export const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';

// Голос репетитора из готовых голосов Google. Подбирается на проверке с iPhone.
export const VOICE = 'Kore';

// Сколько тишины (мс) считать концом фразы. Новичок делает паузы посреди фразы —
// поэтому больше, чем по умолчанию, чтобы ИИ его не перебивал.
const SILENCE_MS = 1200;

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
export function buildTutorPrompt({ level, maxLevel, topics, words, memory }) {
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

How to correct mistakes:
- Small mistake: do NOT stop. Just repeat the correct version naturally in your reply.
  Example: he says "I go to shop yesterday" — you say "Oh, you went to the shop yesterday? What did you buy?"
- Stop and correct ONLY when the same mistake repeats (he already made it in this call, or it is in his frequent mistakes list)
  or when you cannot understand the sentence. Then: explain in Russian in one or two short sentences,
  ask him to say the correct sentence, praise him briefly, and continue the talk.
- Never correct if you are not 100% sure it is a mistake. A false correction is worse than a missed one.
- Do not correct pronunciation if the word is understandable.

Rules for Russian explanations:
${TEACHER_STYLE}

When he says goodbye ("bye", "пока", "I have to go"), say a short goodbye and then call the end_call function.
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
    inputAudioTranscription: {},
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
