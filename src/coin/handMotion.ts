import { smooth } from '../core/math';

/** 충돌마다 같은 손동작을 처음부터 재생한다. 비행당 1회 제한은 두지 않는다. */
export class HandMotion {
  private elapsed = Infinity;
  private approach = 0;

  strike() {
    this.elapsed = 0;
    this.approach = 0;
  }

  reset() {
    this.elapsed = Infinity;
    this.approach = 0;
  }

  step(dt: number, gap: number, rising: boolean) {
    this.elapsed += dt;
    const t = this.elapsed;
    const playing = t < 0.95;
    const opacity = playing ? 1 - smooth(0.45, 0.95, t) : 0;
    const release = smooth(0.12, 0.3, t);
    const target = !playing && rising ? 1 - smooth(0.5, 4, gap) : 0;
    this.approach += (target - this.approach) * (1 - Math.exp(-dt * 18));
    const ready = playing ? 0 : this.approach < 0.001 ? 0 : this.approach;
    return {
      ready,
      contact: playing ? opacity * (1 - release) : 0,
      release: playing ? opacity * release : 0,
      retreat: playing ? smooth(0.32, 0.95, t) : 1 - ready,
      flash: playing ? 1 - smooth(0.03, 0.2, t) : 0,
      ripple: playing ? 1 - smooth(0, 0.7, t) : 0,
    };
  }
}
