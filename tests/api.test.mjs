import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATEGORIES, confirmPrize, drawCards, fetchShop } from '../src/data/api.ts';

/** 경로별 응답을 돌려주는 fetch 대역. 요청은 calls에 남긴다 */
function mockFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    const [status, body] = routes[`${init.method ?? 'GET'} ${new URL(url).pathname}`] ?? [404, { message: '없음' }];
    return { ok: status < 400, status, json: async () => body };
  };
  return calls;
}

test('수량: 첫 번째 활성 팩의 경품을 전체·최고등급·카테고리별로 합치고, 어드민 종류 이름은 카드 카테고리 키로', async () => {
  const calls = mockFetch({
    'GET /api/v1/admin/packs': [200, { packs: [{ id: 2, active: false }, { id: 5, active: true }] }],
    'GET /api/v1/admin/prizes': [200, { prizes: [
      { id: 1, name: '카드 1장', rarity: 'UR', icon: 'card', description: null, condition: '현장 즉시 증정', remaining: 9, total: 10 },
      { rarity: 'C', icon: 'discount', remaining: 400, total: 500 },
      { rarity: 'R', icon: 'drink', remaining: 50, total: 50 },
      { rarity: 'C', icon: null, remaining: 1, total: 1 },
    ] }],
  });
  const shop = await fetchShop();
  assert.equal(calls[1].url, 'http://localhost:8080/api/v1/admin/prizes?packId=5');
  assert.equal(shop.packId, 5);
  assert.deepEqual(shop.all, { remaining: 460, total: 561 });
  assert.deepEqual(shop.top, { remaining: 9, total: 10 });
  const at = (id) => shop.categories[CATEGORIES.findIndex((c) => c.id === id)];
  assert.deepEqual(at('card'), { remaining: 9, total: 10 });
  assert.deepEqual(at('coupon'), { remaining: 400, total: 500 });
  assert.deepEqual(at('cafe'), { remaining: 50, total: 50 });
  assert.deepEqual(at('bakery'), { remaining: 0, total: 0 });
  assert.equal(shop.prizes.length, 4, '카드 미리 준비용 경품 전체');
  assert.deepEqual(shop.prizes[0], { id: '1', name: '카드 1장', rarity: 'UR', category: 'card', description: '', condition: '현장 즉시 증정' });
});

test('활성 팩이 없으면 수량 0, 뽑을 팩 없음', async () => {
  mockFetch({ 'GET /api/v1/admin/packs': [200, { packs: [{ id: 2, active: false }] }] });
  const shop = await fetchShop();
  assert.equal(shop.packId, null);
  assert.deepEqual(shop.all, { remaining: 0, total: 0 });
});

test('뽑기와 확정: 카드는 화면용 경품으로 바꾸고, 확정은 고른 경품 id 하나만 보낸다', async () => {
  const card = { id: 7, name: '5% 할인권', rarity: 'C', description: null, condition: null, icon: 'discount', packId: 3, packName: '스페셜 카드팩', packImage: null, packIcon: null };
  const calls = mockFetch({
    'POST /api/v1/packs/3/draw': [200, { drawId: 12, cards: [card, card, card, card, card] }],
    'POST /api/v1/draws/12/confirm': [200, card],
  });
  const { drawId, cards } = await drawCards(3);
  assert.equal(drawId, 12);
  assert.deepEqual(cards[0], { id: '7', name: '5% 할인권', rarity: 'C', category: 'coupon', description: '', condition: '' });
  await confirmPrize(drawId, cards[0].id);
  assert.deepEqual(calls.at(-1), { url: 'http://localhost:8080/api/v1/draws/12/confirm', method: 'POST', body: { prizeId: 7 } });
});

test('오류: 서버의 안내 문구를 그대로, 연결 실패는 연결 안내로', async () => {
  mockFetch({ 'POST /api/v1/packs/3/draw': [409, { code: 'PACK_SOLD_OUT', message: '팩에 남은 경품이 없습니다.' }] });
  await assert.rejects(drawCards(3), { message: '팩에 남은 경품이 없습니다.' });
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(fetchShop(), { message: '서버에 연결하지 못했어요.' });
});
