// 3D 카드팩: 앞·뒤 두 장의 곡면이 좌우 접힌 가장자리와 상·하단 봉합부에서 만나는 "베개" 형태.
// 절취선 기준으로 윗조각(top)과 본체(body)로 나뉘어 있고, 둘은 같은 찢김 곡선에서 맞물린다 (tearShader.ts).
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  Vector2,
  Vector3,
} from 'three';
import { PACK } from '../../design/lib/pack.js';
import { TEAR_V, TearState } from './tear';
import { applyTear, createTearUniforms, type TearPiece, type TearUniforms } from './tearShader';
import type { PackTextures, SideTextures } from './textures';

/** 월드 단위 팩 크기 (높이 2) */
export const PACK_H = 2;
export const PACK_W = (PACK_H * PACK.W) / PACK.H;

const HALF_THICK = 0.034; // 가운데 부푼 두께의 절반 (실물 약 4% 두께감)
const FOLD = 0.055; // 좌우 접힌 가장자리의 둥근 폭 (u 비율)
const TAPER = 0.1; // 봉합부에서 최대 두께까지 부풀어 오르는 구간 (v 비율)
const SEAL_GAP = 0.0012; // 봉합부 앞뒤 사이 틈 (z 파이팅 방지)

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 표면 높이 (u: 0=왼쪽, v: 0=위쪽) */
export function thickness(u: number, v: number) {
  const c = PACK.crimp / PACK.H;
  const d = Math.min(u, 1 - u);
  const fx = d >= FOLD ? 1 : Math.sqrt(1 - (1 - d / FOLD) ** 2);
  const tv = Math.min(v, 1 - v);
  const fy = smooth(c, c + TAPER, tv);
  // 속이 찬 카드 뭉치 위로 포장지가 살짝 더 부푼 느낌
  const puff = 0.88 + 0.12 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
  return SEAL_GAP + (HALF_THICK - SEAL_GAP) * fx * fy * puff;
}

/** 가장자리 쪽에 정점을 더 촘촘히 (접힌 곡면 해상도 확보) */
const denseEdges = (t: number) => t - (0.55 * Math.sin(2 * Math.PI * t)) / (2 * Math.PI);

const SEG_X = 72;
const SEG_Y = 140;

/**
 * 팩 곡면 (v0~v1 구간). 행은 전역 격자(1/SEG_Y)에 맞춘다
 * → 윗조각·본체가 겹치는 구간의 삼각형이 완전히 같아서, 찢김 곡선 양쪽이 픽셀 단위로 딱 맞물린다.
 */
export function packSurface(side: 1 | -1, v0 = 0, v1 = 1, segX = SEG_X, segY = SEG_Y): BufferGeometry {
  const j0 = Math.floor(v0 * segY);
  const ny = Math.ceil(v1 * segY) - j0;
  const pos = new Float32Array((segX + 1) * (ny + 1) * 3);
  const uv = new Float32Array((segX + 1) * (ny + 1) * 2);
  for (let j = 0, p = 0, q = 0; j <= ny; j++) {
    const v = (j0 + j) / segY;
    for (let i = 0; i <= segX; i++) {
      const u = denseEdges(i / segX);
      pos[p++] = (u - 0.5) * PACK_W;
      pos[p++] = (0.5 - v) * PACK_H;
      pos[p++] = side * thickness(u, v);
      // 뒷면은 뒤에서 봤을 때 바르게 읽히도록 좌우 반전
      uv[q++] = side === 1 ? u : 1 - u;
      uv[q++] = 1 - v;
    }
  }
  const idx: number[] = [];
  const row = segX + 1;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      if (side === 1) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function packMaterial(t: SideTextures) {
  return new MeshPhysicalMaterial({
    map: t.albedo,
    roughnessMap: t.orm,
    metalnessMap: t.orm,
    roughness: 1,
    metalness: 1,
    normalMap: t.normal,
    normalScale: new Vector2(1, 1),
    // 포장 필름의 얇은 광택층 (주름은 따라가되 박 눌림은 덮음)
    clearcoat: 0.35,
    clearcoatRoughness: 0.3,
    clearcoatNormalMap: t.normal,
    clearcoatNormalScale: new Vector2(0.35, 0.35),
    // 펄 포장지의 은은한 무지갯빛
    iridescence: 0.12,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [220, 480],
    alphaTest: 0.5,
    alphaToCoverage: true,
  });
}

/** 윗조각·본체가 겹쳐 만들어지는 여유 폭 (찢김 요철 + 틈보다 넉넉히) */
const OVERLAP = 0.03;
const GRAVITY = 14;

/** 팩 좌표 (u, v) → 팩 로컬 x, y */
export const packX = (u: number) => (u - 0.5) * PACK_W;
export const packY = (v: number) => (0.5 - v) * PACK_H;

/** 절취선 높이에서 앞면 표면의 z (입력 판정용 평면) */
export const TEAR_Z = thickness(0.5, TEAR_V);

interface Flight {
  pivot: Group;
  vel: Vector3;
  spin: Vector3;
  age: number;
}

export class Pack {
  /** 팩 전체 (무대의 자식) */
  readonly root = new Group();
  /** 절취선 위 조각 — 개봉 완료 시 날아간다 */
  readonly top = new Group();
  readonly body = new Group();
  readonly tear = new TearState();
  readonly uniforms: TearUniforms;
  private flight: Flight | null = null;

  constructor(tex: PackTextures) {
    this.uniforms = createTearUniforms(this.tear.texture);
    const surface = (side: 1 | -1, piece: TearPiece) => {
      const [v0, v1] = piece === 'top' ? [0, TEAR_V + OVERLAP] : [TEAR_V - OVERLAP, 1];
      const mat = packMaterial(side === 1 ? tex.front : tex.back);
      applyTear(mat, this.uniforms, { piece, flipU: side === -1, side, guide: side === 1 });
      return new Mesh(packSurface(side, v0, v1), mat);
    };
    this.top.add(surface(1, 'top'), surface(-1, 'top'));
    this.body.add(surface(1, 'body'), surface(-1, 'body'));

    // 속지: 틈 사이로 보이는 팩 안쪽 (실물처럼 은박 안감)
    const lining = new MeshStandardMaterial({ color: '#b9b4ac', metalness: 1, roughness: 0.38 });
    applyTear(lining, this.uniforms, { piece: 'body', flipU: false, side: 0, guide: false });
    const inside = new Mesh(flatStrip(TEAR_V - OVERLAP, TEAR_V + 0.06), lining);
    this.body.add(inside);

    this.root.add(this.top, this.body);
  }

  get opened() {
    return this.flight !== null;
  }

  /**
   * 윗조각을 떼어 world(보통 scene)로 옮기고 날려 보낸다.
   * vel: 월드 속도, spin: 각속도(rad/s, 로컬 x·y·z)
   */
  detachTop(world: Object3D, vel: Vector3, spin: Vector3) {
    if (this.flight) return;
    // 윗조각 중심을 회전축으로
    const pivot = new Group();
    pivot.position.set(0, packY(TEAR_V / 2), TEAR_Z * 0.5);
    this.root.add(pivot);
    pivot.attach(this.top);
    world.attach(pivot);
    this.flight = { pivot, vel: vel.clone(), spin: spin.clone(), age: 0 };
  }

  update(dt: number, time: number) {
    this.tear.update(time);
    this.uniforms.uTime.value = time;
    const f = this.flight;
    if (!f || !f.pivot.visible) return;
    f.age += dt;
    f.vel.y -= GRAVITY * dt;
    f.vel.multiplyScalar(Math.exp(-0.25 * dt)); // 공기 저항
    f.pivot.position.addScaledVector(f.vel, dt);
    f.pivot.rotateX(f.spin.x * dt);
    f.pivot.rotateY(f.spin.y * dt);
    f.pivot.rotateZ(f.spin.z * dt);
    if (f.age > 3) f.pivot.visible = false;
  }
}

/** 두 장 사이 z=0에 놓이는 평평한 띠 (팩과 같은 uv 규칙) */
function flatStrip(v0: number, v1: number) {
  const g = packSurface(1, v0, v1, 36, SEG_Y);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setZ(i, 0);
  g.computeVertexNormals();
  return g;
}
