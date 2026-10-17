// 코인 플립 물리. 화면·입력과 분리해 테스트에서 그대로 돌린다.
// 단위: 코인 반지름 0.5, 시간 초. 입력 속도는 화면 높이 기준(화면 높이/초)이라 기기 크기와 무관하다.
// 결과는 멈췄을 때 위를 향한 면이다. 공정성: 처음 바닥에 닿는 순간 50:50으로 결과를 뽑고,
// 튕김 회전 후보를 끝까지 미리 굴려 보아 그 결과로 끝나는 후보를 고른다 (튕김 모양은 원래 분포 그대로).
import { Quaternion, Vector3 } from 'three';
import { clamp, smooth } from '../core/math';

export const COIN_R = 0.5;
export const COIN_T = 0.072; // 500원 동전 비율 (지름 26.5mm, 두께 1.92mm)

export type Face = 'front' | 'back';
export type Phase = 'rest' | 'air' | 'settle';
export type CoinEvent =
  | { type: 'bounce'; strength: number }
  | { type: 'settle'; face: Face }
  | { type: 'tick'; strength: number; rate: number }
  | { type: 'rest'; face: Face };

const H = 1 / 240; // 고정 시간 간격: 미리 굴려 본 결과와 실제 움직임이 똑같아야 한다
const G = 16; // 중력 (실제보다 약해 오래 떠 있다)
const SPIN_DRAG = 0.35; // 공중 회전 감쇠 (1/초)
const SPIN_KEEP = 22; // 바닥에 닿기 전에는 이 빠르기 아래로는 줄지 않는다 (높이서 떨어지는 동안에도 계속 돈다)
const MAX_SPIN = 42; // rad/s
const MAX_RISE = 14; // 위로 향하는 속도 상한
const LAUNCH_MIN = 1.2; // 이보다 느린 스와이프는 던지기로 치지 않는다 (화면 높이/초)
const LAUNCH_RISE = 2.6; // 스와이프 속도 → 상승 속도
const LAUNCH_SPIN = 7; // 스와이프 속도 → 앞뒤 회전
const SPIN_GAIN = 38; // 화면 높이만큼 문지르면 더해지는 회전 (rad/s)
// 문지르는 빠르기(화면 높이/초, 최근 RUB_TAU초 평균)만큼 올라간다. 쓸고 손 떼는 틈은 평균에 묻혀 떨어지지 않는다
const RUB_TAU = 0.35;
const RUB_MIN = 0.05; // 이보다 느리면 중력대로 떨어지고
const RUB_FULL = 0.25; // 이보다 빠르면 완전히 떠받친다
const CLIMB = 8; // 문지르는 빠르기 1당 올라가는 속도
const CATCH = 4; // 떨어지던 코인이 올라가는 속도에 맞춰지는 빠르기 (1/초)
const TERMINAL = 18; // 떨어지는 속도 상한 (아주 높이서 떨어져도 착지가 과하지 않게)
const RESTITUTION = 0.55;
const BOUNCE_KICK = 1.5; // 두 번째부터의 튕김에 섞이는 앞뒤 회전 (충돌 속도 1당 rad/s 폭)
const FAIR_TURNS = 1.2; // 첫 튕김 회전 후보의 폭: 다음 착지까지 도는 각도가 이 바퀴 수만큼 달라진다
const FAIR_TRIES = 48;
const SETTLE_SPEED = 1.6; // 바닥에 닿을 때 이보다 느리면 튕기지 않고 눕는다
const MAX_TILT = 0.38; // 이보다 기울어 닿으면 먼저 쓰러지고, 이 기울기부터 흔들린다
const TOPPLE = (0.8 * G) / COIN_R; // 가장자리를 축으로 쓰러지는 각가속도 (원판: g·R / (5/4·R²))
const TOPPLE_START = 0.6; // 거의 서서 닿아도 멈춰 서 있지 않도록 처음 쓰러지는 속도 (rad/s)
const WOBBLE_RATE = 6.9; // 기울기 0.3에서 초당 약 2바퀴, 눕을수록 빨라진다 (오일러 디스크)

const Y = new Vector3(0, 1, 0);
const X = new Vector3(1, 0, 0);
const FRONT_UP = new Quaternion();
const BACK_UP = new Quaternion().setFromAxisAngle(X, Math.PI);

/** 시드 고정 난수 (mulberry32) */
export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class CoinSim {
  readonly pos = new Vector3(0, COIN_T / 2, 0);
  readonly vel = new Vector3();
  readonly q = new Quaternion();
  /** 월드 기준 각속도 (rad/s) */
  readonly omega = new Vector3();
  phase: Phase = 'rest';
  face: Face = 'front';
  /** 이번 던지기에서 바닥에 부딪힌 횟수. 한 번 닿으면 문질러도 회전이 바뀌지 않는다 */
  bounces = 0;
  private rng: () => number;
  private predicting = false;
  private acc = 0;
  private rubbed = 0; // 최근에 문지른 거리 (RUB_TAU로 서서히 잊는다)
  private wobble = { t: 0, dur: 1, tilt0: 0, tilt: 0, fall: 0, phi: 0, psi: 0, ticks: 0 };
  private dq = new Quaternion();
  private axis = new Vector3();

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  /** 위를 향한 면의 법선 (앞면 기준) */
  normal(out = new Vector3()) {
    return out.copy(Y).applyQuaternion(this.q);
  }

  /** 쉬는 중에 위로 스와이프. dx: 오른쪽 +, up: 위쪽 + (화면 높이/초). 던졌으면 true */
  launch(dx: number, up: number) {
    if (this.phase !== 'rest' || up < LAUNCH_MIN || up < Math.abs(dx)) return false;
    this.phase = 'air';
    this.bounces = 0;
    this.rubbed = 0;
    this.acc = 0;
    this.vel.set(0, clamp(up * LAUNCH_RISE, 5, MAX_RISE), 0);
    this.omega.set(-up * LAUNCH_SPIN * (0.8 + 0.4 * this.rng()), dx * 4 + (this.rng() - 0.5) * 2, 0);
    this.clampSpin();
    return true;
  }

  /** 공중에서 문지른 만큼 회전을 더한다 (dx·up: 이번 이동량, 화면 높이 단위). 방향과 무관하게 문지르는 동안 위로 뜬다 */
  spin(dx: number, up: number) {
    if (this.phase !== 'air' || this.bounces > 0) return;
    // 코인 앞쪽을 위로 쓸면 가까운 쪽 가장자리가 올라가고, 옆으로 쓸면 팽이처럼 돈다
    this.omega.x -= up * SPIN_GAIN;
    this.omega.y += dx * SPIN_GAIN;
    this.clampSpin();
    this.rubbed += Math.hypot(dx, up);
  }

  step(dt: number): CoinEvent[] {
    const events: CoinEvent[] = [];
    this.acc += dt;
    while (this.acc >= H) {
      this.acc -= H;
      if (this.phase === 'air') this.stepAir(events);
      else if (this.phase === 'settle') this.stepSettle(events);
    }
    return events;
  }

  private clampSpin() {
    if (this.omega.length() > MAX_SPIN) this.omega.setLength(MAX_SPIN);
  }

  private stepAir(events: CoinEvent[]) {
    const fall = Math.max(-TERMINAL, this.vel.y - G * H);
    if (this.bounces === 0) {
      // 문지르는 동안엔 그 빠르기에 맞는 속도로 올라간다. 이미 더 빨리 솟고 있으면 중력대로 둔다
      this.rubbed *= Math.exp(-H / RUB_TAU);
      const rate = this.rubbed / RUB_TAU;
      const climb = Math.min(MAX_RISE, CLIMB * rate);
      const lifted = fall < climb ? this.vel.y + (climb - this.vel.y) * (1 - Math.exp(-CATCH * H)) : fall;
      this.vel.y = fall + (Math.max(fall, lifted) - fall) * smooth(RUB_MIN, RUB_FULL, rate);
    } else this.vel.y = fall;
    this.pos.y += this.vel.y * H;
    const spin = this.omega.length();
    const keep = this.bounces === 0 ? Math.min(spin, SPIN_KEEP) : 0;
    if (spin > keep) this.omega.setLength(keep + (spin - keep) * Math.exp(-SPIN_DRAG * H));
    const w = this.omega.length();
    if (w > 1e-6) {
      this.dq.setFromAxisAngle(this.axis.copy(this.omega).divideScalar(w), w * H);
      this.q.premultiply(this.dq).normalize();
    }
    // 가장 낮은 점의 높이: 기울어진 원판의 아래 끝
    const ny = this.normal(this.axis).y;
    const reach = COIN_R * Math.sqrt(Math.max(0, 1 - ny * ny)) + (COIN_T / 2) * Math.abs(ny);
    if (this.pos.y > reach || this.vel.y > 0) return;
    this.pos.y = reach;
    const speed = -this.vel.y;
    if (speed > SETTLE_SPEED) {
      this.vel.y = speed * RESTITUTION;
      this.omega.multiplyScalar(0.7);
      if (this.bounces++ === 0 && !this.predicting) this.fairKick();
      else this.omega.x += (this.rng() - 0.5) * speed * BOUNCE_KICK;
      events.push({ type: 'bounce', strength: Math.min(1, speed / 10) });
      return;
    }
    this.startSettle(ny);
    events.push({ type: 'settle', face: this.face });
  }

  /** 첫 충돌: 결과를 50:50으로 뽑고, 그 결과로 끝나는 튕김 회전을 고른다. 이후 난수는 미리 굴려 본 것과 같은 시드를 쓴다 */
  private fairKick() {
    const want: Face = this.rng() < 0.5 ? 'front' : 'back';
    const spin = this.omega.x;
    // 다음 착지까지 도는 각도가 한 바퀴 남짓 차이 나는 만큼만 흔든다 (높이 튈수록 작게)
    const range = (FAIR_TURNS * 2 * Math.PI) / ((2 * this.vel.y) / G);
    for (let i = 0; i < FAIR_TRIES; i++) {
      this.omega.x = spin + (this.rng() - 0.5) * range;
      const seed = (this.rng() * 2 ** 32) >>> 0;
      if (this.predict(seed) === want || i === FAIR_TRIES - 1) {
        this.rng = seeded(seed);
        return;
      }
    }
  }

  /** 지금 상태에서 끝까지 굴려 보아 나올 면 */
  private predict(seed: number): Face {
    const c = new CoinSim(seeded(seed));
    c.predicting = true;
    c.phase = this.phase;
    c.bounces = this.bounces;
    c.pos.copy(this.pos);
    c.vel.copy(this.vel);
    c.q.copy(this.q);
    c.omega.copy(this.omega);
    const none: CoinEvent[] = [];
    for (let i = 0; i < 240 * 10 && c.phase === 'air'; i++) c.stepAir(none);
    return c.face;
  }

  private startSettle(ny: number) {
    this.phase = 'settle';
    this.face = ny >= 0 ? 'front' : 'back';
    this.vel.set(0, 0, 0);
    const w = this.wobble;
    const up = this.normal().multiplyScalar(this.face === 'front' ? 1 : -1);
    // 눕는 쪽으로 구르던 회전은 그대로 이어 쓰러지고, 일어서는 쪽이면 가장자리가 부딪혀 되튕긴다 (up.y = cos 기울기)
    const tiltRate = -this.axis.copy(this.omega).cross(up).y / Math.max(Math.sqrt(1 - up.y * up.y), 1e-3);
    this.omega.set(0, 0, 0);
    // 위를 향한 면이 기운 방향을 그대로 이어 받는다: Q(a, tilt)·Y = up, a = (cos φ, 0, sin φ)
    w.phi = Math.atan2(-up.x, up.z);
    w.tilt = Math.acos(clamp(up.y, -1, 1));
    // 면 안에서 돌아간 각도도 이어 받는다 → 닿은 자세 그대로에서 시작해 끊기는 순간이 없다
    const rest = this.tiltQuat(w.phi, w.tilt).invert().multiply(this.q).multiply(this.base().clone().invert());
    w.psi = 2 * Math.atan2(rest.y, rest.w);
    w.fall = w.tilt > MAX_TILT ? Math.min(-TOPPLE_START, tiltRate) : 0;
    if (!w.fall) this.startWobble();
  }

  private startWobble() {
    const w = this.wobble;
    w.tilt0 = w.tilt;
    w.t = 0;
    w.dur = 0.9 + 4 * w.tilt0 + this.rng() * 0.3;
    w.ticks = Math.floor(w.phi / Math.PI);
  }

  private base() {
    return this.face === 'front' ? FRONT_UP : BACK_UP;
  }

  private tiltQuat(phi: number, tilt: number) {
    return new Quaternion().setFromAxisAngle(new Vector3(Math.cos(phi), 0, Math.sin(phi)), tilt);
  }

  private stepSettle(events: CoinEvent[]) {
    const w = this.wobble;
    if (w.fall) {
      // 가장자리를 축으로 쓰러진다: 무게중심이 축에서 수평으로 멀수록(눕을수록) 빨라진다
      w.fall -= TOPPLE * Math.cos(w.tilt) * H;
      w.tilt += w.fall * H;
      if (w.tilt <= MAX_TILT) {
        events.push({ type: 'bounce', strength: Math.min(1, -w.fall / 12) });
        w.fall = 0;
        this.startWobble();
      }
      this.pose();
      return;
    }
    w.t += H;
    const left = 1 - w.t / w.dur;
    if (left <= 0) {
      this.phase = 'rest';
      this.q.setFromAxisAngle(Y, w.psi).multiply(this.base());
      this.pos.y = COIN_T / 2;
      events.push({ type: 'rest', face: this.face });
      return;
    }
    // 오일러 디스크: 기울기가 유한 시간 안에 0으로 줄고, 기울기가 작을수록 세차 운동이 빨라진다
    w.tilt = w.tilt0 * Math.cbrt(left);
    const rate = WOBBLE_RATE / Math.sqrt(Math.max(w.tilt, 0.02));
    w.phi += rate * H;
    w.psi -= rate * (1 - Math.cos(w.tilt)) * H; // 굴러가며 면이 아주 천천히 돈다
    // 반 바퀴마다 가장자리가 바닥을 두드리는 소리
    const ticks = Math.floor(w.phi / Math.PI);
    if (ticks !== w.ticks) {
      w.ticks = ticks;
      events.push({ type: 'tick', strength: w.tilt / MAX_TILT, rate });
    }
    this.pose();
  }

  /** 기울기·세차 각도로 자세와 높이를 정한다 (가장자리 한 점이 바닥에 닿아 있다) */
  private pose() {
    const w = this.wobble;
    this.q.copy(this.tiltQuat(w.phi, w.tilt)).multiply(this.dq.setFromAxisAngle(Y, w.psi)).multiply(this.base());
    this.pos.y = COIN_R * Math.sin(w.tilt) + (COIN_T / 2) * Math.cos(w.tilt);
  }
}
