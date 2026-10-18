import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HandMotion } from '../src/coin/handMotion.ts';
import { CoinSim, CEILING_Y, seeded } from '../src/coin/physics.ts';

test('손은 상한 접근 중 나타나고, 멀리 있거나 그냥 낙하 중이면 나타나지 않는다', () => {
  const hand = new HandMotion();
  assert.equal(hand.step(0, 10, true).ready, 0);
  assert.ok(hand.step(0.2, 2, true).ready > 0);
  assert.ok(hand.step(0.5, 0.3, true).ready > 0.99);
  assert.ok(hand.step(0.05, 2, false).ready > 0, '상승을 멈춰도 갑자기 사라지지 않는다');
  assert.equal(hand.step(1, 2, false).ready, 0);
});

test('손은 접촉 → 후속 자세 → 사라짐을 거쳐 재충돌 때 동일한 동작으로 돌아온다', () => {
  const hand = new HandMotion();
  const play = () => {
    hand.strike();
    return [0, 0.08, 0.12, 0.2, 0.4, 0.2].map(dt => hand.step(dt, 2, false));
  };
  const first = play();
  assert.equal(first[0].contact, 1);
  assert.equal(first[0].flash, 1);
  assert.ok(first[3].release > 0);
  assert.equal(first.at(-1).contact + first.at(-1).release, 0);
  // 같은 비행에서 다시 올렸을 때도 준비 자세가 돌아와야 한다.
  assert.ok(hand.step(0.2, 1, true).ready > 0);
  assert.deepEqual(play(), first);
  hand.reset();
  assert.equal(hand.step(0, 20, false).contact, 0);
});

test('한 비행에서 손에 튕겨 낙하한 코인을 다시 올리면 같은 상한에서 두 번째로 튕겨 낙하한다', () => {
  for (const dt of [1 / 240, 1 / 60, 0.05]) {
    const sim = new CoinSim(seeded(42));
    sim.launch(0, 6);
    const hand = new HandMotion();
    let hits = 0;
    let fallen = false;
    let lowest = Infinity;
    for (let time = 0; time < 40 && hits < 2; time += dt) {
      if (hits === 1) {
        lowest = Math.min(lowest, sim.pos.y);
        if (sim.pos.y < CEILING_Y - 8) fallen = true;
      }
      // 1회차 후에는 실제로 8단위 이상 떨어뜨린 다음 스와이프를 재개한다.
      if (hits === 0 || fallen) sim.spin(0, 4 * dt);
      const events = sim.step(dt);
      for (const event of events) {
        if (event.type !== 'ceiling') continue;
        hits++;
        hand.strike();
        assert.equal(hand.step(0, 0, false).contact, 1);
        assert.ok(sim.vel.y < -5, '손이 닿으면 분명한 하향 충격');
        assert.equal(sim.bounces, 0, '아직 바닥에 닿지 않은 동일 비행');
      }
      assert.ok(sim.pos.y <= CEILING_Y);
      hand.step(dt, CEILING_Y - sim.pos.y, sim.vel.y > 0);
    }
    assert.ok(fallen && lowest < CEILING_Y - 8);
    assert.equal(hits, 2);
    assert.equal(sim.phase, 'air');
  }
});
