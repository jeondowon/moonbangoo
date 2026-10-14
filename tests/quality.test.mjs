import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseQuality } from '../src/gfx/quality.ts';

const DEFAULT = { maxPixelRatio: 2, msaa: false, bloom: true, gloss: true, showFps: false, label: '' };

test('주소 옵션이 없으면 기본 화질이고 FPS를 표시하지 않는다', () => {
  assert.deepEqual(parseQuality(''), DEFAULT);
  assert.deepEqual(parseQuality('?quality=high'), DEFAULT);
});

test('?quality=low는 네 항목을 모두 낮추고, ?fps는 값 없이도 FPS 표시를 켠다', () => {
  assert.deepEqual(parseQuality('?fps&quality=low'), {
    maxPixelRatio: 1, msaa: false, bloom: false, gloss: false, showFps: true,
    label: 'dpr 1 · bloom off · gloss off',
  });
});

test('개별 옵션은 그 항목만 바꾸고, quality=low 위에 덮어쓸 수 있다', () => {
  assert.deepEqual(parseQuality('?dpr=1'), { ...DEFAULT, maxPixelRatio: 1, label: 'dpr 1' });
  assert.deepEqual(parseQuality('?bloom=0'), { ...DEFAULT, bloom: false, label: 'bloom off' });
  assert.deepEqual(parseQuality('?msaa=1&gloss=0'), { ...DEFAULT, msaa: true, gloss: false, label: 'msaa on · gloss off' });
  assert.equal(parseQuality('?msaa=0').msaa, false);
  assert.equal(parseQuality('?quality=low&bloom=1').bloom, true);
  assert.equal(parseQuality('?quality=low&dpr=1.5').maxPixelRatio, 1.5);
});
