// 3D 카드팩: 앞·뒤 두 장의 곡면이 좌우 접힌 가장자리와 상·하단 봉합부에서 만나는 "베개" 형태.
// M2(절취)에서 윗부분/본체를 나누기 쉽도록 곡면은 v 구간을 받아 만들 수 있게 해 둔다.
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  Vector2,
} from 'three';
import { PACK } from '../../design/lib/pack.js';
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
function thickness(u: number, v: number) {
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

export function packSurface(side: 1 | -1, v0 = 0, v1 = 1, segX = 72, segY = 140): BufferGeometry {
  const ny = Math.max(2, Math.round(segY * (v1 - v0)));
  const pos = new Float32Array((segX + 1) * (ny + 1) * 3);
  const uv = new Float32Array((segX + 1) * (ny + 1) * 2);
  for (let j = 0, p = 0, q = 0; j <= ny; j++) {
    const v = v0 + ((v1 - v0) * j) / ny;
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

export class Pack {
  readonly root = new Group();
  readonly front: Mesh;
  readonly back: Mesh;

  constructor(tex: PackTextures) {
    this.front = new Mesh(packSurface(1), packMaterial(tex.front));
    this.back = new Mesh(packSurface(-1), packMaterial(tex.back));
    this.root.add(this.front, this.back);
  }
}
