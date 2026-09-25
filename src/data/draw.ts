// 팩 결과(카드 5장). 명세 5.2: 연출 시작 전에 결과를 확정하고, 연출은 보여주기만 한다.
// 1차: 확률이 아직 정해지지 않아 추첨 없이 초안(design/lib/data.js)의 경품 5종을 그대로 사용.
// 2차: 같은 시그니처로 서버 추첨 API 호출로 교체.
import { PRIZES, RARITY_ORDER } from '../../design/lib/data.js';

export type Prize = (typeof PRIZES)[number];

export interface PackResult {
  /** 넘기는 순서 = 등급 오름차순 (명세 R9: 레어는 뒤쪽) */
  cards: Prize[];
}

export async function drawPack(): Promise<PackResult> {
  const rank = (p: Prize) => RARITY_ORDER.indexOf(p.rarity);
  return { cards: [...PRIZES].sort((a, b) => rank(a) - rank(b)) };
}
