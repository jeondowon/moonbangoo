import assert from "node:assert/strict";
import { test } from "node:test";
import { CoinSim, COIN_T, seeded } from "../src/coin/physics.ts";

/** 멈출 때까지 60fps로 돌린다 */
function runUntilRest(sim, onFrame = () => {}) {
  const events = [];
  for (let i = 0; i < 60 * 30 && sim.phase !== "rest"; i++) {
    events.push(...sim.step(1 / 60));
    onFrame(sim, i);
  }
  return events;
}

test("느리거나 옆으로 쓴 스와이프는 던지지 않는다", () => {
  const sim = new CoinSim(seeded(1));
  assert.equal(sim.launch(0, 0.5), false);
  assert.equal(sim.launch(3, 2), false);
  assert.equal(sim.launch(0, -3), false);
  assert.equal(sim.phase, "rest");
});

test("던지면 튕기고 흔들리다 반드시 멈추며, 결과는 멈춘 뒤 위를 향한 면과 같다", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const rng = seeded(seed);
    const sim = new CoinSim(rng);
    assert.equal(sim.launch(rng() - 0.5, 2 + rng() * 4), true);
    const events = runUntilRest(sim);
    assert.equal(sim.phase, "rest", `seed ${seed}: 30초 안에 멈춰야 한다`);
    const settle = events.find((e) => e.type === "settle");
    const rest = events.at(-1);
    assert.equal(rest.type, "rest");
    assert.equal(rest.face, settle.face);
    const up = sim.normal().y;
    assert.ok(Math.abs(Math.abs(up) - 1) < 1e-6, "멈춘 코인은 바닥에 납작하게 눕는다");
    assert.equal(up > 0 ? "front" : "back", rest.face);
    assert.ok(Math.abs(sim.pos.y - COIN_T / 2) < 1e-9);
  }
});

test("공중에서 문지르면 더 빨리 돌고 더 높이 떠서, 문지르지 않을 때보다 오래 떠 있다", () => {
  const airTime = (rub) => {
    const sim = new CoinSim(seeded(7));
    sim.launch(0, 3);
    let frames = 0;
    let peak = 0;
    while (sim.phase === "air") {
      // 처음 2초 동안 매 프레임 위로 문지른다
      if (rub && frames < 120) sim.spin(0, 0.03);
      sim.step(1 / 60);
      peak = Math.max(peak, sim.pos.y);
      frames++;
    }
    return { frames, peak };
  };
  const still = airTime(false);
  const rubbed = airTime(true);
  assert.ok(rubbed.frames > still.frames + 60, `${rubbed.frames} > ${still.frames}`);
  assert.ok(rubbed.peak > still.peak);
});

/** 짧게 쓸고 손을 떼기를 반복한다: 0.15초 동안 len만큼 쓸고 0.12초 쉰다. 2초 뒤부터 seconds초 동안 */
function strokes(sim, len, seconds, dir = 1) {
  for (let f = 0; f < 60 * seconds; f++) {
    if ((f / 60) % 0.27 < 0.15) sim.spin(0, (dir * len) / 9);
    sim.step(1 / 60);
  }
}

test("짧게 쓸고 손 떼기를 반복해도 올라가고, 빠르게 문지를수록 더 빨리 올라간다", () => {
  const heights = [0.08, 0.2, 0.4].map((len) => {
    const sim = new CoinSim(seeded(1));
    sim.launch(0, 3);
    strokes(sim, len, 4);
    assert.equal(sim.phase, "air", `쓸기 ${len}: 떨어지지 않아야 한다`);
    return sim.pos.y;
  });
  assert.ok(heights[0] > 5, heights.join(", "));
  assert.ok(heights[0] < heights[1] && heights[1] < heights[2], heights.join(", "));
});

test("반대로 문지르면 회전은 느려지지만, 올라가는 건 같다", () => {
  const sim = new CoinSim(seeded(3));
  sim.launch(0, 3);
  const spinBefore = sim.omega.length();
  sim.spin(0, -0.05); // 위로 던질 때와 반대 방향
  assert.ok(sim.omega.length() < spinBefore);
  const climb = (dir) => {
    const s = new CoinSim(seeded(3));
    s.launch(0, 3);
    strokes(s, 0.2, 3, dir);
    return s.pos.y;
  };
  assert.ok(Math.abs(climb(1) - climb(-1)) < 1e-9);
});

test("문지르기를 멈추면 다시 떨어진다", () => {
  const sim = new CoinSim(seeded(4));
  sim.launch(0, 3);
  strokes(sim, 0.2, 3);
  const top = sim.pos.y;
  for (let f = 0; f < 120; f++) sim.step(1 / 60);
  assert.ok(sim.vel.y < 0 && sim.pos.y < top + 3);
});

test("회전이 최대 속도에 닿아도, 계속 문지르면 멈추지 않고 점점 더 높이 올라간다", () => {
  const sim = new CoinSim(seeded(9));
  sim.launch(0, 3);
  const heights = [];
  // 초당 화면 높이 2.4번 문지르기를 4초 동안
  for (let frame = 0; frame < 240; frame++) {
    sim.spin(0, 0.04);
    sim.step(1 / 60);
    if (frame % 60 === 59) heights.push(sim.pos.y);
  }
  assert.equal(sim.phase, "air");
  assert.ok(sim.omega.length() > 41, "회전은 이미 최대");
  for (let i = 1; i < heights.length; i++) assert.ok(heights[i] > heights[i - 1] + 1, heights.join(", "));
});

test("바닥에 한 번 닿은 뒤에는 스와이프를 해도 회전이 바뀌지 않는다", () => {
  const sim = new CoinSim(seeded(5));
  sim.launch(0, 3);
  while (sim.bounces === 0) sim.step(1 / 60);
  const spin = sim.omega.clone();
  sim.spin(0.3, 0.3);
  assert.deepEqual(sim.omega, spin);
});

test("착지해서 멈출 때까지 자세가 순간이동하지 않는다 (결과를 다시 뽑는 것처럼 보이지 않게)", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const rng = seeded(seed);
    const sim = new CoinSim(rng);
    sim.launch(0, 1.5 + rng() * 4);
    while (sim.phase !== "rest") {
      const before = sim.q.clone();
      const phase = sim.phase;
      const spin = sim.omega.length();
      sim.step(1 / 240);
      const turned = before.angleTo(sim.q);
      // 공중에서 넘어오는 순간은 공중 회전만큼만, 눕는 동안은 초당 30 rad 이내로
      if (phase === "air" && sim.phase === "settle")
        assert.ok(turned <= spin / 240 + 1e-6, `seed ${seed}: 넘어오며 ${turned}`);
      else if (phase === "settle") assert.ok(turned < 30 / 240, `seed ${seed}: 눕는 중 ${turned}`);
    }
  }
});

test("흔들림 소리는 멈출수록 촘촘해진다", () => {
  const sim = new CoinSim(seeded(11));
  sim.launch(0, 3);
  const ticks = runUntilRest(sim).filter((e) => e.type === "tick");
  assert.ok(ticks.length > 4);
  assert.ok(ticks.at(-1).rate > ticks[0].rate);
});

test("약하게 던지든 세게 던지든, 공중에서 문지르든 앞면과 뒷면은 50:50으로 나온다", () => {
  const rng = seeded(2026);
  const n = 1000;
  // 같은 세기로 반복해 던져도 치우치지 않아야 한다 (세기를 섞으면 치우침이 서로 상쇄되어 가려진다)
  for (const [up, rub] of [
    [1.5, 0],
    [2, 0],
    [3, 0],
    [6, 0],
    [3, 0.02],
  ]) {
    let front = 0;
    for (let i = 0; i < n; i++) {
      const sim = new CoinSim(rng);
      sim.launch((rng() - 0.5) * 0.2, up);
      runUntilRest(sim, (s, frame) => {
        if (frame < 40) s.spin(0, rub);
      });
      if (sim.face === "front") front++;
    }
    // 이항분포 표준편차 ≈ 16 → ±3σ
    assert.ok(Math.abs(front - n / 2) < 48, `세기 ${up}, 문지르기 ${rub}: 앞면 ${front} / ${n}`);
  }
});

test("높이 올렸다가 떨어지는 동안에도 회전이 줄어 사라지지 않는다", () => {
  const sim = new CoinSim(seeded(12));
  sim.launch(0, 3);
  strokes(sim, 0.4, 6);
  assert.ok(sim.pos.y > 30, `높이 ${sim.pos.y}`);
  let spin = sim.omega.length();
  while (sim.bounces === 0) {
    spin = sim.omega.length();
    sim.step(1 / 60);
  }
  assert.ok(spin > 20, `착지 직전 회전 ${spin}`);
});

test("1억 광년 천장은 먼저 감속한 뒤 되튕기며, 바닥 충돌로 세지 않는다", async () => {
  const { CEILING_Y } = await import('../src/coin/physics.ts');
  const sim = new CoinSim(seeded(23));
  sim.launch(0, 6);
  sim.pos.y = CEILING_Y - 0.2;
  sim.vel.y = 14;
  const events = [];
  let hit = false;
  for (let f = 0; f < 240; f++) {
    sim.spin(0, 0.01);
    const step = sim.step(1 / 240);
    events.push(...step);
    assert.ok(sim.pos.y <= CEILING_Y, '천장을 넘지 않는다');
    if (step.some(e => e.type === 'ceiling')) {
      assert.ok(sim.vel.y < 0, '충돌 뒤 아래로 되튕긴다');
      hit = true;
      break;
    }
    assert.ok(sim.vel.y < 14, '상한 직전에 미리 감속한다');
  }
  assert.ok(hit);
  assert.equal(sim.bounces, 0);
  assert.equal(sim.phase, 'air');
  assert.equal(events.some(e => e.type === 'bounce'), false);
});

test("계속 문질러도 1억 광년을 넘지 않고, 손을 떼면 낙하해 정상 결과로 멈춘다", async () => {
  const { CEILING_Y } = await import('../src/coin/physics.ts');
  const { MAX_ALTITUDE, altitudeAt } = await import('../src/coin/altitude.ts');
  for (const dt of [1 / 240, 1 / 60, 0.05]) {
    const sim = new CoinSim(seeded(24));
    sim.launch(0, 6);
    let hits = 0;
    for (let t = 0; t < 25; t += dt) {
      sim.spin(0, 4 * dt);
      const events = sim.step(dt);
      hits += events.filter(e => e.type === 'ceiling').length;
      assert.ok(sim.pos.y <= CEILING_Y);
      assert.ok(altitudeAt(sim.pos.y - COIN_T / 2) <= MAX_ALTITUDE * (1 + 1e-12));
    }
    assert.ok(hits > 1, '실제 발사부터 상승해 반복 충돌까지 검사');
    assert.equal(sim.bounces, 0);
    const events = runUntilRest(sim);
    assert.equal(sim.phase, 'rest');
    assert.equal(events.at(-1).type, 'rest');
    assert.equal(sim.normal().y > 0 ? 'front' : 'back', sim.face);
    assert.ok(sim.launch(0, 3), '다음 발사도 정상');
    assert.ok(sim.vel.y > 0);
  }
});
