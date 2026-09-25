// 기울여 보기 입력 (명세 R10). 결과는 정규화된 목표 기울기 x, y ∈ [-1, 1].
//   x > 0: 오른쪽 모서리가 화면 안쪽으로 / y > 0: 위쪽 모서리가 화면 안쪽으로
// 입력원:
//   - 마우스 호버: 커서 위치 (데스크톱)
//   - 드래그: 누른 지점에서 이동한 거리 (터치·마우스 공통), 떼면 0으로
//   - 자이로: 기준 자세 대비 회전량. 기준 자세는 천천히 현재 자세를 따라가서
//     폰을 비스듬히 든 채로 있으면 정면으로 돌아온다.
import { Euler, Quaternion, Vector3 } from 'three';

const GYRO_FULL = (20 * Math.PI) / 180; // 이만큼 기울이면 최대치
const GYRO_RECENTER = 2.5; // 기준 자세가 따라오는 시간 상수(s)
const DRAG_FULL = 0.28; // 화면 짧은 변 대비 이만큼 끌면 최대치

type OrientationPermission = { requestPermission?: () => Promise<'granted' | 'denied'> };

const clamp = (v: number, a = -1, b = 1) => Math.min(b, Math.max(a, v));

export class TiltInput {
  x = 0;
  y = 0;
  /** 사용자가 최근에 직접 조작했는지 (자동 흔들림 억제용) */
  idleTime = 0;
  /** true를 돌려주면 이 포인터로는 기울이기 드래그를 시작하지 않음 (절취 등 다른 조작에 양보) */
  shouldIgnore?: (e: PointerEvent) => boolean;

  private hover = { on: false, x: 0, y: 0 };
  private drag = { id: -1, sx: 0, sy: 0, x: 0, y: 0 };
  private gyro = { on: false, has: false, x: 0, y: 0 };
  private qNow = new Quaternion();
  private qBase = new Quaternion();
  private readonly el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('pointerleave', this.onLeave);
  }

  get dragging() {
    return this.drag.id !== -1;
  }

  get gyroActive() {
    return this.gyro.has;
  }

  /** iOS는 사용자 제스처(탭) 안에서 호출해야 권한 창이 뜬다 */
  async enableGyro(): Promise<boolean> {
    if (this.gyro.on || typeof DeviceOrientationEvent === 'undefined') return this.gyro.on;
    const req = (DeviceOrientationEvent as unknown as OrientationPermission).requestPermission;
    if (req) {
      try {
        if ((await req()) !== 'granted') return false;
      } catch {
        return false;
      }
    }
    window.addEventListener('deviceorientation', this.onOrientation);
    this.gyro.on = true;
    return true;
  }

  update(dt: number) {
    if (this.gyro.has) {
      // 기준 자세를 현재 자세 쪽으로 천천히 이동
      this.qBase.slerp(this.qNow, 1 - Math.exp(-dt / GYRO_RECENTER));
      const f = FORWARD.set(0, 0, -1).applyQuaternion(Q.copy(this.qBase).invert().multiply(this.qNow));
      this.gyro.x = clamp(Math.atan2(f.x, -f.z) / GYRO_FULL);
      this.gyro.y = clamp(Math.atan2(f.y, Math.hypot(f.x, f.z)) / GYRO_FULL);
    }
    const hand = this.dragging ? this.drag : this.hover.on ? this.hover : null;
    this.x = clamp((hand?.x ?? 0) + this.gyro.x);
    this.y = clamp((hand?.y ?? 0) + this.gyro.y);
    this.idleTime = hand ? 0 : this.idleTime + dt;
  }

  private onMove = (e: PointerEvent) => {
    if (e.pointerId === this.drag.id) {
      const s = Math.min(window.innerWidth, window.innerHeight) * DRAG_FULL;
      this.drag.x = clamp((e.clientX - this.drag.sx) / s);
      this.drag.y = clamp(-(e.clientY - this.drag.sy) / s);
    } else if (e.pointerType === 'mouse') {
      const r = this.el.getBoundingClientRect();
      this.hover.on = true;
      this.hover.x = clamp(((e.clientX - r.left) / r.width) * 2 - 1);
      this.hover.y = clamp(-(((e.clientY - r.top) / r.height) * 2 - 1));
    }
  };

  private onDown = (e: PointerEvent) => {
    if (this.dragging || this.shouldIgnore?.(e)) return;
    this.el.setPointerCapture(e.pointerId);
    this.drag.id = e.pointerId;
    this.drag.sx = e.clientX;
    this.drag.sy = e.clientY;
    this.drag.x = this.drag.y = 0;
    this.hover.on = false;
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.drag.id) return;
    this.drag.id = -1;
  };

  private onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') this.hover.on = false;
  };

  private onOrientation = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null) return;
    const d = Math.PI / 180;
    const screenAngle = (screen.orientation?.angle ?? 0) * d;
    // 기기 방향 → 카메라(화면 뒤쪽을 바라보는) 자세 쿼터니언. 화면 회전(가로 모드)까지 보정.
    EULER.set(e.beta * d, (e.alpha ?? 0) * d, -e.gamma * d, 'YXZ');
    this.qNow.setFromEuler(EULER).multiply(Q_CAM).multiply(Q.setFromAxisAngle(Z, -screenAngle));
    if (!this.gyro.has) {
      this.qBase.copy(this.qNow);
      this.gyro.has = true;
    }
  };
}

const EULER = new Euler();
const Q = new Quaternion();
const Q_CAM = new Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
const Z = new Vector3(0, 0, 1);
const FORWARD = new Vector3();
