// 오리파 화면: 남은 카드·최고등급 수량(위), 팩 고르기 캐러셀 조작(가운데), 카테고리별 남은 수량(아래).
// 팩은 캔버스(WebGL)에 그리고, 이 화면은 그 위에 수량 표시와 조작 영역을 덮는다.
import { CATEGORIES, categoryCounts, topRarityCounts, totalCounts, type Stock } from '../data/inventory';
import type { PackCarousel } from '../pack/carousel';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (n: number) => n.toLocaleString('ko-KR');

/** 카테고리 이미지 (루트의 *-concept.png를 160px로 줄인 사본) */
const CATEGORY_IMAGE: Record<string, string> = {
  card: new URL('./category/card.png', import.meta.url).href,
  pack: new URL('./category/pack.png', import.meta.url).href,
  cafe: new URL('./category/cafe.png', import.meta.url).href,
  sleeve: new URL('./category/sleeve.png', import.meta.url).href,
  saver: new URL('./category/saver.png', import.meta.url).href,
  bakery: new URL('./category/bakery.png', import.meta.url).href,
  coupon: new URL('./category/coupon.png', import.meta.url).href,
};

const TAP_MOVE = 10; // px — 이보다 적게 움직이면 탭 (가운데 팩 = 열기, 옆 팩 = 그 팩으로)

export class OripaScreen {
  private readonly root = el('oripa');
  readonly stage = el('oripa-stage');
  private drag: { id: number; x: number; startX: number; step: number; samples: { t: number; x: number }[] } | null = null;

  constructor(
    private readonly carousel: PackCarousel,
    private readonly stock: Stock[],
  ) {
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') this.carousel.go(-1);
      if (e.key === 'ArrowRight') this.carousel.go(1);
      if (e.key === 'Enter' || e.key === ' ') this.open();
    });
    this.stage.addEventListener('pointerdown', this.onDown);
    this.stage.addEventListener('pointermove', this.onMove);
    this.stage.addEventListener('pointerup', this.onUp);
    this.stage.addEventListener('pointercancel', this.onUp);
  }

  get shown() {
    return !this.root.hidden;
  }

  show() {
    this.render();
    this.root.hidden = false;
    this.carousel.group.visible = true;
    this.stage.focus({ preventScroll: true });
  }

  /** 현재 재고로 수량 표시를 다시 그린다 */
  render() {
    const total = totalCounts(this.stock);
    const top = topRarityCounts(this.stock);
    el('oripa-remaining').textContent = fmt(total.remaining);
    el('oripa-top').textContent = `${fmt(top.remaining)} / ${fmt(top.total)}`;
    const list = el('oripa-stock');
    list.replaceChildren(
      ...CATEGORIES.map((c) => {
        const { remaining, total } = categoryCounts(this.stock, c.id);
        const li = document.createElement('li');
        li.className = remaining > 0 ? 'oripa-item' : 'oripa-item is-empty';
        li.setAttribute('aria-label', `${c.name} ${remaining}개 남음, 전체 ${total}개`);
        const img = document.createElement('img');
        img.src = CATEGORY_IMAGE[c.id];
        img.alt = '';
        const count = document.createElement('span');
        count.className = 'oripa-count';
        const left = document.createElement('b');
        left.textContent = fmt(remaining);
        const all = document.createElement('small');
        all.textContent = ` / ${fmt(total)}`;
        count.append(left, all);
        li.append(img, count);
        return li;
      }),
    );
    // 남은 경품이 없으면 팩을 만들 수 없다 (열기는 open()에서 막음)
    el('oripa-soldout').hidden = total.remaining > 0;
  }

  private open() {
    if (!this.carousel.picking || totalCounts(this.stock).remaining <= 0) return;
    this.carousel.pick();
    this.root.classList.add('is-leaving');
    this.root.inert = true;
  }

  /** 팩이 실제 팩 자리로 모인 뒤 화면을 닫는다 */
  hide() {
    this.root.hidden = true;
    this.carousel.group.visible = false;
  }

  private onDown = (e: PointerEvent) => {
    if (this.drag || !this.carousel.picking) return;
    this.stage.setPointerCapture(e.pointerId);
    // 드래그 1칸 = 가운데 팩 폭 정도의 화면 거리
    const step = Math.max(80, this.stage.getBoundingClientRect().width * 0.42);
    this.drag = { id: e.pointerId, x: e.clientX, startX: e.clientX, step, samples: [{ t: e.timeStamp, x: e.clientX }] };
  };

  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.carousel.dragBy(-(e.clientX - d.x) / d.step);
    d.x = e.clientX;
    d.samples.push({ t: e.timeStamp, x: e.clientX });
    while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > 100) d.samples.shift();
  };

  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    if (e.type === 'pointerup' && Math.abs(e.clientX - d.startX) < TAP_MOVE) {
      this.carousel.release(0);
      // 가운데 팩을 누르면 열고, 옆 팩을 누르면 그 팩을 가운데로
      const box = this.stage.getBoundingClientRect();
      const side = (e.clientX - (box.left + box.width / 2)) / (box.width * 0.22);
      if (Math.abs(side) > 1) this.carousel.go(Math.sign(side));
      else this.open();
      return;
    }
    const first = d.samples[0];
    const dt = (e.timeStamp - first.t) / 1000;
    const velocity = dt > 0 ? -(e.clientX - first.x) / dt / d.step : 0;
    this.carousel.release(velocity);
  };
}
