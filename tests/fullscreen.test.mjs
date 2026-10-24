import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupFullscreen } from '../public/fullscreen.js';

/** 전체화면 API를 흉내 내는 document 대역. 요청 횟수는 requests에 남긴다 */
function fakePage({ supported = true, installed = false, withButton = true } = {}) {
  const listeners = {};
  const button = { hidden: true, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(type, fn) { listeners[`button:${type}`] = fn; } };
  const doc = {
    requests: 0,
    fullscreenElement: null,
    fullscreenEnabled: supported,
    documentElement: { requestFullscreen() { doc.requests++; doc.fullscreenElement = this; return Promise.resolve(); } },
    exitFullscreen() { doc.fullscreenElement = null; return Promise.resolve(); },
    getElementById: (id) => (withButton && id === 'fullscreen-toggle' ? button : null),
    addEventListener(type, fn) { listeners[type] = fn; },
  };
  const win = { matchMedia: () => ({ matches: installed }) };
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const fire = (type) => listeners[type]?.();
  return { doc, win, storage, store, button, fire };
}

test('메뉴 버튼으로 켜면 전체화면이 되고 상태를 기억한다', () => {
  const p = fakePage();
  setupFullscreen(p.doc, p.win, p.storage);
  assert.equal(p.button.hidden, false);
  assert.equal(p.button.attrs['aria-pressed'], 'false');
  p.fire('button:click');
  assert.equal(p.doc.requests, 1);
  assert.equal(p.store.get('fullscreen'), 'on');
  p.fire('fullscreenchange');
  assert.equal(p.button.attrs['aria-pressed'], 'true');
});

test('버튼으로 끄면 기억도 지운다', () => {
  const p = fakePage();
  setupFullscreen(p.doc, p.win, p.storage);
  p.fire('button:click');
  p.fire('button:click');
  assert.equal(p.doc.fullscreenElement, null);
  assert.equal(p.store.has('fullscreen'), false);
});

test('기억된 상태면 다른 페이지에서 첫 터치 때 다시 켠다', () => {
  const p = fakePage({ withButton: false });
  p.store.set('fullscreen', 'on');
  setupFullscreen(p.doc, p.win, p.storage);
  p.fire('pointerup');
  assert.equal(p.doc.requests, 1);
  p.fire('pointerup');
  assert.equal(p.doc.requests, 1, '이미 전체화면이면 다시 요청하지 않음');
});

test('켠 적이 없으면 터치해도 전체화면으로 바꾸지 않는다', () => {
  const p = fakePage();
  setupFullscreen(p.doc, p.win, p.storage);
  p.fire('pointerup');
  assert.equal(p.doc.requests, 0);
});

test('지원하지 않는 브라우저(아이폰)나 홈 화면 앱에서는 버튼을 숨긴 채 아무것도 하지 않는다', () => {
  for (const opts of [{ supported: false }, { installed: true }]) {
    const p = fakePage(opts);
    p.store.set('fullscreen', 'on');
    setupFullscreen(p.doc, p.win, p.storage);
    p.fire('pointerup');
    assert.equal(p.button.hidden, true);
    assert.equal(p.doc.requests, 0);
  }
});
