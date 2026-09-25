// 스프링 솔버 (명세 R7: 모든 움직임은 스프링 기반, 선형 트윈 금지).
// 고정 서브스텝(1/240s) 반암시적 오일러 → 프레임레이트가 달라도 같은 궤적.

const SUBSTEP = 1 / 240;

export class Spring {
  value: number;
  target: number;
  velocity = 0;
  private k: number;
  private c: number;

  /** freq: 고유 진동수(Hz), zeta: 감쇠비(1 = 임계감쇠, <1 = 살짝 튕김) */
  constructor(value = 0, freq = 2, zeta = 0.8) {
    this.value = value;
    this.target = value;
    const w = 2 * Math.PI * freq;
    this.k = w * w;
    this.c = 2 * zeta * w;
  }

  set(freq: number, zeta: number) {
    const w = 2 * Math.PI * freq;
    this.k = w * w;
    this.c = 2 * zeta * w;
    return this;
  }

  /** 위치를 즉시 옮긴다 (속도 초기화) */
  snap(v: number) {
    this.value = this.target = v;
    this.velocity = 0;
  }

  step(dt: number) {
    let t = dt;
    while (t > 1e-6) {
      const h = Math.min(SUBSTEP, t);
      const a = -this.k * (this.value - this.target) - this.c * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
      t -= h;
    }
    return this.value;
  }
}
