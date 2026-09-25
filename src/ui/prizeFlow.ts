// M5: 넘긴 카드 5장을 재사용해 요약 → 미리보기 → 확정 → 쿠폰으로 연결한다.
// DOM의 빈 카드 영역을 월드 좌표로 옮겨 같은 WebGL 장면 안에서 배치한다.
import { Group, type PerspectiveCamera, type Scene } from 'three';
import { RARITIES } from '../../design/lib/data.js';
import { Spring } from '../core/spring';
import { TiltInput } from '../core/tilt';
import { createMockCoupon, formatVisitDate, type MockCoupon } from '../data/coupon';
import type { Prize } from '../data/draw';
import type { RevealFx } from '../fx/revealFx';
import { Card, CARD_H, CARD_W } from '../card/card';
import type { RarityCode } from '../card/holo';

type State = 'inactive' | 'entering' | 'summary' | 'preview' | 'confirming' | 'result';
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function setPrizeDetails(view: 'preview' | 'result', prize: Prize) {
  el(`${view}-name`).textContent = prize.name;
  el(`${view}-rarity`).textContent = RARITIES[prize.rarity as RarityCode].name;
  el(`${view}-description`).textContent = prize.description;
  el(`${view}-condition`).textContent = prize.condition;
  el(`${view}-card`).setAttribute('aria-label', `${prize.name} 카드, 드래그해서 기울여 보기`);
}

interface DisplayCard {
  card: Card;
  holder: Group;
  x: Spring;
  y: Spring;
  scale: Spring;
  shade: Spring;
  slot: HTMLElement;
  button: HTMLButtonElement;
}

export class PrizeFlow {
  private state: State = 'inactive';
  private age = 0;
  private selected = -1;
  private coupon: MockCoupon | null = null;
  private items: DisplayCard[] = [];
  private dirty = true;
  private fxScale = 1;
  private readonly background = new Spring(1, 2.5, 1);
  private readonly root = new Group();
  private readonly ui = el('prize-flow');
  private readonly summary = el('summary');
  private readonly preview = el('prize-preview');
  private readonly result = el('prize-result');
  private readonly grid = el('prize-grid');
  private readonly previewSlot = el('preview-card');
  private readonly resultSlot = el('result-card');
  private readonly confirm = el<HTMLButtonElement>('confirm-prize');
  private readonly change = el<HTMLButtonElement>('change-prize');
  private readonly previewTilt = new TiltInput(this.previewSlot);
  private readonly resultTilt = new TiltInput(this.resultSlot);

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: PerspectiveCamera,
    private readonly prizes: Prize[],
    private readonly fx: RevealFx,
    private readonly onConfirm?: () => void,
  ) {
    this.confirm.addEventListener('click', () => this.commit());
    this.change.addEventListener('click', () => this.back());
    this.preview.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.back();
    });
    // 스크롤 중에는 카드도 DOM 영역에 즉시 맞춰 본문과 겹치지 않게 한다.
    this.result.addEventListener('scroll', () => {
      if (this.state === 'result') this.layout(true);
    }, { passive: true });
    const observer = new ResizeObserver(() => { this.dirty = true; });
    for (const target of [this.ui, this.grid, this.previewSlot, this.resultSlot]) observer.observe(target);
  }

  get active() { return this.state !== 'inactive'; }
  get backgroundBrightness() { return this.background.value; }

  /** 마지막 스와이프가 화면 밖으로 나간 뒤 호출. 이후 카드 갱신은 덱 대신 이 화면이 담당한다. */
  start(cards: Card[], scene: Scene) {
    if (this.active) return;
    this.state = 'entering';
    this.age = 0;
    this.ui.hidden = false;
    scene.add(this.root);
    this.items = cards.map((card, i) => {
      const prize = this.prizes[i];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'prize-option';
      button.disabled = true;
      button.setAttribute('aria-label', `${prize.name}, ${RARITIES[prize.rarity as RarityCode].name}, ${prize.condition} — 크게 보기`);
      const slot = document.createElement('span');
      slot.className = 'card-space';
      slot.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.className = 'prize-option-name';
      name.textContent = prize.name;
      const rarity = document.createElement('span');
      rarity.className = 'prize-option-rarity';
      rarity.textContent = RARITIES[prize.rarity as RarityCode].name;
      button.append(slot, name, rarity);
      button.addEventListener('click', () => this.select(i));
      this.grid.append(button);

      const holder = new Group();
      this.root.add(holder);
      holder.add(card.root);
      card.flight = null;
      card.root.visible = true;
      for (const s of [card.x, card.y, card.z, card.pitch, card.lean, card.roll, card.flip]) s.snap(0);
      card.step(0);
      return {
        card, holder, slot, button,
        x: new Spring(0, 1.9, 0.78), y: new Spring(0, 1.9, 0.78),
        scale: new Spring(0, 1.9, 0.78), shade: new Spring(1, 2.5, 1),
      };
    });
    this.layout();
    this.items.forEach((item, i) => {
      item.x.snap(item.x.target);
      item.y.value = item.y.target + 0.3;
      item.scale.value = item.scale.target * 0.72;
      item.card.roll.snap((i - 2) * -0.055);
      item.card.roll.target = 0;
      item.holder.visible = false;
    });
    el('summary-title').focus({ preventScroll: true });
  }

  private select(index: number) {
    if (this.state !== 'summary' || this.coupon) return;
    this.selected = index;
    this.state = 'preview';
    this.age = 0;
    const prize = this.prizes[index];
    setPrizeDetails('preview', prize);
    this.summary.classList.add('is-background');
    this.summary.inert = true;
    this.preview.hidden = false;
    this.confirm.disabled = true; // 카드가 클로즈업되기 전 연속 탭으로 확정하지 않도록
    this.layout();
    this.change.focus({ preventScroll: true });
    el('flow-status').textContent = `${prize.name} 미리보기. 아직 확정되지 않았어요.`;
  }

  private back() {
    if (this.state !== 'preview' || this.coupon) return;
    this.state = 'summary';
    this.preview.hidden = true;
    this.summary.classList.remove('is-background');
    this.summary.inert = false;
    this.layout();
    this.items[this.selected].button.focus({ preventScroll: true });
    el('flow-status').textContent = '다른 경품을 골라 주세요.';
  }

  private commit() {
    if (this.state !== 'preview' || this.age < 0.65 || this.coupon) return;
    this.coupon = createMockCoupon(this.prizes[this.selected]);
    this.state = 'confirming';
    this.age = 0;
    this.confirm.disabled = this.change.disabled = true;
    this.preview.classList.add('is-confirming');
    el('confirm-notice').textContent = '선택한 선물을 준비하고 있어요';
    el('flow-status').textContent = `${this.coupon.prize.name} 선택이 확정되었어요.`;
    const chosen = this.items[this.selected];
    chosen.scale.velocity += chosen.scale.value * 0.7;
    this.fx.play(chosen.card.root, chosen.card.rarity, true);
    this.onConfirm?.();
    // 미리보기 뒤에 남아 있던 4장이 각각 바깥쪽으로 흩어져 나간다.
    this.items.forEach((item, i) => {
      if (i === this.selected) return;
      const side = item.x.value < 0 ? -1 : 1;
      item.x.target = side * this.visibleWidth();
      item.y.target += (i < 3 ? 1 : -1) * 1.5;
      item.card.roll.target = side * 0.8;
      item.shade.target = 0;
    });
  }

  private showResult() {
    const coupon = this.coupon!;
    this.state = 'result';
    this.age = 0;
    this.preview.hidden = this.summary.hidden = true;
    this.result.hidden = false;
    this.result.scrollTop = 0;
    setPrizeDetails('result', coupon.prize);
    el('result-code').textContent = coupon.code;
    const expiry = el<HTMLTimeElement>('result-expiry');
    expiry.dateTime = coupon.expiresAt;
    expiry.textContent = formatVisitDate(coupon.expiresAt);
    this.items.forEach((item, i) => { item.holder.visible = i === this.selected; });
    this.fx.stop();
    this.layout();
    el('result-title').focus({ preventScroll: true });
  }

  private visibleWidth() {
    return 2 * Math.tan(this.camera.fov * Math.PI / 360) * this.camera.position.z * this.camera.aspect;
  }

  /** DOM 영역을 z=0 평면으로 투영. 화면 크기 변경·안전 영역·결과 스크롤에도 동일한 배치 규칙. */
  private layout(snap = false) {
    if (!this.active) return;
    this.dirty = false;
    // 한 번의 배치에서 공통 뷰포트는 한 번만 읽는다. 프레임 루프에는 DOM 크기 조회를 남기지 않는다.
    const view = this.canvas.getBoundingClientRect();
    const unit = this.visibleWidth() / view.width;
    this.fxScale = this.canvas.clientHeight / (2 * Math.tan(this.camera.fov * Math.PI / 360));
    const place = (item: DisplayCard, slot: HTMLElement, padding = 1, immediate = false) => {
      const box = slot.getBoundingClientRect();
      item.x.target = (box.left + box.width / 2 - view.left - view.width / 2) * unit;
      item.y.target = -(box.top + box.height / 2 - view.top - view.height / 2) * unit;
      item.scale.target = Math.min(box.width / CARD_W, box.height / CARD_H) * unit * padding;
      if (immediate) {
        item.x.snap(item.x.target);
        item.y.snap(item.y.target);
        item.scale.snap(item.scale.target);
      }
    };
    const focused = this.state !== 'summary' && this.state !== 'entering';
    this.background.target = this.state === 'preview' || this.state === 'confirming' ? 0.22 : 1;
    this.items.forEach((item, i) => {
      const chosen = focused && i === this.selected;
      if (chosen) {
        place(item, this.state === 'result' ? this.resultSlot : this.previewSlot, 0.88, snap);
      } else if (this.state !== 'confirming' && this.state !== 'result') {
        place(item, item.slot, focused ? 0.86 : 1);
      }
      // 선형 밝기 1.2% → 출력 화면에서는 윤곽만 은은하게 남는다. 선택 카드의 반사는 그대로.
      item.shade.target = focused && !chosen ? (this.state === 'confirming' ? 0 : 0.012) : 1;
      item.card.z.target = chosen ? 0.025 : 0;
    });
  }

  update(dt: number, pixelRatio: number) {
    if (!this.active) return;
    this.age += dt;
    if (this.dirty) this.layout();
    this.background.step(dt);
    if (this.state === 'entering' && this.age > 1.15) {
      this.state = 'summary';
      this.items.forEach((item) => { item.button.disabled = false; });
      el('flow-status').textContent = '5장을 모두 확인했어요. 원하는 경품 1개를 골라 주세요.';
    }
    if (this.state === 'preview' && this.age >= 0.65 && this.confirm.disabled) this.confirm.disabled = false;
    if (this.state === 'confirming' && this.age > 1.5) this.showResult();
    const input = this.state === 'result' ? this.resultTilt : this.previewTilt;
    input.update(dt);
    this.items.forEach((item, i) => {
      if (this.state === 'entering' && this.age < i * 0.1) return;
      if (this.state !== 'result') item.holder.visible = true;
      if (!item.holder.visible) return;
      item.holder.position.set(item.x.step(dt), item.y.step(dt), 0);
      item.holder.scale.setScalar(item.scale.step(dt));
      const focus = i === this.selected && (this.state === 'preview' || this.state === 'result');
      item.card.pitch.target = focus ? -input.y * Math.PI / 10 : 0;
      item.card.lean.target = focus ? input.x * Math.PI / 10 : 0;
      item.card.brightness.value = item.shade.step(dt);
      item.card.step(dt);
    });
    if (this.selected >= 0) {
      const scale = this.items[this.selected].holder.scale.x;
      this.fx.setScale(this.fxScale * pixelRatio * scale);
    }
  }
}
