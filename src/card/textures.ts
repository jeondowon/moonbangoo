// 카드 텍스처: design/lib/card.js의 SVG(M0 확정 시안)를 래스터화한다.
// M3은 색(albedo)만 — 등급별 금속·홀로 재질 분리는 M4에서.
import type { Texture, WebGLRenderer } from 'three';
import { CARD, cardBack, cardFront } from '../../design/lib/card.js';
import { loadLogo } from '../../design/lib/logo.js';
import type { Prize } from '../data/draw';
import { embeddedFontCss } from '../gfx/fonts';
import { parseSvg, rasterize, svgText, toTexture } from '../gfx/svg';

/** 630×880 → 788×1100. 폰에서 카드가 화면 높이의 약 2/3 (DPR 2 기준 1000px 남짓) */
const SCALE = 1.25;

export interface CardTextures {
  back: Texture;
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

export async function buildCardTextures(renderer: WebGLRenderer, cards: Prize[]): Promise<CardTextures> {
  await loadLogo();
  const back = cardBack({ uid: 'cb' });
  const fronts = cards.map((p, i) => cardFront(p, { uid: `cf${i}`, index: i + 1, total: cards.length }));
  const fontCss = await embeddedFontCss([back, ...fronts].map(svgText).join('')).catch((e) => {
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
  const [b, ...f] = await Promise.all([back, ...fronts].map(draw));
  return { back: b, fronts: f };
}
