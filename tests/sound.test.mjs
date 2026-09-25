import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SoundEffects } from '../src/audio/sound.ts';

class Param {
  value = 0;
  events = [];
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push(['ramp', value, time]); }
  cancelScheduledValues(time) { this.events.push(['cancel', time]); }
}

class AudioNode {
  connect(target) { return target; }
  disconnect() {}
}

class Context {
  state = 'suspended';
  currentTime = 0;
  destination = new AudioNode();
  sources = [];
  gains = [];
  createGain() {
    const gain = Object.assign(new AudioNode(), { gain: new Param() });
    this.gains.push(gain);
    return gain;
  }
  createBufferSource() {
    const source = Object.assign(new AudioNode(), {
      playbackRate: { value: 1 }, buffer: null, starts: [],
      start(...args) { this.starts.push(args); },
    });
    this.sources.push(source);
    return source;
  }
  async resume() { this.state = 'running'; }
  async decodeAudioData(bytes) { return { duration: 1, clip: new Uint8Array(bytes)[0] }; }
}

test('첫 입력 전에는 무음, 절취 진행만 속도 연동·간격 제한, 종료 시 감쇠', async () => {
  const originalContext = globalThis.AudioContext;
  const originalFetch = globalThis.fetch;
  let context;
  const fetched = [];
  globalThis.AudioContext = class extends Context { constructor() { super(); context = this; } };
  globalThis.fetch = async (url) => {
    fetched.push(url);
    const id = url.includes('tear') ? 1 : url.includes('swipe') ? 2 : 3;
    return { ok: true, arrayBuffer: async () => new Uint8Array([id]).buffer };
  };
  try {
    const sound = new SoundEffects();
    sound.preload();
    assert.equal(fetched.length, 3);
    sound.cut(0.1, 1);
    assert.equal(context, undefined);
    await sound.unlock();
    sound.cut(0, 2);
    assert.equal(context.sources.length, 0, '미절단 구간에는 소리가 없어야 함');

    sound.cut(0.02, 0.6);
    sound.cut(0.02, 3);
    assert.equal(context.sources.length, 1, '연속 입력은 약 45ms 간격으로 제한');
    const slowRate = context.sources[0].playbackRate.value;
    const slowLevel = context.gains.at(-1).gain.events[1][1];
    context.currentTime = 0.05;
    sound.cut(0.02, 3);
    assert.equal(context.sources.length, 2);
    assert.ok(context.sources[1].playbackRate.value > slowRate);
    assert.ok(context.gains.at(-1).gain.events[1][1] > slowLevel);

    sound.updateCut(false);
    assert.ok(context.gains.at(-1).gain.events.some(([type, value]) => type === 'ramp' && value === 0));
    context.currentTime = 0.06;
    sound.cut(0.02, 1);
    assert.equal(context.sources.length, 3, '손을 뗀 뒤 같은 지점을 다시 자를 수 있음');
    context.currentTime = 0.15;
    sound.updateCut(true);
    assert.ok(context.gains.at(-1).gain.events.some(([type]) => type === 'cancel'), '움직임이 멈추면 감쇠');

    sound.completeCut();
    assert.equal(context.sources.length, 4);
    assert.equal(context.sources.at(-1).buffer.clip, 1);
    sound.swipe(); sound.swipe(); sound.confirm();
    assert.deepEqual(context.sources.slice(-3).map((source) => source.buffer.clip), [2, 2, 3]);
  } finally {
    globalThis.AudioContext = originalContext;
    globalThis.fetch = originalFetch;
  }
});

test('지원하지 않는 오디오 환경이나 음원 로딩 실패도 앱 흐름을 막지 않는다', async () => {
  const originalContext = globalThis.AudioContext;
  const originalFetch = globalThis.fetch;
  try {
    globalThis.AudioContext = undefined;
    const unsupported = new SoundEffects();
    await unsupported.unlock();
    unsupported.swipe(); unsupported.confirm();

    let context;
    globalThis.AudioContext = class extends Context { constructor() { super(); context = this; } };
    globalThis.fetch = async () => ({ ok: false });
    const missing = new SoundEffects();
    missing.preload();
    await missing.unlock();
    missing.cut(0.1, 2); missing.swipe(); missing.confirm();
    assert.equal(context.sources.length, 0);
  } finally {
    globalThis.AudioContext = originalContext;
    globalThis.fetch = originalFetch;
  }
});
