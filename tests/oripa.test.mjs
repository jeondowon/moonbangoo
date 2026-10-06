import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Texture } from 'three';
import { drawPack } from '../src/data/draw.ts';
import { categoryCounts, consume, createInventory, pickPrize, topRarityCounts, totalCounts } from '../src/data/inventory.ts';
import { PackCarousel, PACK_COUNT, POOL_SIDE, slotAt } from '../src/pack/carousel.ts';
import { OripaScreen } from '../src/ui/oripa.ts';
import { pointer, setup } from './helpers/flow.mjs';
import { fixedPack } from './helpers/pack.mjs';

const side = () => ({ albedo: new Texture(), orm: new Texture(), normal: new Texture() });
const tex = () => ({ front: side(), back: side() });
const run = (carousel, seconds) => {
  for (let t = 0; t < seconds; t += 1 / 60) carousel.update(1 / 60);
};

test('남은 수량에 비례해 뽑히고(추첨권 1장 = 남은 경품 1개), 품절 경품은 나오지 않는다', () => {
  const stock = createInventory(); // 카드 10 · 부스터 20 · … · 할인권 500 (합계 1000)
  assert.equal(pickPrize(stock, () => 0).id, 'card');
  assert.equal(pickPrize(stock, () => 0.0099).id, 'card');
  assert.equal(pickPrize(stock, () => 0.01).id, 'booster');
  assert.equal(pickPrize(stock, () => 0.9999).id, 'coupon-5');
  stock[0].remaining = 0;
  assert.equal(pickPrize(stock, () => 0).id, 'booster');
});

test('5장은 남은 경품 중에서 뽑고, 같은 경품이 여러 장 나와도 되며, 뽑기만으로는 차감하지 않는다', async () => {
  const stock = createInventory();
  for (const s of stock) s.remaining = s.prize.id === 'drink' ? 1 : 0;
  const before = structuredClone(stock);
  const { cards } = await drawPack(stock);
  assert.equal(cards.length, 5);
  assert.ok(cards.every((p) => p.id === 'drink'));
  assert.deepEqual(stock, before);
});

test('팩은 등급 오름차순(레어는 뒤쪽), 모두 소진되면 만들 수 없다', async () => {
  assert.deepEqual((await fixedPack()).map((p) => p.rarity), ['C', 'R', 'R', 'SR', 'UR']);
  const empty = createInventory();
  for (const s of empty) s.remaining = 0;
  await assert.rejects(drawPack(empty));
});

test('최종 선택한 1개만 차감하고 0 아래로 내려가지 않으며, 합계·최고등급·카테고리 수량에 반영된다', () => {
  const stock = createInventory();
  assert.deepEqual(totalCounts(stock), { remaining: 1000, total: 1000 });
  assert.deepEqual(topRarityCounts(stock), { remaining: 10, total: 10 });
  consume(stock, 'card');
  assert.deepEqual(topRarityCounts(stock), { remaining: 9, total: 10 });
  assert.deepEqual(categoryCounts(stock, 'card'), { remaining: 9, total: 10 });
  assert.equal(totalCounts(stock).remaining, 999);
  stock[0].remaining = 0;
  consume(stock, 'card');
  assert.equal(stock[0].remaining, 0);
});

test('팩 자리: 큰 원 위에 같은 간격으로 서서 바깥을 향하고, 옆으로 갈수록 더 물러나 더 돌아선다', () => {
  const center = slotAt(0);
  assert.deepEqual([center.x, center.z, center.rotY], [0, 0, 0]);
  const chord = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const step = chord(slotAt(0), slotAt(1));
  for (const d of [1, 2]) {
    const r = slotAt(d);
    const l = slotAt(-d);
    const inner = slotAt(d - 1);
    assert.ok(Math.abs(r.x + l.x) < 1e-9 && r.z === l.z && r.rotY === -l.rotY, `좌우 대칭(${d})`);
    assert.ok(r.x > inner.x && r.z < inner.z && r.rotY > inner.rotY, `바깥으로 갈수록 더 물러나 더 돌아섬(${d})`);
    assert.ok(Math.abs(chord(inner, r) - step) < 1e-9, `같은 간격(${d})`);
    assert.ok(Math.abs(r.rotY - d * slotAt(1).rotY) < 1e-9, `기울기는 칸 수에 비례(${d})`);
  }
});

test('캐러셀: 팩이 많아도 가운데 근처만 메시로 두고, 어디까지 넘겨도 가운데에 팩이 선다', () => {
  setup();
  const carousel = new PackCarousel(tex(), new Texture());
  assert.equal(PACK_COUNT, 100);
  assert.equal(carousel.group.children.length, 2 * POOL_SIDE + 1);
  for (let i = 0; i < 57; i++) carousel.go(1);
  run(carousel, 5);
  carousel.dragBy(0.4); // 넘기는 도중
  run(carousel, 0.05);
  const xs = carousel.group.children.filter((p) => p.visible).map((p) => p.position.x).sort((a, b) => a - b);
  // 넘기는 도중에도 보이는 팩은 화면 가운데를 기준으로 양옆에 퍼져 있음 (멀리 남겨진 메시 없음)
  assert.ok(xs[0] < -slotAt(1).x && xs.at(-1) > slotAt(1).x, `${xs}`);
  carousel.release(0);
  run(carousel, 3);
  assert.equal(carousel.index, 57);
  // 멈추면 가운데와 양옆 두 칸이 보이고, 그 바깥은 화면 밖 세 칸째 자리까지만 그린다 (원을 돌아 뒤쪽에서 다시 보이지 않게)
  const drawn = carousel.group.children.filter((p) => p.visible).map((p) => Math.abs(p.position.x));
  assert.ok(drawn.length >= 5 && drawn.every((x) => x <= slotAt(3).x + 1e-6), `${drawn}`);
  const atCenter = carousel.group.children.filter((p) => Math.abs(p.position.x) < 1e-3);
  assert.equal(atCenter.length, 1, '가운데에 팩 하나');
});

test('캐러셀: 끝에서 처음으로 이어지고, 놓으면 가까운 팩에 멈추며, 고른 팩은 실제 팩 자리로 모인다', () => {
  setup(); // document 대역
  const carousel = new PackCarousel(tex(), new Texture());
  carousel.setLayout(0.4, 0.6);
  carousel.go(-1);
  assert.equal(carousel.index, PACK_COUNT - 1);
  carousel.go(1);
  carousel.dragBy(0.3);
  carousel.release(0);
  assert.equal(carousel.index, 0);
  carousel.dragBy(0.7);
  carousel.release(0);
  assert.equal(carousel.index, 1);
  run(carousel, 2);
  assert.equal(carousel.group.position.y, 0.4);

  carousel.pick();
  carousel.go(1);
  carousel.dragBy(1);
  assert.equal(carousel.index, 1, '고른 뒤에는 움직이지 않음');
  run(carousel, 0.2);
  assert.equal(carousel.opened, false);
  run(carousel, 4);
  assert.equal(carousel.opened, true);
  const shown = carousel.group.children.filter((p) => p.visible);
  assert.equal(shown.length, 1, '나머지 팩은 물러나 사라짐');
  const [chosen] = shown;
  assert.ok(Math.abs(carousel.group.position.y) < 1e-3 && Math.abs(carousel.group.scale.x - 1) < 1e-3);
  assert.ok(chosen.position.length() < 1e-3 && Math.abs(chosen.rotation.y) < 1e-3 && Math.abs(chosen.scale.x - 1) < 1e-3);
});

test('오리파 화면: 수량 표시, 스와이프·옆 팩 탭·방향키로 이동, 가운데 팩 탭으로 열기, 소진 시 차단', () => {
  const { get } = setup();
  const carousel = new PackCarousel(tex(), new Texture());
  const stock = createInventory();
  const screen = new OripaScreen(carousel, stock);
  screen.show();
  assert.equal(carousel.group.visible, true);
  assert.equal(get('oripa-remaining').textContent, (1000).toLocaleString('ko-KR'));
  assert.equal(get('oripa-top').textContent, '10 / 10');
  const items = get('oripa-stock').children;
  assert.equal(items.length, 7);
  assert.match(items[0].attributes.get('aria-label'), /카드 10개 남음/);
  consume(stock, 'card');
  screen.render();
  assert.equal(get('oripa-top').textContent, '9 / 10');

  const stage = get('oripa-stage');
  stage.rect = { left: 0, top: 100, width: 390, height: 400 };
  // 왼쪽으로 밀면 다음 팩
  pointer(stage, 'pointerdown', { pointerId: 1, clientX: 300 });
  pointer(stage, 'pointermove', { pointerId: 1, clientX: 200 });
  pointer(stage, 'pointerup', { pointerId: 1, clientX: 170 });
  const afterSwipe = carousel.index;
  assert.ok(afterSwipe === 1 || afterSwipe === 2, `swipe → ${afterSwipe}`);
  // 오른쪽 팩을 톡 누르면 그 팩으로
  pointer(stage, 'pointerdown', { pointerId: 2, clientX: 370 });
  pointer(stage, 'pointerup', { pointerId: 2, clientX: 372 });
  assert.equal(carousel.index, afterSwipe + 1);
  pointer(get('oripa'), 'keydown', { key: 'ArrowLeft' });
  assert.equal(carousel.index, afterSwipe);

  // 소진되면 가운데 팩을 눌러도 열리지 않음
  const tapCenter = (id) => {
    pointer(stage, 'pointerdown', { pointerId: id, clientX: 195 });
    pointer(stage, 'pointerup', { pointerId: id, clientX: 195 });
  };
  for (const s of stock) s.remaining = 0;
  screen.render();
  assert.equal(get('oripa-soldout').hidden, false);
  tapCenter(3);
  assert.equal(carousel.picking, true);

  stock[0].remaining = 1;
  screen.render();
  assert.equal(get('oripa-soldout').hidden, true);
  tapCenter(4);
  assert.equal(carousel.picking, false);
  assert.equal(carousel.index, afterSwipe);
  assert.equal(get('oripa').inert, true);
  screen.hide();
  assert.equal(get('oripa').hidden, true);
  assert.equal(carousel.group.visible, false);
});
