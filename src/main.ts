// 1차 M1: 인트로 → 팩 등장 → 기울여 보기.
import {
  Group,
  NeutralToneMapping,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import './style.css';
import { Spring } from './core/spring';
import { TiltInput } from './core/tilt';
import { drawPack, type PackResult } from './data/draw';
import { createBackdrop, createShadow } from './gfx/backdrop';
import { createStudioEnv } from './gfx/env';
import { Pack, PACK_H, PACK_W } from './pack/pack';
import { buildPackTextures } from './pack/textures';

const MAX_TILT = (18 * Math.PI) / 180; // 명세 R10: 최대 ±15~20°
const FOV = 26;

const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
const intro = document.querySelector<HTMLElement>('#intro')!;

const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.toneMapping = NeutralToneMapping; // 인쇄 색(시안 팔레트)을 최대한 그대로 유지
renderer.toneMappingExposure = 1;

const scene = new Scene();
scene.environment = createStudioEnv(renderer);
const camera = new PerspectiveCamera(FOV, 1, 0.1, 50);
const backdrop = createBackdrop();
scene.add(backdrop.mesh);

const stage = new Group(); // 팩 위치·회전 담당
scene.add(stage);
const shadow = createShadow(PACK_W, PACK_H);
shadow.position.z = -0.45;
scene.add(shadow);

const tilt = new TiltInput(canvas);

/** 이번 참여의 결과. 카드 등장(M3)부터 사용 */
const session: { result: PackResult | null } = { result: null };

// 기울기 (입력 추종) + 등장 연출 스프링
const rx = new Spring(0, 2.4, 0.62);
const ry = new Spring(0, 2.4, 0.62);
const enterY = new Spring(-PACK_H * 1.9, 1.5, 0.74);
const enterSpin = new Spring(-1.1, 1.2, 0.58);
const enterPitch = new Spring(0.55, 1.4, 0.7);
let started = false;
let time = 0;

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const t = Math.tan(((FOV / 2) * Math.PI) / 180);
  // 팩이 화면 높이의 70%, 폭의 74%를 넘지 않게
  const byH = PACK_H / 0.7 / 2 / t;
  const byW = PACK_W / 0.74 / 2 / t / camera.aspect;
  camera.position.set(0, 0, Math.max(byH, byW));
  camera.updateProjectionMatrix();
  backdrop.resize(camera.aspect);
}
window.addEventListener('resize', resize);
resize();

let ready = false;
let wantsStart = false;

async function prepare() {
  const [tex, result] = await Promise.all([buildPackTextures(renderer), drawPack()]);
  session.result = result;
  const pack = new Pack(tex);
  stage.add(pack.root);
  // 첫 등장 때 셰이더 컴파일로 끊기지 않도록 미리 컴파일 (보이는 오브젝트만 컴파일되므로 숨기기 전에)
  await renderer.compileAsync(scene, camera);
  stage.visible = shadow.visible = false;
  ready = true;
  intro.classList.remove('is-loading');
  if (wantsStart) start();
}

// 준비 중에 탭해도 기억했다가 준비되면 바로 시작 (자이로 권한은 탭 순간에 요청해야 함)
function onIntroTap() {
  void tilt.enableGyro();
  wantsStart = true;
  if (ready) start();
}
intro.addEventListener('click', onIntroTap);
intro.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') onIntroTap();
});

function start() {
  if (started) return;
  intro.classList.add('is-hidden');
  stage.visible = shadow.visible = true;
  enterY.target = 0;
  enterSpin.target = 0;
  enterPitch.target = 0;
  started = true;
}

prepare().catch((e) => {
  console.error(e);
  intro.classList.add('is-error');
});

// 입력이 없을 때 빛 반사가 보이도록 천천히 흔들림 (자이로가 있으면 손 떨림만으로 충분)
function autoSway(t: number, weight: number) {
  return { x: weight * 0.32 * Math.sin(t * 0.55), y: weight * 0.22 * Math.sin(t * 0.41 + 1.3) };
}

/** 개발용: 기울기 입력을 직접 지정 (null이면 실제 입력) */
let tiltOverride: { x: number; y: number } | null = null;
/** 개발용: 뒷면 확인 등을 위한 추가 Y 회전 */
let devSpin = 0;

function frame(dt: number) {
  time += dt;

  if (started) {
    tilt.update(dt);
    const idle = tilt.gyroActive ? 0 : Math.min(1, Math.max(0, (tilt.idleTime - 1.5) / 2));
    const sway = autoSway(time, idle);
    const tx = tiltOverride?.x ?? tilt.x + sway.x;
    const ty = tiltOverride?.y ?? tilt.y + sway.y;
    ry.target = MAX_TILT * tx;
    rx.target = -MAX_TILT * ty;
    rx.step(dt);
    ry.step(dt);
    enterY.step(dt);
    enterSpin.step(dt);
    enterPitch.step(dt);

    const float = Math.sin(time * 1.1) * 0.012;
    stage.position.set(0, enterY.value + float, 0);
    stage.rotation.set(rx.value + enterPitch.value, ry.value + enterSpin.value + devSpin, Math.sin(time * 0.7) * 0.006);
    // 그림자는 기울기 반대쪽으로 살짝 밀리고, 팩과 함께 움직인다
    shadow.position.x = stage.position.x - ry.value * 0.25;
    shadow.position.y = stage.position.y - 0.07 + rx.value * 0.25;
  }
  renderer.render(scene, camera);
}

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frame(dt);
});

// 개발 서버 전용 검수 훅 (빌드에서는 제거됨): 숨겨진 탭에서도 시간을 진행시켜 캡처할 수 있게
if (import.meta.env.DEV) {
  Object.assign(window, {
    __dev: {
      /** seconds만큼 60fps로 진행 */
      tick(seconds: number) {
        for (let t = 0; t < seconds; t += 1 / 60) frame(1 / 60);
      },
      tilt(x: number | null, y = 0) {
        tiltOverride = x == null ? null : { x, y };
      },
      spin(rad: number) {
        devSpin = rad;
      },
      start: onIntroTap,
      session,
    },
  });
}
