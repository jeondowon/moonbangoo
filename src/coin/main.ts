// 코인 플립: 위로 튕겨 던지기 → 공중에서 문질러 돌리며 우주·은하까지 → 튕기고 흔들리다 멈추며 결과 (50:50).
import {
  CanvasTexture,
  AdditiveBlending,
  Fog,
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
  type Material,
  type MeshStandardMaterial,
} from "three";
import { clamp, smooth } from "../core/math";
import { Spring } from "../core/spring";
import { createStudioEnv } from "../gfx/env";
import { QUALITY } from "../gfx/quality";
import { altitudeAt, formatAltitude, heightFor, loadBest, MILESTONES, saveBest } from "./altitude";
import { createCoin, createCoinMaterials, type CoinMaterials } from "./coinMesh";
import { CoinSim, COIN_R, COIN_T, type CoinEvent, type Face } from "./physics";
import { createScenery, pixelTexture, radialAlpha } from "./scenery";
import { CoinSound } from "./sound";

const GROUND = "#f3ecdc";
const LOOK_Y = 0.45; // 쉬는 코인이 화면 가운데보다 조금 아래에 보이게
const FOLLOW_FROM = 1.1; // 코인이 이보다 높이 뜨면 카메라가 따라 올라간다
// 빠르게 오르내리면 카메라 스프링이 뒤처져 코인이 화면을 벗어나므로, 뒤처지는 거리를 이만큼까지로 묶는다
const LAG_UP = 0.3;
const LAG_DOWN = 1;
const GHOSTS = 3; // 빠르게 돌 때 직전 자세를 겹쳐 그려 잔상을 만든다
const SWIPE_WINDOW = 100; // ms — 손을 떼기 직전 이 시간 동안의 속도로 던진다
const RUB_HINT_DONE = 0.6; // 화면 높이의 이만큼 문질러 보면 문지르기 안내를 끈다
const FLICK_AT = 0.015; // 공중에서 한 번 쓸 때 화면 높이의 이만큼 움직이면 튕기는 소리를 낸다
const FACE_NAME: Record<Face, string> = { front: "앞면", back: "뒷면" };
const DEG = Math.PI / 180;
const TOAST_MS = 1800;
const VALID_M = 500; // 이 고도를 넘겨야 앞뒤 결과를 인정한다
const VALID_HEIGHT = heightFor(VALID_M);

/** 카메라가 내려다보는 각도: 매장에선 코인을 내려다보고, 떠오르면 지평선이 보이게 든 뒤로는 은하까지 그대로 (cosmos.ts PITCH) */
const pitchAt = (h: number) => (40 - 26 * smooth(1.5, 7, h)) * DEG;
/** 우주 경계 높이 (altitude.ts MILESTONES '우주') */
const SPACE_EDGE = 24;
/** 대기권 안에서만 바람 소리가 난다: 우주 경계(높이 24) 언저리에서 서서히 줄고, 돌아오면 서서히 커진다 */
const airAt = (h: number) => 1 - smooth(18, 28, h);
/** 대기권 재진입: 빠르게 떨어지며 대기권을 지날 때 달아오른다 */
const reentryAt = (h: number, vy: number) => smooth(9, 16, -vy) * smooth(8, 14, h) * (1 - smooth(30, 40, h));

const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
const resultEl = document.querySelector<HTMLElement>("#result")!;
const hintEl = document.querySelector<HTMLElement>("#hint")!;
const altitudeEl = document.querySelector<HTMLElement>("#altitude")!;
const bestEl = document.querySelector<HTMLElement>("#best")!;
const toastEl = document.querySelector<HTMLElement>("#toast")!;
const gaugeEl = document.querySelector<HTMLElement>("#gauge")!;
const storage = (() => {
  try {
    return localStorage;
  } catch {
    return null;
  }
})();

const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(QUALITY.maxPixelRatio, window.devicePixelRatio));
renderer.toneMapping = NeutralToneMapping;
renderer.autoClear = false; // 하늘·천체 장면 위에 코인 장면을 겹쳐 그린다
const scene = new Scene();
// 바닥이 멀어질수록 하늘색(지평선 색)에 녹아 경계가 보이지 않는다. 색은 매 프레임 고도에 맞춘다
const fog = new Fog("#ffffff", 9, 26);
scene.fog = fog;
scene.environment = createStudioEnv(renderer, "pack"); // 밝은 베이지 방을 비춰 금화가 밝은 노란 금색으로 보인다
const camera = new PerspectiveCamera(30, 1, 0.1, 400);
const scenery = createScenery(camera, renderer);
scene.add(scenery.group);
let camDist = 8;

const groundMat = new MeshBasicMaterial({ color: GROUND, toneMapped: false, transparent: true });
const ground = new Mesh(new PlaneGeometry(80, 80), groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const shadowMat = new MeshBasicMaterial({
  map: blobTexture(),
  transparent: true,
  depthWrite: false,
  toneMapped: false,
});
const shadow = new Mesh(new PlaneGeometry(1, 1), shadowMat);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.002;
scene.add(shadow);

const sim = new CoinSim();
const sound = new CoinSound();
const follow = new Spring(0, 2.4, 1);
const pitch = new Spring(pitchAt(0), 0.8, 1);
const buzz = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* iOS 등 진동 미지원 */
  }
};

function blobTexture() {
  return pixelTexture(128, 128, (x, y) => [
    0,
    0,
    0,
    radialAlpha(Math.hypot(x - 64, y - 64) / 64, [
      [0, 0.42],
      [0.45, 0.22],
      [1, 0],
    ]),
  ]);
}

/** 재진입 불꽃: 아래(코인 쪽)가 하얗게 뜨겁고 위로 갈수록 주황에서 사라지는 꼬리 */
function flameTexture() {
  // 크게 확대돼도 픽셀이 보이지 않게 넉넉한 해상도로, 경로로 자르지 않고 픽셀마다 가장자리를 부드럽게 흐린다
  const W = 256;
  const H = 640;
  const STOPS = [
    // [아래에서의 높이, r, g, b, a]
    [0, 255, 245, 210, 1],
    [0.25, 255, 170, 60, 0.9],
    [0.7, 255, 90, 20, 0.35],
    [1, 255, 60, 10, 0],
  ];
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const v = 1 - (y + 0.5) / H;
    const i = STOPS.findIndex((s) => s[0] >= v);
    const [v0, ...a] = STOPS[i - 1];
    const [v1, ...b] = STOPS[i];
    const t = (v - v0) / (v1 - v0);
    const col = a.map((x, k) => x + (b[k] - x) * t);
    // 폭: 아래는 둥글게, 아래쪽 4분의 1 언저리가 가장 넓고 위로 갈수록 가늘어진다
    const half = 0.46 * Math.sqrt(Math.sin(Math.PI * Math.pow(v, 0.6)));
    for (let x = 0; x < W; x++) {
      const d = Math.abs((x + 0.5) / W - 0.5) / Math.max(half, 1e-3);
      const edge = d < 1 ? (1 - d * d) ** 2 : 0;
      const p = (y * W + x) * 4;
      img.data[p] = col[0];
      img.data[p + 1] = col[1];
      img.data[p + 2] = col[2];
      img.data[p + 3] = col[3] * edge * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return new CanvasTexture(c);
}

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // 코인 지름이 화면 폭의 42%, 높이의 27%를 넘지 않게
  const t = 2 * Math.tan(((camera.fov / 2) * Math.PI) / 180);
  camDist = Math.max((2 * COIN_R) / (0.42 * t * camera.aspect), (2 * COIN_R) / (0.27 * t));
}
new ResizeObserver(resize).observe(canvas);

// ---- 안내·결과 ----
let rubbed = 0;
function setHint(text: string) {
  if (text) hintEl.textContent = text;
  hintEl.classList.toggle("is-shown", Boolean(text));
}
function showResult(face: Face | null) {
  if (face) resultEl.textContent = FACE_NAME[face];
  resultEl.classList.toggle("is-shown", Boolean(face));
}

// ---- 고도·기록 ----
let best = loadBest(storage);
let flightPeak = 0;
let climb = 0; // 이번 비행에서 오른 가장 높은 물리 높이. 게이지를 채운다
let passed = new Set<number>();
let toastTimer = 0;
function showBest() {
  bestEl.textContent = best > 0 ? `최고 기록 ${formatAltitude(best)}` : "";
}
function toast(text: string) {
  toastEl.textContent = text;
  toastEl.classList.add("is-shown");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove("is-shown"), TOAST_MS);
}
showBest();

function onEvent(e: CoinEvent) {
  if (e.type === "bounce") {
    sound.clink(0.3 + 0.7 * e.strength);
    buzz(10 + 30 * e.strength);
  } else if (e.type === "tick") {
    sound.tick(e.strength);
    if (e.strength > 0.3) buzz(5);
  } else if (e.type === "rest") {
    sound.clink(0.12, 0.8);
    buzz(20);
    // 500m를 못 넘기면 결과 없이 다시 던지게 한다
    const valid = flightPeak >= VALID_M;
    showResult(valid ? e.face : null);
    setHint(valid ? "위로 튕겨서 다시 던지기" : `${VALID_M}m를 넘겨야 결과가 나와요. 다시 던져 보세요`);
    climb = 0;
    altitudeEl.classList.remove("is-shown");
    if (flightPeak > best) {
      best = flightPeak;
      saveBest(storage, best);
      showBest();
      toast(`신기록! ${formatAltitude(best)}`);
    }
  }
}

// ---- 입력: 쉬는 중엔 위로 튕겨 던지고, 떠 있는 동안엔 문지른 만큼 돌린다 ----
const strokes = new Map<number, { x: number; y: number; t: number }[]>();
const strokeRub = new Map<number, { rub: number; dx: number; up: number }>(); // 이번에 쓴 방향과 그 방향으로 공중에서 문지른 거리

canvas.addEventListener("pointerdown", (e) => {
  sound.unlock();
  canvas.setPointerCapture(e.pointerId);
  strokes.set(e.pointerId, [{ x: e.clientX, y: e.clientY, t: e.timeStamp }]);
});
canvas.addEventListener("pointermove", (e) => {
  const stroke = strokes.get(e.pointerId);
  if (!stroke) return;
  const prev = stroke[stroke.length - 1];
  const h = canvas.clientHeight;
  const dx = (e.clientX - prev.x) / h;
  const up = -(e.clientY - prev.y) / h;
  if (sim.phase === "air" && sim.bounces === 0) {
    sim.spin(dx, up);
    rubbed += Math.hypot(dx, up);
    // 쓸 때마다 엄지로 튕기는 소리. 손을 떼지 않아도 반대 방향으로 쓸기 시작하면 새로 쓴 것으로 친다
    const swipe = strokeRub.get(e.pointerId) ?? { rub: 0, dx, up };
    if (dx * swipe.dx + up * swipe.up < 0) swipe.rub = 0;
    if (dx || up) Object.assign(swipe, { dx, up });
    const before = swipe.rub;
    swipe.rub += Math.hypot(dx, up);
    strokeRub.set(e.pointerId, swipe);
    if (before < FLICK_AT && swipe.rub >= FLICK_AT) {
      sound.clink(0.3, 1.25);
      buzz(5);
    }
    if (rubbed > RUB_HINT_DONE && hintEl.classList.contains("is-shown")) setHint("");
  }
  stroke.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
  while (stroke.length > 2 && e.timeStamp - stroke[1].t > SWIPE_WINDOW) stroke.shift();
});
canvas.addEventListener("pointerup", (e) => {
  sound.unlock();
  const stroke = strokes.get(e.pointerId);
  strokes.delete(e.pointerId);
  strokeRub.delete(e.pointerId);
  if (!stroke) return;
  const from = stroke.find((s) => e.timeStamp - s.t <= SWIPE_WINDOW) ?? stroke[stroke.length - 1];
  const sec = Math.max(1, e.timeStamp - from.t) / 1000;
  const h = canvas.clientHeight;
  if (sim.launch((e.clientX - from.x) / h / sec, -(e.clientY - from.y) / h / sec)) {
    sound.clink(0.35, 1.25); // 엄지로 튕기는 소리
    buzz(8);
    showResult(null);
    setHint(rubbed < RUB_HINT_DONE ? "떠 있는 동안 화면을 스와이프하여 더 돌려 보세요" : "");
    flightPeak = 0;
    passed = new Set();
    altitudeEl.classList.add("is-shown");
  }
});
canvas.addEventListener("pointercancel", (e) => {
  strokes.delete(e.pointerId);
  strokeRub.delete(e.pointerId);
});

// ---- 그리기 ----
const ghostAxis = new Vector3();
const ghostTurn = new Quaternion();

function ghostOf(mats: CoinMaterials) {
  const clones = mats.map((m) => Object.assign(m.clone(), { transparent: true, depthWrite: false })) as Material[];
  return { coin: createCoin(clones as CoinMaterials), mats: clones };
}

async function start() {
  const mats = await createCoinMaterials(renderer);
  const coin = createCoin(mats);
  const glowing = mats as unknown as MeshStandardMaterial[];
  // 잔상은 이 재질을 복제하므로 꺼진 상태(세기 0)로 둔 채 복제되게 한다
  for (const m of glowing) Object.assign(m, { emissiveIntensity: 0 }).emissive.set("#ff6a1a");
  const flame = new Sprite(
    new SpriteMaterial({
      map: flameTexture(),
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0,
    }),
  );
  flame.scale.set(1.1, 2.6, 1);
  scene.add(flame);
  const ghosts = Array.from({ length: GHOSTS }, () => ghostOf(mats));
  scene.add(coin, ...ghosts.map((g) => g.coin));
  gaugeEl.hidden = false;
  await renderer.compileAsync(scenery.cosmos, scenery.cosmosCamera);
  await renderer.compileAsync(scene, camera);
  setHint("위로 튕겨서 던지기");

  let last = performance.now();
  // ?fps: 실제로 그린 프레임 수를 1초마다 표시 (TV 브라우저에는 개발자 도구가 없어 화면에 띄운다).
  // 코인 화면에 적용되는 화질 옵션은 해상도 배율뿐이라 그것만 함께 적는다
  const fpsMeter = QUALITY.showFps ? document.body.appendChild(document.createElement("div")) : null;
  if (fpsMeter) fpsMeter.className = "fps-meter";
  let fpsFrames = 0;
  let fpsFrom = last;
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (fpsMeter) {
      fpsFrames++;
      if (now - fpsFrom >= 1000) {
        fpsMeter.textContent = `${Math.round((fpsFrames * 1000) / (now - fpsFrom))} fps · dpr ${renderer.getPixelRatio()}`;
        fpsFrames = 0;
        fpsFrom = now;
      }
    }
    for (const e of sim.step(dt)) onEvent(e);

    coin.position.copy(sim.pos);
    coin.quaternion.copy(sim.q);
    const w = sim.omega.length();
    const trail = sim.phase === "air" ? smooth(12, 36, w) * 0.35 : 0;
    if (w > 1e-6) ghostAxis.copy(sim.omega).divideScalar(w);
    ghosts.forEach((g, i) => {
      const k = (i + 1) / (GHOSTS + 1);
      g.coin.visible = trail > 0.01;
      if (!g.coin.visible) return;
      g.coin.position.copy(sim.pos);
      g.coin.quaternion.copy(sim.q).premultiply(ghostTurn.setFromAxisAngle(ghostAxis, (-w * k) / 60));
      for (const m of g.mats) m.opacity = trail * (1 - k);
    });
    const height = sim.pos.y;
    const glow = sim.phase === "air" ? reentryAt(height, sim.vel.y) : 0;
    for (const m of glowing) m.emissiveIntensity = glow * 1.2;
    flame.visible = glow > 0.01;
    flame.position.set(sim.pos.x, sim.pos.y + 1.1, sim.pos.z);
    flame.material.opacity = glow * (0.85 + 0.15 * Math.sin(now / 25));
    // 바람 소리는 대기권 밖까지 나갔다가 떨어질 때만 낸다. 바닥에 한 번 닿으면 튕기는 동안에도 끈다. 재진입 중엔 불꽃 소리로 이어진다. 대기권 밖에선 들리지 않는다
    sound.setWind(
      sim.phase === "air" && passed.has(SPACE_EDGE) && sim.bounces === 0 && sim.vel.y < 0
        ? Math.max(smooth(3, 42, w), glow) * airAt(height)
        : 0,
    );

    // 고도 표시. 구간을 지날 때는 글 없이 소리로만 알린다
    const altitude = altitudeAt(height - COIN_T / 2);
    if (sim.phase === "air") {
      flightPeak = Math.max(flightPeak, altitude);
      climb = Math.max(climb, height - COIN_T / 2);
      altitudeEl.textContent = formatAltitude(altitude);
      for (const m of MILESTONES) {
        if (height < m.height || passed.has(m.height)) continue;
        passed.add(m.height);
        sound.clink(0.2, 1.6);
      }
    }
    document.body.classList.toggle("is-night", height > 19);

    // 바닥·그림자는 매장을 벗어나면 사라지고 지구가 드러난다. 그림자는 높이 뜰수록 넓고 옅어진다
    const indoor = 1 - smooth(3, 9, height);
    groundMat.opacity = indoor;
    ground.visible = shadow.visible = indoor > 0;
    shadow.scale.setScalar(COIN_R * 2.8 * (1 + height * 0.15));
    shadowMat.opacity = indoor / (1 + height * 0.6);

    follow.target = Math.max(0, height - FOLLOW_FROM);
    follow.value = clamp(follow.step(dt), follow.target - LAG_UP, follow.target + LAG_DOWN);
    const y = follow.value + LOOK_Y;
    pitch.target = pitchAt(height);
    const p = pitch.step(dt);
    camera.position.set(0, y + Math.sin(p) * camDist, Math.cos(p) * camDist);
    camera.lookAt(0, y, 0);
    scenery.update(height, now / 1000);
    fog.color.copy(scenery.horizon);
    renderer.clear();
    renderer.render(scenery.cosmos, scenery.cosmosCamera);
    renderer.clearDepth();
    renderer.render(scene, camera);

    // 500m 게이지: 오른 만큼 차고, 500m를 넘으면 사라진다
    gaugeEl.style.setProperty("--fill", String(Math.min(1, climb / VALID_HEIGHT)));
    gaugeEl.classList.toggle("is-done", climb >= VALID_HEIGHT);
  });
}

start().catch((e) => {
  console.error(e);
  setHint("불러오지 못했어요. 새로고침해 주세요.");
});
