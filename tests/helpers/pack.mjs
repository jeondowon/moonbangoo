import { drawPack } from '../../src/data/draw.ts';
import { createInventory } from '../../src/data/inventory.ts';

/**
 * 테스트용 고정 팩: 기본 재고(카드 10·부스터 20·음료 50·슬리브 70·…, 합계 1000)에서
 * 난수를 고정해 UR·SR·R·R·C를 한 장씩 뽑는다 → 등급순 C, R, R, SR, UR.
 */
export async function fixedPack() {
  const seq = [0.005, 0.02, 0.05, 0.1, 0.5];
  return (await drawPack(createInventory(), () => seq.shift())).cards;
}
