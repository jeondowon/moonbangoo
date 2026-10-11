// 절취 진행 상태 (명세 R1). 절취선을 BINS칸으로 나눠 각 칸이 잘린 시각을 기록한다.
//   - 손가락이 허용 밴드 안에서 지나간 칸만 잘림 → "손가락이 도달한 위치까지만" 1:1로 잘린다
//   - 좌→우, 우→좌, 중간에서 시작, 떼었다가 이어 자르기 모두 같은 방식으로 처리
//   - 칸마다 손가락이 지나간 높이를 기록 → 그은 경로 그대로 잘린다. 아직 안 잘린 칸은 잘린 칸 사이를 직선으로 잇는다
// 셰이더에는 1×BINS 텍스처로 전달: R = 벌어진 정도(틈·단면), G = 잔광(최근에 잘린 곳일수록 밝음),
//   B = 절취선 높이 (TEAR_V 기준 ±TEAR_MAX_DEV를 128±127로)
import { DataTexture, LinearFilter, RGBAFormat } from 'three';
import { PACK } from '../../design/lib/pack.js';

/** 기본 절취선 위치 (팩 위에서부터의 비율, 시안의 PACK.tear) */
export const TEAR_V = PACK.tear / PACK.H;
/** 절취선이 기본 위치에서 벗어날 수 있는 최대 폭 (= 허용 밴드, 휴대폰에서 약 ±30px) */
export const TEAR_MAX_DEV = 0.05;
/** 아래쪽으로는 이만큼만 내려간다. 팩 안 카드 윗변(deck.ts IN_TOP_V = 0.16)보다 위에서 잘려야 카드가 비치지 않는다 */
export const TEAR_MAX_DOWN = 0.015;

export const TEAR_BINS = 256;
const BINS = TEAR_BINS;
const OPEN_TIME = 0.12; // 잘린 뒤 틈이 다 벌어지기까지(s)
const GLOW_TIME = 0.5; // 잔광이 사라지는 시간 상수(s)

export class TearState {
  readonly texture: DataTexture;
  private readonly cutAt = new Float32Array(BINS).fill(-1);
  private readonly data = new Uint8Array(BINS * 4);
  /** 칸별 절취선 높이 (텍스처에 저장된 값과 같게 양자화) */
  private readonly lineAt = new Float32Array(BINS).fill(TEAR_V);
  private count = 0;

  constructor() {
    for (let i = 0; i < BINS; i++) this.data[i * 4 + 2] = 128;
    this.texture = new DataTexture(this.data, BINS, 1, RGBAFormat);
    this.texture.minFilter = this.texture.magFilter = LinearFilter;
    this.texture.needsUpdate = true;
  }

  /** 잘린 비율 0~1 */
  get progress() {
    return this.count / BINS;
  }

  /** 절취선 위 u 지점의 높이 v (셰이더의 선형 보간과 같은 방식) */
  lineV(u: number) {
    const x = Math.max(0, Math.min(BINS - 1, u * BINS - 0.5));
    const i = Math.floor(x);
    const j = Math.min(BINS - 1, i + 1);
    return this.lineAt[i] + (this.lineAt[j] - this.lineAt[i]) * (x - i);
  }

  /**
   * (u0, v0)~(u1, v1) 구간을 잘림으로 표시하고, 새로 잘린 칸에는 그 사이 손가락 높이를 기록한다.
   * 새로 잘린 칸 수를 반환
   */
  cut(u0: number, u1: number, time: number, v0 = TEAR_V, v1 = v0): number {
    const i0 = Math.max(0, Math.floor(Math.min(u0, u1) * BINS));
    const i1 = Math.min(BINS - 1, Math.floor(Math.max(u0, u1) * BINS));
    let n = 0;
    for (let i = i0; i <= i1; i++) {
      if (this.cutAt[i] >= 0) continue;
      this.cutAt[i] = time;
      const t = u1 === u0 ? 1 : Math.max(0, Math.min(1, ((i + 0.5) / BINS - u0) / (u1 - u0)));
      this.setLine(i, v0 + (v1 - v0) * t);
      n++;
    }
    if (n > 0) this.bridge();
    this.count += n;
    return n;
  }

  private setLine(i: number, v: number) {
    v = Math.min(v, TEAR_V + TEAR_MAX_DOWN);
    const b = Math.max(1, Math.min(255, 128 + Math.round(((v - TEAR_V) / TEAR_MAX_DEV) * 127)));
    this.data[i * 4 + 2] = b;
    this.lineAt[i] = TEAR_V + ((b - 128) / 127) * TEAR_MAX_DEV;
    this.texture.needsUpdate = true;
  }

  /** 안 잘린 칸은 양옆 잘린 칸 사이를 직선으로 잇고, 바깥쪽은 끝 높이를 그대로 이어간다 (자동 완료 시 그 선대로 잘림) */
  private bridge() {
    let prev = -1;
    for (let i = 0; i <= BINS; i++) {
      if (i < BINS && this.cutAt[i] < 0) continue;
      if (i - prev > 1 && (prev >= 0 || i < BINS)) {
        const a = prev >= 0 ? this.lineAt[prev] : this.lineAt[i];
        const b = i < BINS ? this.lineAt[i] : this.lineAt[prev];
        for (let k = prev + 1; k < i; k++) this.setLine(k, a + ((b - a) * (k - prev)) / (i - prev));
      }
      prev = i;
    }
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
