// 팩 고르기 캐러셀 (포켓몬 카드게임 Pocket의 팩 선택 연출 참고).
// 같은 팩 여러 개가 큰 원을 따라 늘어서 있고, 좌우로 넘기면 원이 돌며 다음 팩이 옆에서 들어온다. 가운데 한 팩을 고른다.
// 팩이 많아도(PACK_COUNT) 가운데 근처 몇 개만 메시로 만들어 두고, 넘길 때마다 자리를 돌려 쓴다.
// 팩은 개봉용과 동일한 윗조각·본체·곡면을 공유하고, 재질만 미리 구운 반사 그림을 쓰는 가벼운 재질이다.
// 팩은 바닥에서 떠 있고, 그 아래 바닥에 반사가 비친다.
// 고른 팩이 실제 팩 자리(원점·원래 크기·정면)로 모이면 opened가 되고, 그때 실제 팩으로 바꿔 끼운다.
import { Group, Vector3, type Texture } from 'three';
import { clamp } from '../core/math';
import { Spring } from '../core/spring';
import type { PackMatcaps } from './lite';
import { Pack, PACK_H } from './pack';
import { PackReflection, PACK_FLOOR_Y } from './reflection';
import type { PackTextures } from './textures';

export const PACK_COUNT = 100;
/** 가운데 양옆으로 메시를 만들어 두는 칸 수 (화면 밖 팩은 그려지지 않으므로 넉넉히) */
export const POOL_SIDE = 6;
const RADIUS = 5; // 팩이 늘어선 원의 반지름 (가운데 팩 앞면이 원의 맨 앞)
const STEP = 0.3; // 이웃 팩 사이 원 위의 각도 (rad) — 한 칸마다 이만큼 더 돌아서고 더 물러난다
const SHOWN = 2; // 가운데 양옆으로 화면에 들어오는 칸 수. 한 칸 더 바깥(화면 밖)까지만 그린다 (더 멀면 원을 돌아 뒤쪽에서 다시 보이므로)
const SNAP = { freq: 2.2, zeta: 0.82 }; // 탭·방향키로 한 칸씩 옮길 때
const GLIDE = 0.3; // 놓은 뒤 미끄러지는 시간 상수(초). 클수록 멀리, 천천히 멈춘다
const MAX_FLICK = 12; // 놓는 속도 상한 (칸/초)

/**
 * 가운데에서 d칸 떨어진(오른쪽 +) 팩의 배치. 팩들은 큰 원 위에 같은 각도(STEP) 간격으로 서서 바깥을 향한다.
 * 그래서 옆으로 갈수록 더 돌아서고 더 물러나며, 원근은 카메라가 그대로 그린다.
 */
export function slotAt(d: number) {
  const a = d * STEP;
  return { x: RADIUS * Math.sin(a), z: RADIUS * (Math.cos(a) - 1), rotY: a };
}

export class PackCarousel {
  readonly group = new Group();
  /** 현재 위치 (연속 값). 정수 n일 때 n번 팩(끝에서 처음으로 이어짐)이 가운데 */
  readonly pos = new Spring(0, SNAP.freq, SNAP.zeta);
  /** 0 = 고르는 중, 1 = 고른 팩이 실제 팩 자리로 모임 */
  private readonly focus = new Spring(0, 1.6, 0.92);
  private readonly y = new Spring(0, 1.6, 0.92);
  private readonly size = new Spring(1, 1.6, 0.92);
  /** 가운데에서 −POOL_SIDE ~ +POOL_SIDE칸 자리의 팩 메시 */
  private readonly packs: Group[] = [];
  private readonly reflections: PackReflection[] = [];
  private readonly floorPosition = new Vector3();
  /** 고른 팩의 위치 (pos 기준, 끝에서 처음으로 이어 붙이기 전 값). 고르기 전에는 null */
  private picked: number | null = null;
  private dragging = false;
  private time = 0;
  /** 고른 팩이 실제 팩 자리에 도착함 */
  opened = false;

  constructor(tex: PackTextures, environment: Texture, matcaps: PackMatcaps, readonly count = PACK_COUNT) {
    // 캐러셀은 팩 여러 장이 화면을 크게 덮으므로 가벼운 팩으로 그린다 (lite.ts). 고른 팩은 실제 팩으로 바꿔 끼워 연다
    const template = new Pack(tex, environment, matcaps, true);
    for (let i = 0; i < 2 * POOL_SIDE + 1; i++) {
      const pack = new Group();
      const shell = template.root.clone(true); // 지오메트리·재질은 공유, 배치만 독립
      const reflection = new PackReflection(shell);
      pack.add(shell, reflection.group);
      this.packs.push(pack);
      this.reflections.push(reflection);
      this.group.add(pack);
    }
    this.group.visible = false;
  }

  /** 가운데에 서 있는(또는 멈출) 팩 번호 */
  get index() {
    return (((Math.round(this.pos.target) % this.count) + this.count) % this.count);
  }

  get picking() {
    return this.picked === null;
  }

  /** 고르는 동안 캐러셀의 세로 위치·배율 (1 = 실제 팩 크기). 화면 크기가 바뀔 때마다 부른다. */
  setLayout(y: number, scale: number) {
    if (!this.picking) return;
    this.y.snap(y);
    this.size.snap(scale);
  }

  go(delta: number) {
    if (!this.picking) return;
    this.pos.set(SNAP.freq, SNAP.zeta);
    this.pos.target = Math.round(this.pos.target) + delta;
  }

  /** 손가락을 1:1로 따라감 (packs: 이동한 팩 칸 수, 오른쪽으로 밀면 −) */
  dragBy(packs: number) {
    if (!this.picking) return;
    this.dragging = true;
    this.pos.value += packs;
    this.pos.target = this.pos.value;
    this.pos.velocity = 0;
  }

  /** 놓은 속도(칸/초)를 그대로 이어받아 미끄러지다가 가까운 팩에 멈춤 */
  release(velocity: number) {
    if (!this.dragging) return;
    this.dragging = false;
    const v = clamp(velocity, -MAX_FLICK, MAX_FLICK);
    const target = Math.round(this.pos.value + v * GLIDE);
    const d = target - this.pos.value;
    // 임계감쇠 스프링은 ω = v/d이면 놓은 속도 v로 출발해 지수적으로 느려지며 target에 닿는다 (멈칫·튕김 없음)
    const w = v * d > 0 ? clamp(v / d, 3, 10) : 2 * Math.PI * SNAP.freq;
    this.pos.set(w / (2 * Math.PI), v * d > 0 ? 1 : SNAP.zeta);
    this.pos.velocity = v;
    this.pos.target = target;
  }

  /** 가운데 팩을 골라 실제 팩 자리로 모은다. 나머지 팩은 양옆으로 물러난다. */
  pick() {
    if (!this.picking) return;
    this.dragging = false;
    this.pos.target = Math.round(this.pos.target);
    this.picked = this.pos.target;
    this.focus.target = 1;
    this.y.target = 0;
    this.size.target = 1;
  }

  update(dt: number) {
    this.time += dt;
    const here = this.pos.step(dt);
    const f = this.focus.step(dt);
    this.group.position.y = this.y.step(dt);
    this.group.scale.setScalar(this.size.step(dt));
    this.floorPosition.set(0, PACK_FLOOR_Y, 0);
    this.group.localToWorld(this.floorPosition);
    // 메시 자리 돌려쓰기: 가운데에 가장 가까운 팩부터 양옆으로 POOL_SIDE칸씩 맡는다
    const base = Math.round(here);
    this.packs.forEach((pack, k) => {
      const n = base + k - POOL_SIDE;
      const d = n - here;
      const s = slotAt(d);
      const away = n === this.picked ? 0 : f;
      // 가운데 팩은 숨 쉬듯 흔들림 (고르는 동안만)
      const live = clamp(1 - Math.abs(d), 0, 1) * (1 - f);
      pack.position.set(
        s.x * (1 + 1.4 * away),
        live * Math.sin(this.time * 1.1) * 0.02,
        s.z * (1 - f) - away * 0.8,
      );
      pack.rotation.set(0, s.rotY * (1 - f) + live * Math.sin(this.time * 0.6) * 0.08, 0);
      pack.scale.setScalar(1 - away);
      pack.visible = pack.scale.x > 0.01 && Math.abs(d) <= SHOWN + 1;
      if (pack.visible) this.reflections[k].update(this.floorPosition.y, PACK_H * this.group.scale.y, 1 - away);
    });
    if (!this.picking && f > 0.99 && Math.abs(this.focus.velocity) < 0.03) this.opened = true;
  }
}
