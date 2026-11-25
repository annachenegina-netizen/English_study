// Обработчик звука с микрофона. Работает в отдельном потоке браузера (AudioWorklet).
// Копит отсчёты примерно на 100 мс и отправляет их на страницу одним куском.
class MicChunker extends AudioWorkletProcessor {
  constructor() {
    super();
    // sampleRate — частота звука в браузере (обычно 48 000), задаётся самим браузером
    this.size = Math.round(sampleRate / 10);
    this.buffer = new Float32Array(this.size);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.filled++] = channel[i];
      if (this.filled === this.size) {
        this.port.postMessage(this.buffer);
        this.buffer = new Float32Array(this.size);
        this.filled = 0;
      }
    }
    return true; // продолжаем работать
  }
}

registerProcessor('mic-chunker', MicChunker);
