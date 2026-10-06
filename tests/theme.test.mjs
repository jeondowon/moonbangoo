import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createThemeToggle, THEME_KEY } from '../src/ui/theme.ts';

function setup(initial, storage = new Map()) {
  let onClick;
  const attrs = new Map();
  const button = {
    setAttribute(name, value) { attrs.set(name, value); },
    addEventListener(type, fn) { if (type === 'click') onClick = fn; },
  };
  const root = { dataset: initial ? { theme: initial } : {} };
  const meta = { content: '', setAttribute(_, value) { this.content = value; } };
  const changes = [];
  createThemeToggle(button, root, meta, { setItem: (k, v) => storage.set(k, v) }, dark => changes.push(dark));
  return { click: () => onClick(), root, meta, attrs, changes, storage };
}

test('저장된 값이 없으면 라이트로 시작하고, 누를 때마다 다크와 라이트를 오가며 선택을 저장한다', () => {
  const t = setup(undefined);
  assert.equal(t.root.dataset.theme, undefined);
  assert.deepEqual(t.changes, [false]);
  assert.equal(t.meta.content, '#e9dec8');
  assert.equal(t.attrs.get('aria-label'), '다크 모드로 전환');
  assert.equal(t.storage.size, 0);

  t.click();
  assert.equal(t.root.dataset.theme, 'dark');
  assert.deepEqual(t.changes, [false, true]);
  assert.equal(t.meta.content, '#1a1511');
  assert.equal(t.attrs.get('aria-label'), '라이트 모드로 전환');
  assert.equal(t.storage.get(THEME_KEY), 'dark');

  t.click();
  assert.equal(t.root.dataset.theme, undefined);
  assert.deepEqual(t.changes, [false, true, false]);
  assert.equal(t.storage.get(THEME_KEY), 'light');
});

test('인라인 스크립트가 다크로 시작했으면 배경도 다크로 맞춘다', () => {
  const t = setup('dark');
  assert.deepEqual(t.changes, [true]);
  assert.equal(t.meta.content, '#1a1511');
});

test('저장이 막혀 있어도 전환은 된다', () => {
  let onClick;
  const root = { dataset: {} };
  createThemeToggle(
    { setAttribute() {}, addEventListener(_, fn) { onClick = fn; } },
    root, null,
    { setItem() { throw new Error('QuotaExceededError'); } },
    () => {},
  );
  onClick();
  assert.equal(root.dataset.theme, 'dark');
});
