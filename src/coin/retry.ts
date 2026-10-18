import { smooth } from '../core/math';
import { heightFor } from './altitude';
import { CoinSim, COIN_T, type CoinEvent } from './physics';

export const VALID_M = 500;
export const VALID_HEIGHT = heightFor(VALID_M);
const RETURN_TIME = 0.6;

/** 유효 고도에 닿지 못하면 첫 바닥 충돌에서 코인과 시작 위치 코인을 교차 페이드한다. */
export class CoinRetry {
  climb = 0;
  private elapsed: number | null = null;
  get active() { return this.elapsed !== null; }
  get waitingOpacity() {
    return this.elapsed === null ? 1 : smooth(0, RETURN_TIME, this.elapsed);
  }
  get thrownOpacity() {
    return this.elapsed === null ? 0 : 1 - this.waitingOpacity;
  }

  step(sim: CoinSim, dt: number): CoinEvent[] {
    if (this.elapsed !== null) {
      this.elapsed += dt;
      if (this.elapsed >= RETURN_TIME) {
        sim.reset();
        this.climb = 0;
        this.elapsed = null;
      }
      return [];
    }
    const events: CoinEvent[] = [];
    // 500m 통과와 첫 바닥 충돌을 프레임 간격에 관계없이 잡는다.
    for (let left = dt; left > 1e-8; left -= 1 / 240) {
      const stepEvents = sim.step(Math.min(left, 1 / 240));
      events.push(...stepEvents);
      this.climb = Math.max(this.climb, sim.pos.y - COIN_T / 2);
      if (this.climb < VALID_HEIGHT && stepEvents.some(e => e.type === 'bounce' || e.type === 'settle')) {
        this.elapsed = 0;
        break;
      }
    }
    return events;
  }
}
