// SVG를 <img>로 그려 텍스처로 만들 때는 문서에 로드된 웹폰트를 쓸 수 없다(이미지 내부는 격리됨).
// → 실제로 쓰인 글자가 들어 있는 폰트 조각만 받아서 data URL @font-face로 SVG 안에 넣는다.
// 폰트 출처는 디자인 시안(design/*.html)과 동일. (배포 단계에서 셀프 호스팅으로 바꾸려면 URL만 교체)

const GOOGLE_CSS =
  'https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,600&display=block';
const PRETENDARD_CSS =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css';

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

async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function embedFrom(cssUrl: string, codepoints: number[]): Promise<string[]> {
  const css = await (await fetch(cssUrl)).text();
  const blocks = css.match(/@font-face\s*{[^}]*}/g) ?? [];
  const jobs = blocks.map(async (block) => {
    const ranges = parseRanges(block.match(/unicode-range:\s*([^;}]+)/)?.[1]);
    if (ranges && !codepoints.some((c) => ranges.some(([a, b]) => c >= a && c <= b))) return '';
    const src = block.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/)?.[1];
    if (!src) return '';
    const data = await toDataUrl(new URL(src, cssUrl).href);
    return block.replace(/url\([^)]*\)/, `url(${data})`);
  });
  return (await Promise.all(jobs)).filter(Boolean);
}

/** text에 쓰인 글자를 그릴 수 있는 @font-face CSS (폰트 데이터 내장) */
export async function embeddedFontCss(text: string): Promise<string> {
  const chars = [...new Set(text.replace(/\s/g, ''))].join('') + ' ';
  const codepoints = [...chars].map((c) => c.codePointAt(0)!);
  const google = `${GOOGLE_CSS}&text=${encodeURIComponent(chars)}`;
  const parts = await Promise.all([embedFrom(google, codepoints), embedFrom(PRETENDARD_CSS, codepoints)]);
  return parts.flat().join('\n');
}
