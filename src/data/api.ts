// 백엔드(moonbangoo-backend, docs/API.md) 연결. 매장 디스플레이는 사장님 컴퓨터에서 서버와 함께 돌린다.
// 서버의 활성 팩 1개에 모든 경품이 섞여 있고(오리파), 경품마다 종류(icon)가 카드·오리파 화면의 카테고리가 된다.

/**
 * 백엔드가 서빙한 페이지면 그 서버의 API를 쓴다 (TV·폰에서 노트북 주소로 열어도 동작).
 * GitHub Pages·개발 서버·테스트에서는 같은 기기의 백엔드(localhost:8080)를 쓴다.
 */
function apiBase(): string {
  const host = globalThis.location?.hostname;
  const served = host !== undefined && !host.endsWith('github.io') && !import.meta.env?.DEV;
  return served ? '/api/v1' : 'http://localhost:8080/api/v1';
}

export interface Prize {
  id: string;
  name: string;
  rarity: string;
  /** design/lib/icons.js의 카테고리 키 */
  category: string;
  description: string;
  condition: string;
}

export interface Counts {
  remaining: number;
  total: number;
}

/** 기본 카테고리 7종 (어드민 기본 종류와 같음). 오리파 화면 하단 표시 순서 */
export const CATEGORIES = [
  { id: 'card', name: '카드' },
  { id: 'pack', name: '부스터팩' },
  { id: 'cafe', name: '음료 이용권' },
  { id: 'sleeve', name: '카드 슬리브' },
  { id: 'saver', name: '카드 세이버' },
  { id: 'bakery', name: '베이커리 이용권' },
  { id: 'coupon', name: '할인권' },
] as const;

export interface Shop {
  /** 뽑을 서버 팩 (첫 번째 활성 팩). 없으면 null */
  packId: number | null;
  /** 팩 전체 남은/전체 수량 */
  all: Counts;
  /** 최고등급 경품의 남은/전체 수량 */
  top: Counts;
  /** CATEGORIES 순서의 카테고리별 수량 */
  categories: Counts[];
  /** 팩에 든 경품 전체 (카드 텍스처를 미리 준비하는 데 쓴다) */
  prizes: Prize[];
}

export interface DrawResult {
  drawId: number;
  /** 넘기는 순서 = 등급 오름차순 (서버가 정렬) */
  cards: Prize[];
}

/** 어드민 페이지의 기본 아이콘 이름 → 프론트 카테고리 키 (나머지는 이름이 같다) */
const ICON_ALIAS: Record<string, string> = { drink: 'cafe', booster: 'pack', discount: 'coupon' };
const category = (icon: string | null) => (icon ? ICON_ALIAS[icon] ?? icon : '');

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(apiBase() + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new Error('서버에 연결하지 못했어요.');
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message ?? `서버 오류 (${res.status})`);
  }
  return res.json();
}

interface CardDto {
  id: number;
  name: string;
  rarity: string;
  description: string | null;
  condition: string | null;
  icon: string | null;
}

const toPrize = (c: CardDto): Prize => ({
  id: String(c.id),
  name: c.name,
  rarity: c.rarity,
  category: category(c.icon),
  description: c.description ?? '',
  condition: c.condition ?? '',
});

type PrizeDto = CardDto & { remaining: number; total: number };
/** 운영·시연 모드 공통 재고 합산. 빈 목록은 남은/전체 수량 모두 0이다. */
export function sumCounts(rows: readonly Counts[]): Counts {
  const counts = { remaining: 0, total: 0 };
  for (const row of rows) {
    counts.remaining += row.remaining;
    counts.total += row.total;
  }
  return counts;
}

export async function fetchShop(): Promise<Shop> {
  // 손님용 API만 쓴다 (어드민 API는 로그인이 필요). /packs는 활성 팩만 돌려준다
  const { packs } = await call<{ packs: { id: number }[] }>('GET', '/packs');
  const packId = packs[0]?.id ?? null;
  const prizes = packId === null ? [] : (await call<{ prizes: PrizeDto[] }>('GET', `/packs/${packId}/prizes`)).prizes;
  return {
    packId,
    all: sumCounts(prizes),
    top: sumCounts(prizes.filter((p) => p.rarity === 'UR')),
    categories: CATEGORIES.map((c) => sumCounts(prizes.filter((p) => category(p.icon) === c.id))),
    prizes: prizes.map(toPrize),
  };
}

/** 팩에서 카드 5장 (수량 차감 없음) */
export async function drawCards(packId: number): Promise<DrawResult> {
  const res = await call<{ drawId: number; cards: CardDto[] }>('POST', `/packs/${packId}/draw`);
  return { drawId: res.drawId, cards: res.cards.map(toPrize) };
}

/** 손님이 고른 1장 확정 (그 경품만 1 차감) */
export async function confirmPrize(drawId: number, prizeId: string): Promise<void> {
  await call('POST', `/draws/${drawId}/confirm`, { prizeId: Number(prizeId) });
}
