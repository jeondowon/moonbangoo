// 팩 고르기 캐러셀 (포켓몬 카드게임 Pocket의 팩 선택 연출 참고).
// 같은 팩 여러 개가 큰 원을 따라 늘어서 있고, 좌우로 넘기면 원이 돌며 다음 팩이 옆에서 들어온다. 가운데 한 팩을 고른다.
// 팩이 많아도(PACK_COUNT) 가운데 근처 몇 개만 메시로 만들어 두고, 넘길 때마다 자리를 돌려 쓴다.
// 팩은 실제 팩과 같은 곡면·재질을 쓴다 (개봉 때 질감이 달라 보이지 않게). 절취가 없으니 곡면만 성기게 만든다.
// 팩은 바닥에서 떠 있고, 그 아래 바닥에 반사가 비친다.
// 고른 팩이 실제 팩 자리(원점·원래 크기·정면)로 모이면 opened가 되고, 그때 실제 팩으로 바꿔 끼운다.
import {
  BackSide,
  CanvasTexture,
  Group,
  Mesh,
  type MeshPhysicalMaterial,
  type Texture,
} from 'three';
import { clamp } from '../core/math';
import { Spring } from '../core/spring';
import { PACK_H, packMaterial, packSurface } from './pack';
import type { PackTextures } from './textures';

export const PACK_COUNT = 100;
/** 가운데 양옆으로 메시를 만들어 두는 칸 수 (화면 밖 팩은 그려지지 않으므로 넉넉히) */
export const POOL_SIDE = 6;
const REFLECTION = 0.3; // 바닥 반사 불투명도
const FLOAT = 0.07 * PACK_H; // 팩 아랫변에서 바닥까지 — 이만큼 공중에 떠 있다
const RADIUS = 5; // 팩이 늘어선 원의 반지름 (가운데 팩 앞면이 원의 맨 앞)
const STEP = 0.3; // 이웃 팩 사이 원 위의 각도 (rad) — 한 칸마다 이만큼 더 돌아서고 더 물러난다
const SHOWN = 2; // 가운데 양옆으로 화면에 들어오는 칸 수. 한 칸 더 바깥(화면 밖)까지만 그린다 (더 멀면 원을 돌아 뒤쪽에서 다시 보이므로)
const SEG_X = 36; // 보기만 하는 용도라 절취용 팩보다 성긴 곡면 (지오메트리는 모든 팩이 공유)
const SEG_Y = 48;

/** 바닥에 닿는 쪽은 불투명하고 멀어질수록 사라지는 반사 페이드 (alphaMap은 G 채널) */
function reflectionFade() {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#000');
  grad.addColorStop(0.62, '#000');
  grad.addColorStop(1, '#fff');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1, 64);
  return new CanvasTexture(c);
}

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
  readonly pos = new Spring(0, 2.2, 0.82);
  /** 0 = 고르는 중, 1 = 고른 팩이 실제 팩 자리로 모임 */
  private readonly focus = new Spring(0, 1.6, 0.92);
  private readonly y = new Spring(0, 1.6, 0.92);
  private readonly size = new Spring(1, 1.6, 0.92);
  /** 가운데에서 −POOL_SIDE ~ +POOL_SIDE칸 자리의 팩 메시 */
  private readonly packs: Group[] = [];
  private readonly reflected: MeshPhysicalMaterial[];
  /** 고른 팩의 위치 (pos 기준, 끝에서 처음으로 이어 붙이기 전 값). 고르기 전에는 null */
  private picked: number | null = null;
  private dragging = false;
  private time = 0;
  /** 고른 팩이 실제 팩 자리에 도착함 */
  opened = false;

  constructor(tex: PackTextures, environment: Texture, readonly count = PACK_COUNT) {
    const sides = [1, -1] as const; // 앞면, 뒷면
    const geometry = sides.map((s) => packSurface(s, 0, 1, SEG_X, SEG_Y));
    const material = sides.map((s) => packMaterial(s === 1 ? tex.front : tex.back, environment));
    // 바닥 반사: 바닥면을 기준으로 뒤집은 사본.
    // 뒤집으면 삼각형이 뒤집히므로 BackSide로 "원래 앞을 향하던 면"만 남긴다 (앞뒷면 반사가 겹쳐 짙어지지 않게).
    const fade = reflectionFade();
    const reflected = (this.reflected = material.map((m) => {
      const r = m.clone();
      Object.assign(r, {
        alphaMap: fade,
        alphaTest: 0.01,
        alphaToCoverage: false,
        transparent: true,
        opacity: REFLECTION,
        depthWrite: false,
        side: BackSide,
      });
      return r;
    }));
    for (let i = 0; i < 2 * POOL_SIDE + 1; i++) {
      const pack = new Group();
      const mirror = new Group();
      mirror.position.y = -PACK_H - 2 * FLOAT; // 바닥면(팩 아랫변 아래 FLOAT)을 기준으로 뒤집은 자리
      mirror.scale.y = -1;
      sides.forEach((_, k) => {
        pack.add(new Mesh(geometry[k], material[k]));
        mirror.add(new Mesh(geometry[k], reflected[k]));
      });
      pack.add(mirror);
      this.packs.push(pack);
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

  /** 놓은 속도(칸/초)를 이어받아 가까운 팩에 멈춤 */
  release(velocity: number) {
    if (!this.dragging) return;
    this.dragging = false;
    this.pos.velocity = 0;
    this.pos.target = Math.round(this.pos.value + clamp(velocity, -8, 8) * 0.18);
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
    // 실제 팩에는 반사가 없으므로 모이는 동안 반사를 걷어 낸다
    for (const r of this.reflected) r.opacity = REFLECTION * (1 - f);
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
    });
    if (!this.picking && f > 0.99 && Math.abs(this.focus.velocity) < 0.03) this.opened = true;
  }
}
