// 절취 진행 상태 (명세 R1). 절취선을 BINS칸으로 나눠 각 칸이 잘린 시각을 기록한다.
//   - 손가락이 허용 밴드 안에서 지나간 칸만 잘림 → "손가락이 도달한 위치까지만" 1:1로 잘린다
//   - 좌→우, 우→좌, 중간에서 시작, 떼었다가 이어 자르기 모두 같은 방식으로 처리
// 셰이더에는 1×BINS 텍스처로 전달: R = 벌어진 정도(틈·종이 단면), G = 잔광(최근에 잘린 곳일수록 밝음)
import { DataTexture, LinearFilter, RGBAFormat } from 'three';
import { PACK } from '../../design/lib/pack.js';

/** 절취선 위치 (팩 위에서부터의 비율, 시안의 PACK.tear) */
export const TEAR_V = PACK.tear / PACK.H;

export const TEAR_BINS = 256;
const BINS = TEAR_BINS;
const OPEN_TIME = 0.12; // 잘린 뒤 틈이 다 벌어지기까지(s)
const GLOW_TIME = 0.5; // 잔광이 사라지는 시간 상수(s)

export class TearState {
  readonly texture: DataTexture;
  private readonly cutAt = new Float32Array(BINS).fill(-1);
  private readonly data = new Uint8Array(BINS * 4);
  private count = 0;

  constructor() {
    this.texture = new DataTexture(this.data, BINS, 1, RGBAFormat);
    this.texture.minFilter = this.texture.magFilter = LinearFilter;
    this.texture.needsUpdate = true;
  }

  /** 잘린 비율 0~1 */
  get progress() {
    return this.count / BINS;
  }

  /** u0~u1 구간(팩 폭 비율)을 잘림으로 표시. 새로 잘린 칸 수를 반환 */
  cut(u0: number, u1: number, time: number): number {
    const i0 = Math.max(0, Math.floor(Math.min(u0, u1) * BINS));
    const i1 = Math.min(BINS - 1, Math.floor(Math.max(u0, u1) * BINS));
    let n = 0;
    for (let i = i0; i <= i1; i++) {
      if (this.cutAt[i] >= 0) continue;
      this.cutAt[i] = time;
      n++;
    }
    this.count += n;
    return n;
  }

  /** 남은 칸을 fromU에서 양쪽으로 speed(폭/초) 속도로 마저 찢는다 (95% 이후 자동 완료) */
  finish(fromU: number, time: number, speed: number) {
    for (let i = 0; i < BINS; i++) {
      if (this.cutAt[i] >= 0) continue;
      this.cutAt[i] = time + Math.abs((i + 0.5) / BINS - fromU) / speed;
    }
    this.count = BINS;
  }

  update(time: number) {
    let changed = false;
    for (let i = 0; i < BINS; i++) {
      const age = time - this.cutAt[i];
      const cut = this.cutAt[i] >= 0 && age >= 0;
      const open = cut ? Math.min(1, age / OPEN_TIME) : 0;
      const glow = cut ? Math.exp(-age / GLOW_TIME) : 0;
      // Uint8Array에 저장될 값(소수점 버림)으로 비교
      const r = Math.trunc(open * 255);
      const g = Math.trunc(glow * 255);
      if (this.data[i * 4] !== r || this.data[i * 4 + 1] !== g) {
        this.data[i * 4] = r;
        this.data[i * 4 + 1] = g;
        changed = true;
      }
    }
    // 값이 바뀐 프레임에만 GPU로 올린다 (자르기 전·잔광이 다 식은 뒤에는 그대로)
    if (changed) this.texture.needsUpdate = true;
  }
}
