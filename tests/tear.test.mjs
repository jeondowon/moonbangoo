import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TearState, TEAR_BINS, TEAR_V, TEAR_MAX_DEV, TEAR_MAX_DOWN } from '../src/pack/tear.ts';
import { Cutter } from '../src/pack/cutter.ts';

/** 텍스처 8비트 양자화 오차(밴드의 1/127)까지 허용 */
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < TEAR_MAX_DEV / 127, `${msg}: ${a} ≠ ${b}`);

/** 포인터 좌표를 그대로 팩 좌표(u, v)로 쓰는 절취기 */
function cutter(tear) {
  const handlers = {};
  const el = {
    addEventListener: (type, fn) => (handlers[type] = fn),
    setPointerCapture() {},
    hasPointerCapture: () => false,
    releasePointerCapture() {},
  };
  const c = new Cutter(el, {}, {}, tear, () => 0);
  c.enabled = true;
  c.project = (u, v) => ({ u, v });
  let t = 0;
  const ev = (u, v) => ({ pointerId: 1, clientX: u, clientY: v, timeStamp: (t += 16) });
  return {
    c,
    down: (u, v) => handlers.pointerdown(ev(u, v)),
    move: (u, v) => handlers.pointermove(ev(u, v)),
    up: () => handlers.pointerup(ev(0, 0)),
  };
}

test('절취선: 잘린 칸에는 그은 높이를, 안 잘린 칸에는 양옆을 잇는 직선을 기록한다', () => {
  const tear = new TearState();
  near(tear.lineV(0.5), TEAR_V, '자르기 전에는 기본 절취선');
  tear.cut(0, 0.2, 0, TEAR_V, TEAR_V - 0.04);
  near(tear.lineV(0.1), TEAR_V - 0.02, '그은 경로 위 (중간)');
  near(tear.lineV(0.19), TEAR_V - 0.038, '그은 경로 위 (끝 근처)');
  near(tear.lineV(0.8), tear.lineV(0.2), '바깥쪽은 끝 높이를 이어감');
  tear.cut(0.6, 0.8, 0, TEAR_V + 0.01, TEAR_V + 0.01);
  near(tear.lineV(0.4), (tear.lineV(0.2) + tear.lineV(0.6)) / 2, '사이 안 잘린 곳은 직선으로 이음');
  // 이미 잘린 칸은 다시 그어도 바뀌지 않는다
  tear.cut(0, 0.2, 0, TEAR_V + 0.01, TEAR_V + 0.01);
  near(tear.lineV(0.1), TEAR_V - 0.02, '이미 잘린 경로 유지');
});

test('절취선: 높이는 허용 밴드 안으로 제한되고, 텍스처 B 채널과 일치한다', () => {
  const tear = new TearState();
  tear.cut(0, 1, 0, TEAR_V - 1, TEAR_V + 1);
  for (const u of [0, 0.3, 0.7, 1]) {
    assert.ok(tear.lineV(u) >= TEAR_V - TEAR_MAX_DEV - 1e-6);
    assert.ok(tear.lineV(u) <= TEAR_V + TEAR_MAX_DOWN + 1e-6, '아래로는 팩 안 카드가 보이지 않는 곳까지만');
  }
  const data = tear.texture.image.data;
  for (let i = 0; i < TEAR_BINS; i += 37) {
    const v = TEAR_V + ((data[i * 4 + 2] - 128) / 127) * TEAR_MAX_DEV;
    near(tear.lineV((i + 0.5) / TEAR_BINS), v, `칸 ${i}`);
  }
});

test('절취: 손가락이 지나간 경로 그대로 잘리고, 밴드를 벗어나면 멈춘다', () => {
  const tear = new TearState();
  const { down, move } = cutter(tear);
  down(0, TEAR_V);
  move(0.25, TEAR_V - 0.03); // 올라갔다가
  move(0.5, TEAR_V + 0.01); // 내려감
  assert.ok(tear.progress > 0.49);
  near(tear.lineV(0.125), TEAR_V - 0.015, '첫 구간');
  near(tear.lineV(0.375), TEAR_V - 0.01, '두 번째 구간');
  const before = tear.progress;
  move(0.8, TEAR_V + 0.2);
  assert.equal(tear.progress, before, '밴드 밖에서는 진행 없음');
});

test('절취: 떼었다가 다시 누르면 새 경로로 이어 자르고, 기존 경로는 유지된다', () => {
  const tear = new TearState();
  const { down, move, up } = cutter(tear);
  down(1, TEAR_V);
  move(0.6, TEAR_V + 0.01);
  const kept = tear.lineV(0.8);
  up();
  down(0.6, TEAR_V - 0.02);
  move(0.2, TEAR_V - 0.02);
  near(tear.lineV(0.8), kept, '기존 경로 유지');
  near(tear.lineV(0.4), TEAR_V - 0.02, '새 경로');
  assert.ok(tear.progress > 0.79);
});
