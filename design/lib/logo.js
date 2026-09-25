// logo-mono.svg를 단일 원본으로 불러와 원하는 위치·크기·칠로 인라인한다.
// 로고 좌표계: viewBox 52 34 306 267 (원본 PNG 좌표). 해 중심 ≈ (205, 185), 반지름 ≈ 91.

export const LOGO_BOX = { x: 52, y: 34, w: 306, h: 267 };

let inner = null;

export async function loadLogo(url = new URL('../../logo-mono.svg', import.meta.url)) {
  const raw = await (await fetch(url)).text();
  inner = raw
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<title>[\s\S]*?<\/title>/, '');
}

// paint: 선 색 (예: 'url(#uid-foil-logo)'). 그라디언트는 로고 좌표계 기준으로 정의해야 함 (logoFoilGradient 사용)
export function logoMarkup({ uid, paint, x, y, width, filter = '' }) {
  if (!inner) throw new Error('loadLogo()를 먼저 호출하세요');
  const s = width / LOGO_BOX.w;
  const body = inner
    .replace(/ id="([^"]+)"/g, (_, id) => (id === 'ko-fish-b' ? ` id="${uid}-ko"` : ` data-part="${id}"`))
    .replace('url(#ko-fish-b)', `url(#${uid}-ko)`)
    .replaceAll('currentColor', paint);
  return `<g transform="translate(${x} ${y}) scale(${+s.toFixed(5)}) translate(${-LOGO_BOX.x} ${-LOGO_BOX.y})"${filter ? ` filter="url(#${filter})"` : ''}>${body}</g>`;
}
