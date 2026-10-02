import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PerspectiveCamera, Scene, Texture } from 'three';
import { Deck } from '../src/card/deck.ts';
import { drawPack } from '../src/data/draw.ts';
import { createTearUniforms } from '../src/pack/tearShader.ts';

const prizes = (await drawPack()).cards; // C, R, R, SR, UR
const W = 390;
const H = 844;

class Stage extends EventTarget {
  getBoundingClientRect() { return { left: 0, top: 0, width: W, height: H }; }
  setPointerCapture() {}
}

function setup() {
  const el = new Stage();
  const camera = new PerspectiveCamera(26, W / H, 0.1, 50);
  camera.position.z = 6;
  camera.updateMatrixWorld();
  const deck = new Deck(el, camera, prizes, prizes.map(() => new Texture()), new Texture(), new Texture(), createTearUniforms(new Texture()));
  deck.setViewScale(1.6);
  const reveals = [];
  deck.onReveal = (card) => reveals.push(deck.cards.indexOf(card));
  const scene = new Scene();
  // 렌더러가 없으므로 레이캐스트용 월드 행렬을 직접 갱신
  const tick = (seconds) => {
    for (let t = 0; t < seconds; t += 1 / 60) deck.update(1 / 60);
    scene.updateMatrixWorld();
  };
  deck.slideOut();
  tick(0.8);
  deck.present(scene);
  tick(1.5);
  assert.equal(deck.state, 'ready');
  let now = 1000;
  const pointer = (type, x, y) => {
    const e = Object.assign(new Event(type), { pointerId: 1, clientX: x, clientY: y });
    Object.defineProperty(e, 'timeStamp', { value: (now += 40) });
    el.dispatchEvent(e);
  };
  const gesture = (dx, dy) => {
    pointer('pointerdown', W / 2, H / 2);
    pointer('pointermove', W / 2 + dx, H / 2 + dy);
    pointer('pointerup', W / 2 + dx, H / 2 + dy);
  };
  return { deck, reveals, tick, gesture };
}

test('뒷면 뭉치를 탭하면 5장이 모두 앞면이 되고, 등장 연출은 맨 위 카드만', () => {
  const { deck, reveals, tick, gesture } = setup();
  assert.ok(deck.cards.every((c) => !c.faceUp));
  gesture(0, 0);
  assert.ok(deck.cards.every((c) => c.faceUp));
  tick(1.5);
  assert.deepEqual(reveals, [0]);
});

test('앞면 카드는 어느 방향으로 조금만 밀어도 위로 넘어가고, 다음 카드는 앞면으로 드러나며 연출된다', () => {
  const { deck, reveals, tick, gesture } = setup();
  gesture(0, 0);
  tick(1.5);
  // 아래(+왼쪽)로 살짝 민 경우
  gesture(-6, 14);
  assert.equal(deck.current, 1);
  assert.ok(deck.cards[0].flight.vy > 0);
  const x0 = deck.cards[0].x.value;
  tick(0.1);
  assert.ok(Math.abs(deck.cards[0].x.value - x0) < 1e-6, '옆으로 비껴가지 않고 일직선으로 올라가야 함');
  assert.deepEqual(reveals, [0, 1]);
  assert.ok(deck.cards[1].faceUp);
  // 옆으로 크게 민 경우도 위로
  gesture(120, 0);
  assert.equal(deck.current, 2);
  assert.ok(deck.cards[1].flight.vy > 0);
  const x1 = deck.cards[1].x.value;
  tick(0.1);
  assert.ok(Math.abs(deck.cards[1].x.value - x1) < 1e-6, '옆으로 민 경우도 일직선으로 올라가야 함');
});

test('매장 안내 카드가 맨 앞에 있고, 경품 카드 목록에는 들어가지 않는다', () => {
  const { deck } = setup();
  assert.equal(deck.cards.length, prizes.length + 1);
  assert.equal(deck.cards[0], deck.lead);
  assert.ok(!deck.prizeCards.includes(deck.lead));
  assert.deepEqual(deck.prizeCards.map((c) => c.rarity), prizes.map((p) => p.rarity));
});

test('앞면 카드를 탭만 하면 넘어가지 않는다', () => {
  const { deck, tick, gesture } = setup();
  gesture(0, 0);
  tick(1.5);
  gesture(0, 0);
  assert.equal(deck.current, 0);
});

test('카드 옆면은 등급별 반사 재질 (일반: 종이, 레어 이상: 금속, 최고등급: 무지개 박), 발광 없음', () => {
  const { deck } = setup();
  const edge = (c) => c.mesh.material[2];
  for (const c of deck.cards) {
    assert.equal(edge(c).emissive.getHex(), 0, `${c.rarity} 옆면은 발광하지 않음`);
    assert.equal(edge(c).metalness > 0, c.rarity !== 'C', `${c.rarity} 금속 여부`);
    assert.equal(edge(c).iridescence > 0, c.rarity === 'UR', `${c.rarity} 무지개 박 여부`);
  }
});
