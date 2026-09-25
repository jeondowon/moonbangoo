// 팩 텍스처: design/lib/pack.js의 SVG(M0 확정 시안)를 재질별로 나눠 래스터화한다.
//   albedo : 색 + 알파(톱니 외곽). 2D 전용 음영 레이어는 빼고, 박은 평평한 금색으로 (반사는 3D 조명이 담당)
//   orm    : G = 거칠기, B = 금속도 (three.js roughnessMap / metalnessMap 채널 규칙)
//   normal : 박 눌림 + 크림프 골 + 뒷면 봉합선 골 + 종이결 + 포장지 주름
import { CanvasTexture, NoColorSpace, SRGBColorSpace, type Texture, type WebGLRenderer } from 'three';
import { loadLogo } from '../../design/lib/logo.js';
import { PACK, packBack, packFront } from '../../design/lib/pack.js';
import { embeddedFontCss } from '../gfx/fonts';
import { boxBlur, HeightField, readChannel, valueNoise, whiteNoise } from '../gfx/surface';
import { parseSvg, rasterize, svgText } from '../gfx/svg';

/** 텍스처 해상도 배율 (SVG 600×1040 → 900×1560). 화면에서 팩 높이가 1500px를 넘을 일이 드물다 */
const SCALE = 1.5;

// 금속 박의 기본색(PBR base color). 2D 시안의 금색 그라디언트 중간 톤
const FOIL_ALBEDO = '#e2c486';

const ROUGH = { paper: 0.58, crimp: 0.42, foil: 0.28 };

export interface SideTextures {
  albedo: Texture;
  orm: Texture;
  normal: Texture;
}

export interface PackTextures {
  front: SideTextures;
  back: SideTextures;
}

type Variant = 'albedo' | 'foil';

/** 재질 레이어별 변형 SVG */
function variant(markup: string, mode: Variant): SVGSVGElement {
  const svg = parseSvg(markup);
  svg.querySelectorAll('[data-layer="shading"]').forEach((n) => n.remove());
  for (const layer of svg.querySelectorAll('[data-layer="foil"]')) {
    for (const el of [layer, ...layer.querySelectorAll('*')]) {
      el.removeAttribute('filter'); // 2D 눌림 효과 → 노멀맵이 대신함
      for (const attr of ['fill', 'stroke']) {
        if (el.getAttribute(attr)?.startsWith('url(')) el.setAttribute(attr, mode === 'foil' ? '#fff' : FOIL_ALBEDO);
      }
    }
  }
  if (mode === 'foil') {
    svg.querySelectorAll('[data-layer]:not([data-layer="foil"])').forEach((n) => n.remove());
  }
  return svg;
}

function toTexture(canvas: HTMLCanvasElement, renderer: WebGLRenderer, srgb: boolean): Texture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

/**
 * 포장지 공통 높이: 종이결 + 낮은 주파수 주름 (상·하단 봉합부 근처일수록 강함).
 * 계산이 가장 무거운 부분이라 한 번만 만들어 앞·뒷면이 같이 쓴다 (뒷면은 봉합선·글자가 달라 반복이 눈에 띄지 않음).
 */
function wrapperRelief(w: number, h: number): HeightField {
  const { W, H, crimp } = PACK;
  const hf = new HeightField(w, h);
  const s = w / W;
  const seed = 1;
  const taper = 150 * s; // 봉합부에서 이 거리까지 주름이 강함
  hf.add((x, y) => {
    const fromEdge = Math.min(y - crimp * s, (H - crimp) * s - y);
    const near = fromEdge < 0 ? 0 : Math.exp(-fromEdge / taper);
    // 세로로 긴 주름 (봉합부에서 당겨진 방향)
    const wr = valueNoise(x / (26 * s), y / (90 * s), seed) - 0.5;
    const soft = valueNoise(x / (140 * s), y / (140 * s), seed + 11) - 0.5;
    const grain = whiteNoise(x, y, seed + 3) - 0.5;
    return wr * (2.4 * near + 0.2) + soft * 4 + grain * 0.03;
  });
  return hf;
}

/** 톱니 봉합부의 세로 골 (2D 시안의 줄무늬와 같은 위치·간격: x = 3 + 5k) */
function addCrimpRidges(hf: HeightField) {
  const { W, H, crimp } = PACK;
  const s = hf.w / W;
  hf.add((x, y) => {
    const yu = y / s;
    if (yu > crimp && yu < H - crimp) return 0;
    return 0.22 * Math.cos((2 * Math.PI * (x / s - 3)) / 5);
  });
}

/** 뒷면 세로 봉합선 (pack.js packBack의 seam과 같은 위치·간격) */
function addBackSeam(hf: HeightField) {
  const { W, H, crimp } = PACK;
  const s = hf.w / W;
  const x0 = W / 2 - 34;
  const x1 = W / 2 + 34;
  hf.add((x, y) => {
    const xu = x / s;
    const yu = y / s;
    if (xu < x0 || xu > x1 || yu < crimp || yu > H - crimp) return 0;
    const t = (xu - x0) / (x1 - x0);
    const bulge = Math.sin(Math.PI * t) * 1.2; // 겹쳐 붙인 띠가 살짝 볼록
    return bulge + 0.14 * Math.cos((2 * Math.PI * (yu - crimp - 4)) / 6);
  });
}

async function buildSide(
  markup: string,
  fontCss: string,
  renderer: WebGLRenderer,
  relief: HeightField,
  side: 'front' | 'back',
): Promise<SideTextures> {
  const { w, h } = relief;
  const [albedo, foilCanvas] = await Promise.all([
    rasterize(variant(markup, 'albedo'), w, h, { fontCss }),
    rasterize(variant(markup, 'foil'), w, h, { fontCss, background: '#000', readback: true }),
  ]);
  const foil = readChannel(foilCanvas);

  // 거칠기·금속도
  const { H, crimp } = PACK;
  const orm = document.createElement('canvas');
  orm.width = w;
  orm.height = h;
  const octx = orm.getContext('2d')!;
  const oimg = octx.createImageData(w, h);
  for (let y = 0, i = 0; y < h; y++) {
    const inCrimp = y / SCALE < crimp || y / SCALE > H - crimp;
    const base = inCrimp ? ROUGH.crimp : ROUGH.paper;
    for (let x = 0; x < w; x++, i++) {
      const m = foil[i];
      // 박 표면도 완전히 균일하지 않게 (주름 높이를 얼룩으로 재사용, 거칠기 ±0.05 정도)
      const foilRough = ROUGH.foil + relief.data[i] * 0.03;
      const o = i * 4;
      oimg.data[o] = 255;
      oimg.data[o + 1] = (base + (foilRough - base) * m) * 255;
      oimg.data[o + 2] = m * 255;
      oimg.data[o + 3] = 255;
    }
  }
  octx.putImageData(oimg, 0, 0);

  // 높이 → 노멀
  const hf = relief.clone();
  addCrimpRidges(hf);
  if (side === 'back') addBackSeam(hf);
  // 박은 살짝 눌려 들어간 형태 (가장자리가 부드럽게 경사)
  const r = Math.max(1, Math.round(0.8 * SCALE));
  const pressed = boxBlur(boxBlur(foil, w, h, r), w, h, r);
  for (let i = 0; i < pressed.length; i++) hf.data[i] -= pressed[i] * 0.3;

  return {
    albedo: toTexture(albedo, renderer, true),
    orm: toTexture(orm, renderer, false),
    normal: toTexture(hf.toNormalCanvas(1.6), renderer, false),
  };
}

export async function buildPackTextures(renderer: WebGLRenderer): Promise<PackTextures> {
  await loadLogo();
  const front = packFront({ uid: 'tf' });
  const back = packBack({ uid: 'tb' });
  // 폰트를 못 받아도(오프라인 등) 팩은 보여야 하므로 시스템 폰트로 대체
  const fontCss = await embeddedFontCss(svgText(front) + svgText(back)).catch((e) => {
    console.warn('폰트 내장 실패, 시스템 폰트로 대체', e);
    return '';
  });
  const relief = wrapperRelief(Math.round(PACK.W * SCALE), Math.round(PACK.H * SCALE));
  const [f, b] = await Promise.all([
    buildSide(front, fontCss, renderer, relief, 'front'),
    buildSide(back, fontCss, renderer, relief, 'back'),
  ]);
  return { front: f, back: b };
}
