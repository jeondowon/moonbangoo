import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CoinSim, COIN_T, seeded } from '../src/coin/physics.ts';
import { CoinRetry, VALID_HEIGHT } from '../src/coin/retry.ts';

test('500m 미만은 정점에서 취소하고 충돌 없이 0.6초 안에 복귀·재발사한다', () => {
  for (const dt of [1 / 240, 1 / 60, 1 / 20]) {
    const sim = new CoinSim(seeded(4));
    const retry = new CoinRetry();
    sim.launch(0, 2);
    const events = [];
    for (let t = 0; t < 2 && !retry.active; t += dt) events.push(...retry.step(sim, dt));
    assert.ok(retry.active);
    assert.ok(sim.pos.y > COIN_T / 2);
    assert.equal(sim.bounces, 0);
    assert.deepEqual(events, []);
    const thrownHeight = sim.pos.y;
    assert.equal(retry.thrownOpacity, 1);
    assert.equal(retry.waitingOpacity, 0);
    retry.step(sim, 0.3);
    assert.equal(retry.thrownOpacity, 0.5);
    assert.equal(retry.waitingOpacity, 0.5);
    assert.equal(sim.pos.y, thrownHeight, '던져진 코인은 페이드 중 제자리를 유지한다');
    retry.step(sim, 0.3);
    assert.equal(retry.active, false);
    assert.equal(retry.thrownOpacity, 0);
    assert.equal(retry.waitingOpacity, 1);
    assert.equal(sim.pos.y, COIN_T / 2);
    assert.equal(sim.phase, 'rest');
    assert.equal(retry.climb, 0);
    assert.ok(sim.launch(0, 2));
    assert.ok(sim.canSpin);
  }
});

test('500m에 정확히 도달한 던지기는 취소하지 않고 착지 결과까지 진행한다', () => {
  const sim = new CoinSim(seeded(7));
  const retry = new CoinRetry();
  sim.launch(0, 2);
  sim.pos.y = VALID_HEIGHT + COIN_T / 2;
  sim.vel.y = 0;
  retry.climb = VALID_HEIGHT;
  const events = [];
  for (let t = 0; t < 20 && sim.phase !== 'rest'; t += 1 / 60) {
    events.push(...retry.step(sim, 1 / 60));
    assert.equal(retry.active, false);
  }
  assert.ok(events.some(e => e.type === 'bounce'));
  assert.ok(events.some(e => e.type === 'rest'));
});

test('상승 중 문질러 500m에 도달하면 이후 하강해도 취소하지 않는다', () => {
  const sim = new CoinSim(seeded(8));
  const retry = new CoinRetry();
  sim.launch(0, 2);
  for (let t = 0; t < 4 && retry.climb < VALID_HEIGHT; t += 1 / 60) {
    sim.spin(0, 0.08);
    retry.step(sim, 1 / 60);
    assert.equal(retry.active, false);
  }
  assert.ok(retry.climb >= VALID_HEIGHT);
  for (let t = 0; t < 20 && sim.phase !== 'rest'; t += 1 / 60) {
    retry.step(sim, 1 / 60);
    assert.equal(retry.active, false);
  }
  assert.equal(sim.phase, 'rest');
});
