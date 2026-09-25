// 카드 1장: 둥근 모서리의 얇은 판 (앞면 / 뒷면 / 옆면 재질 분리).
// 움직임은 모두 스프링 (명세 R7). 계층: root(위치·기울기) → flipper(앞뒤 뒤집기, y축 회전) → mesh
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Material,
  type Texture,
} from 'three';
import { CARD } from '../../design/lib/card.js';
import { Spring } from '../core/spring';
import { applyHoloFront, applyRimGlow, RARITY_STYLE, type RarityCode } from './holo';

/** 월드 단위 카드 크기 (팩 안에 들어가는 크기 기준. 보여줄 때는 덱 전체를 키운다) */
export const CARD_W = 1;
export const CARD_H = (CARD_W * CARD.H) / CARD.W;
const RADIUS = (CARD_W * CARD.R) / CARD.W;
export const CARD_T = 0.0035; // 두께

/** 둥근 사각 판. groups: 0 = 앞면(+z), 1 = 뒷면(-z), 2 = 옆면 */
function cardGeometry(w: number, h: number, r: number, t: number, seg = 8): BufferGeometry {
  // 외곽선 (반시계 방향)
  const ring: [number, number, number, number][] = []; // x, y, 법선 x, 법선 y
  const corners = [
    [w / 2 - r, h / 2 - r],
    [-w / 2 + r, h / 2 - r],
    [-w / 2 + r, -h / 2 + r],
    [w / 2 - r, -h / 2 + r],
  ];
  corners.forEach(([cx, cy], k) => {
    for (let i = 0; i <= seg; i++) {
      const a = ((k + i / seg) * Math.PI) / 2;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      ring.push([cx + r * nx, cy + r * ny, nx, ny]);
    }
  });
  const n = ring.length;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const z = t / 2;

  // 앞면: 중심에서 부채꼴 (볼록 도형이라 가능)
  const cap = (side: 1 | -1) => {
    const base = pos.length / 3;
    const u = (x: number) => (side === 1 ? x / w + 0.5 : 0.5 - x / w); // 뒷면은 뒤에서 봤을 때 바르게 읽히도록
    pos.push(0, 0, side * z);
    nor.push(0, 0, side);
    uv.push(0.5, 0.5);
    for (const [x, y] of ring) {
      pos.push(x, y, side * z);
      nor.push(0, 0, side);
      uv.push(u(x), y / h + 0.5);
    }
    const start = idx.length;
    for (let i = 0; i < n; i++) {
      const a = base + 1 + i;
      const b = base + 1 + ((i + 1) % n);
      if (side === 1) idx.push(base, a, b);
      else idx.push(base, b, a);
    }
    return { start, count: idx.length - start };
  };
  const front = cap(1);
  const back = cap(-1);

  // 옆면
  const base = pos.length / 3;
  for (const [x, y, nx, ny] of ring) {
    pos.push(x, y, z, x, y, -z);
    nor.push(nx, ny, 0, nx, ny, 0);
    uv.push(0, 0, 0, 1);
  }
  const edgeStart = idx.length;
  for (let i = 0; i < n; i++) {
    const a = base + i * 2;
    const b = base + ((i + 1) % n) * 2;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.addGroup(front.start, front.count, 0);
  g.addGroup(back.start, back.count, 1);
  g.addGroup(edgeStart, idx.length - edgeStart, 2);
  return g;
}

let sharedGeometry: BufferGeometry | null = null;
let sharedEdge: Material | null = null;
/** 뒷면 텍스처는 모든 카드가 공유하지만, 테두리 암시 발광은 등급별로 달라 재질은 (텍스처, 등급) 쌍으로 캐시 */
const backMaterials = new Map<string, Material>();

/** 등급별 인쇄 카드 재질 (명세 R6·R9, M4): 금속감·클리어코트 + 홀로/테두리 발광 */
function printMaterial(map: Texture, rarity: RarityCode, face: 'front' | 'back') {
  const style = RARITY_STYLE[rarity];
  const mat = new MeshPhysicalMaterial({
    map,
    roughness: style.roughness,
    metalness: style.metalness,
    clearcoat: style.clearcoat,
    clearcoatRoughness: style.clearcoatRoughness,
    emissive: 0x000000,
  });
  if (face === 'front') applyHoloFront(mat, rarity);
  else applyRimGlow(mat, rarity);
  return mat;
}

export class Card {
  readonly root = new Group();
  readonly flipper = new Group();
  readonly mesh: Mesh;

  // 덱 기준 위치·기울기
  readonly x = new Spring(0, 2.6, 0.72);
  readonly y = new Spring(0, 2.6, 0.72);
  readonly z = new Spring(0, 3, 0.9);
  /** 화면 평면 회전 (z축) */
  readonly roll = new Spring(0, 3.2, 0.62);
  /** 좌우로 기우는 회전 (y축) — 드래그 방향 */
  readonly lean = new Spring(0, 4, 0.62);
  /** 앞뒤로 기우는 회전 (x축) */
  readonly pitch = new Spring(0, 4, 0.62);
  /** 뒤집기 각도 (y축). π = 뒷면이 보임, 0 또는 2π = 앞면이 보임 */
  readonly flip = new Spring(Math.PI, 1.55, 0.74);

  /** 넘겨져 화면 밖으로 날아가는 중 (덱 로컬 속도, 카드 폭/초) */
  flight: { vx: number; vy: number; age: number } | null = null;

  constructor(front: Texture, back: Texture, rarity: RarityCode) {
    sharedGeometry ??= cardGeometry(CARD_W, CARD_H, RADIUS, CARD_T);
    sharedEdge ??= new MeshStandardMaterial({ color: '#e8dcc6', roughness: 0.75 });
    const backKey = `${back.uuid}:${rarity}`;
    let backMat = backMaterials.get(backKey);
    if (!backMat) backMaterials.set(backKey, (backMat = printMaterial(back, rarity, 'back')));
    this.mesh = new Mesh(sharedGeometry, [printMaterial(front, rarity, 'front'), backMat, sharedEdge]);
    this.flipper.rotation.y = Math.PI;
    this.flipper.add(this.mesh);
    this.root.add(this.flipper);
  }

  get faceUp() {
    return Math.abs(this.flip.target - Math.PI) > 1;
  }

  /** 앞면으로 뒤집기. dir: +1 = 왼쪽 가장자리가 들리며 오른쪽으로 넘어감 */
  turnOver(dir: number) {
    if (this.faceUp) return;
    this.flip.target = Math.PI + (dir >= 0 ? 1 : -1) * Math.PI;
  }

  /** 뒤집기 진행도 0(뒷면) → 1(앞면) */
  get flipProgress() {
    return Math.min(1, Math.abs(this.flip.value - Math.PI) / Math.PI);
  }

  /**
   * 기울거나 뒤집히는 동안 아래 카드를 뚫고 들어가지 않도록 들어 올릴 높이.
   * 판의 반폭·반높이가 회전으로 z 방향에 차지하는 만큼 + 뒤집을 때 살짝 떠오르는 궤적.
   */
  clearance() {
    const turn = Math.abs(Math.sin(this.flip.value)) + Math.abs(Math.sin(this.lean.value));
    const arc = Math.sin(Math.PI * this.flipProgress) * 0.12;
    return (CARD_W / 2) * turn + (CARD_H / 2) * Math.abs(Math.sin(this.pitch.value)) + arc;
  }

  /** 놓은 속도 그대로 날려 보낸다. 날아가는 방향으로 돌고 기울어짐 */
  fling(vx: number, vy: number) {
    this.flight = { vx, vy, age: 0 };
    const side = Math.sign(vx) || 1;
    this.roll.target = this.roll.value - side * 0.55;
    this.lean.target = side * 0.45;
    this.z.target = this.z.value + 0.06; // 다음 카드 위로 지나가도록
  }

  step(dt: number) {
    const f = this.flight;
    if (f) {
      f.age += dt;
      this.x.snap(this.x.value + f.vx * dt);
      this.y.snap(this.y.value + f.vy * dt);
    }
    for (const s of [this.x, this.y, this.z, this.roll, this.lean, this.pitch, this.flip]) s.step(dt);
    this.root.position.set(this.x.value, this.y.value, this.z.value + this.clearance());
    this.root.rotation.set(this.pitch.value, this.lean.value, this.roll.value);
    this.flipper.rotation.y = this.flip.value;
  }
}
