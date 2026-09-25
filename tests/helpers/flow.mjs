// DOM/레이아웃만 대역으로 제공한다. Three.js 카드·스프링·화면 로직은 실제 모듈을 사용한다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PerspectiveCamera, Scene, Texture } from 'three';
import { Card, CARD_H } from '../../src/card/card.ts';
import { drawPack } from '../../src/data/draw.ts';
import { PrizeFlow } from '../../src/ui/prizeFlow.ts';

export const prizes = (await drawPack()).cards;
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
assert.equal(new Set(ids).size, ids.length, 'HTML IDs must be unique');

class Element extends EventTarget {
  hidden = false;
  disabled = false;
  inert = false;
  textContent = '';
  children = [];
  attributes = new Map();
  scrollTop = 0;
  rect = { left: 0, top: 0, width: 390, height: 844 };
  layoutReads = 0;
  classList = {
    values: new Set(),
    add(name) { this.values.add(name); },
    remove(name) { this.values.delete(name); },
    contains(name) { return this.values.has(name); },
  };

  append(...children) { this.children.push(...children); }
  setAttribute(key, value) { this.attributes.set(key, value); }
  getBoundingClientRect() { this.layoutReads++; return this.rect; }
  get clientHeight() { this.layoutReads++; return this.rect.height; }
  focus() { document.activeElement = this; }
  setPointerCapture() {}
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
}

export function pointer(target, type, values) {
  target.dispatchEvent(Object.assign(new Event(type), values));
}

export function setup(width = 390, height = 844) {
  const elements = new Map(ids.map(id => [id, new Element()]));
  globalThis.document = {
    getElementById(id) {
      assert.ok(elements.has(id), `missing HTML element: ${id}`);
      return elements.get(id);
    },
    createElement() { return new Element(); },
  };
  globalThis.window = { innerWidth: width, innerHeight: height };
  const observers = [];
  globalThis.ResizeObserver = class {
    constructor(callback) { observers.push(callback); }
    observe() {}
  };
  const resize = () => observers.forEach(callback => callback());
  const get = id => elements.get(id);
  get('stage').rect = { left: 0, top: 0, width, height };
  for (const id of ['prize-flow', 'prize-preview', 'prize-result']) get(id).hidden = true;
  get('preview-card').rect = { left: 20, top: 110, width: width - 40, height: Math.max(100, height - 420) };
  get('result-card').rect = { left: 20, top: 125, width: width - 40, height: 250 };
  const camera = new PerspectiveCamera(26, width / height, 0.1, 50);
  camera.position.z = 6;
  camera.updateMatrixWorld();
  const scene = new Scene();
  const cards = prizes.map(p => new Card(new Texture(), new Texture(), p.rarity));
  const fx = { calls: 0, scale: 0, play() { this.calls++; }, stop() {}, setScale(value) { this.scale = value; } };
  const flow = new PrizeFlow(get('stage'), camera, prizes, fx);
  const tick = seconds => {
    for (let t = 0; t < seconds; t += 1 / 60) flow.update(1 / 60, 2);
  };
  flow.start(cards, scene);
  const buttons = get('prize-grid').children;
  buttons.forEach((button, i) => {
    button.children[0].rect = {
      left: 20 + (i % 3) * 110, top: 210 + Math.floor(i / 3) * 190, width: 100, height: 100 * CARD_H,
    };
  });
  resize();
  return { get, flow, cards, fx, buttons, tick, camera, resize };
}
