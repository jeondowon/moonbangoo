// 1차: 인트로 → 팩 등장 → 기울여 보기 / 탭해서 뒤집기 → 절취 개봉 → 카드 뭉치 등장 → 한 장씩 넘기기 (M1~M3).
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
import { CARD_H, CARD_W } from './card/card';
import { Deck, RISE_TOP } from './card/deck';
import { buildCardTextures } from './card/textures';
import { updateHoloTime } from './card/holo';
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
const RISE_MARGIN = 0.15; // 빠져나오는 카드 윗변과 화면 윗끝 사이 여백

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
const deckShadow = createShadow(CARD_W, CARD_H);
deckShadow.position.z = -0.45;
deckShadow.visible = false;
scene.add(deckShadow);
const fx = new CutFx();
scene.add(fx.group);

const tilt = new TiltInput(canvas);

/** 이번 참여의 결과 (카드 5장) */
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
// 카드가 빠져나오는 동안 팩이 내려감 (카드가 화면 위로 잘리지 않게). 되튀지 않도록 감쇠 높게
const openDrop = new Spring(0, 1.6, 0.9);

let pack: Pack | null = null;
let cutter: Cutter | null = null;
let deck: Deck | null = null;
/** 카드를 보여줄 때 덱 배율 (화면 비율에 맞춰 resize에서 계산) */
let viewScale = 1;
/** 카드가 빠져나올 때 팩이 내려가는 거리 (화면 비율에 맞춰 resize에서 계산) */
let dropBy = 0;
let started = false;
let time = 0;
let startedAt = 0;
let cutTouched = false; // 한 번이라도 잘랐는지 (안내 문구·반짝임 끄기)
let detachAt = -1; // 윗조각을 날려 보낼 시각
let flyVel = new Vector3();
let flySpin = new Vector3();
let openedAt = -1; // 윗조각이 날아간 시각
let packFall: { y: number; v: number } | null = null; // 카드가 빠져나온 뒤 팩 본체 퇴장
let everFlipped = false; // 안내 문구: 카드를 한 번이라도 뒤집었는지
let everSwiped = false; // 안내 문구: 카드를 한 번이라도 넘겼는지

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
  // 카드는 화면 높이의 66%, 폭의 80%를 넘지 않게
  const visH = 2 * t * camera.position.z;
  viewScale = Math.min((0.66 * visH) / CARD_H, (0.8 * visH * camera.aspect) / CARD_W);
  deck?.setViewScale(viewScale);
  // 빠져나오는 카드 윗변이 화면 윗끝 아래에 머물 만큼 팩을 내림
  dropBy = Math.max(0, RISE_TOP + RISE_MARGIN - visH / 2);
  if (deck && deck.state !== 'packed') openDrop.target = -dropBy;
}
// 인앱 브라우저(인스타그램 등)는 최초 진입 시 주소창이 접히며 실제 뷰포트가
// 바뀌어도 window resize 이벤트를 안정적으로 쏘지 않는 경우가 있어,
// 캔버스의 실제 레이아웃 크기 변화를 직접 관찰한다.
new ResizeObserver(resize).observe(canvas);

let ready = false;
let wantsStart = false;

async function prepare() {
  const drawn = drawPack();
  const [tex, result, cardTex] = await Promise.all([
    buildPackTextures(renderer),
    drawn,
    drawn.then((r) => buildCardTextures(renderer, r.cards)),
  ]);
  session.result = result;
  pack = new Pack(tex);
  stage.add(pack.root);
  setupCutter(pack);
  // 카드 뭉치는 처음부터 팩 안에 뒷면으로 들어 있다
  deck = new Deck(canvas, camera, result.cards, cardTex.fronts, cardTex.back);
  deck.setViewScale(viewScale);
  pack.root.add(deck.root);
  setupDeck(deck);
  // 카드 텍스처 6장을 로딩 중에 GPU로 올려 둔다 (팩 등장 첫 프레임에 한꺼번에 올리며 끊기지 않게)
  for (const t of [cardTex.back, ...cardTex.fronts]) renderer.initTexture(t);
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
  // 개봉한 뒤에는 드래그가 카드 넘기기용 (기울이기는 마우스 호버만)
  tilt.shouldIgnore = (e) => p.opened || c.active || c.wants(e);

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

// ── 카드 ─────────────────────────────────────────
function setupDeck(d: Deck) {
  d.onFlip = () => {
    everFlipped = true;
  };
  d.onAdvance = () => {
    everSwiped = true;
  };
  d.onFinish = () => {
    everSwiped = true;
  };
}

/** 개봉 후: 카드 뭉치가 팩 입구로 빠져나오고 → 팩은 아래로 떨어져 퇴장 → 뭉치는 화면 중앙으로 (명세 R2) */
function updateOpening(p: Pack, d: Deck, dt: number) {
  if (openedAt < 0) return;
  if (d.state === 'packed' && time - openedAt > 0.35) {
    p.lining.visible = false;
    d.slideOut();
    openDrop.target = -dropBy;
  }
  if (d.state === 'rising' && d.riseTime > 0.75) {
    d.present(scene);
    packFall = { y: 0, v: -0.5 };
  }
  if (packFall && stage.visible) {
    packFall.v -= 9 * dt;
    packFall.y += packFall.v * dt;
    if (packFall.y < -6) stage.visible = shadow.visible = false;
  }
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
  if (!pack || !started || time - startedAt < 1.4) return;
  if (deck && deck.state !== 'packed' && deck.state !== 'rising') {
    updateCardHint(deck);
    return;
  }
  if (pack.opened || detachAt >= 0) return;
  if (flip.target !== 0) setHint('뒷면이에요', '팩을 톡 누르면 다시 앞면으로');
  else if (cutTouched) setHint(null);
  else setHint('점선을 따라 옆으로 그어 개봉하세요', '팩을 톡 누르면 뒷면을 볼 수 있어요');
}

function updateCardHint(d: Deck) {
  const top = d.top;
  if (d.state === 'done') setHint('5장을 모두 확인했어요');
  else if (d.state !== 'ready' || !top) setHint(null);
  else if (!top.faceUp && !everFlipped) setHint('카드를 톡 눌러 뒤집어 보세요');
  else if (top.faceUp && top.flipProgress > 0.9 && !everSwiped) setHint('옆으로 밀어서 다음 카드 보기');
  else setHint(null);
}

// ── 프레임 ───────────────────────────────────────
// 입력이 없을 때 빛 반사가 보이도록 천천히 흔들림
function autoSway(t: number, weight: number) {
  return { x: weight * 0.32 * Math.sin(t * 0.55), y: weight * 0.22 * Math.sin(t * 0.41 + 1.3) };
}

function frame(dt: number) {
  time += dt;
  updateHoloTime(time);

  if (started && pack && cutter) {
    // 자르는 동안에는 팩을 정면으로 붙잡아 절취선이 흔들리지 않게
    // 카드가 빠져나오는 동안에도 팩을 거의 정면으로
    tiltGain.target = cutter.active ? 0.12 : pack.opened ? 0.3 : 1;
    tilt.update(dt);
    const idle = cutter.active ? 0 : Math.min(1, Math.max(0, (tilt.idleTime - 1.5) / 2));
    const sway = autoSway(time, idle);
    const g = tiltGain.step(dt);
    ry.target = MAX_TILT * (tilt.x + sway.x) * g;
    rx.target = -MAX_TILT * (tilt.y + sway.y) * g;
    for (const s of [rx, ry, roll, enterY, enterSpin, enterPitch, flip, openDrop]) s.step(dt);

    // 앞면이 정면을 향하고, 등장이 끝났고, 아직 안 열었을 때만 자를 수 있음
    cutter.enabled =
      !pack.opened && detachAt < 0 && flip.target === 0 && Math.abs(flip.value) < 0.12 && enterY.value > -0.05;

    const float = Math.sin(time * 1.1) * 0.012;
    // 뒤집을 때 화면 쪽으로 살짝 떠올랐다 돌아옴
    const lift = Math.sin(Math.min(Math.PI, Math.abs(flip.value))) * 0.45;
    // 퇴장: 아래로 떨어지면서 뒤로 살짝 젖혀짐
    const fall = packFall?.y ?? 0;
    stage.position.set(0, enterY.value + openDrop.value + float + fall, lift + fall * 0.08);
    stage.rotation.set(
      rx.value + enterPitch.value - fall * 0.1,
      ry.value + enterSpin.value + flip.value,
      roll.value + Math.sin(time * 0.7) * 0.006,
    );
    // 그림자는 기울기 반대쪽으로 살짝 밀리고, 팩과 함께 움직인다
    shadow.position.x = stage.position.x - ry.value * 0.25;
    shadow.position.y = stage.position.y - 0.07 + rx.value * 0.25;
    shadow.material.opacity = 0.55 * Math.max(0, 1 + fall / 1.2);

    if (detachAt >= 0 && time >= detachAt && !pack.opened) {
      pack.detachTop(scene, flyVel, flySpin);
      openedAt = time;
      // 본체는 반동으로 살짝 아래로
      enterY.velocity -= 0.9;
      rx.velocity += 0.5;
    }

    guide.target = !cutTouched && cutter.enabled && time - startedAt > 1.4 ? 1 : 0;
    pack.uniforms.uGuide.value = guide.step(dt);
    pack.update(dt, time);
    updateHint();
    fx.update(dt, cutter.active ? headWorld(cutter.headU) : null, !cutter.inBand);

    if (deck) {
      updateOpening(pack, deck, dt);
      if (deck.state !== 'packed' && deck.state !== 'rising') {
        // 카드도 기울여 볼 수 있음 (명세 R10 — 마우스 호버 + 가만히 있으면 자동 흔들림). 넘기는 중에는 약하게
        const k = MAX_TILT * 0.8 * (deck.dragging ? 0.25 : 1);
        deck.setTilt(-k * (tilt.y + sway.y), k * (tilt.x + sway.x));
      }
      deck.update(dt);
      updateDeckShadow(deck);
    }
  }
  composer.render(dt);
}

/** 화면 중앙으로 나온 카드 뭉치 아래 그림자 */
function updateDeckShadow(d: Deck) {
  const inScene = d.root.parent === scene;
  deckShadow.visible = inScene && d.state !== 'done';
  if (!deckShadow.visible) return;
  const s = d.root.scale.x;
  deckShadow.scale.setScalar(s);
  deckShadow.position.x = d.root.position.x - d.root.rotation.y * 0.25 * s;
  deckShadow.position.y = d.root.position.y - 0.07 * s + d.root.rotation.x * 0.25 * s;
  // 중앙으로 올수록(커질수록) 진해짐
  const grow = viewScale - 1 > 0.05 ? (s - 1) / (viewScale - 1) : 1;
  deckShadow.material.opacity = 0.5 * Math.min(1, Math.max(0, grow));
}

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frame(dt);
});
