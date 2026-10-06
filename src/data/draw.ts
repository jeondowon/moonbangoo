// 팩 결과(카드 5장). 명세 5.2: 연출 시작 전에 결과를 확정하고, 연출은 보여주기만 한다.
// 오리파 방식: 남은 경품 중에서 한 장씩 무작위로 뽑는다. 같은 경품이 여러 장 나와도 된다.
// 수량 차감은 여기서 하지 않고, 사용자가 1장을 최종 선택할 때만 한다 (inventory.consume).
import { RARITY_ORDER } from '../../design/lib/data.js';
import { inventory, pickPrize, type Prize, type Stock } from './inventory';

export type { Prize };

export const PACK_SIZE = 5;

export interface PackResult {
  /** 넘기는 순서 = 등급 오름차순 (명세 R9: 레어는 뒤쪽) */
  cards: Prize[];
}

export async function drawPack(stock: Stock[] = inventory, random = Math.random): Promise<PackResult> {
  const cards: Prize[] = [];
  for (let i = 0; i < PACK_SIZE; i++) {
    const prize = pickPrize(stock, random);
    if (!prize) throw new Error('남은 경품이 없어요');
    cards.push(prize);
  }
  const rank = (p: Prize) => RARITY_ORDER.indexOf(p.rarity);
  return { cards: cards.sort((a, b) => rank(a) - rank(b)) };
}
