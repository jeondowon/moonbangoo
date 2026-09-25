// 높이맵(Float32) 연산 → 노멀맵 캔버스. 종이결·주름·박 눌림·크림프 골을 한 장의 노멀맵으로 합친다.

export class HeightField {
  readonly data: Float32Array;

  constructor(readonly w: number, readonly h: number) {
    this.data = new Float32Array(w * h);
  }

  clone() {
    const c = new HeightField(this.w, this.h);
    c.data.set(this.data);
    return c;
  }

  /** f(x, y) → 더할 높이. 픽셀 좌표 기준 */
  add(f: (x: number, y: number) => number) {
    const { w, h, data } = this;
    for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) data[i] += f(x, y);
  }

  /** 노멀맵 (탄젠트 공간, +Y = 텍스처 위쪽 / three.js 기본 flipY 기준) */
  toNormalCanvas(strength: number): HTMLCanvasElement {
    const { w, h, data } = this;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    const out = img.data;
    for (let y = 0; y < h; y++) {
      const up = (y > 0 ? y - 1 : y) * w;
      const dn = (y < h - 1 ? y + 1 : y) * w;
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const l = x > 0 ? x - 1 : x;
        const r = x < w - 1 ? x + 1 : x;
        const nx = -(data[row + r] - data[row + l]) * strength;
        const ny = (data[dn + x] - data[up + x]) * strength;
        const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
        const o = (row + x) * 4;
        out[o] = (nx * inv * 0.5 + 0.5) * 255;
        out[o + 1] = (ny * inv * 0.5 + 0.5) * 255;
        out[o + 2] = (inv * 0.5 + 0.5) * 255;
        out[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
}

/** 캔버스의 R 채널을 0~1 배열로 (마스크 읽기용) */
export function readChannel(canvas: HTMLCanvasElement): Float32Array {
  const { width: w, height: h } = canvas;
  const src = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = src[i * 4] / 255;
  return out;
}

/** 분리형 박스 블러 (2회 적용하면 가우시안에 가까움) */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / n;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

function hash(ix: number, iy: number, seed: number) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 값 노이즈 0~1 (결정적 — 새로고침해도 주름 모양이 같다) */
export function valueNoise(x: number, y: number, seed = 1) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** 픽셀 단위 백색 노이즈 (종이결) */
export function whiteNoise(x: number, y: number, seed = 7) {
  return hash(x, y, seed);
}
