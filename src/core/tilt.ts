// 기울여 보기 입력 (명세 R10). 결과는 정규화된 목표 기울기 x, y ∈ [-1, 1].
//   x > 0: 오른쪽 모서리가 화면 안쪽으로 / y > 0: 위쪽 모서리가 화면 안쪽으로
// 입력원:
//   - 마우스 호버: 커서 위치 (데스크톱)
//   - 드래그: 누른 지점에서 이동한 거리 (터치·마우스 공통), 떼면 0으로
// 폰 기울기 센서(자이로)는 쓰지 않음 (2026-09-25 결정)

import { clamp } from './math';

const DRAG_FULL = 0.28; // 화면 짧은 변 대비 이만큼 끌면 최대치

export class TiltInput {
  x = 0;
  y = 0;
  /** 사용자가 최근에 직접 조작했는지 (자동 흔들림 억제용) */
  idleTime = 0;
  /** true를 돌려주면 이 포인터로는 기울이기 드래그를 시작하지 않음 (절취 등 다른 조작에 양보) */
  shouldIgnore?: (e: PointerEvent) => boolean;

  private hover = { on: false, x: 0, y: 0 };
  private drag = { id: -1, sx: 0, sy: 0, x: 0, y: 0 };

  constructor(private readonly el: HTMLElement) {
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('pointerleave', this.onLeave);
  }

  get dragging() {
    return this.drag.id !== -1;
  }

  update(dt: number) {
    const hand = this.dragging ? this.drag : this.hover.on ? this.hover : null;
    this.x = hand?.x ?? 0;
    this.y = hand?.y ?? 0;
    this.idleTime = hand ? 0 : this.idleTime + dt;
  }

  private onMove = (e: PointerEvent) => {
    if (e.pointerId === this.drag.id) {
      const s = Math.min(window.innerWidth, window.innerHeight) * DRAG_FULL;
      this.drag.x = clamp((e.clientX - this.drag.sx) / s, -1, 1);
      this.drag.y = clamp(-(e.clientY - this.drag.sy) / s, -1, 1);
    } else if (e.pointerType === 'mouse') {
      const r = this.el.getBoundingClientRect();
      this.hover.on = true;
      this.hover.x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      this.hover.y = clamp(-(((e.clientY - r.top) / r.height) * 2 - 1), -1, 1);
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
}
