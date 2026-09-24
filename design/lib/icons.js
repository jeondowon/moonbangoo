// 경품 카테고리 아이콘 (24×24 선 아이콘, stroke로 그림)
export const ICONS = {
  // 할인권: 양옆이 파인 티켓 + %
  coupon: `<path d="M3 7.2A2.2 2.2 0 0 1 5.2 5h13.6A2.2 2.2 0 0 1 21 7.2v2.3a2.5 2.5 0 0 0 0 5v2.3a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 16.8v-2.3a2.5 2.5 0 0 0 0-5Z"/>
<path d="M9.4 14.6l5.2-5.2"/><circle cx="9.6" cy="9.8" r="1.1"/><circle cx="14.4" cy="14.2" r="1.1"/>`,
  // 카드 씰: 모서리가 살짝 벗겨진 스티커 + 별
  sticker: `<path d="M5.2 3.5h9.6l5.7 5.7v10.1a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 19.3V4.7a1.2 1.2 0 0 1 1.2-1.2Z"/>
<path d="M14.8 3.5v4.5a1.2 1.2 0 0 0 1.2 1.2h4.5"/>
<path d="M11.2 9.3l1.05 2.2 2.4.3-1.75 1.65.45 2.4-2.15-1.2-2.15 1.2.45-2.4L7.75 11.8l2.4-.3Z"/>`,
  // 카페 음료: 뚜껑·빨대가 있는 아이스 컵
  cafe: `<path d="M5.6 8.2h12.8"/><path d="M7 8.2l.9-2.6h8.2l.9 2.6"/>
<path d="M7.1 8.2l1.25 11.6a1.2 1.2 0 0 0 1.2 1.07h4.9a1.2 1.2 0 0 0 1.2-1.07L16.9 8.2"/>
<path d="M13 5.6l1.6-3.4h2.6"/><path d="M8.3 12.6c1.2-.8 2.4-.8 3.7 0s2.5.8 3.7 0"/>`,
  // 부스터팩: 위아래 톱니 봉합 + 해 로고
  pack: `<path d="M6 3l1.5 1.1L9 3l1.5 1.1L12 3l1.5 1.1L15 3l1.5 1.1L18 3v18l-1.5-1.1L15 21l-1.5-1.1L12 21l-1.5-1.1L9 21l-1.5-1.1L6 21Z"/>
<circle cx="12" cy="11" r="2.6"/><path d="M9 15.6h6"/>`,
};

export const CATEGORY_LABEL = {
  coupon: '할인권',
  sticker: '카드 씰',
  cafe: '카페 음료',
  pack: '부스터팩',
};

export function icon(name, { x, y, size = 24, color, sw = 1.6 }) {
  const s = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${color}" stroke-width="${sw / s}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</g>`;
}
