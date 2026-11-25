// Тесты перевода звука: микрофон → 16 кГц PCM16 → base64 и обратно
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downsample, floatToPcm16, pcm16ToFloat, int16ToBase64, base64ToInt16 } from '../js/call/pcm.js';

test('48к → 16к: длина втрое меньше', () => {
  assert.equal(downsample(new Float32Array(4800), 48000, 16000).length, 1600);
});

test('44.1к → 16к: длина пропорциональна', () => {
  assert.equal(downsample(new Float32Array(4410), 44100, 16000).length, 1600);
});

test('та же частота — без изменений', () => {
  const input = new Float32Array([0.1, 0.2, 0.3]);
  assert.deepEqual([...downsample(input, 16000, 16000)], [...input]);
});

test('понижение частоты усредняет соседние отсчёты', () => {
  const out = downsample(new Float32Array([0, 0.6, 0.3, 0.3, 0.3, 0.3]), 48000, 16000);
  assert.ok(Math.abs(out[0] - 0.3) < 1e-6);
});

test('PCM16 крайние значения и обрезка', () => {
  assert.deepEqual([...floatToPcm16(new Float32Array([-1, 0, 1, 2]))], [-32768, 0, 32767, 32767]);
});

test('base64 туда-обратно', () => {
  const a = new Int16Array([1, -2, 32767, -32768]);
  assert.deepEqual([...base64ToInt16(int16ToBase64(a))], [...a]);
});

test('base64 в порядке little-endian', () => {
  assert.equal(int16ToBase64(new Int16Array([1])), 'AQA=');
});

test('PCM16 → float в пределах [-1, 1]', () => {
  const f = pcm16ToFloat(new Int16Array([-32768, 32767]));
  assert.ok(f[0] >= -1 && f[1] <= 1);
  assert.equal(f[0], -1);
});
