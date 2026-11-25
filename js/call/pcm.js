// Перевод звука в формат Gemini Live и обратно. Чистые функции — работают и в браузере, и в Node (тесты).
// Gemini принимает 16-битные отсчёты (PCM16) с частотой 16 000 в секунду, а присылает 24 000 в секунду.

// Понижает частоту: каждый выходной отсчёт — среднее соседних входных
export function downsample(input, fromRate, toRate) {
  if (fromRate === toRate) return new Float32Array(input);
  const ratio = fromRate / toRate;
  const length = Math.round(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    output[i] = end > start ? sum / (end - start) : 0;
  }
  return output;
}

// Числа от -1 до 1 → целые от -32768 до 32767 (лишнее обрезается)
export function floatToPcm16(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const value = Math.max(-1, Math.min(1, input[i]));
    output[i] = value < 0 ? value * 32768 : value * 32767;
  }
  return output;
}

// Обратно: целые → числа от -1 до 1, как нужно для воспроизведения
export function pcm16ToFloat(input) {
  const output = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) output[i] = input[i] / 32768;
  return output;
}

// Отсчёты → base64 для отправки в JSON. Байты идут младшим вперёд, как ждёт Gemini.
export function int16ToBase64(samples) {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = '';
  // Кусками, чтобы не упереться в лимит аргументов String.fromCharCode
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function base64ToInt16(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
}
