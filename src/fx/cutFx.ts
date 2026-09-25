// 커팅 헤드 효과 (명세 R1): 현재 잘리는 지점의 광점 + 주변을 비추는 빛 + 스파크 파티클.
// 밝은 부분은 HDR 값(>1)으로 그려 Bloom이 번지게 한다.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  PointLight,
  Points,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { Spring } from '../core/spring';

const MAX_SPARKS = 700;

function glowTexture() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,.55)');
  g.addColorStop(0.45, 'rgba(255,255,255,.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new CanvasTexture(c);
}

class Sparks {
  readonly points: Points;
  private readonly pos = new Float32Array(MAX_SPARKS * 3);
  private readonly vel = new Float32Array(MAX_SPARKS * 3);
  private readonly life = new Float32Array(MAX_SPARKS); // 남은 수명 비율 1→0
  private readonly span = new Float32Array(MAX_SPARKS);
  private readonly size = new Float32Array(MAX_SPARKS);
  private next = 0;
  private readonly material: ShaderMaterial;

  constructor() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('aLife', new BufferAttribute(this.life, 1));
    g.setAttribute('aSize', new BufferAttribute(this.size, 1));
    this.material = new ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute float aLife;
        attribute float aSize;
        uniform float uScale;
        varying float vLife;
        void main() {
          vLife = aLife;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aLife > 0.0 ? aSize * (0.35 + 0.65 * aLife) * uScale / -mv.z : 0.0;
        }`,
      fragmentShader: /* glsl */ `
        varying float vLife;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          // 막 튄 불티는 흰빛, 식으면서 금색 → 주황
          vec3 hot = vec3(1.0, 0.95, 0.85);
          vec3 warm = vec3(1.0, 0.62, 0.22);
          vec3 col = mix(warm, hot, vLife * vLife) * (1.2 + 4.0 * vLife);
          gl_FragColor = vec4(col * a * vLife, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }

  /** 화면 높이(px) 기준 월드 크기 → 점 크기 변환 계수 */
  setScale(pxPerUnitAtOne: number) {
    this.material.uniforms.uScale.value = pxPerUnitAtOne;
  }

  /** p 위치에서 n개 방출. dir: 커팅 진행 방향(-1/1) */
  emit(p: Vector3, n: number, dir: number, power: number) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX_SPARKS;
      // 진행 반대쪽 뒤로 + 위·앞쪽으로 튄다
      const a = Math.random() * Math.PI * 2;
      const s = (0.4 + Math.random() * 1.4) * power;
      this.pos.set([p.x, p.y, p.z], i * 3);
      this.vel[i * 3] = -dir * s * (0.3 + Math.random() * 0.9) + Math.cos(a) * 0.35 * s;
      this.vel[i * 3 + 1] = s * (0.2 + Math.random() * 1.1);
      this.vel[i * 3 + 2] = s * (0.35 + Math.random() * 0.8);
      this.span[i] = 0.25 + Math.random() * 0.45;
      this.life[i] = 1;
      this.size[i] = 0.012 + Math.random() * 0.02;
    }
  }

  update(dt: number) {
    const drag = Math.exp(-2.2 * dt);
    for (let i = 0; i < MAX_SPARKS; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] = Math.max(0, this.life[i] - dt / this.span[i]);
      this.vel[i * 3 + 1] -= 5.5 * dt;
      for (let k = 0; k < 3; k++) {
        this.vel[i * 3 + k] *= drag;
        this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      }
    }
    const g = this.points.geometry;
    g.getAttribute('position').needsUpdate = true;
    g.getAttribute('aLife').needsUpdate = true;
    g.getAttribute('aSize').needsUpdate = true;
  }
}

export class CutFx {
  readonly group = new Group();
  private readonly halo: Sprite;
  private readonly core: Sprite;
  private readonly light: PointLight;
  private readonly sparks = new Sparks();
  private readonly strength = new Spring(0, 5, 0.9);
  private readonly pos = new Vector3();
  private carry = 0;
  private time = 0;

  constructor() {
    const tex = glowTexture();
    const mat = (c: Color) =>
      new SpriteMaterial({ map: tex, color: c, blending: AdditiveBlending, depthTest: false, depthWrite: false });
    this.halo = new Sprite(mat(new Color(2.2, 1.35, 0.55)));
    this.core = new Sprite(mat(new Color(6, 5.2, 4)));
    this.halo.renderOrder = this.core.renderOrder = 30;
    this.light = new PointLight('#ffcf8a', 0, 0.9, 2);
    this.group.add(this.halo, this.core, this.light, this.sparks.points);
  }

  setScale(pxPerUnitAtOne: number) {
    this.sparks.setScale(pxPerUnitAtOne);
  }

  /**
   * 매 프레임 호출.
   * head: 커팅 헤드 월드 위치 (null이면 꺼짐), paused: 밴드 밖으로 벗어나 멈춘 상태
   */
  update(dt: number, head: Vector3 | null, paused: boolean) {
    this.time += dt;
    this.strength.target = head ? (paused ? 0.35 : 1) : 0;
    const s = this.strength.step(dt);
    // 손가락 위치를 지연 없이 그대로 (명세 R1: 체감 지연 없음). 꺼질 때는 마지막 위치에서 사그라듦
    if (head) this.pos.copy(head);
    const flicker = 1 + 0.12 * Math.sin(this.time * 47) * Math.sin(this.time * 31);
    const k = Math.max(0, s) * flicker;
    this.halo.position.copy(this.pos);
    this.core.position.copy(this.pos);
    this.halo.scale.setScalar(0.34 * k + 0.001);
    this.core.scale.setScalar(0.085 * k + 0.001);
    this.halo.visible = this.core.visible = k > 0.01;
    this.light.position.copy(this.pos).z += 0.14;
    this.light.intensity = 0.09 * k;
    this.sparks.update(dt);
  }

  /** 절단이 du(폭 비율)만큼 진행됐을 때 불티 방출 */
  spray(du: number, dir: number, speed: number) {
    this.carry += du * 900;
    const n = Math.floor(this.carry);
    this.carry -= n;
    if (n > 0) this.sparks.emit(this.pos, Math.min(n, 40), dir, 0.6 + Math.min(1.6, speed * 0.25));
  }

  /** 개봉 완료 순간 한 번 크게 */
  burst(p: Vector3) {
    this.sparks.emit(p, 90, 0, 2.2);
  }
}
