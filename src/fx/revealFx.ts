// 카드를 뒤집을 때 등급별 등장 연출 (명세 R9, M4).
//  - 일반: 기본 (연출 없음)
//  - 레어: 반짝임 (은빛)
//  - 슈퍼레어: 반짝임 (금빛, 더 많이)
//  - 최고등급: 화면 플래시 + 무지개 반짝임 + 특수 연출(퍼져 나가는 빛 고리 + 빛 입자 분출)
// 카드 뒤 광선·후광은 과하다는 사용자 판단으로 빼고, 등급 차이는 반짝임 색·개수로 둔다 (2026-09-25).
// 연출은 뒤집히는 카드(root)에 붙어 함께 움직인다. 밝은 부분은 HDR 값(>1)으로 그려 Bloom이 번지게 한다.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  type Object3D,
} from 'three';
import type { RarityCode } from '../card/holo';
import { smooth } from '../core/math';

const MAX_MOTES = 320;

interface RevealStyle {
  /** 반짝임 개수 */
  glints: number;
  /** 반짝임 색 (rainbow면 무시) */
  color: Color;
  rainbow: boolean;
  /** 화면 플래시 최고 불투명도 (0이면 없음) */
  flash: number;
  /** 특수 연출: 빛 고리 + 빛 입자 분출 */
  special: boolean;
}

const STYLE: Record<RarityCode, RevealStyle | null> = {
  C: null,
  R: { glints: 16, color: new Color(1.6, 1.75, 2), rainbow: false, flash: 0, special: false },
  SR: { glints: 24, color: new Color(1.9, 1.45, 0.65), rainbow: false, flash: 0, special: false },
  UR: { glints: 26, color: new Color(1.6, 1.6, 1.6), rainbow: true, flash: 0.45, special: true },
};

/**
 * 반짝임·빛 입자. 방출 순간의 위치·속도·시각만 기록하고 궤적과 명멸은 셰이더에서 계산
 * (매 프레임 CPU 갱신 없음).
 */
class Motes {
  readonly points: Points;
  private readonly p0 = new Float32Array(MAX_MOTES * 3);
  private readonly vel = new Float32Array(MAX_MOTES * 3);
  private readonly col = new Float32Array(MAX_MOTES * 3);
  /** x = 시작 시각, y = 수명, z = 크기, w = 모양 (0 = 십자 반짝임, 1 = 둥근 입자) */
  private readonly info = new Float32Array(MAX_MOTES * 4);
  private next = 0;
  readonly material: ShaderMaterial;

  constructor() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.p0, 3));
    g.setAttribute('aVel', new BufferAttribute(this.vel, 3));
    g.setAttribute('aColor', new BufferAttribute(this.col, 3));
    g.setAttribute('aInfo', new BufferAttribute(this.info, 4));
    this.material = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 400 }, uAlpha: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 aVel;
        attribute vec3 aColor;
        attribute vec4 aInfo;
        uniform float uTime, uScale;
        varying vec3 vColor;
        varying float vEnv, vShape, vSpin;
        void main() {
          float t = uTime - aInfo.x;
          float k = t / aInfo.y;
          // 반짝임은 빠르게 켜졌다 천천히 꺼짐, 입자는 처음부터 밝았다가 식음
          vEnv = k < 0.0 || k > 1.0 ? 0.0 : (aInfo.w < 0.5 ? pow(sin(3.14159 * pow(k, 0.6)), 2.0) : (1.0 - k) * (1.0 - k));
          vColor = aColor;
          vShape = aInfo.w;
          vSpin = t * 1.6 + aInfo.x * 7.0;
          // 입자는 감속하며 퍼지고 살짝 떠오름
          float d = (1.0 - exp(-2.4 * max(t, 0.0))) / 2.4;
          vec3 p = position + aVel * d + vec3(0.0, 0.12, 0.0) * max(t, 0.0) * aInfo.w;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = vEnv > 0.0 ? aInfo.z * (0.4 + 0.6 * vEnv) * uScale / -mv.z : 0.0;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha;
        varying vec3 vColor;
        varying float vEnv, vShape, vSpin;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          float r = length(q);
          float a;
          if (vShape < 0.5) {
            // 네 갈래 반짝임: 가는 십자 광채 + 둥근 중심, 천천히 돈다
            float c = cos(vSpin), s = sin(vSpin);
            q = mat2(c, -s, s, c) * q;
            float cross = exp(-abs(q.x) * 60.0) * exp(-abs(q.y) * 5.0) + exp(-abs(q.y) * 60.0) * exp(-abs(q.x) * 5.0);
            a = cross * 0.9 + exp(-r * r * 90.0);
          } else {
            a = smoothstep(0.5, 0.0, r);
            a *= a;
          }
          a *= smoothstep(0.5, 0.35, r);
          gl_FragColor = vec4(vColor * a * vEnv * uAlpha, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 22;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, c: Color, start: number, span: number, size: number, shape: 0 | 1) {
    const i = this.next;
    this.next = (this.next + 1) % MAX_MOTES;
    this.p0.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set([c.r, c.g, c.b], i * 3);
    this.info.set([start, span, size, shape], i * 4);
  }

  commit() {
    const g = this.points.geometry;
    for (const name of ['position', 'aVel', 'aColor', 'aInfo']) g.getAttribute(name).needsUpdate = true;
  }
}

/** 최고등급 특수 연출: 카드 둘레에서 퍼져 나가는 무지개 빛 고리 */
function ringMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRingR: { value: 0 },
      uRingA: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uRingR, uRingA;
      varying vec2 vUv;
      vec3 hsl2rgb(vec3 c) {
        vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
        return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
      }
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float a = atan(p.y, p.x);
        // 가장자리로 갈수록 옅어짐
        float ring = exp(-pow((r - uRingR) / (0.02 + 0.05 * uRingR), 2.0)) * uRingA * (1.0 - smoothstep(0.7, 1.0, r));
        vec3 col = hsl2rgb(vec3(fract(a / 6.28318 - uTime * 0.2), 0.85, 0.7)) * 1.3;
        gl_FragColor = vec4(col * ring, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

export class RevealFx {
  readonly group = new Group();
  private readonly motes = new Motes();
  private readonly ring: Mesh<PlaneGeometry, ShaderMaterial>;
  private style: RevealStyle | null = null;
  private time = 0;
  /** 이번 연출 시작 시각 (-1 = 재생 중 아님) */
  private startedAt = -1;
  /** 카드를 넘겨 연출을 거두기 시작한 시각 */
  private stoppedAt = -1;

  constructor(private readonly flashEl: HTMLElement, private readonly cardW: number, private readonly cardH: number) {
    this.ring = new Mesh(new PlaneGeometry(cardH * 2.6, cardH * 2.6), ringMaterial());
    // 카드 뭉치 전체보다 뒤 (남은 카드들이 가운데를 가리고, 고리는 가장자리 밖으로만 보인다)
    this.ring.position.z = -0.045;
    this.ring.renderOrder = 21;
    this.ring.visible = false;
    this.group.add(this.ring, this.motes.points);
    this.group.visible = false;
  }

  /** 화면 높이(px) 기준 월드 크기 → 점 크기 변환 계수 (덱 배율만큼 곱해서 넘긴다) */
  setScale(pxPerUnitAtOne: number) {
    this.motes.material.uniforms.uScale.value = pxPerUnitAtOne;
  }

  /** 첫 등장 때 셰이더 컴파일로 끊기지 않도록, 미리 컴파일하는 동안만 parent에 붙여 보이게 한다 (null이면 원래대로) */
  warmup(parent: Object3D | null) {
    if (parent) parent.add(this.group);
    else this.group.removeFromParent();
    this.group.visible = this.ring.visible = parent !== null;
  }

  /** 카드가 앞면으로 드러나는 순간 호출. card: 뒤집히는 카드의 root */
  play(card: Object3D, rarity: RarityCode, selection = false) {
    // 선택 확정은 등급과 무관하게 절제된 금빛 반짝임·입자 + 짧은 빛 번짐.
    // 기존에 제외한 카드 뒤 광선·후광은 다시 넣지 않는다.
    const st: RevealStyle | null = selection
      ? { glints: 20, color: new Color(1.9, 1.45, 0.65), rainbow: false, flash: 0.12, special: true }
      : STYLE[rarity];
    this.style = st;
    if (!st) return;
    card.add(this.group);
    this.group.visible = true;
    this.startedAt = this.time;
    this.stoppedAt = -1;

    const w = this.cardW / 2;
    const h = this.cardH / 2;
    const z = 0.02;
    const color = new Color();
    const hued = (i: number, n: number) => (st.rainbow ? color.setHSL(i / n, 0.9, 0.62).multiplyScalar(1.8) : st.color);

    // 반짝임: 카드 위 곳곳에서 조금씩 시차를 두고 켜졌다 꺼짐 (절반은 테두리 근처)
    for (let i = 0; i < st.glints; i++) {
      let x: number;
      let y: number;
      if (i % 2) {
        const side = Math.floor(Math.random() * 4);
        const s = Math.random() * 2 - 1;
        [x, y] = side < 2 ? [s * w, (side ? 1 : -1) * h] : [(side === 2 ? 1 : -1) * w, s * h];
        x *= 0.96;
        y *= 0.97;
      } else {
        x = (Math.random() * 2 - 1) * w * 0.85;
        y = (Math.random() * 2 - 1) * h * 0.88;
      }
      const start = this.time + Math.random() * 0.9;
      const size = 0.1 + Math.random() * 0.12;
      this.motes.emit(x, y, z, 0, 0, 0, hued(i, st.glints), start, 0.35 + Math.random() * 0.35, size, 0);
    }

    // 최고등급 특수 연출: 카드 테두리에서 사방으로 빛 입자가 분출
    if (st.special) {
      const n = selection ? 48 : 90;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const cx = Math.cos(a);
        const cy = Math.sin(a);
        // 방향으로 카드 외곽 위의 출발점
        const k = Math.min(w / Math.abs(cx || 1e-6), h / Math.abs(cy || 1e-6));
        const s = 0.9 + Math.random() * 1.6;
        this.motes.emit(cx * k, cy * k, z * 0.5, cx * s, cy * s, (Math.random() - 0.3) * 0.6, hued(i, n), this.time, 0.7 + Math.random() * 0.8, 0.025 + Math.random() * 0.035, 1);
      }
    }
    this.motes.commit();

    this.ring.material.uniforms.uRingA.value = 0;
    this.ring.visible = st.special && !selection;
  }

  /** 카드를 넘겼을 때: 남아 있는 반짝임·입자를 빠르게 거둔다 */
  stop() {
    if (this.startedAt >= 0 && this.stoppedAt < 0) this.stoppedAt = this.time;
  }

  update(dt: number) {
    this.time += dt;
    const st = this.style;
    if (!st || this.startedAt < 0) return;
    const t = this.time - this.startedAt;
    const out = this.stoppedAt < 0 ? 1 : 1 - smooth(0, 0.3, this.time - this.stoppedAt);

    const m = this.ring.material.uniforms;
    m.uTime.value = this.time;
    if (st.special) {
      m.uRingR.value = 1 - Math.exp(-t * 2.6);
      m.uRingA.value = (1 - smooth(0.15, 1.1, t)) * smooth(0, 0.05, t) * out;
    }
    this.motes.material.uniforms.uTime.value = this.time;
    this.motes.material.uniforms.uAlpha.value = out;

    // 화면 플래시: 순간 번쩍였다가 사그라듦
    const flash = st.flash * smooth(0, 0.05, t) * Math.exp(-Math.max(0, t - 0.05) * 5);
    this.flashEl.style.opacity = flash > 0.003 ? flash.toFixed(3) : '0';

    if (out <= 0) {
      this.startedAt = -1;
      this.group.visible = false;
      this.flashEl.style.opacity = '0';
      this.group.removeFromParent();
    }
  }
}
