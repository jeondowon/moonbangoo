// 팩·카드 시안 공통: 팔레트, 그라디언트, 필터, 장식 도형 생성기.
// 모든 생성기는 SVG 문자열을 반환한다. 한 페이지에 여러 개를 인라인해도 id가 겹치지 않도록 uid 접두사를 받는다.

export const INK = {
  paper: '#F4EDE0',
  paperHi: '#FBF7EF',
  paperLo: '#E6D9C2',
  tone: '#E9DDC7',      // 종이 위 톤온톤 무늬
  ink: '#4A3A28',       // 본문 인쇄색 (검정 대신 따뜻한 갈색)
  inkSoft: '#8A7760',
  accent: '#7A5520',
};

// 금속 박 그라디언트 — 대각선 방향 밴드로 2D에서 금속감을 흉내 낸다 (M1부터는 실제 PBR 반사로 대체)
export const METALS = {
  gold: [
    [0, '#7a5623'], [0.18, '#b68c47'], [0.34, '#e3c88b'], [0.5, '#a57b37'],
    [0.68, '#d2b06b'], [0.84, '#8f6a2c'], [1, '#c29d59'],
  ],
  silver: [
    [0, '#7d848d'], [0.2, '#c9ced4'], [0.36, '#f7f8fa'], [0.52, '#a3aab3'],
    [0.7, '#e6e9ed'], [0.86, '#8a919a'], [1, '#cfd4da'],
  ],
  ivory: [
    [0, '#bfa77d'], [0.3, '#e4d5b8'], [0.5, '#f3e9d6'], [0.7, '#d8c6a2'], [1, '#b99f73'],
  ],
  rainbow: [
    [0, '#f2a7c3'], [0.17, '#f7d59c'], [0.33, '#f1f0a6'], [0.5, '#a8e6c0'],
    [0.67, '#9fd3f2'], [0.83, '#b9a7f0'], [1, '#f2a7c3'],
  ],
};

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const n = (v) => +v.toFixed(2);

export function linGrad(id, stops, x1, y1, x2, y2) {
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops
    .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a < 1 ? ` stop-opacity="${a}"` : ''}/>`)
    .join('')}</linearGradient>`;
}

export function radGrad(id, stops, cx, cy, r) {
  return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}">${stops
    .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a < 1 ? ` stop-opacity="${a}"` : ''}/>`)
    .join('')}</radialGradient>`;
}

// 종이결 노이즈 (적용 대상 도형 안에서만 보이도록 SourceGraphic으로 잘라냄)
export function grainFilter(id, { freq = 1.15, alpha = 0.028, seed = 7 } = {}) {
  // 노이즈 R채널(0~1)을 ±0.07 폭의 아주 옅은 알파로 변환 → 검정 rect에 적용해 종이결만 남김
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="${seed}" result="n"/>
<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0 0.12  0.28 0 0 0 ${(alpha - 0.14).toFixed(3)}" result="g"/>
<feComposite in="g" in2="SourceGraphic" operator="in"/></filter>`;
}

// 박 찍힘(foil stamping) 느낌: 아주 얕은 눌림 그림자 + 윗면 하이라이트
export function pressFilter(id, s = 1) {
  return `<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
<feGaussianBlur in="SourceAlpha" stdDeviation="${0.5 * s}" result="b"/>
<feOffset in="b" dy="${0.9 * s}" result="o"/>
<feFlood flood-color="#4b3415" flood-opacity=".38"/><feComposite in2="o" operator="in" result="sh"/>
<feOffset in="SourceAlpha" dy="${-0.6 * s}" result="up"/>
<feComposite in="SourceAlpha" in2="up" operator="out" result="edge"/>
<feFlood flood-color="#fff6dc" flood-opacity=".55"/><feComposite in2="edge" operator="in" result="hl"/>
<feMerge><feMergeNode in="sh"/><feMergeNode in="SourceGraphic"/><feMergeNode in="hl"/></feMerge></filter>`;
}

// 해돋이 방사선: 교차하는 쐐기 n개 (톤온톤 무늬)
export function raysPath(cx, cy, R, count) {
  const step = (Math.PI * 2) / count;
  let d = '';
  for (let i = 0; i < count; i += 2) {
    const a0 = i * step - Math.PI / 2;
    const a1 = a0 + step;
    d += `M${cx} ${cy}L${n(cx + R * Math.cos(a0))} ${n(cy + R * Math.sin(a0))}L${n(cx + R * Math.cos(a1))} ${n(cy + R * Math.sin(a1))}Z`;
  }
  return d;
}

// 물결: y 기준선에서 진폭 amp, 파장 len. closed=true면 아래쪽(bottom)까지 채움 영역
export function wavePath(x0, x1, y, amp, len, phase = 0, bottom = null) {
  const k = len / 4;
  let x = x0 - ((phase % len) + len) % len;
  let d = `M${n(x)} ${n(y)}`;
  let up = true;
  while (x < x1) {
    const dy = up ? -amp : amp;
    // 반 파장 = 사인 곡선 근사 cubic 2개 → 여기서는 부드러운 반원형 cubic 1개
    d += `C${n(x + k * 0.73)} ${n(y + dy * 1.33)} ${n(x + 2 * k - k * 0.73)} ${n(y + dy * 1.33)} ${n(x + 2 * k)} ${n(y)}`;
    x += 2 * k;
    up = !up;
  }
  if (bottom != null) d += `L${n(x)} ${bottom}L${n(x0 - len)} ${bottom}Z`;
  return d;
}

// 오목한 모서리의 사각 테두리 (증서 스타일)
export function notchedRect(x0, y0, x1, y1, r) {
  return `M${x0 + r} ${y0}H${x1 - r}A${r} ${r} 0 0 0 ${x1} ${y0 + r}V${y1 - r}A${r} ${r} 0 0 0 ${x1 - r} ${y1}H${x0 + r}A${r} ${r} 0 0 0 ${x0} ${y1 - r}V${y0 + r}A${r} ${r} 0 0 0 ${x0 + r} ${y0}Z`;
}

// 모서리 장식: 조개 부채꼴(동심 호 2개 + 진주 점)
export function cornerFans(x0, y0, x1, y1, { r1 = 9, r2 = 15, dot = 2.2, sw = 1 } = {}) {
  const corners = [
    [x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1],
  ];
  return corners
    .map(([cx, cy, sx, sy]) => {
      const arc = (r) => {
        const ax = cx + sx * r, by = cy + sy * r;
        const sweep = sx * sy > 0 ? 1 : 0;
        return `<path d="M${ax} ${cy}A${r} ${r} 0 0 ${sweep} ${cx} ${by}" fill="none" stroke-width="${sw}"/>`;
      };
      const d = Math.SQRT1_2 * (r2 + 6);
      return `${arc(r1)}${arc(r2)}<circle cx="${n(cx + sx * d)}" cy="${n(cy + sy * d)}" r="${dot}" stroke="none"/>`;
    })
    .join('');
}

// 가운데 마름모가 있는 구분선
export function divider(cx, y, half, gap = 14, size = 4.5, sw = 1) {
  return `<path d="M${cx - half} ${y}H${cx - gap}M${cx + gap} ${y}H${cx + half}" fill="none" stroke-width="${sw}"/>
<path d="M${cx} ${y - size}L${cx + size} ${y}L${cx} ${y + size}L${cx - size} ${y}Z" stroke="none"/>`;
}

// 4꼭지 반짝이
export function sparkle(x, y, r) {
  const q = r * 0.22;
  return `M${x} ${y - r}Q${x + q} ${y - q} ${x + r} ${y}Q${x + q} ${y + q} ${x} ${y + r}Q${x - q} ${y + q} ${x - r} ${y}Q${x - q} ${y - q} ${x} ${y - r}Z`;
}

// 결정적 의사난수 (시안이 새로고침마다 바뀌지 않도록)
export function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
