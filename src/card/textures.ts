// 카드 텍스처: design/lib/card.js의 SVG(M0 확정 시안)를 래스터화한다.
// M3은 색(albedo)만 — 등급별 금속·홀로 재질 분리는 M4에서.
import type { Texture, WebGLRenderer } from 'three';
import { CARD, STORE_PALETTES, cardBack, cardFront, cardStore } from '../../design/lib/card.js';
import { loadLogo } from '../../design/lib/logo.js';
import type { Prize } from '../data/api';
import { embeddedFontCss } from '../gfx/fonts';
import { parseSvg, rasterize, svgText, toTexture } from '../gfx/svg';

/** 630×880 → 788×1100. 폰에서 카드가 화면 높이의 약 2/3 (DPR 2 기준 1000px 남짓) */
const SCALE = 1.25;

/** 카테고리별 경품 일러스트 (design/concepts/의 *-concept.png 시안을 긴 변 720px WebP로 줄인 사본) */
const ARTWORK: Record<string, string> = {
  card: new URL('./artwork/card.webp', import.meta.url).href,
  pack: new URL('./artwork/pack.webp', import.meta.url).href,
  cafe: new URL('./artwork/cafe.webp', import.meta.url).href,
  sleeve: new URL('./artwork/sleeve.webp', import.meta.url).href,
  saver: new URL('./artwork/saver.webp', import.meta.url).href,
  bakery: new URL('./artwork/bakery.webp', import.meta.url).href,
  coupon: new URL('./artwork/coupon.webp', import.meta.url).href,
};
/** 일러스트 창 대비 크기 (design/index.html 시안과 같게) */
const artworkScale = (category: string) => (category === 'saver' ? 0.95 : 0.8);

/** SVG를 이미지로 그릴 때는 외부 파일을 불러오지 않으므로 data URL로 넣는다. 카테고리당 한 번만 읽는다 */
const artworkData = new Map<string, Promise<string>>();
function loadArtwork(category: string): Promise<string> {
  const url = ARTWORK[category];
  if (!url) return Promise.resolve(''); // 종류가 없거나 모르는 종류면 기존 빈 자리 표시
  let data = artworkData.get(category);
  if (!data) {
    data = fetch(url)
      .then((res) => res.blob())
      .then((blob) => new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      }));
    artworkData.set(category, data);
  }
  return data;
}

interface CardTextures {
  back: Texture;
  /** 경품 카드 앞에 끼우는 매장 안내 카드 */
  store: Texture;
  /** 넘기는 순서와 같은 순서 */
  fronts: Texture[];
}

/**
 * 시안의 data-maxw(최대 폭) 처리: 문서에 잠깐 붙여 실제 폰트로 글자 폭을 재고, 넘치면 textLength로 줄인다.
 * (design/render.html과 같은 규칙. 이미지로 그릴 때는 글자 폭을 잴 수 없어서 미리 속성으로 박아 둔다)
 */
async function fitTexts(svg: SVGSVGElement) {
  const texts = [...svg.querySelectorAll<SVGTextElement>('text[data-maxw]')];
  if (!texts.length) return;
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${CARD.W}px;visibility:hidden;pointer-events:none`;
  const live = document.importNode(svg, true);
  host.append(live);
  document.body.append(host);
  try {
    const liveTexts = [...live.querySelectorAll<SVGTextElement>('text[data-maxw]')];
    await Promise.all(
      liveTexts.map((t) => {
        const cs = getComputedStyle(t);
        return document.fonts
          .load(`${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, t.textContent ?? '')
          .catch(() => []);
      }),
    );
    liveTexts.forEach((t, i) => {
      const max = Number(t.dataset.maxw);
      if (t.getComputedTextLength() > max) {
        texts[i].setAttribute('textLength', String(max));
        texts[i].setAttribute('lengthAdjust', 'spacingAndGlyphs');
      }
    });
  } finally {
    host.remove();
  }
}

/** 미리 준비한 폰트: 들어 있는 글자와 @font-face CSS */
let preparedFont: { chars: Set<string>; css: Promise<string> } | null = null;
const charsOf = (text: string) => new Set(text.replace(/\s/g, ''));

/** 이미 준비한 폰트에 글자가 모두 있으면 그것을, 아니면 새로 받는다 */
function fontCssFor(text: string): Promise<string> {
  const prepared = preparedFont;
  if (prepared && [...charsOf(text)].every((c) => prepared.chars.has(c))) return prepared.css;
  return embeddedFontCss(text);
}

/**
 * 로딩 중에 경품 전체의 글자 폰트와 일러스트를 미리 받아 둔다.
 * 팩을 열 때마다 폰트를 받으면 몇 초씩 걸리므로, 열 때는 그리기만 하도록.
 */
export async function prepareCardTextures(prizes: Prize[]) {
  await loadLogo();
  const markups = [
    cardBack({ uid: 'cb' }),
    ...STORE_PALETTES.map((palette) => cardStore({ uid: 'cs', palette })),
    ...prizes.map((p) => cardFront(p, { uid: 'cf' })),
  ];
  const text = markups.map(svgText).join('') + '0123456789'; // 카드 번호 (No. 01/05)
  const css = embeddedFontCss(text);
  preparedFont = { chars: charsOf(text), css };
  css.catch(() => { preparedFont = null; }); // 실패하면 열 때 다시 받는다
  await Promise.all([css, ...prizes.map((p) => loadArtwork(p.category))]);
}

export async function buildCardTextures(renderer: WebGLRenderer, cards: Prize[]): Promise<CardTextures> {
  const [, artworks] = await Promise.all([loadLogo(), Promise.all(cards.map((p) => loadArtwork(p.category)))]);
  const back = cardBack({ uid: 'cb' });
  const palette = STORE_PALETTES[Math.floor(Math.random() * STORE_PALETTES.length)];
  const store = cardStore({ uid: 'cs', total: cards.length, palette });
  const fronts = cards.map((p, i) =>
    cardFront(p, { uid: `cf${i}`, index: i + 1, total: cards.length, artwork: artworks[i], artworkScale: artworkScale(p.category) }),
  );
  const fontCss = await fontCssFor([back, store, ...fronts].map(svgText).join('')).catch((e) => {
    console.warn('폰트 내장 실패, 시스템 폰트로 대체', e);
    return '';
  });
  const w = Math.round(CARD.W * SCALE);
  const h = Math.round(CARD.H * SCALE);
  const draw = async (markup: string) => {
    const svg = parseSvg(markup);
    await fitTexts(svg);
    return toTexture(await rasterize(svg, w, h, { fontCss }), renderer);
  };
  // 팩이 가운데로 모이는 애니메이션 도중에 그리므로, 한꺼번에 그려 프레임이 끊기지 않게 한 장씩 차례로 그린다
  const textures: Texture[] = [];
  for (const markup of [back, store, ...fronts]) textures.push(await draw(markup));
  const [b, s, ...f] = textures;
  return { back: b, store: s, fronts: f };
}
