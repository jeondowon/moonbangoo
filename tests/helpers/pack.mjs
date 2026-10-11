/** 테스트용 고정 팩: 서버가 등급 오름차순으로 주는 카드 5장 (C, R, R, SR, UR) */
export async function fixedPack() {
  const prize = (id, rarity, category, name) => ({ id: String(id), rarity, category, name, description: `${name} 1개`, condition: '현장 즉시 증정' });
  return [
    prize(7, 'C', 'coupon', '5% 할인권'),
    prize(3, 'R', 'cafe', '음료 이용권'),
    prize(4, 'R', 'sleeve', '카드 슬리브'),
    prize(2, 'SR', 'pack', '부스터팩 1팩'),
    prize(1, 'UR', 'card', '카드 1장'),
  ];
}
