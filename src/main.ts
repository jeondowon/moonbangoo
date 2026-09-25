// 1차: 인트로 → 팩 등장 → 기울여 보기 / 탭해서 뒤집기 → 절취 개봉 (M1~M2).
import {
  Group,
  HalfFloatType,
  NeutralToneMapping,
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import './style.css';
import { Spring } from './core/spring';
import { TiltInput } from './core/tilt';
import { drawPack, type PackResult } from './data/draw';
import { CutFx } from './fx/cutFx';
import { createBackdrop, createShadow } from './gfx/backdrop';
import { createStudioEnv } from './gfx/env';
import { Cutter } from './pack/cutter';
import { Pack, PACK_H, PACK_W, packX, packY, TEAR_Z } from './pack/pack';
import { TEAR_V } from './pack/tear';
import { buildPackTextures } from './pack/textures';

const MAX_TILT = (18 * Math.PI) / 180; // 명세 R10: 최대 ±15~20°
const FOV = 26;
const TAP_MOVE = 10; // px — 이보다 적게 움직이고
const TAP_TIME = 350; // ms — 이보다 빨리 떼면 탭

const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
const intro = document.querySelector<HTMLElement>('#intro')!;
const hint = document.querySelector<HTMLElement>('#hint')!;

const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.toneMapping = NeutralToneMapping; // 인쇄 색(시안 팔레트)을 최대한 그대로 유지
renderer.toneMappingExposure = 1;

const scene = new Scene();
scene.environment = createStudioEnv(renderer);
const camera = new PerspectiveCamera(FOV, 1, 0.1, 50);
const backdrop = createBackdrop();
scene.add(backdrop.mesh);

// 후처리: HDR로 그린 뒤 밝은 부분(>1)만 번지게 → 커팅 헤드·불티·잔광 발광 (명세 5.2)
const composer = new EffectComposer(renderer, new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.7, 0.45, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const stage = new Group(); // 팩 위치·회전 담당
scene.add(stage);
const shadow = createShadow(PACK_W, PACK_H);
shadow.position.z = -0.45;
scene.add(shadow);
const fx = new CutFx();
scene.add(fx.group);

const tilt = new TiltInput(canvas);

/** 이번 참여의 결과. 카드 등장(M3)부터 사용 */
const session: { result: PackResult | null } = { result: null };

// 기울기 (입력 추종) + 등장 연출 + 뒤집기 + 절취 중 흔들림 스프링
const rx = new Spring(0, 2.4, 0.62);
const ry = new Spring(0, 2.4, 0.62);
const roll = new Spring(0, 2.8, 0.32);
const tiltGain = new Spring(1, 2.5, 1);
const enterY = new Spring(-PACK_H * 1.9, 1.5, 0.74);
const enterSpin = new Spring(-1.1, 1.2, 0.58);
const enterPitch = new Spring(0.55, 1.4, 0.7);
const flip = new Spring(0, 1.5, 0.68);
const guide = new Spring(0, 1.5, 1);

let pack: Pack | null = null;
let cutter: Cutter | null = null;
let started = false;
let time = 0;
let startedAt = 0;
let cutTouched = false; // 한 번이라도 잘랐는지 (안내 문구·반짝임 끄기)
let detachAt = -1; // 윗조각을 날려 보낼 시각
let flyVel = new Vector3();
let flySpin = new Vector3();

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  camera.aspect = w / h;
  const t = Math.tan(((FOV / 2) * Math.PI) / 180);
  // 팩이 화면 높이의 70%, 폭의 74%를 넘지 않게
  const byH = PACK_H / 0.7 / 2 / t;
  const byW = PACK_W / 0.74 / 2 / t / camera.aspect;
  camera.position.set(0, 0, Math.max(byH, byW));
  camera.updateProjectionMatrix();
  backdrop.resize(camera.aspect);
  fx.setScale((h * renderer.getPixelRatio()) / (2 * t));
}
window.addEventListener('resize', resize);
resize();

let ready = false;
let wantsStart = false;

async function prepare() {
  const [tex, result] = await Promise.all([buildPackTextures(renderer), drawPack()]);
  session.result = result;
  pack = new Pack(tex);
  stage.add(pack.root);
  setupCutter(pack);
  // 첫 등장 때 셰이더 컴파일로 끊기지 않도록 미리 컴파일 (보이는 오브젝트만 컴파일되므로 숨기기 전에)
  await renderer.compileAsync(scene, camera);
  stage.visible = shadow.visible = false;
  ready = true;
  intro.classList.remove('is-loading');
  if (wantsStart) start();
}

// 준비 중에 탭해도 기억했다가 준비되면 바로 시작
function onIntroTap() {
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
  startedAt = time;
}

prepare().catch((e) => {
  console.error(e);
  intro.classList.add('is-error');
});

// ── 절취 ─────────────────────────────────────────
function setupCutter(p: Pack) {
  const c = new Cutter(canvas, camera, p.root, p.tear, () => time);
  cutter = c;
  // 절취선 근처를 누르면 기울이기 대신 절취
  tilt.shouldIgnore = (e) => c.active || c.wants(e);

  c.onCut = (du, dir, speed) => {
    cutTouched = true;
    fx.spray(du, dir, speed);
    // 포장지가 끌려가며 살짝 흔들림 (명세 R7)
    roll.velocity += -dir * du * 2.2;
    ry.velocity += dir * du * 1.2;
  };

  c.onComplete = (vel, headU) => {
    const t = time;
    p.tear.finish(headU, t, 5);
    fx.burst(headWorld(headU));
    // 손가락 속도·방향을 이어받아 날아감 (속도가 너무 느리면 마지막 긋던 방향으로 기본 속도)
    const vx = Math.abs(vel.x) < 1.5 ? Math.sign(vel.x || 1) * 2.5 : Math.max(-8, Math.min(8, vel.x));
    flyVel = new Vector3(vx * 0.9, 3.2 + Math.max(0, vel.y) * 0.4, 1.6);
    flySpin = new Vector3(2.2, (Math.random() - 0.5) * 3, -Math.sign(vx) * (3 + Math.abs(vx) * 0.5));
    detachAt = t + 0.06;
    setHint(null);
  };
}

/** 커팅 헤드의 월드 위치 */
const headTmp = new Vector3();
function headWorld(u: number) {
  return pack!.root.localToWorld(headTmp.set(packX(u), packY(TEAR_V), TEAR_Z + 0.012));
}

// ── 탭해서 뒤집기 ─────────────────────────────────
let tapStart: { id: number; x: number; y: number; t: number; progress: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  tapStart = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, progress: pack?.tear.progress ?? 0 };
});
canvas.addEventListener('pointerup', (e) => {
  const s = tapStart;
  tapStart = null;
  if (!s || s.id !== e.pointerId || !pack || !cutter || pack.opened || !started) return;
  if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > TAP_MOVE || e.timeStamp - s.t > TAP_TIME) return;
  if (pack.tear.progress !== s.progress) return; // 자르는 중이었음
  const p = cutter.project(e.clientX, e.clientY);
  if (!p || p.u < 0 || p.u > 1 || p.v < 0 || p.v > 1) return; // 팩 밖
  toggleFlip();
});

function toggleFlip() {
  flip.target = flip.target === 0 ? Math.PI : 0;
}

// ── 안내 문구 ────────────────────────────────────
function setHint(main: string | null, sub = '') {
  if (!main) {
    hint.classList.remove('is-shown');
    return;
  }
  hint.querySelector('.hint-main')!.textContent = main;
  hint.querySelector('.hint-sub')!.textContent = sub;
  hint.classList.add('is-shown');
}

function updateHint() {
  if (!pack || !started || pack.opened || detachAt >= 0 || time - startedAt < 1.4) return;
  if (flip.target !== 0) setHint('뒷면이에요', '팩을 톡 누르면 다시 앞면으로');
  else if (cutTouched) setHint(null);
  else setHint('점선을 따라 옆으로 그어 개봉하세요', '팩을 톡 누르면 뒷면을 볼 수 있어요');
}

// ── 프레임 ───────────────────────────────────────
// 입력이 없을 때 빛 반사가 보이도록 천천히 흔들림
function autoSway(t: number, weight: number) {
  return { x: weight * 0.32 * Math.sin(t * 0.55), y: weight * 0.22 * Math.sin(t * 0.41 + 1.3) };
}

function frame(dt: number) {
  time += dt;

  if (started && pack && cutter) {
    // 자르는 동안에는 팩을 정면으로 붙잡아 절취선이 흔들리지 않게
    tiltGain.target = cutter.active ? 0.12 : 1;
    tilt.update(dt);
    const idle = cutter.active ? 0 : Math.min(1, Math.max(0, (tilt.idleTime - 1.5) / 2));
    const sway = autoSway(time, idle);
    const g = tiltGain.step(dt);
    ry.target = MAX_TILT * (tilt.x + sway.x) * g;
    rx.target = -MAX_TILT * (tilt.y + sway.y) * g;
    for (const s of [rx, ry, roll, enterY, enterSpin, enterPitch, flip]) s.step(dt);

    // 앞면이 정면을 향하고, 등장이 끝났고, 아직 안 열었을 때만 자를 수 있음
    cutter.enabled =
      !pack.opened && detachAt < 0 && flip.target === 0 && Math.abs(flip.value) < 0.12 && enterY.value > -0.05;

    const float = Math.sin(time * 1.1) * 0.012;
    // 뒤집을 때 화면 쪽으로 살짝 떠올랐다 돌아옴
    const lift = Math.sin(Math.min(Math.PI, Math.abs(flip.value))) * 0.45;
    stage.position.set(0, enterY.value + float, lift);
    stage.rotation.set(
      rx.value + enterPitch.value,
      ry.value + enterSpin.value + flip.value,
      roll.value + Math.sin(time * 0.7) * 0.006,
    );
    // 그림자는 기울기 반대쪽으로 살짝 밀리고, 팩과 함께 움직인다
    shadow.position.x = stage.position.x - ry.value * 0.25;
    shadow.position.y = stage.position.y - 0.07 + rx.value * 0.25;

    if (detachAt >= 0 && time >= detachAt && !pack.opened) {
      pack.detachTop(scene, flyVel, flySpin);
      // 본체는 반동으로 살짝 아래로
      enterY.velocity -= 0.9;
      rx.velocity += 0.5;
    }

    guide.target = !cutTouched && cutter.enabled && time - startedAt > 1.4 ? 1 : 0;
    pack.uniforms.uGuide.value = guide.step(dt);
    pack.update(dt, time);
    updateHint();
    fx.update(dt, cutter.active ? headWorld(cutter.headU) : null, !cutter.inBand);
  }
  composer.render(dt);
}

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frame(dt);
});
