import assert from 'node:assert/strict';
import { test } from 'node:test';
import { altitudeAt, formatAltitude, heightFor, MAX_ALTITUDE, MAX_HEIGHT, MILESTONES } from '../src/coin/altitude.ts';

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

test('고도에 닿는 높이를 거꾸로 찾는다', () => {
  for (const m of [5, 500, 1e5, 3.84e8]) assert.ok(Math.abs(altitudeAt(heightFor(m)) / m - 1) < 1e-6, `${m}m`);
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

test('1억 광년 상한의 높이 변환과 표시가 일치한다', () => {
  assert.equal(MAX_ALTITUDE, 1e8 * 9.4607e15);
  assert.ok(Math.abs(altitudeAt(MAX_HEIGHT) / MAX_ALTITUDE - 1) < 1e-12);
  assert.equal(formatAltitude(MAX_ALTITUDE), '1억 광년');
});
