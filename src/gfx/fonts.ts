// SVG를 <img>로 그려 텍스처로 만들 때는 문서에 로드된 웹폰트를 쓸 수 없다(이미지 내부는 격리됨).
// → 실제로 쓰인 글자가 들어 있는 폰트 조각만 골라 data URL @font-face로 SVG 안에 넣는다.
// 매장 PC에서 인터넷 없이도 같은 글꼴이 나오도록 폰트는 npm 패키지에서 빌드에 포함한다.
import gowun400 from '@fontsource/gowun-batang/400.css?raw';
import gowun700 from '@fontsource/gowun-batang/700.css?raw';
import cormorant500 from '@fontsource/cormorant-garamond/500.css?raw';
import cormorant600 from '@fontsource/cormorant-garamond/600.css?raw';
import cormorant700 from '@fontsource/cormorant-garamond/700.css?raw';
import cormorant600Italic from '@fontsource/cormorant-garamond/600-italic.css?raw';
import pretendard from 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css?raw';
import { fetchDataUrl } from './svg';

const FONT_CSS = [gowun400, gowun700, cormorant500, cormorant600, cormorant700, cormorant600Italic, pretendard];

/** 폰트 조각 파일 이름 → 빌드된 URL. woff 대체 파일은 쓰지 않으므로 woff2만 포함한다. */
const FILES = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>(
      [
        '/node_modules/@fontsource/gowun-batang/files/*-{400,700}-normal.woff2',
        '/node_modules/@fontsource/cormorant-garamond/files/*-{500,600,700}-normal.woff2',
        '/node_modules/@fontsource/cormorant-garamond/files/*-600-italic.woff2',
        '/node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/*.woff2',
      ],
      { query: '?url', import: 'default', eager: true },
    ),
  ).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url]),
);

type Range = [number, number];

function parseRanges(s: string | undefined): Range[] | null {
  if (!s) return null; // unicode-range 없음 = 전 범위
  return s.split(',').map((part) => {
    const p = part.trim().replace(/^U\+/i, '');
    if (p.includes('?')) return [parseInt(p.replace(/\?/g, '0'), 16), parseInt(p.replace(/\?/g, 'f'), 16)];
    const [a, b = a] = p.split('-');
    return [parseInt(a, 16), parseInt(b, 16)];
  });
}

function embedFrom(css: string, codepoints: number[]): Promise<string>[] {
  const blocks = css.match(/@font-face\s*{[^}]*}/g) ?? [];
  return blocks.map(async (block) => {
    const ranges = parseRanges(block.match(/unicode-range:\s*([^;}]+)/)?.[1]);
    if (ranges && !codepoints.some((c) => ranges.some(([a, b]) => c >= a && c <= b))) return '';
    const src = block.match(/url\(\s*['"]?([^'")]+\.woff2)['"]?\s*\)/)?.[1];
    const url = src && FILES[src.slice(src.lastIndexOf('/') + 1)];
    if (!url) return '';
    return block.replace(/src:[^;}]*/, `src: url(${await fetchDataUrl(url)})`);
  });
}

/** text에 쓰인 글자를 그릴 수 있는 @font-face CSS (폰트 데이터 내장) */
export async function embeddedFontCss(text: string): Promise<string> {
  const codepoints = [...new Set(text.replace(/\s/g, '') + ' ')].map((c) => c.codePointAt(0)!);
  const parts = await Promise.all(FONT_CSS.flatMap((css) => embedFrom(css, codepoints)));
  return parts.filter(Boolean).join('\n');
}
