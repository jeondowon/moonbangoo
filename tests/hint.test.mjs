import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHint } from '../src/ui/hint.ts';

test('안내 문구는 바뀔 때만 갱신하고 숨겼다가 같은 문구로 다시 표시할 수 있다', () => {
  let writes = 0;
  let shown = false;
  const nodes = new Map(['.hint-main', '.hint-sub'].map(selector => [selector, {
    value: '',
    set textContent(value) { writes++; this.value = value; },
  }]));
  const setHint = createHint({
    querySelector(selector) { return nodes.get(selector); },
    classList: {
      add() { writes++; shown = true; },
      remove() { writes++; shown = false; },
    },
  });
  setHint('카드를 선택하세요', '원하는 한 장');
  const initialWrites = writes;
  for (let i = 0; i < 120; i++) setHint('카드를 선택하세요', '원하는 한 장');
  assert.equal(writes, initialWrites);
  assert.equal(shown, true);
  setHint(null);
  assert.equal(shown, false);
  setHint('카드를 선택하세요');
  assert.equal(shown, true);
  assert.equal(nodes.get('.hint-sub').value, '');
  setHint('카드를 선택하세요', '변경된 설명');
  assert.equal(nodes.get('.hint-sub').value, '변경된 설명');
});
