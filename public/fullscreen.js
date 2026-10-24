// 전체화면 유지: 메뉴 버튼으로 켜면 기억해 두고, 페이지 이동으로 풀린 전체화면을 첫 터치 때 다시 켠다.
// 브라우저는 페이지를 옮기면 전체화면을 해제하고, 다시 켜는 요청은 사용자 입력 중에만 받아 준다.
// 핀볼(정적 페이지)도 같이 쓰도록 public에 둔 일반 JS 모듈이다.
const KEY = 'fullscreen';

export function setupFullscreen(doc = document, win = window, storage = safeStorage(win)) {
  const root = doc.documentElement;
  const request = root.requestFullscreen ?? root.webkitRequestFullscreen;
  const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
  const supported = Boolean((doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled) && request);
  // 홈 화면 앱(매니페스트)으로 열었으면 이미 주소창이 없다
  const installed = win.matchMedia?.('(display-mode: fullscreen), (display-mode: standalone)').matches;
  // 아이폰 Safari처럼 지원하지 않으면 버튼은 숨긴 채(hidden) 둔다
  if (!supported || installed) return;

  const isFullscreen = () => Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
  const call = async (fn, target) => { try { await fn.call(target); } catch {} };

  // 터치는 pointerup에서야 사용자 입력으로 인정되므로 pointerup에 건다
  doc.addEventListener('pointerup', () => {
    if (storage?.getItem(KEY) === 'on' && !isFullscreen()) call(request, root);
  }, true);

  const button = doc.getElementById('fullscreen-toggle');
  if (!button) return;
  const sync = () => {
    const on = isFullscreen();
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? '전체화면 끄기' : '전체화면 켜기');
  };
  button.addEventListener('click', () => {
    if (isFullscreen()) {
      storage?.removeItem(KEY);
      call(exit, doc);
    } else {
      storage?.setItem(KEY, 'on');
      call(request, root);
    }
  });
  doc.addEventListener('fullscreenchange', sync);
  doc.addEventListener('webkitfullscreenchange', sync);
  sync();
  button.hidden = false;
}

function safeStorage(win) {
  try { return win.localStorage; } catch { return null; }
}

if (typeof document !== 'undefined') setupFullscreen();
