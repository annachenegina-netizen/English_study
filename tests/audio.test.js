// Тесты включения микрофона на поддельных браузерных объектах
import { test } from 'node:test';
import assert from 'node:assert/strict';

let track;
Object.defineProperty(globalThis.navigator, 'mediaDevices', {
  configurable: true,
  value: {
    getUserMedia: async () => {
      track = { readyState: 'live', stopped: false, stop() { this.stopped = true; this.readyState = 'ended'; } };
      return { getTracks: () => [track], getAudioTracks: () => [track] };
    },
  },
});

class FakeWorkletNode {
  static lastOptions;
  constructor(context, name, options) {
    FakeWorkletNode.lastOptions = options;
    this.port = {};
  }
  disconnect() {}
}
globalThis.AudioWorkletNode = FakeWorkletNode;

function fakeContext({ workletFails = false } = {}) {
  return {
    sampleRate: 48000,
    audioWorklet: { addModule: async () => { if (workletFails) throw new Error('worklet'); } },
    createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
  };
}

const { startMic } = await import('../js/call/audio.js');

test('обработчик звука не загрузился — микрофон выключается, а не висит включённым', async () => {
  await assert.rejects(startMic(fakeContext({ workletFails: true }), () => {}));
  assert.equal(track.stopped, true);
});

test('обработчик звука без выходов — иначе Safari может его не запускать', async () => {
  await startMic(fakeContext(), () => {});
  assert.equal(FakeWorkletNode.lastOptions?.numberOfOutputs, 0);
});

test('alive() показывает, что iOS отобрала микрофон', async () => {
  const mic = await startMic(fakeContext(), () => {});
  assert.equal(mic.alive(), true);
  track.readyState = 'ended';
  assert.equal(mic.alive(), false);
});
