// 절취 입력 (명세 R1). 포인터 위치를 팩 좌표(u, v)로 바꿔 TearState에 반영한다.
//   - 판정 평면: 절취선 높이의 앞면 곡면(z = TEAR_Z). 팩 밖(좌우 V홈 바깥)까지 연장되므로 가장자리부터 긋기 쉽다
//   - 허용 밴드 밖으로 벗어나면 진행이 멈춘다(취소 아님). 다시 들어오면 그 지점부터 이어서
//   - getCoalescedEvents로 프레임 사이 포인터 이동까지 모두 반영 → 빠르게 그어도 끊기지 않음
import { Matrix4, Raycaster, Vector2, type Camera, type Object3D } from 'three';
import { packX, packY, PACK_H, PACK_W, TEAR_Z } from './pack';
import { TEAR_BINS, TEAR_V, type TearState } from './tear';

const BAND = 0.05; // 절취선 위아래 허용 폭 (팩 높이 비율, 휴대폰에서 약 ±30px)
const START_BAND = 0.065; // 처음 누를 때는 조금 더 너그럽게
const EDGE_SLACK = 0.12; // 좌우로 팩 밖까지 허용하는 폭 (팩 폭 비율)
const COMPLETE = 0.95; // 이만큼 자르면 자동 완료

interface Sample {
  t: number;
  x: number;
  y: number;
}

export class Cutter {
  /** 앞면이 보이고 개봉 전일 때만 true */
  enabled = false;
  /** 커팅 헤드 위치 (팩 폭 비율 0~1) */
  headU = 0.5;
  /** 마지막 입력이 허용 밴드 안인지 */
  inBand = false;

  onCut?: (du: number, dir: number, speed: number) => void;
  /** velocity: 마지막 약 0.1초간 손가락 속도 (팩 로컬 단위/s) */
  onComplete?: (velocity: Vector2, headU: number) => void;

  private id = -1;
  private lastU = 0;
  private lastIn = false;
  private samples: Sample[] = [];
  private readonly ray = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly inv = new Matrix4();

  constructor(
    private readonly el: HTMLElement,
    private readonly camera: Camera,
    private readonly target: Object3D,
    private readonly tear: TearState,
    private readonly now: () => number,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
  }

  get active() {
    return this.id !== -1;
  }

  /** 화면 좌표 → 팩 좌표 (u: 0=왼쪽, v: 0=위쪽) */
  project(clientX: number, clientY: number): { u: number; v: number } | null {
    const r = this.el.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    this.target.updateWorldMatrix(true, false);
    const ray = this.ray.ray.applyMatrix4(this.inv.copy(this.target.matrixWorld).invert());
    if (Math.abs(ray.direction.z) < 1e-6) return null;
    const t = (TEAR_Z - ray.origin.z) / ray.direction.z;
    if (t < 0) return null;
    const x = ray.origin.x + ray.direction.x * t;
    const y = ray.origin.y + ray.direction.y * t;
    return { u: x / PACK_W + 0.5, v: 0.5 - y / PACK_H };
  }

  /** 이 포인터 입력이 절취를 시작하는지 (절취선 근처를 눌렀는지) */
  wants(e: PointerEvent) {
    if (!this.enabled || this.active) return false;
    const p = this.project(e.clientX, e.clientY);
    return !!p && Math.abs(p.v - TEAR_V) < START_BAND && p.u > -EDGE_SLACK && p.u < 1 + EDGE_SLACK;
  }

  private onDown = (e: PointerEvent) => {
    if (!this.wants(e)) return;
    this.el.setPointerCapture(e.pointerId);
    this.id = e.pointerId;
    this.samples = [];
    this.lastIn = false;
    this.sample(e.clientX, e.clientY, e.timeStamp);
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerId !== this.id) return;
    const events = e.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e]) {
      this.sample(ev.clientX, ev.clientY, ev.timeStamp);
      if (!this.active) break; // 도중에 완료됨
    }
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId === this.id) this.id = -1;
  };

  private sample(clientX: number, clientY: number, t: number) {
    const p = this.project(clientX, clientY);
    if (!p) return;
    const inBand = Math.abs(p.v - TEAR_V) < BAND && p.u > -EDGE_SLACK && p.u < 1 + EDGE_SLACK;
    if (inBand) {
      if (this.lastIn) {
        const n = this.tear.cut(this.lastU, p.u, this.now());
        if (n > 0) {
          const prev = this.samples[this.samples.length - 1];
          const dtS = prev ? Math.max(1e-3, (t - prev.t) / 1000) : 1 / 60;
          this.onCut?.(n / TEAR_BINS, Math.sign(p.u - this.lastU), Math.abs(p.u - this.lastU) / dtS);
        }
      }
      this.headU = Math.min(1, Math.max(0, p.u));
      this.lastU = p.u;
    }
    this.lastIn = inBand;
    this.inBand = inBand;

    this.samples.push({ t, x: packX(p.u), y: packY(p.v) });
    while (this.samples.length > 2 && t - this.samples[0].t > 100) this.samples.shift();

    if (this.tear.progress >= COMPLETE) this.complete();
  }

  private complete() {
    this.enabled = false;
    if (this.id !== -1 && this.el.hasPointerCapture(this.id)) this.el.releasePointerCapture(this.id);
    this.id = -1;
    const a = this.samples[0];
    const b = this.samples[this.samples.length - 1];
    const dt = Math.max(0.016, (b.t - a.t) / 1000);
    this.onComplete?.(new Vector2((b.x - a.x) / dt, (b.y - a.y) / dt), this.headU);
  }
}
