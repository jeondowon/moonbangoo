import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATEGORIES } from '../src/data/api.ts';
import { createDemoGame } from '../src/data/demo.ts';

test('시연: 서버 없이 7종 수량 조회 → 5장 추첨 → 1장 확정, 새 세션은 초기화', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('시연에서는 API를 호출하면 안 됨'); });
  const game = createDemoGame();
  const shop = await game.fetchShop();
  assert.deepEqual(shop.prizes.map((p) => p.category), CATEGORIES.map((c) => c.id));
  assert.equal(shop.all.remaining, shop.categories.reduce((n, c) => n + c.remaining, 0));
  assert.ok(shop.top.remaining > 0);
  const { drawId, cards } = await game.drawCards(shop.packId);
  assert.equal(cards.length, 5);
  const order = ['C', 'R', 'SR', 'UR'];
  assert.deepEqual(cards.map((p) => order.indexOf(p.rarity)), cards.map((p) => order.indexOf(p.rarity)).sort((a, b) => a - b));
  assert.ok(cards.every((p) => shop.prizes.some((prize) => prize.id === p.id)));
  assert.deepEqual((await game.fetchShop()).all, shop.all, '추첨만으로 수량이 줄지 않음');
  await assert.rejects(game.confirmPrize(drawId, 'invalid'));
  await game.confirmPrize(drawId, cards[0].id);
  await assert.rejects(game.confirmPrize(drawId, cards[0].id), /이미 선택/);
  const after = await game.fetchShop();
  assert.equal(after.all.remaining, shop.all.remaining - 1);
  const chosenCategory = CATEGORIES.findIndex((c) => c.id === cards[0].category);
  after.categories.forEach((c, i) => assert.equal(c.remaining, shop.categories[i].remaining - Number(i === chosenCategory)));
  assert.deepEqual((await createDemoGame().fetchShop()).all, shop.all);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('시연: 중복 추첨 허용, 소진한 경품 제외, 전체 품절 시 차단', async (t) => {
  t.mock.method(Math, 'random', () => 0);
  const game = createDemoGame();
  const initial = await game.fetchShop();
  for (let i = 0; i < initial.all.total; i++) {
    const before = await game.fetchShop();
    const { drawId, cards } = await game.drawCards(initial.packId);
    assert.ok(cards.every((p) => p.id === cards[0].id));
    const category = CATEGORIES.findIndex((c) => c.id === cards[0].category);
    assert.ok(before.categories[category].remaining > 0);
    await game.confirmPrize(drawId, cards[0].id);
  }
  assert.equal((await game.fetchShop()).all.remaining, 0);
  await assert.rejects(game.drawCards(initial.packId), /남은 경품이 없습니다/);
  await assert.rejects(game.drawCards(-1), /존재하지 않는 팩/);
});
