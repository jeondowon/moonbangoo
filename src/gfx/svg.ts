// design/lib의 SVG 문자열 → 캔버스(텍스처 원본).
import { CanvasTexture, NoColorSpace, SRGBColorSpace, type Texture, type WebGLRenderer } from 'three';

const parser = new DOMParser();
const serializer = new XMLSerializer();

export function parseSvg(markup: string): SVGSVGElement {
  const doc = parser.parseFromString(markup, 'image/svg+xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error(`SVG 파싱 실패: ${err.textContent}`);
  return doc.documentElement as unknown as SVGSVGElement;
}

/** SVG 안의 모든 글자 (폰트 서브셋 추출용) */
export function svgText(markup: string): string {
  return [...parseSvg(markup).querySelectorAll('text')].map((t) => t.textContent ?? '').join('');
}

/**
 * SVG를 w×h 캔버스로 그린다.
 * fontCss: embeddedFontCss() 결과. background: 투명 대신 깔 색.
 */
export async function rasterize(
  svg: SVGSVGElement,
  w: number,
  h: number,
  {
    fontCss = '',
    background = '',
    readback = false,
  }: { fontCss?: string; background?: string; readback?: boolean } = {},
): Promise<HTMLCanvasElement> {
  const el = svg.cloneNode(true) as SVGSVGElement;
  // 크기를 지정하지 않으면 브라우저가 기본 크기로 그린 뒤 늘려서 흐려진다
  el.setAttribute('width', String(w));
  el.setAttribute('height', String(h));
  if (fontCss) {
    const style = el.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = fontCss;
    el.insertBefore(style, el.firstChild);
  }
  const url = URL.createObjectURL(new Blob([serializer.serializeToString(el)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    // Safari는 SVG 이미지 안의 폰트 적용이 decode 직후 조금 늦는 경우가 있다
    // (rAF는 백그라운드 탭에서 멈추므로 타이머로 대기)
    await new Promise((r) => setTimeout(r, 50));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    // readback: 픽셀을 JS로 읽을 캔버스는 CPU 메모리에 두어야 getImageData가 빠르다
    const ctx = canvas.getContext('2d', { willReadFrequently: readback })!;
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 캔버스 → 텍스처. srgb: 색 텍스처면 true, 거칠기·노멀처럼 데이터 텍스처면 false */
export function toTexture(canvas: HTMLCanvasElement, renderer: WebGLRenderer, srgb = true): Texture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
