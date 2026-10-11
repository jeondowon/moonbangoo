// 카드팩 2D 시안 (앞·뒤). 600×1040, 실물 부스터팩 비율(약 1:1.73).
// 레이어는 재질별로 그룹을 나눠 둔다 → M1에서 텍스처/마스크로 분리:
//   [data-layer=paper]   크림 펄 포장지 + 톤온톤 무늬 (무광 + 미세 광택)
//   [data-layer=crimp]   상·하단 톱니 봉합부 (노멀맵 대상)
//   [data-layer=foil]    금박 요소 전부 (금속 반사 마스크)
//   [data-layer=print]   일반 인쇄 텍스트
//   [data-layer=shading] 2D 시안 전용 입체감 (3D에서는 실제 조명이 대신하므로 제외)
import {
  INK, METALS, linGrad, grainFilter, pressFilter, wavePath, divider,
} from './common.js';
import { logoMarkup, LOGO_BOX } from './logo.js';

export const PACK = {
  W: 600,
  H: 1040,
  crimp: 54,          // 상·하단 봉합부 높이
  tear: 132,          // 절취선 y (상단 12.7%)
  teeth: 12,          // 톱니 간격
  toothDepth: 8,
  notch: 9,           // 절취선 양끝 V홈 깊이
};

// 팩 외곽선: 상·하단 톱니 + 절취선 양옆 V홈
function packOutline({ W, H, teeth: p, toothDepth: d, tear, notch } = PACK) {
  let s = `M0 ${d}`;
  for (let x = 0; x < W; x += p) s += `L${x + p / 2} 0L${x + p} ${d}`;
  s += `L${W} ${tear - 7}L${W - notch} ${tear}L${W} ${tear + 7}L${W} ${H - d}`;
  for (let x = W; x > 0; x -= p) s += `L${x - p / 2} ${H}L${x - p} ${H - d}`;
  s += `L0 ${tear + 7}L${notch} ${tear}L0 ${tear - 7}Z`;
  return s;
}

function crimpBand(y0, y1, W, fill) {
  let ridges = '';
  for (let x = 3; x < W; x += 5) ridges += `M${x} ${y0}V${y1}`;
  const edge = y0 === 0 ? y1 : y0;
  const dir = y0 === 0 ? 1 : -1;
  return `<rect x="0" y="${y0}" width="${W}" height="${y1 - y0}" fill="${fill}"/>
<path d="${ridges}" stroke="#fff" stroke-opacity=".42" stroke-width="1.3"/>
<path d="${ridges}" transform="translate(2 0)" stroke="#7a6038" stroke-opacity=".13" stroke-width="1.1"/>
<path d="M0 ${edge}H${W}" stroke="#6b5230" stroke-opacity=".28" stroke-width="1.2"/>
<path d="M0 ${edge + dir * 1.4}H${W}" stroke="#fff" stroke-opacity=".6" stroke-width="1"/>`;
}

export function packFront({ uid = 'pf' } = {}) {
  const { W, H, crimp, tear } = PACK;
  const id = (s) => `${uid}-${s}`;
  const u = (s) => `url(#${id(s)})`;

  const logo = { x: 100, y: 196, width: 400 };
  const inner = { x0: 0, x1: W };
  const wy = 806; // 물결 시작

  const defs = `
${linGrad(id('base'), [[0, INK.paperHi], [0.45, INK.paper], [1, '#EADFCB']], 0, 0, W, H)}
${linGrad(id('pearl'), [[0, '#f6d6e2', 0], [0.3, '#f6d6e2', 0.55], [0.5, '#d8efe6', 0.5], [0.72, '#f5e6c2', 0.55], [1, '#f5e6c2', 0]], 0, 120, W, H - 120)}
${linGrad(id('crimp'), [[0, '#EDE3D2'], [0.5, '#F7F1E6'], [1, '#E4D7C0']], 0, 0, W, 0)}
${linGrad(id('foil'), METALS.gold, 0, 0, W, H * 0.62)}
${linGrad(id('foil-logo'), METALS.gold, LOGO_BOX.x, LOGO_BOX.y, LOGO_BOX.x + LOGO_BOX.w, LOGO_BOX.y + LOGO_BOX.h)}
${linGrad(id('side'), [[0, '#5b4424', 0.16], [0.09, '#5b4424', 0], [0.91, '#5b4424', 0], [1, '#5b4424', 0.16]], 0, 0, W, 0)}
${linGrad(id('gloss'), [[0, '#fff', 0], [0.36, '#fff', 0], [0.46, '#fff', 0.28], [0.56, '#fff', 0], [1, '#fff', 0]], 0, 0, W, H)}
${grainFilter(id('grain'))}
${pressFilter(id('press'))}
${pressFilter(id('press-logo'), 0.75)}
<clipPath id="${id('clip')}"><path d="${packOutline()}"/></clipPath>
<clipPath id="${id('inner')}"><rect x="${inner.x0}" y="0" width="${inner.x1 - inner.x0}" height="${H}"/></clipPath>`;

  const paper = `
<g data-layer="paper">
  <rect width="${W}" height="${H}" fill="${u('base')}"/>
  <rect width="${W}" height="${H}" fill="${u('pearl')}" opacity=".35"/>
  <g clip-path="${u('inner')}">
    <path d="${wavePath(inner.x0, inner.x1, wy + 20, 9, 150, 30, H)}" fill="#EFE5D3"/>
    <path d="${wavePath(inner.x0, inner.x1, wy + 58, 8, 118, 80, H)}" fill="#E8DCC6"/>
    <path d="${wavePath(inner.x0, inner.x1, wy + 96, 7, 96, 10, H)}" fill="#E1D3BA"/>
  </g>
</g>`;

  const crimps = `<g data-layer="crimp">${crimpBand(0, crimp, W, u('crimp'))}${crimpBand(H - crimp, H, W, u('crimp'))}</g>`;

  const foil = `
<g data-layer="foil" fill="${u('foil')}" stroke="${u('foil')}">
  <g filter="url(#${id('press')})">
    <text x="${W / 2}" y="${(crimp + tear) / 2 + 5}" text-anchor="middle" stroke="none"
      font-family="Cormorant Garamond, serif" font-weight="700" font-size="15.5" letter-spacing="5">EOREUN MUNGBANGGU · SPECIAL CARD PACK</text>
    <path d="M20 ${tear}H${W - 20}" fill="none" stroke-width="1.6" stroke-dasharray="6 5" stroke-linecap="round"/>
    <text x="${W / 2}" y="614" text-anchor="middle" stroke="none"
      font-family="Cormorant Garamond, serif" font-weight="700" font-size="17" letter-spacing="7">EVENT BOOSTER PACK</text>
    <text x="${W / 2}" y="670" text-anchor="middle" stroke="none"
      font-family="Gowun Batang, serif" font-weight="700" font-size="48" letter-spacing="2">스페셜 카드팩</text>
    ${divider(W / 2, 702, 74, 14, 4.5, 1)}
    <path d="${wavePath(inner.x0, inner.x1, wy + 20, 9, 150, 30)}" fill="none" stroke-width=".9" opacity=".75"/>
  </g>
  ${logoMarkup({ uid: id('logo'), paint: u('foil-logo'), ...logo, filter: id('press-logo') })}
</g>`;

  const print = `
<g data-layer="print">
  <text x="${W / 2}" y="742" text-anchor="middle" fill="${INK.inkSoft}"
    font-family="Pretendard Variable, Pretendard, sans-serif" font-weight="500" font-size="16.5" letter-spacing="-.2">카드 5장을 모두 확인하고, 원하는 경품 1개를 고르세요</text>
</g>`;

  const shading = `
<g data-layer="shading" pointer-events="none">
  <rect width="${W}" height="${H}" fill="${u('side')}"/>
  <rect width="${W}" height="${H}" fill="${u('gloss')}"/>
  <rect width="${W}" height="${H}" fill="#000" filter="url(#${id('grain')})"/>
</g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="pack" role="img" aria-label="카드팩 앞면">
<defs>${defs}</defs>
<g clip-path="${u('clip')}">${paper}${crimps}${print}${foil}${shading}</g>
</svg>`;
}

export function packBack({ uid = 'pb' } = {}) {
  const { W, H, crimp } = PACK;
  const id = (s) => `${uid}-${s}`;
  const u = (s) => `url(#${id(s)})`;
  const seam = { x0: W / 2 - 34, x1: W / 2 + 34 };
  let seamRidges = '';
  for (let y = crimp + 4; y < H - crimp; y += 6) seamRidges += `M${seam.x0 + 6} ${y}H${seam.x1 - 6}`;

  const L = { x: 58 };
  const lines = [
    ['이벤트 안내', 'h'],
    ['1인 1회 참여할 수 있어요.', 'p'],
    ['카드 5장 중 원하는 경품', 'p'],
    ['1개를 고릅니다.', 'p2'],
    ['14일 이내 매장에 방문해', 'p'],
    ['경품을 교환해 주세요.', 'p2'],
    ['교환 조건은 경품마다 달라요.', 'p'],
  ];
  let ty = 200;
  const info = lines
    .map(([t, k]) => {
      if (k === 'h') {
        return `<text x="${L.x}" y="${ty}" font-family="Gowun Batang, serif" font-weight="700" font-size="22" fill="${INK.ink}">${t}</text>`;
      }
      ty += k === 'p2' ? 24 : 34;
      return `${k === 'p2' ? '' : `<circle cx="${L.x + 3}" cy="${ty - 5.5}" r="2.2" fill="${INK.accent}"/>`}
<text x="${L.x + 16}" y="${ty}" font-family="Pretendard Variable, Pretendard, sans-serif" font-size="15.5" font-weight="500" fill="${INK.inkSoft}">${t}</text>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="pack" role="img" aria-label="카드팩 뒷면">
<defs>
${linGrad(id('base'), [[0, INK.paperHi], [0.5, INK.paper], [1, '#EADFCB']], W, 0, 0, H)}
${linGrad(id('crimp'), [[0, '#EDE3D2'], [0.5, '#F7F1E6'], [1, '#E4D7C0']], 0, 0, W, 0)}
${linGrad(id('seam'), [[0, '#5b4424', 0.12], [0.18, '#fff', 0.35], [0.5, '#fff', 0.08], [0.82, '#fff', 0.35], [1, '#5b4424', 0.12]], seam.x0, 0, seam.x1, 0)}
${linGrad(id('foil'), METALS.gold, 0, 0, W, H * 0.62)}
${linGrad(id('foil-logo'), METALS.gold, LOGO_BOX.x, LOGO_BOX.y, LOGO_BOX.x + LOGO_BOX.w, LOGO_BOX.y + LOGO_BOX.h)}
${linGrad(id('side'), [[0, '#5b4424', 0.16], [0.09, '#5b4424', 0], [0.91, '#5b4424', 0], [1, '#5b4424', 0.16]], 0, 0, W, 0)}
${grainFilter(id('grain'))}
${pressFilter(id('press'), 0.75)}
<clipPath id="${id('clip')}"><path d="${packOutline({ ...PACK, notch: 0 })}"/></clipPath>
</defs>
<g clip-path="${u('clip')}">
  <g data-layer="paper"><rect width="${W}" height="${H}" fill="${u('base')}"/></g>
  <g data-layer="crimp">
    ${crimpBand(0, crimp, W, u('crimp'))}
    ${crimpBand(H - crimp, H, W, u('crimp'))}
    <rect x="${seam.x0}" y="${crimp}" width="${seam.x1 - seam.x0}" height="${H - 2 * crimp}" fill="${u('seam')}"/>
    <path d="${seamRidges}" stroke="#7a6038" stroke-opacity=".1" stroke-width="1.2"/>
    <path d="M${seam.x0} ${crimp}V${H - crimp}M${seam.x1} ${crimp}V${H - crimp}" stroke="#6b5230" stroke-opacity=".22" stroke-width="1"/>
  </g>
  <g data-layer="print">
    ${info}
    <g transform="translate(${W / 2 + 34 + 24} 0)">
      <text x="0" y="200" font-family="Gowun Batang, serif" font-weight="700" font-size="22" fill="${INK.ink}">매장 안내</text>
      <text x="0" y="236" font-family="Pretendard Variable, Pretendard, sans-serif" font-size="16.5" font-weight="500" fill="${INK.inkSoft}">경북 포항시 ○○구</text>
      <text x="0" y="262" font-family="Pretendard Variable, Pretendard, sans-serif" font-size="16.5" font-weight="500" fill="${INK.inkSoft}">○○로 00, 1층</text>
      <text x="0" y="298" font-family="Pretendard Variable, Pretendard, sans-serif" font-size="16.5" font-weight="500" fill="${INK.inkSoft}">매일 10:00 – 21:00</text>
    </g>
  </g>
  <g data-layer="foil" fill="${u('foil')}" stroke="${u('foil')}">
    <g filter="url(#${id('press')})">
      ${logoMarkup({ uid: id('logo'), paint: u('foil-logo'), x: W / 2 - 34 - 24 - 170, y: 760, width: 170 })}
      <text x="${W / 2 + 34 + 24}" y="840" stroke="none" font-family="Cormorant Garamond, serif" font-weight="600" font-size="13" letter-spacing="4">EOREUN MUNGBANGGU</text>
      <text x="${W / 2 + 34 + 24}" y="862" stroke="none" font-family="Cormorant Garamond, serif" font-weight="600" font-size="13" letter-spacing="4">POHANG · KOREA</text>
    </g>
  </g>
  <g data-layer="shading" pointer-events="none">
    <rect width="${W}" height="${H}" fill="${u('side')}"/>
    <rect width="${W}" height="${H}" fill="#000" filter="url(#${id('grain')})"/>
  </g>
</g>
</svg>`;
}
