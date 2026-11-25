// Микрофон и воспроизведение голоса ИИ во время звонка. Только для браузера.
import { downsample, floatToPcm16, int16ToBase64, base64ToInt16, pcm16ToFloat } from './pcm.js';

const MIC_RATE = 16000;   // Gemini слушает 16 000 отсчётов в секунду
const VOICE_RATE = 24000; // и говорит 24 000

// Включает микрофон. Каждые ~100 мс вызывает onChunk(base64) с куском звука для Gemini.
// Вызывать после нажатия кнопки: иначе iPhone не даст доступ к звуку.
export async function startMic(context, onChunk) {
  // На iPhone просим режим «говорю и слушаю», чтобы голос ИИ шёл в динамик нормальной громкости
  if (navigator.audioSession) navigator.audioSession.type = 'play-and-record';

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true, // чтобы ИИ не слышал сам себя из динамика
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  });

  await context.audioWorklet.addModule(new URL('./mic-worklet.js', import.meta.url));
  const source = context.createMediaStreamSource(stream);
  const chunker = new AudioWorkletNode(context, 'mic-chunker');
  let muted = false;

  chunker.port.onmessage = (event) => {
    if (muted) return;
    const samples = downsample(event.data, context.sampleRate, MIC_RATE);
    onChunk(int16ToBase64(floatToPcm16(samples)));
  };
  source.connect(chunker);

  return {
    // Пауза: микрофон остаётся включённым, но звук никуда не уходит
    setMuted(value) { muted = value; },
    stop() {
      chunker.port.onmessage = null;
      source.disconnect();
      chunker.disconnect();
      for (const track of stream.getTracks()) track.stop();
    },
  };
}

// Проигрыватель голоса ИИ: куски звука ставятся в очередь и играют встык, без щелчков и пауз
export function createPlayer(context) {
  const playing = new Set();
  let nextTime = 0;
  let waiters = [];

  const checkIdle = () => {
    if (playing.size) return;
    for (const resolve of waiters) resolve();
    waiters = [];
  };

  return {
    play(base64) {
      const samples = pcm16ToFloat(base64ToInt16(base64));
      if (!samples.length) return;
      const buffer = context.createBuffer(1, samples.length, VOICE_RATE);
      buffer.copyToChannel(samples, 0);

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      nextTime = Math.max(nextTime, context.currentTime);
      source.start(nextTime);
      nextTime += buffer.duration;

      playing.add(source);
      source.onended = () => {
        playing.delete(source);
        checkIdle();
      };
    },

    // Ученик перебил ИИ — мгновенно замолкаем и выбрасываем очередь
    flush() {
      for (const source of playing) {
        source.onended = null;
        try { source.stop(); } catch { /* уже остановлен */ }
      }
      playing.clear();
      nextTime = 0;
      checkIdle();
    },

    // Дождаться, пока доиграет всё, что в очереди (например, прощание перед концом звонка)
    idle() {
      if (!playing.size) return Promise.resolve();
      return new Promise((resolve) => waiters.push(resolve));
    },
  };
}
