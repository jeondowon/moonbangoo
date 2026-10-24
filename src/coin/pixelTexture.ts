// 코드로 그리는 작은 텍스처 도우미 (배경·코인 그림자·손 빛무리가 같이 쓴다).
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';

export type Rgb = [number, number, number];
export const rgb = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

type Rgba = readonly [number, number, number, number]; // rgb 0~255, a 0~1

/**
 * 픽셀마다 계산해 텍스처를 만든다 (x·y는 위에서부터 센 픽셀 가운데 좌표).
 * 2D 캔버스로 그리지 않는다: iOS WebKit은 캔버스를 텍스처로 올릴 때 추적 방지 잡음을 섞어, 옅은 부분이 무지갯빛 점으로 보인다.
 */
export function pixelTexture(w: number, h: number, pixel: (x: number, y: number) => Rgba) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5);
      const i = ((h - 1 - y) * w + x) * 4; // 캔버스처럼 첫 줄이 텍스처 위쪽
      data[i] = Math.round(r);
      data[i + 1] = Math.round(g);
      data[i + 2] = Math.round(b);
      data[i + 3] = Math.round(a * 255);
    }
  }
  const t = new DataTexture(data, w, h);
  t.colorSpace = SRGBColorSpace;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** 가운데에서 바깥으로 갈수록 투명해지는 원 (캔버스 원형 그라데이션과 같은 모양). stops: [반지름 비율, 불투명도] */
export function radialAlpha(d: number, stops: readonly (readonly [number, number])[]) {
  if (d <= stops[0][0]) return stops[0][1];
  const i = stops.findIndex((s) => s[0] >= d);
  if (i < 0) return stops[stops.length - 1][1];
  const [d0, a0] = stops[i - 1];
  const [d1, a1] = stops[i];
  return a0 + ((a1 - a0) * (d - d0)) / (d1 - d0);
}
