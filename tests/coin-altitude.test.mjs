import assert from 'node:assert/strict';
import { test } from 'node:test';
import { altitudeAt, BEST_KEY, formatAltitude, loadBest, MILESTONES, saveBest } from '../src/coin/altitude.ts';

test('고도는 높이에 따라 끊김 없이 계속 커지고, 쉬는 코인은 0m', () => {
  assert.equal(altitudeAt(0.036 - 0.036), 0);
  let prev = -1;
  for (let h = 0; h <= 140; h += 0.05) {
    const a = altitudeAt(h);
    assert.ok(a > prev, `높이 ${h.toFixed(2)}`);
    // 기준점 경계에서 튀지 않는다 (0.05 차이로 두 배 넘게 뛰지 않음)
    if (prev > 1) assert.ok(a / prev < 2, `높이 ${h.toFixed(2)}: ${prev} → ${a}`);
    prev = a;
  }
});

test('구간 이름의 높이는 실제 천체 거리와 맞는다', () => {
  const at = (name) => altitudeAt(MILESTONES.find((m) => m.name === name).height);
  assert.ok(Math.abs(at('우주') - 1e5) < 1);
  assert.ok(Math.abs(at('달') / 3.84e8 - 1) < 0.01);
  assert.ok(at('은하 밖') > 5e20);
});

test('한국어 큰 수 단위로 보여 준다', () => {
  assert.equal(formatAltitude(0), '0 m');
  assert.equal(formatAltitude(812.4), '812 m');
  assert.equal(formatAltitude(3200), '3.2 km');
  assert.equal(formatAltitude(100000), '100 km');
  assert.equal(formatAltitude(3.84e8), '38만 km');
  assert.equal(formatAltitude(7.8e11), '7.8억 km');
  assert.equal(formatAltitude(9.4607e16), '10 광년');
  assert.equal(formatAltitude(9.4607e20), '10만 광년');
});

test('최고 기록을 저장하고 불러오며, 저장소가 없거나 깨져도 0으로 시작한다', () => {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  assert.equal(loadBest(storage), 0);
  saveBest(storage, 3.84e8);
  assert.equal(map.get(BEST_KEY), '384000000');
  assert.equal(loadBest(storage), 3.84e8);
  map.set(BEST_KEY, 'abc');
  assert.equal(loadBest(storage), 0);
  assert.equal(loadBest(null), 0);
  assert.equal(loadBest({ getItem() { throw new Error('blocked'); } }), 0);
  saveBest({ setItem() { throw new Error('blocked'); } }, 1);
});
