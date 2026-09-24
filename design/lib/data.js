// 1차 목업 데이터. 필드는 명세 R5-1 데이터 모델과 동일하게 유지 → 2차에서 서버 API 응답으로 교체.
// ⚠ 등급 이름·경품·확률은 사장님 결정 대기 (명세 Q1). 아래는 모두 가칭/예시.

export const RARITIES = {
  C: { code: 'C', name: '일반', metal: 'ivory', pearls: 1 },
  R: { code: 'R', name: '레어', metal: 'silver', pearls: 2 },
  SR: { code: 'SR', name: '슈퍼레어', metal: 'gold', pearls: 3 },
  UR: { code: 'UR', name: '최고등급', metal: 'rainbow', pearls: 0 }, // 진주 대신 해 문양
};

export const RARITY_ORDER = ['C', 'R', 'SR', 'UR'];

export const PRIZES = [
  {
    id: 'coupon-5',
    name: '5% 할인권',
    rarity: 'C',
    category: 'coupon',
    image: null,
    description: '매장 전 품목 5% 할인\n다른 할인과 중복 적용 불가',
    condition: '1만원 이상 구매 시 사용',
    probability: 0.4,
    stock: null,
  },
  {
    id: 'coupon-10',
    name: '10% 할인권',
    rarity: 'R',
    category: 'coupon',
    image: null,
    description: '매장 전 품목 10% 할인\n다른 할인과 중복 적용 불가',
    condition: '2만원 이상 구매 시 사용',
    probability: 0.25,
    stock: null,
  },
  {
    id: 'seal',
    name: '카드 씰 1매',
    rarity: 'R',
    category: 'sticker',
    image: null,
    description: '랜덤 카드 씰 1매\n디자인은 현장 재고에 따라 다름',
    condition: '현장 즉시 증정',
    probability: 0.2,
    stock: 50,
  },
  {
    id: 'americano',
    name: '아이스 아메리카노',
    rarity: 'SR',
    category: 'cafe',
    image: null,
    description: '카페 음료 1잔\n핫/아이스 선택 가능',
    condition: '현장 즉시 증정',
    probability: 0.1,
    stock: 30,
  },
  {
    id: 'booster',
    name: '부스터팩 1팩',
    rarity: 'UR',
    category: 'pack',
    image: null,
    description: '인기 카드 부스터팩 1팩\n종류는 현장 재고에 따라 다름',
    condition: '현장 즉시 증정',
    probability: 0.05,
    stock: 10,
  },
];

export const VISIT_DAYS = 14; // 모든 경품 공통 고정
