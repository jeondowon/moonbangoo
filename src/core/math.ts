// 여러 모듈이 같이 쓰는 작은 수학 함수.

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** GLSL smoothstep과 같은 곡선 (a~b 구간에서 0→1) */
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
