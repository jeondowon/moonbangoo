import { sumCounts, toShop, type DrawResult, type Prize, type Shop } from './api';

const PACK_ID = 1;
const RARITIES = ['C', 'R', 'SR', 'UR'];
const PRIZES: (Prize & { total: number })[] = [
  { id: 'demo-card', name: '스페셜 카드 1장', rarity: 'UR', category: 'card', description: '반짝이는 스페셜 카드', condition: '현장 즉시 증정', total: 10 },
  { id: 'demo-pack', name: '부스터팩 1팩', rarity: 'UR', category: 'pack', description: '새로운 즐거움이 담긴 카드팩', condition: '현장 즉시 증정', total: 10 },
  { id: 'demo-cafe', name: '아이스 아메리카노', rarity: 'SR', category: 'cafe', description: '시원한 카페 음료 한 잔', condition: '현장 즉시 증정', total: 30 },
  { id: 'demo-sleeve', name: '카드 슬리브', rarity: 'R', category: 'sleeve', description: '소중한 카드를 보호하는 슬리브', condition: '현장 즉시 증정', total: 50 },
  { id: 'demo-saver', name: '카드 세이버', rarity: 'R', category: 'saver', description: '카드를 안전하게 보관하는 세이버', condition: '현장 즉시 증정', total: 50 },
  { id: 'demo-bakery', name: '베이커리 이용권', rarity: 'SR', category: 'bakery', description: '달콤한 베이커리와 함께하는 시간', condition: '현장 즉시 증정', total: 30 },
  { id: 'demo-coupon', name: '5% 할인권', rarity: 'C', category: 'coupon', description: '매장 상품 5% 할인', condition: '현장 즉시 증정', total: 100 },
];

/** 페이지를 새로 열면 초기화되는 시연 데이터. 서버·브라우저 저장소에 기록하지 않는다. */
export function createDemoGame() {
  const stock = PRIZES.map((prize) => ({ ...prize, remaining: prize.total }));
  let nextDrawId = 1;
  const draws = new Map<number, { cards: Prize[]; confirmed: boolean }>();
  const toPrize = ({ total: _total, remaining: _remaining, ...prize }: typeof stock[number]): Prize => prize;

  return {
    async fetchShop(): Promise<Shop> {
      return toShop(PACK_ID, stock);
    },
    async drawCards(packId: number): Promise<DrawResult> {
      if (packId !== PACK_ID) throw new Error('존재하지 않는 팩이에요.');
      const remaining = sumCounts(stock).remaining;
      if (!remaining) throw new Error('팩에 남은 경품이 없습니다.');
      const cards = Array.from({ length: 5 }, () => {
        let ticket = Math.floor(Math.random() * remaining);
        const prize = stock.find((p) => (ticket -= p.remaining) < 0)!;
        return toPrize(prize);
      }).sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity));
      const drawId = nextDrawId++;
      draws.set(drawId, { cards, confirmed: false });
      return { drawId, cards: cards.map((p) => ({ ...p })) };
    },
    async confirmPrize(drawId: number, prizeId: string): Promise<void> {
      const draw = draws.get(drawId);
      if (!draw || !draw.cards.some((p) => p.id === prizeId)) throw new Error('뽑은 카드 중에서 선택해 주세요.');
      if (draw.confirmed) throw new Error('이미 선택이 확정되었어요.');
      const prize = stock.find((p) => p.id === prizeId)!;
      if (!prize.remaining) throw new Error('해당 경품이 모두 소진되었어요.');
      prize.remaining -= 1;
      draw.confirmed = true;
    },
  };
}
