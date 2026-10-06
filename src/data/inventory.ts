// 오리파 재고 (ADMIN.md 2·4장): 사장님이 정한 수량 안에서만 경품이 나온다.
// 어드민이 아직 없어 임시 수량을 쓰고, 차감도 메모리에만 반영한다 (새로고침하면 초기화).
// 어드민 연결 시 createInventory()와 consume()만 저장소 접근으로 바꾸면 된다.
import { RARITY_ORDER } from '../../design/lib/data.js';

export interface Prize {
  id: string;
  name: string;
  rarity: string;
  /** design/lib/icons.js의 카테고리 키 */
  category: string;
  description: string;
  condition: string;
}

export interface Stock {
  prize: Prize;
  total: number;
  remaining: number;
}

/** 기본 카테고리 7종 (ADMIN.md 3.1). 오리파 화면 하단 표시 순서 */
export const CATEGORIES = [
  { id: 'card', name: '카드' },
  { id: 'pack', name: '부스터팩' },
  { id: 'cafe', name: '음료 이용권' },
  { id: 'sleeve', name: '카드 슬리브' },
  { id: 'saver', name: '카드 세이버' },
  { id: 'bakery', name: '베이커리 이용권' },
  { id: 'coupon', name: '할인권' },
] as const;

const SAME_DAY = '현장 즉시 증정';

/** 임시 경품·등급·수량 (사장님 결정 대기 — ADMIN.md Q9) */
export function createInventory(): Stock[] {
  const rows: [Prize, number][] = [
    [{ id: 'card', category: 'card', name: '카드 1장', rarity: 'UR', description: '컬렉션 카드 1장\n종류는 현장 재고에 따라 다름', condition: SAME_DAY }, 10],
    [{ id: 'booster', category: 'pack', name: '부스터팩 1팩', rarity: 'SR', description: '인기 카드 부스터팩 1팩\n종류는 현장 재고에 따라 다름', condition: SAME_DAY }, 20],
    [{ id: 'drink', category: 'cafe', name: '음료 이용권', rarity: 'R', description: '카페 음료 1잔\n핫/아이스 선택 가능', condition: SAME_DAY }, 50],
    [{ id: 'sleeve', category: 'sleeve', name: '카드 슬리브', rarity: 'R', description: '카드 슬리브 1팩\n디자인은 현장 재고에 따라 다름', condition: SAME_DAY }, 70],
    [{ id: 'saver', category: 'saver', name: '카드 세이버', rarity: 'C', description: '카드 세이버 1개\n디자인은 현장 재고에 따라 다름', condition: SAME_DAY }, 150],
    [{ id: 'bakery', category: 'bakery', name: '베이커리 이용권', rarity: 'C', description: '베이커리 1개 교환\n메뉴는 현장 재고에 따라 다름', condition: SAME_DAY }, 200],
    [{ id: 'coupon-5', category: 'coupon', name: '5% 할인권', rarity: 'C', description: '매장 전 품목 5% 할인\n다른 할인과 중복 적용 불가', condition: '1만원 이상 구매 시 사용' }, 500],
  ];
  return rows.map(([prize, total]) => ({ prize, total, remaining: total }));
}

type Counts = { remaining: number; total: number };
const sum = (rows: Stock[]): Counts => ({
  remaining: rows.reduce((n, s) => n + s.remaining, 0),
  total: rows.reduce((n, s) => n + s.total, 0),
});

export const totalCounts = (stock: Stock[]) => sum(stock);
export const categoryCounts = (stock: Stock[], category: string) => sum(stock.filter((s) => s.prize.category === category));
/** 최고등급 경품의 남은/전체 수량 */
export const topRarityCounts = (stock: Stock[]) =>
  sum(stock.filter((s) => s.prize.rarity === RARITY_ORDER[RARITY_ORDER.length - 1]));

/** 남은 경품 1개 = 추첨권 1장. 남은 수량이 많을수록 잘 나오며, 품절(0)된 경품은 나오지 않는다. */
export function pickPrize(stock: Stock[], random = Math.random): Prize | null {
  let n = Math.floor(random() * sum(stock).remaining);
  for (const s of stock) {
    if (n < s.remaining) return s.prize;
    n -= s.remaining;
  }
  return null;
}

/** 사용자가 최종 선택한 경품 1개만 차감 (ADMIN.md 2장 5번) */
export function consume(stock: Stock[], prizeId: string) {
  const s = stock.find((row) => row.prize.id === prizeId);
  if (s && s.remaining > 0) s.remaining--;
}

/** 앱 전체가 공유하는 현재 재고 */
export const inventory = createInventory();
