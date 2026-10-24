// 매장 TV 실기기 점검용 주소 옵션. ?fps 화면 구석에 FPS 표시.
// ?quality=low는 아래 항목을 모두 낮추고, 개별 옵션(?dpr=1 ?msaa=1 ?bloom=0 ?gloss=0)은 그 항목만 덮어쓴다.
export function parseQuality(search: string) {
  const params = new URLSearchParams(search);
  const low = params.get('quality') === 'low';
  const on = (name: string) => (params.has(name) ? params.get(name) !== '0' : !low);
  const dpr = Number(params.get('dpr'));
  const quality = {
    /** 렌더링 해상도 배율 상한 */
    maxPixelRatio: dpr > 0 ? dpr : low ? 1 : 2,
    // 2배 해상도 + 4배 MSAA + HDR 버퍼 조합이 맥북 프로에서도 41fps라 기본은 끈다. 고해상도 화면에선 계단이 잘 안 보인다.
    msaa: params.has('msaa') && params.get('msaa') !== '0',
    bloom: on('bloom'),
    /** 카드·팩의 클리어코트·무지갯빛 */
    gloss: on('gloss'),
    showFps: params.has('fps'),
  };
  // FPS 옆에 기본값과 다른 항목만 붙여 어떤 조건에서 잰 숫자인지 보이게 한다
  const changed = [
    quality.maxPixelRatio !== 2 && `dpr ${quality.maxPixelRatio}`,
    quality.msaa && 'msaa on',
    !quality.bloom && 'bloom off',
    !quality.gloss && 'gloss off',
  ].filter(Boolean);
  return { ...quality, label: changed.join(' · ') };
}

export const QUALITY = parseQuality(globalThis.location?.search ?? '');

/**
 * ?fps: 실제로 그린 프레임 수를 1초마다 표시 (TV 브라우저에는 개발자 도구가 없어 화면에 띄운다).
 * 그린 프레임마다 돌려받은 함수를 부른다. label: 숫자 옆에 붙여 어떤 조건에서 잰 값인지 보이게 한다
 */
export function createFpsMeter(label: string) {
  if (!QUALITY.showFps) return () => {};
  const meter = document.body.appendChild(document.createElement('div'));
  meter.className = 'fps-meter';
  let frames = 0;
  let from = performance.now();
  return (now: number) => {
    frames++;
    if (now - from < 1000) return;
    meter.textContent = `${Math.round((frames * 1000) / (now - from))} fps${label ? ` · ${label}` : ''}`;
    frames = 0;
    from = now;
  };
}
