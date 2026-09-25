import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRIZES } from '../design/lib/data.js';
import { createMockCoupon, formatVisitDate } from '../src/data/coupon.ts';
import { drawPack } from '../src/data/draw.ts';

test('목업 팩은 원본을 변경하지 않고 고정된 5개 경품을 등급순으로 반환한다', async () => {
  const before = structuredClone(PRIZES);
  const { cards } = await drawPack();
  assert.equal(cards.length, 5);
  assert.deepEqual(cards.map(p => p.rarity), ['C', 'R', 'R', 'SR', 'UR']);
  assert.equal(new Set(cards.map(p => p.id)).size, 5);
  assert.deepEqual(PRIZES, before);
  assert.notEqual(cards, PRIZES);
});

test('쿠폰은 발급 시각부터 정확히 14일이며 한국 날짜로 표시한다', () => {
  for (const date of ['2026-09-25T03:30:00Z', '2026-12-25T23:30:00Z', '2028-02-20T10:00:00Z']) {
    const coupon = createMockCoupon(PRIZES[0], new Date(date));
    assert.equal(Date.parse(coupon.expiresAt) - Date.parse(coupon.issuedAt), 14 * 86400000);
    assert.match(coupon.code, /^DEMO-MB-[2-9A-HJ-NP-Z]{6}$/);
  }
  assert.equal(formatVisitDate('2026-12-31T15:01:00Z'), '2027.01.01');
  const leap = createMockCoupon(PRIZES[0], new Date('2028-02-20T10:00:00Z'));
  assert.equal(formatVisitDate(leap.expiresAt), '2028.03.05');
});
