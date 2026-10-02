// 카드 뭉치 (명세 R2·R3). 팩 안에 뒷면으로 들어 있다가 위로 빠져나오고, 화면 중앙으로 옮겨져 한 장씩 확인한다.
//   - 뒷면 뭉치: 탭 → 뭉치 전체가 앞면으로 뒤집힘 (옆으로 밀어도 그 방향으로 뒤집힘)
//   - 앞면 카드: 손가락을 1:1로 따라오고, 놓으면 민 방향과 상관없이 위로 넘어감. 다음 카드는 앞면으로 드러남
//   - 드래그 중 이동 방향으로 기울어짐 (명세 R7)
import { Group, Matrix4, Raycaster, Vector2, Vector3, type Camera, type Material, type Object3D, type Texture } from 'three';
import { clamp, smooth } from '../core/math';
import { Spring } from '../core/spring';
import type { Prize } from '../data/draw';
import { PACK_H, PACK_W, packY } from '../pack/pack';
import { TEAR_CURVE_GLSL, type TearUniforms } from '../pack/tearShader';
import { Card, CARD_H, CARD_W } from './card';
import type { RarityCode } from './holo';

const GAP = 0.013; // 카드 사이 z 간격 (기울이면 아래 카드 옆면이 층층이 보이도록)
const IN_SQUEEZE = 0.65; // 팩 안에서는 뭉치를 이만큼 얇게 눌러 담음 (절취선 입구 두께보다 얇아야 팩을 뚫고 보이지 않음)
const IN_TOP_V = 0.16; // 팩 안에서 카드 윗변 위치 (팩 위에서부터 비율, 절취선 아래)
const IN_Y = packY(IN_TOP_V) - CARD_H / 2;
const RISE = 1; // 팩 입구 위로 빠져나오는 거리
/** 빠져나올 때 카드 윗변의 최고 높이 (팩 로컬) — 끝에서 튕기는 만큼(약 6%) 포함 */
export const RISE_TOP = packY(IN_TOP_V) + RISE * 1.07;
const HOLD = 0.3; // 팩이 떨어져 나가는 동안 뭉치가 제자리에 머무는 시간 (커지면서 팩을 뚫고 나오지 않게)
const SETTLE = 0.75; // 중앙으로 옮겨 가는 동안 입력을 받지 않는 시간

const TAP_MOVE = 10; // px
const TAP_TIME = 350; // ms
const FLING_MIN = 6; // 날아가는 최소 속도 (카드 폭/초)
const TURN_DIST = 0.1; // 뒷면 카드를 이만큼 밀면 뒤집힘
const TURN_SPEED = 0.9;
const BACK_DRAG = 0.35; // 뒷면 카드는 손가락을 덜 따라옴 (고무줄)

/** 카드별로 고정된 작은 흐트러짐 (쌓인 뭉치가 기계적으로 반듯하지 않게) */
const jitter = (i: number, k: number) => (Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;

function openingUniforms(tear: TearUniforms) {
  return {
    uOpeningActive: { value: 0 },
    uPackWorldInverse: { value: new Matrix4() },
    uPackWidth: { value: PACK_W },
    uPackHeight: { value: PACK_H },
    uCut: tear.uCut,
    uTearV: tear.uTearV,
    uGap: tear.uGap,
  };
}

/** 카드 조각마다 팩 본체와 같은 픽셀 경계에서 가린다. 기존 홀로 셰이더는 유지한다. */
function applyOpeningMask(material: Material, uniforms: ReturnType<typeof openingUniforms>) {
  const compile = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOpeningWorldPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOpeningWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
      varying vec3 vOpeningWorldPos;
      uniform float uOpeningActive, uPackWidth, uPackHeight, uTearV, uGap;
      uniform mat4 uPackWorldInverse;
      uniform sampler2D uCut;
      ${TEAR_CURVE_GLSL}`)
      .replace('#include <clipping_planes_fragment>', /* glsl */ `#include <clipping_planes_fragment>
      if (uOpeningActive > 0.5) {
        vec3 packPos = (uPackWorldInverse * vec4(vOpeningWorldPos, 1.0)).xyz;
        float openingU = clamp(packPos.x / uPackWidth + 0.5, 0.0, 1.0);
        float openingV = 0.5 - packPos.y / uPackHeight;
        float bodyEdge = tearCurve(openingU) + texture2D(uCut, vec2(openingU, 0.5)).r * uGap;
        if (openingV >= bodyEdge) discard;
      }`);
  };
  material.customProgramCacheKey = () => `${cacheKey}-opening-mask`;
}

type State = 'packed' | 'rising' | 'presenting' | 'ready' | 'done';

interface Sample {
  t: number;
  x: number;
  y: number;
}

interface Drag {
  id: number;
  card: Card;
  sx: number;
  sy: number;
  t0: number;
  /** 잡은 지점 (덱 로컬) */
  gx: number;
  gy: number;
  /** 잡은 순간 카드 위치 */
  cx: number;
  cy: number;
  /** 카드 윗부분을 잡았으면 1, 아랫부분이면 -1 (회전 방향이 반대) */
  grab: number;
  samples: Sample[];
}

export class Deck {
  readonly root = new Group();
  /** 넘기는 순서. 맨 앞은 매장 안내 카드, 그 뒤가 경품 카드 */
  readonly cards: Card[];
  /** 맨 앞의 매장 안내 카드 (경품 아님 — 첫 장은 넘기기 안내에 덮여 보이므로 경품 대신 이 카드가 덮임) */
  readonly lead: Card;
  state: State = 'packed';
  /** 지금 맨 위 카드 번호 (0부터) */
  current = 0;

  onFlip?: (index: number) => void;
  /** 뒤집히는 카드의 앞면이 드러나기 시작하는 순간 (옆모습을 지날 때) — 등급별 등장 연출 시점 */
  onReveal?: (card: Card) => void;
  onAdvance?: (index: number) => void;
  onFinish?: () => void;

  private readonly rise = new Spring(0, 0.35, 0.55);
  private riseAge = 0;
  private presentAge = 0;
  // 덱 전체 위치·회전·크기 (화면 중앙으로 옮길 때)
  private readonly px = new Spring(0, 1.5, 0.8);
  private readonly py = new Spring(0, 1.5, 0.8);
  private readonly pz = new Spring(0, 1.5, 0.8);
  private readonly rx = new Spring(0, 2.2, 0.66);
  private readonly ry = new Spring(0, 2.2, 0.66);
  private readonly rz = new Spring(0, 1.6, 0.8);
  private readonly scale = new Spring(1, 1.5, 0.74);
  /** 뭉치 두께 배율 — 팩 안에서는 눌려 있다가 중앙으로 옮겨 가며 펴짐 */
  private readonly depth = new Spring(IN_SQUEEZE, 1.5, 0.74);
  private viewScale = 1;
  private settled = false;

  private drag: Drag | null = null;
  private readonly revealed = new Set<Card>();
  private readonly ray = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly inv = new Matrix4();
  private readonly openingMask: ReturnType<typeof openingUniforms>;

  constructor(private readonly el: HTMLElement, private readonly camera: Camera, prizes: Prize[], fronts: Texture[], back: Texture, lead: Texture, tear: TearUniforms) {
    this.openingMask = openingUniforms(tear);
    this.lead = new Card(lead, back, 'C');
    this.cards = [this.lead, ...prizes.map((p, i) => new Card(fronts[i], back, p.rarity as RarityCode))];
    const masked = new Set<Material>();
    for (const card of this.cards) {
      const materials = Array.isArray(card.mesh.material) ? card.mesh.material : [card.mesh.material];
      for (const material of materials) {
        if (masked.has(material)) continue;
        applyOpeningMask(material, this.openingMask);
        masked.add(material);
      }
    }
    this.cards.forEach((c) => this.root.add(c.root));
    this.layout(true);
    this.place();
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
  }

  get top(): Card | null {
    return this.cards[this.current] ?? null;
  }

  /** 경품 카드만 (매장 안내 카드 제외) */
  get prizeCards() {
    return this.cards.slice(1);
  }

  get dragging() {
    return this.drag !== null;
  }

  /** 입력을 받는 중인지 (중앙에 자리 잡은 뒤) */
  get interactive() {
    return this.state === 'ready';
  }

  /** 팩 입구로 빠져나오기 시작 (명세 R2: 마찰감 — 처음엔 느리게, 점점 빨라져서 끝에서 살짝 튕김) */
  slideOut() {
    if (this.state !== 'packed') return;
    this.state = 'rising';
    this.riseAge = 0;
    this.rise.target = RISE;
  }

  /** 빠져나오기 시작한 뒤 경과 시간 (s) */
  get riseTime() {
    return this.riseAge;
  }

  /** 카드 아래쪽을 팩의 실제 찢김 경계에 맞춰 가린다. */
  clipBelowOpening(pack: Object3D) {
    pack.updateWorldMatrix(true, false);
    this.openingMask.uPackWorldInverse.value.copy(pack.matrixWorld).invert();
    this.openingMask.uOpeningActive.value = 1;
  }

  clearOpeningClip() {
    this.openingMask.uOpeningActive.value = 0;
  }

  /** 팩에서 떼어 world(보통 scene)로 옮기고 화면 중앙으로 */
  present(world: Object3D) {
    if (this.state !== 'rising') return;
    world.attach(this.root);
    const { position: p, rotation: r } = this.root;
    this.px.snap(p.x);
    this.py.snap(p.y);
    this.pz.snap(p.z);
    this.rx.snap(r.x);
    this.ry.snap(r.y);
    this.rz.snap(r.z);
    this.scale.snap(this.root.scale.x);
    // 떠오르던 속도를 이어받아 부드럽게 연결 (잠시 제자리에 머무는 동안 잦아듦)
    this.py.velocity = this.rise.velocity;
    this.state = 'presenting';
    this.presentAge = 0;
  }

  /** 화면에서 보여줄 크기 (화면 비율에 따라 main이 계산) */
  setViewScale(s: number) {
    this.viewScale = s;
    if (this.settled) this.scale.target = s;
  }

  /** 기울여 보기 (명세 R10) — 라디안 */
  setTilt(x: number, y: number) {
    this.rx.target = x;
    this.ry.target = y;
  }

  /** 남은 카드를 뭉치 모양으로 정렬 (맨 위 카드는 반듯하게, 아래 카드는 살짝 흐트러지게) */
  private layout(snap = false) {
    this.cards.forEach((c, i) => {
      const k = i - this.current;
      if (k < 0) return;
      const x = k ? jitter(i, 1) * 0.008 : 0;
      const y = k ? jitter(i, 2) * 0.008 : 0;
      const r = k ? jitter(i, 3) * 0.012 : 0;
      const z = -k * GAP;
      if (snap) {
        c.x.snap(x);
        c.y.snap(y);
        c.z.snap(z);
        c.roll.snap(r);
      } else {
        c.x.target = x;
        c.y.target = y;
        c.z.target = z;
        c.roll.target = r;
      }
    });
  }

  /** 팩 안에 있을 때의 덱 위치 (팩 로컬) */
  private place() {
    const n = this.cards.length;
    this.root.position.set(0, IN_Y + this.rise.value, ((n - 1) * GAP * IN_SQUEEZE) / 2);
    this.root.rotation.set(0, 0, 0);
    this.root.scale.set(1, 1, IN_SQUEEZE);
  }

  update(dt: number) {
    if (this.state === 'packed' || this.state === 'rising') {
      if (this.state === 'rising') {
        this.riseAge += dt;
        // 강성을 점점 키워 "처음엔 버티다가 쑥 빠지는" 마찰감, 감쇠비 < 1이라 끝에서 살짝 튕김
        this.rise.set(0.35 + 1.9 * smooth(0, 0.5, this.riseAge), 0.55);
        this.rise.step(dt);
      }
      this.place();
    } else {
      for (const s of [this.px, this.py, this.pz, this.rx, this.ry, this.rz, this.scale, this.depth]) s.step(dt);
      this.root.position.set(this.px.value, this.py.value, this.pz.value);
      this.root.rotation.set(this.rx.value, this.ry.value, this.rz.value);
      this.root.scale.set(this.scale.value, this.scale.value, this.scale.value * this.depth.value);
      if (this.state === 'presenting') {
        this.presentAge += dt;
        if (!this.settled && this.presentAge > HOLD) {
          this.settled = true;
          this.px.target = this.py.target = this.pz.target = this.rz.target = 0;
          this.scale.target = this.viewScale;
          this.depth.target = 1;
        }
        if (this.presentAge > HOLD + SETTLE) this.state = 'ready';
      }
    }

    const d = this.drag;
    if (d) {
      // 드래그 중: 이동 방향으로 기울어짐 + 끌고 간 거리만큼 회전 (잡은 위치에 따라 방향 반대)
      const v = this.velocity(d, performance.now());
      const dx = d.card.x.value - d.cx;
      d.card.lean.target = clamp(v.x * 0.07, -0.35, 0.35);
      d.card.pitch.target = clamp(-v.y * 0.05, -0.25, 0.25);
      d.card.roll.target = clamp(-dx * 0.3 * d.grab, -0.4, 0.4);
    }
    for (const c of this.cards) {
      c.step(dt);
      if (c.flight) c.root.visible = c.flight.age < 1.2;
      // 뭉치를 뒤집으면 모두 앞면이 되지만, 등장 연출은 맨 위로 드러난 카드만
      if (c === this.top && c.faceUp && c.flipProgress > 0.5 && !this.revealed.has(c)) {
        this.revealed.add(c);
        this.onReveal?.(c);
      }
    }
  }

  // ── 입력 ─────────────────────────────────────
  /** 화면 좌표를 지나는 카메라 광선을 this.ray에 설정 */
  private aim(clientX: number, clientY: number) {
    const r = this.el.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
  }

  /** 화면 좌표 → 덱 로컬 평면(z = 0) 좌표 */
  private project(clientX: number, clientY: number): Vector3 | null {
    this.aim(clientX, clientY);
    this.root.updateWorldMatrix(true, false);
    const ray = this.ray.ray.applyMatrix4(this.inv.copy(this.root.matrixWorld).invert());
    if (Math.abs(ray.direction.z) < 1e-6) return null;
    const t = -ray.origin.z / ray.direction.z;
    if (t < 0) return null;
    return ray.at(t, new Vector3());
  }

  /** 화면 좌표가 맨 위 카드를 가리키는지 */
  hitsTop(clientX: number, clientY: number) {
    const top = this.top;
    if (!top) return false;
    this.aim(clientX, clientY);
    return this.ray.intersectObject(top.mesh, false).length > 0;
  }

  /** 최근 0.1초 손가락 속도 (덱 로컬 단위/s). 멈춰 있으면 0 */
  private velocity(d: Drag, now: number) {
    const s = d.samples.filter((p) => now - p.t < 100);
    if (s.length < 2) return { x: 0, y: 0 };
    const a = s[0];
    const b = s[s.length - 1];
    const dt = Math.max(0.016, (b.t - a.t) / 1000);
    return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
  }

  private onDown = (e: PointerEvent) => {
    const card = this.top;
    if (!this.interactive || this.drag || !card || card.flight) return;
    if (!this.hitsTop(e.clientX, e.clientY)) return;
    const p = this.project(e.clientX, e.clientY);
    if (!p) return;
    this.el.setPointerCapture(e.pointerId);
    this.drag = {
      id: e.pointerId,
      card,
      sx: e.clientX,
      sy: e.clientY,
      t0: e.timeStamp,
      gx: p.x,
      gy: p.y,
      cx: card.x.value,
      cy: card.y.value,
      grab: p.y - card.y.value >= 0 ? 1 : -1,
      samples: [{ t: e.timeStamp, x: p.x, y: p.y }],
    };
  };

  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const events = e.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e]) {
      const p = this.project(ev.clientX, ev.clientY);
      if (!p) continue;
      d.samples.push({ t: ev.timeStamp, x: p.x, y: p.y });
    }
    while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > 150) d.samples.shift();
    const last = d.samples[d.samples.length - 1];
    const k = d.card.faceUp ? 1 : BACK_DRAG;
    // 손가락을 1:1로 따라옴 (값을 직접 지정 — 놓는 순간부터 스프링이 이어받음)
    const x = d.cx + (last.x - d.gx) * k;
    const y = d.cy + (last.y - d.gy) * k;
    d.card.x.value = d.card.x.target = x;
    d.card.y.value = d.card.y.target = y;
    d.card.x.velocity = d.card.y.velocity = 0;
  };

  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    const card = d.card;
    const v = this.velocity(d, e.timeStamp);
    const moved = Math.hypot(e.clientX - d.sx, e.clientY - d.sy);
    const tap = moved < TAP_MOVE && e.timeStamp - d.t0 < TAP_TIME;
    const dx = card.x.value - d.cx;
    card.lean.target = card.pitch.target = 0;

    if (!card.faceUp) {
      if (tap) this.turnOver(card, 1);
      else if (Math.abs(dx) > TURN_DIST * BACK_DRAG || Math.abs(v.x) > TURN_SPEED) this.turnOver(card, Math.sign(v.x || dx));
      this.release(card, v);
      return;
    }

    // 조금이라도 밀었으면 어느 방향이든 위로 일직선으로 넘어감
    if (moved >= TAP_MOVE) {
      card.fling(Math.max(FLING_MIN * CARD_W, Math.hypot(v.x, v.y) * 1.1));
      this.current++;
      this.layout();
      if (this.current >= this.cards.length) {
        this.state = 'done';
        this.onFinish?.();
      } else {
        this.onAdvance?.(this.current);
      }
    } else {
      this.release(card, v);
    }
  };

  private onCancel = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    d.card.lean.target = d.card.pitch.target = 0;
    this.release(d.card, { x: 0, y: 0 });
  };

  /** 제자리로 스프링 복귀 (놓을 때 속도를 이어받음) */
  private release(card: Card, v: { x: number; y: number }) {
    this.layout();
    card.x.velocity = v.x;
    card.y.velocity = v.y;
  }

  /** 뭉치 전체를 앞면으로 뒤집는다 */
  private turnOver(card: Card, dir: number) {
    if (card.faceUp) return;
    for (const c of this.cards) c.turnOver(dir);
    this.onFlip?.(this.current);
  }
}
