// 카드 2D 시안. 630×880 (실물 트레이딩 카드 63×88mm 비율).
// 구조는 트레이딩 카드 관례(이름·등급 / 일러스트 창 / 정보 띠 / 설명 박스 / 하단 표기)만 참고하고,
// 프레임·마크·서체는 어른뭉방구 고유 요소(해·조개·물결·진주)로 구성.
import {
  INK, METALS, linGrad, radGrad, grainFilter, pressFilter, raysPath, wavePath,
  notchedRect, cornerFans, divider, sparkle, rng, esc,
} from './common.js';
import { logoMarkup, LOGO_BOX } from './logo.js';
import { icon, CATEGORY_LABEL } from './icons.js';
import { RARITIES, VISIT_DAYS } from './data.js';

export const CARD = { W: 630, H: 880, R: 26 };
/** 일러스트 창 위치 (src/card/holo.ts에서 홀로 마스크 영역으로 재사용) */
export const WINDOW_BOX = { x: 42, y: 110, w: 546, h: 356 };

const SANS = 'Pretendard Variable, Pretendard, sans-serif';
const SERIF = 'Gowun Batang, serif';
const LATIN = 'Cormorant Garamond, serif';

// 등급 마크: 진주 1~3알, 최고등급은 해 문양
function rarityMark(r, x, y, uid) {
  const metal = r.metal;
  const tint = { ivory: '#d9c7a4', silver: '#b8bec6', gold: '#d2a95a', rainbow: '#c9b7f2' }[metal];
  if (!r.pearls) {
    let rays = '';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r0 = 8.5, r1 = i % 2 ? 11.5 : 13.5;
      rays += `M${(x + 10 + r0 * Math.cos(a)).toFixed(2)} ${(y + r0 * Math.sin(a)).toFixed(2)}L${(x + 10 + r1 * Math.cos(a)).toFixed(2)} ${(y + r1 * Math.sin(a)).toFixed(2)}`;
    }
    return {
      w: 24,
      svg: `<circle cx="${x + 10}" cy="${y}" r="6.2" fill="url(#${uid}-metal)"/>
<path d="${rays}" stroke="url(#${uid}-metal)" stroke-width="1.8" stroke-linecap="round"/>
<circle cx="${x + 10}" cy="${y}" r="6.2" fill="none" stroke="#6d5a8a" stroke-opacity=".35" stroke-width=".8"/>`,
    };
  }
  let s = '';
  for (let i = 0; i < r.pearls; i++) {
    const cx = x + 8 + i * 19;
    s += `<circle cx="${cx}" cy="${y}" r="7.5" fill="url(#${uid}-pearl)"/>
<circle cx="${cx}" cy="${y}" r="7.5" fill="none" stroke="${tint}" stroke-width="1"/>`;
  }
  return { w: 8 + r.pearls * 19, svg: s };
}

// 일러스트 창 배경 (1차는 빈 플레이스홀더 — 등급별 바탕만 다르게)
function windowArt(prize, r, box, uid, artwork = '', artworkScale = 1) {
  const { x, y, w, h } = box;
  const cx = x + w / 2, cy = y + h / 2;
  const rand = rng(prize.id.length * 97 + r.code.charCodeAt(0));
  let bg = '';
  let sparkles = '';
  const sp = (n, color, op) => {
    let d = '';
    for (let i = 0; i < n; i++) d += sparkle(x + 20 + rand() * (w - 40), y + 16 + rand() * (h - 32), 3 + rand() * 7);
    return `<path d="${d}" fill="${color}" opacity="${op}"/>`;
  };
  switch (r.code) {
    case 'C': {
      let hatch = '';
      for (let i = -h; i < w; i += 14) hatch += `M${x + i} ${y + h}L${x + i + h} ${y}`;
      bg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ECE3D2"/>
<path d="${hatch}" stroke="#E0D3BC" stroke-width="1.2"/>`;
      break;
    }
    case 'R':
      bg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${uid}-win)"/>`;
      sparkles = sp(14, '#ffffff', 0.9);
      break;
    case 'SR':
      bg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${uid}-win)"/>
<path d="${raysPath(cx, y + h * 0.62, w, 40)}" fill="#fff4d6" opacity=".45"/>`;
      sparkles = sp(12, '#fffaf0', 0.95);
      break;
    case 'UR':
      bg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${INK.paperHi}"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${uid}-metal)" opacity=".55"/>
<path d="${raysPath(cx, y + h * 0.62, w, 40)}" fill="#fff" opacity=".35"/>
<path d="${wavePath(x, x + w, y + h - 54, 8, 120, 20, y + h)}" fill="#fff" opacity=".35"/>
<path d="${wavePath(x, x + w, y + h - 28, 7, 96, 60, y + h)}" fill="#fff" opacity=".35"/>`;
      sparkles = sp(18, '#ffffff', 0.95);
      break;
  }
  const iconColor = r.code === 'C' ? INK.inkSoft : r.code === 'R' ? '#7d858f' : r.code === 'SR' ? '#9a7434' : '#7b6aa8';
  return `<g clip-path="url(#${uid}-win-clip)">
${bg}${sparkles}
${artwork ? `<image href="${artwork}" x="${cx - (w * artworkScale) / 2}" y="${cy - (h * artworkScale) / 2}" width="${w * artworkScale}" height="${h * artworkScale}" preserveAspectRatio="xMidYMid meet"/>` : ''}
${artwork ? '' : `${icon(prize.category, { x: cx - 44, y: cy - 62, size: 88, color: iconColor, sw: 2 }).replace('<g ', '<g opacity=".42" ')}
<text x="${cx}" y="${cy + 54}" text-anchor="middle" fill="${iconColor}" opacity=".7" font-family="${LATIN}" font-weight="700" font-size="12" letter-spacing="5">ILLUSTRATION</text>
<text x="${cx}" y="${cy + 76}" text-anchor="middle" fill="${iconColor}" opacity=".6" font-family="${SANS}" font-weight="500" font-size="13">경품 이미지 자리</text>`}
<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${uid}-winshade)"/>
</g>`;
}

export function cardFront(prize, { uid = `cf-${prize.id}`, index = 1, total = 5, artwork = '', artworkScale = 1 } = {}) {
  const { W, H, R } = CARD;
  const r = RARITIES[prize.rarity];
  const metal = METALS[r.metal];
  const u = (s) => `url(#${uid}-${s})`;
  const win = WINDOW_BOX;
  const panel = { x: 40, y: 530, w: 550, h: 252 };
  const no = `${String(index).padStart(2, '0')}/${String(total).padStart(2, '0')}`;
  const pill = { w: r.code.length > 1 ? 56 : 42, h: 30 };
  pill.x = 532 - pill.w;
  const mark = rarityMark(r, 50, 826, uid);
  const desc = prize.description.split('\n');
  const darkText = r.code === 'UR' ? '#3d3350' : '#3a2c1c';

  const winFill = {
    R: linGrad(`${uid}-win`, [[0, '#f4f5f7'], [0.5, '#e4e7eb'], [1, '#d6dae0']], win.x, win.y, win.x + win.w, win.y + win.h),
    SR: radGrad(`${uid}-win`, [[0, '#fbf0d4'], [0.6, '#efd9a4'], [1, '#d9b870']], win.x + win.w / 2, win.y + win.h * 0.62, win.w * 0.7),
  }[r.code] || '';

  const pearlCore = { ivory: '#f3e9d6', silver: '#e3e7ec', gold: '#f0d89c', rainbow: '#f0e6ff' }[r.metal];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="card" role="img" aria-label="${esc(prize.name)} 카드 앞면">
<defs>
${linGrad(`${uid}-metal`, metal, 0, 0, W, H)}
${linGrad(`${uid}-metal-h`, metal, 0, 0, W, 0)}
${linGrad(`${uid}-face`, [[0, INK.paperHi], [0.6, INK.paper], [1, '#EFE5D3']], 0, 0, 0, H)}
${linGrad(`${uid}-winshade`, [[0, '#3a2a14', 0.22], [0.06, '#3a2a14', 0], [0.94, '#3a2a14', 0], [1, '#3a2a14', 0.12]], 0, win.y, 0, win.y + win.h)}
${linGrad(`${uid}-sheen`, [[0, '#fff', 0], [0.42, '#fff', 0], [0.5, '#fff', 0.5], [0.58, '#fff', 0], [1, '#fff', 0]], 0, 0, W, H)}
${radGrad(`${uid}-pearl`, [[0, '#ffffff'], [0.35, pearlCore], [1, METALS[r.metal][1][1]]], 0, 0, 1).replace('gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1"', 'cx=".35" cy=".3" r=".8"')}
${winFill}
${grainFilter(`${uid}-grain`)}
${pressFilter(`${uid}-press`, 0.7)}
<clipPath id="${uid}-clip"><rect width="${W}" height="${H}" rx="${R}"/></clipPath>
<clipPath id="${uid}-win-clip"><rect x="${win.x}" y="${win.y}" width="${win.w}" height="${win.h}" rx="4"/></clipPath>
</defs>
<g clip-path="url(#${uid}-clip)">
  <g data-layer="frame">
    <rect width="${W}" height="${H}" fill="${u('metal')}"/>
    ${r.code === 'UR' ? `<rect width="${W}" height="${H}" fill="${u('sheen')}" opacity=".7"/>` : ''}
    <rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="${R - 7}" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="1"/>
    <rect x="9" y="9" width="${W - 18}" height="${H - 18}" rx="${R - 8}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1"/>
  </g>
  <g data-layer="paper">
    <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="14" fill="${u('face')}"/>
    ${r.code === 'UR' ? `<rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="14" fill="${u('metal')}" opacity=".12"/>` : ''}
    <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="14" fill="none" stroke="#3a2a14" stroke-opacity=".25" stroke-width="1.2"/>
  </g>

  <g data-layer="header">
    <text x="46" y="82" fill="${INK.ink}" font-family="${SERIF}" font-weight="700" font-size="34" letter-spacing="-.5" data-maxw="${pill.x - 60}">${esc(prize.name)}</text>
    <rect x="${pill.x}" y="${64 - pill.h / 2}" width="${pill.w}" height="${pill.h}" rx="${pill.h / 2}" fill="${u('metal-h')}" stroke="#3a2a14" stroke-opacity=".25"/>
    <text x="${pill.x + pill.w / 2}" y="${64 + 6.5}" text-anchor="middle" fill="${darkText}" font-family="${LATIN}" font-weight="700" font-size="19" letter-spacing="1">${r.code}</text>
    <circle cx="572" cy="64" r="25" fill="${INK.paperHi}" stroke="${u('metal')}" stroke-width="3"/>
    ${icon(prize.category, { x: 572 - 14, y: 64 - 14, size: 28, color: INK.accent, sw: 1.7 })}
  </g>

  <g data-layer="window">
    <rect x="${win.x - 5}" y="${win.y - 5}" width="${win.w + 10}" height="${win.h + 10}" rx="7" fill="${u('metal')}"/>
    <rect x="${win.x - 5}" y="${win.y - 5}" width="${win.w + 10}" height="${win.h + 10}" rx="7" fill="none" stroke="#3a2a14" stroke-opacity=".28"/>
    ${windowArt(prize, r, win, uid, artwork, artworkScale)}
    <rect x="${win.x}" y="${win.y}" width="${win.w}" height="${win.h}" rx="4" fill="none" stroke="#3a2a14" stroke-opacity=".3"/>
  </g>

  <g data-layer="strip">
    <rect x="${win.x - 5}" y="480" width="${win.w + 10}" height="30" rx="4" fill="${u('metal-h')}" opacity=".9"/>
    <text x="${win.x + 12}" y="500" fill="${darkText}" font-family="${SANS}" font-weight="600" font-size="14.5">${CATEGORY_LABEL[prize.category]}</text>
    <text x="${win.x + win.w - 12}" y="500" text-anchor="end" fill="${darkText}" font-family="${LATIN}" font-style="italic" font-weight="600" font-size="15" letter-spacing="1.5">Eoreun Moongbangu Prize Card</text>
  </g>

  <g data-layer="panel">
    <rect x="${panel.x}" y="${panel.y}" width="${panel.w}" height="${panel.h}" rx="12" fill="#FAF6EE" fill-opacity=".8" stroke="${u('metal')}" stroke-width="1.5"/>
    <text x="66" y="570" fill="${INK.accent}" font-family="${SERIF}" font-weight="700" font-size="17">경품 안내</text>
    ${desc.map((t, i) => `<text x="66" y="${604 + i * 30}" fill="${i ? INK.inkSoft : INK.ink}" font-family="${SANS}" font-weight="${i ? 500 : 600}" font-size="${i ? 17 : 20}" letter-spacing="-.3">${esc(t)}</text>`).join('')}
    <path d="M66 666H${panel.x + panel.w - 26}" stroke="${INK.inkSoft}" stroke-opacity=".45" stroke-dasharray="2 5" stroke-linecap="round" stroke-width="1.4"/>
    <text x="66" y="700" fill="${INK.accent}" font-family="${SERIF}" font-weight="700" font-size="17">교환 조건</text>
    <text x="66" y="738" fill="${INK.accent}" font-family="${SANS}" font-weight="700" font-size="23" letter-spacing="-.4" data-maxw="${panel.w - 52}">${esc(prize.condition)}</text>
    <text x="66" y="765" fill="${INK.inkSoft}" font-family="${SANS}" font-weight="500" font-size="14" letter-spacing="-.2">선택일로부터 ${VISIT_DAYS}일 이내 매장 방문 시 교환</text>
  </g>

  <g data-layer="footer">
    ${mark.svg}
    <text x="${50 + mark.w + 10}" y="832" fill="${INK.ink}" font-family="${SERIF}" font-weight="700" font-size="15">${r.name}</text>
    <text x="${W - 46}" y="832" text-anchor="end" fill="${INK.inkSoft}" font-family="${LATIN}" font-weight="600" font-size="15" letter-spacing=".5">No. ${no}  ·  Illus. 어른뭉방구</text>
  </g>
  <rect width="${W}" height="${H}" fill="#000" filter="url(#${uid}-grain)" pointer-events="none"/>
</g>
</svg>`;
}

// 매장 안내 카드: 실물 팩의 광고 카드처럼 뭉치 맨 앞에 끼워 넣는 경품 아닌 카드.
// 첫 장은 넘기기 안내에 덮여 보이므로, 어둡게 덮여도 알아보도록 큰 로고 위주로 구성. 등급·번호는 넣지 않는다.
// 경품 카드(크림 종이 + 일러스트 창)와 구분되도록 에너지 카드처럼 해돋이가 카드 전체를 채우는 풀아트로, 안내 글은 그 위에 반투명 패널로 얹는다.
// 바탕색은 팩마다 이 중 하나를 고른다. sun: 해돋이 그라디언트(중심→가장자리), ray·glow: 방사선·후광, waves: 물결 두 겹, accent: 영문 글씨,
// frame: 테두리 금속 (은색과 같은 명암 밴드에 색만 바탕 무드 쪽으로 — 주홍=구리, 남색=푸른 은, 테라코타=샴페인 브론즈, 버건디=로즈골드, 청록=녹청 은)
export const STORE_PALETTES = [
  { name: 'vermilion', sun: ['#f0a050', '#e07a42', '#c8553d', '#93301f'], ray: '#ffe7c2', glow: '#ffd9a0', waves: ['#a83c26', '#8a2e1d'], accent: '#ffe2b0',
    frame: [[0, '#7a4a32'], [0.2, '#c08560'], [0.36, '#f1d2b4'], [0.52, '#a0674a'], [0.7, '#e2b494'], [0.86, '#875440'], [1, '#cc9675']] },
  { name: 'navy', sun: ['#3b5b86', '#2c4a72', '#1f3658', '#13223a'], ray: '#f3dfae', glow: '#f6e2b0', waves: ['#162a46', '#0e1c30'], accent: '#e8cf94',
    frame: [[0, '#5f6b7d'], [0.2, '#aab6c6'], [0.36, '#eef2f7'], [0.52, '#8692a4'], [0.7, '#d6dde7'], [0.86, '#6a7688'], [1, '#b9c3d0']] },
  { name: 'terracotta', sun: ['#d9a07a', '#c4805e', '#a8634a', '#7a4434'], ray: '#fbead2', glow: '#fde9cc', waves: ['#8e5140', '#6f3d30'], accent: '#fbe3c0',
    frame: [[0, '#86684c'], [0.2, '#c9ab88'], [0.36, '#f5e6d0'], [0.52, '#a6876a'], [0.7, '#e6d0b4'], [0.86, '#907257'], [1, '#d2b896']] },
  { name: 'burgundy', sun: ['#9a4a52', '#80363f', '#652630', '#40161d'], ray: '#f3d9b0', glow: '#f6ddb4', waves: ['#521e27', '#3a131a'], accent: '#ecd09c',
    frame: [[0, '#7d5056'], [0.2, '#c3959a'], [0.36, '#f3dcdc'], [0.52, '#a1727a'], [0.7, '#e4c2c4'], [0.86, '#875b62'], [1, '#cfa4a8']] },
  { name: 'teal', sun: ['#3f7f7a', '#2f6964', '#22524e', '#143633'], ray: '#f1e0b4', glow: '#f3e2b6', waves: ['#1b4643', '#11312f'], accent: '#e9d39e',
    frame: [[0, '#5a716c'], [0.2, '#a3bab4'], [0.36, '#eaf3f0'], [0.52, '#80978f'], [0.7, '#d0e0db'], [0.86, '#647b75'], [1, '#b3c8c2']] },
];

export function cardStore({ uid = 'cs', total = 5, palette = STORE_PALETTES[0] } = {}) {
  const { W, H, R } = CARD;
  const u = (s) => `url(#${uid}-${s})`;
  const panel = { x: 40, y: 530, w: 550, h: 252 };
  const cx = W / 2;
  const lw = 330;
  const lh = (lw * LOGO_BOX.h) / LOGO_BOX.w;
  const ly = 300; // 로고 중심 = 해돋이 중심
  const cream = INK.paperHi;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="card" role="img" aria-label="어른뭉방구 매장 안내 카드">
<defs>
${linGrad(`${uid}-metal`, palette.frame, 0, 0, W, H)}
${linGrad(`${uid}-foil-logo`, [[0, '#fffaf0'], [0.5, '#f3e3c0'], [1, '#fbf1dc']], LOGO_BOX.x, LOGO_BOX.y, LOGO_BOX.x + LOGO_BOX.w, LOGO_BOX.y + LOGO_BOX.h)}
${radGrad(`${uid}-sun`, [0, 0.35, 0.7, 1].map((o, i) => [o, palette.sun[i]]), cx, ly, 620)}
${grainFilter(`${uid}-grain`)}
${pressFilter(`${uid}-press-logo`, 0.75)}
<clipPath id="${uid}-clip"><rect width="${W}" height="${H}" rx="${R}"/></clipPath>
<clipPath id="${uid}-art-clip"><rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="14"/></clipPath>
</defs>
<g clip-path="url(#${uid}-clip)">
  <g data-layer="frame">
    <rect width="${W}" height="${H}" fill="${u('metal')}"/>
    <rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="${R - 7}" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="1"/>
    <rect x="9" y="9" width="${W - 18}" height="${H - 18}" rx="${R - 8}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1"/>
  </g>
  <g data-layer="art" clip-path="url(#${uid}-art-clip)">
    <rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="${u('sun')}"/>
    <path d="${raysPath(cx, ly, 900, 48)}" fill="${palette.ray}" opacity=".16"/>
    <circle cx="${cx}" cy="${ly}" r="190" fill="${palette.glow}" opacity=".14"/>
    <path d="${wavePath(0, W, 468, 9, 130, 20, H)}" fill="${palette.waves[0]}" opacity=".55"/>
    <path d="${wavePath(0, W, 496, 8, 104, 60, H)}" fill="${palette.waves[1]}" opacity=".75"/>
    ${logoMarkup({ uid: `${uid}-logo`, paint: u('foil-logo'), x: cx - lw / 2, y: ly - lh / 2, width: lw, filter: `${uid}-press-logo` })}
    <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="14" fill="none" stroke="#3a1a10" stroke-opacity=".35" stroke-width="1.2"/>
  </g>

  <g data-layer="header">
    <text x="${W - 46}" y="78" text-anchor="end" fill="${palette.accent}" font-family="${LATIN}" font-weight="700" font-size="17" letter-spacing="4">WELCOME</text>
  </g>

  <g data-layer="panel">
    <rect x="${panel.x}" y="${panel.y}" width="${panel.w}" height="${panel.h}" rx="12" fill="${cream}" fill-opacity=".84" stroke="${u('metal')}" stroke-width="1.5"/>
    <text x="66" y="570" fill="${INK.accent}" font-family="${SERIF}" font-weight="700" font-size="17">어서 오세요</text>
    <text x="66" y="604" fill="${INK.ink}" font-family="${SANS}" font-weight="600" font-size="20" letter-spacing="-.3">포항 종합 문구·카드샵</text>
    <text x="66" y="634" fill="${INK.inkSoft}" font-family="${SANS}" font-weight="500" font-size="17" letter-spacing="-.3">포켓몬카드 · 원피스카드 · 문구</text>
    <path d="M66 666H${panel.x + panel.w - 26}" stroke="${INK.inkSoft}" stroke-opacity=".45" stroke-dasharray="2 5" stroke-linecap="round" stroke-width="1.4"/>
    <text x="66" y="700" fill="${INK.accent}" font-family="${SERIF}" font-weight="700" font-size="17">오시는 길</text>
    <text x="66" y="738" fill="${INK.accent}" font-family="${SANS}" font-weight="700" font-size="23" letter-spacing="-.4">포항시 북구 양학로32번길 11-23</text>
    <text x="66" y="765" fill="${INK.inkSoft}" font-family="${SANS}" font-weight="500" font-size="14" letter-spacing="-.2">월–토 12:00 – 21:00 · 일요일 휴무</text>
  </g>

  <g data-layer="footer">
    <text x="50" y="832" fill="${cream}" font-family="${SERIF}" font-weight="700" font-size="15">경품 카드 ${total}장은 다음 장부터</text>
    <text x="${W - 46}" y="832" text-anchor="end" fill="${palette.accent}" font-family="${LATIN}" font-weight="600" font-size="15" letter-spacing=".5">Store Card  ·  Pohang</text>
  </g>
  <rect width="${W}" height="${H}" fill="#000" filter="url(#${uid}-grain)" pointer-events="none"/>
</g>
</svg>`;
}

export function cardBack({ uid = 'cb' } = {}) {
  const { W, H, R } = CARD;
  const u = (s) => `url(#${uid}-${s})`;
  const cx = W / 2, cy = H / 2;
  const lw = 372;
  const lh = (lw * LOGO_BOX.h) / LOGO_BOX.w;
  let rings = '';
  for (let rr = 70; rr < 520; rr += 15) rings += `<circle cx="${cx}" cy="${cy}" r="${rr}"/>`;
  const inner = { x0: 44, y0: 44, x1: W - 44, y1: H - 44 };

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="card" role="img" aria-label="카드 뒷면">
<defs>
${linGrad(`${uid}-metal`, METALS.gold, 0, 0, W, H)}
${linGrad(`${uid}-foil-logo`, METALS.gold, LOGO_BOX.x, LOGO_BOX.y, LOGO_BOX.x + LOGO_BOX.w, LOGO_BOX.y + LOGO_BOX.h)}
${radGrad(`${uid}-face`, [[0, INK.paperHi], [0.7, INK.paper], [1, '#E9DCC5']], cx, cy, 560)}
${radGrad(`${uid}-fade`, [[0, '#fff', 1], [0.6, '#fff', 0.6], [1, '#fff', 0]], cx, cy, 470)}
${grainFilter(`${uid}-grain`)}
${pressFilter(`${uid}-press`, 0.8)}
${pressFilter(`${uid}-press-logo`, 0.75)}
<clipPath id="${uid}-clip"><rect width="${W}" height="${H}" rx="${R}"/></clipPath>
<mask id="${uid}-mask"><rect width="${W}" height="${H}" fill="${u('fade')}"/></mask>
</defs>
<g clip-path="url(#${uid}-clip)">
  <g data-layer="frame">
    <rect width="${W}" height="${H}" fill="${u('metal')}"/>
    <rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="${R - 7}" fill="none" stroke="#000" stroke-opacity=".12"/>
    <rect x="9" y="9" width="${W - 18}" height="${H - 18}" rx="${R - 8}" fill="none" stroke="#fff" stroke-opacity=".45"/>
  </g>
  <g data-layer="paper">
    <rect x="22" y="22" width="${W - 44}" height="${H - 44}" rx="14" fill="${u('face')}"/>
    <g mask="${u('mask')}">
      <path d="${raysPath(cx, cy, 700, 64)}" fill="${INK.tone}" opacity=".75"/>
      <g fill="none" stroke="#E2D4BA" stroke-width=".9" opacity=".7">${rings}</g>
    </g>
    <rect x="22" y="22" width="${W - 44}" height="${H - 44}" rx="14" fill="none" stroke="#3a2a14" stroke-opacity=".3" stroke-width="1.2"/>
  </g>
  <g data-layer="foil" fill="${u('metal')}" stroke="${u('metal')}">
    <g filter="url(#${uid}-press)">
      <rect x="${inner.x0 - 7}" y="${inner.y0 - 7}" width="${inner.x1 - inner.x0 + 14}" height="${inner.y1 - inner.y0 + 14}" fill="none" stroke-width="1.6"/>
      <path d="${notchedRect(inner.x0, inner.y0, inner.x1, inner.y1, 16)}" fill="none" stroke-width=".9"/>
      ${cornerFans(inner.x0, inner.y0, inner.x1, inner.y1, { r1: 10, r2: 17, dot: 2.4 })}
      <text x="${cx}" y="100" text-anchor="middle" stroke="none" font-family="${LATIN}" font-weight="700" font-size="14" letter-spacing="7">PRIZE CARD</text>
      ${divider(cx, 122, 60, 12, 4, 1)}
      ${divider(cx, H - 124, 60, 12, 4, 1)}
      <text x="${cx}" y="${H - 92}" text-anchor="middle" stroke="none" font-family="${LATIN}" font-weight="700" font-size="14" letter-spacing="7">EOREUN MOONGBANGU</text>
    </g>
    ${logoMarkup({ uid: `${uid}-logo`, paint: u('foil-logo'), x: cx - lw / 2, y: cy - lh / 2 - 6, width: lw, filter: `${uid}-press-logo` })}
  </g>
  <rect width="${W}" height="${H}" fill="#000" filter="url(#${uid}-grain)" pointer-events="none"/>
</g>
</svg>`;
}
