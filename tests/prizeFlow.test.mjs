import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { pointer, prizes, setup } from './helpers/flow.mjs';

test('정지된 미리보기 프레임은 DOM 크기를 재조회하지 않고 리사이즈 시에만 반영한다', () => {
  const { get, tick, buttons, cards, camera, fx, resize } = setup();
  tick(1.4);
  get('stage').layoutReads = 0;
  buttons[2].click();
  // 선택 배치 시 공통 canvas rect와 clientHeight 각각 한 번.
  assert.equal(get('stage').layoutReads, 2);
  tick(1);
  const before = get('stage').layoutReads;
  tick(2);
  assert.equal(get('stage').layoutReads, before);

  get('stage').rect = { left: 0, top: 0, width: 844, height: 390 };
  get('preview-card').rect = { left: 60, top: 90, width: 360, height: 280 };
  camera.aspect = 844 / 390;
  camera.updateProjectionMatrix();
  resize();
  tick(2);
  const holder = cards[2].root.parent;
  holder.updateWorldMatrix(true, true);
  const position = holder.getWorldPosition(new Vector3()).project(camera);
  assert.ok(Math.abs(position.x - ((60 + 180) / 844 * 2 - 1)) < 1e-5);
  assert.ok(Math.abs(position.y - (1 - (90 + 140) / 390 * 2)) < 1e-5);
  const expectedScale = 390 * 2 / (2 * Math.tan(camera.fov * Math.PI / 360)) * holder.scale.x;
  assert.ok(Math.abs(fx.scale - expectedScale) < 1e-8);
  assert.equal(get('prize-preview').hidden, false);
  assert.equal(get('preview-name').textContent, prizes[2].name);
});

// 실제 브라우저의 CSS·WebGL·FPS 검증은 별도로 필요하다.
for (let chosen = 0; chosen < prizes.length; chosen++) {
  test(`${prizes[chosen].name}: 선택 변경·터치·중복 확정 차단·결과 스크롤`, () => {
    const { get, flow, cards, fx, sound, buttons, tick, camera } = setup();
    assert.equal(buttons.length, 5);
    buttons[chosen].click(); assert.equal(get('prize-preview').hidden, true, 'landing input blocked');
    tick(1.4);
    buttons[(chosen + 1) % 5].click();
    assert.equal(get('preview-name').textContent, prizes[(chosen + 1) % 5].name);
    assert.equal(get('preview-condition').textContent, prizes[(chosen + 1) % 5].condition);
    get('confirm-prize').click(); assert.equal(fx.calls, 0, 'rapid confirm blocked while enlarging');
    get('change-prize').click(); assert.equal(get('prize-preview').hidden, true);
    buttons[chosen].click(); tick(0.8);
    assert.equal(get('preview-name').textContent, prizes[chosen].name);
    assert.equal(get('summary').inert, true);
    // Mobile drag incl. cancel must tilt without committing and return to front.
    pointer(get('preview-card'), 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 150, clientY: 200 });
    pointer(get('preview-card'), 'pointermove', { pointerId: 1, pointerType: 'touch', clientX: 210, clientY: 230 });
    tick(0.4); assert.ok(cards[chosen].lean.value > 0.1);
    pointer(get('preview-card'), 'pointercancel', { pointerId: 1, pointerType: 'touch' });
    tick(0.7); assert.ok(Math.abs(cards[chosen].lean.value) < 0.01);
    get('confirm-prize').click(); get('confirm-prize').click();
    get('change-prize').click(); buttons[(chosen + 2) % 5].click();
    assert.equal(fx.calls, 1, 'only one confirmation effect');
    assert.deepEqual(sound.rarities, [prizes[chosen].rarity], 'selected rarity sounds only once');
    tick(2);
    assert.equal(get('prize-result').hidden, false);
    assert.equal(get('prize-preview').hidden, true);
    assert.equal(get('result-name').textContent, prizes[chosen].name);
    assert.equal(get('result-condition').textContent, prizes[chosen].condition);
    assert.match(get('result-code').textContent, /^DEMO-MB-/);
    assert.equal(cards.filter(c => c.root.parent.visible).length, 1);
    const code = get('result-code').textContent;
    get('confirm-prize').click(); get('change-prize').click(); tick(0.2);
    assert.equal(get('result-code').textContent, code, 'finalized coupon remains stable');
    // Result card follows content scrolling instantly; material is reused, no new Card.
    const before = cards[chosen].root.parent.position.y;
    get('result-card').rect.top -= 200;
    get('prize-result').dispatchEvent(new Event('scroll')); tick(1 / 60);
    assert.ok(cards[chosen].root.parent.position.y > before);
    cards[chosen].root.parent.updateWorldMatrix(true, true);
    const p = cards[chosen].root.parent.getWorldPosition(new Vector3()).project(camera);
    const expected = 1 - ((get('result-card').rect.top + 125) / 844) * 2;
    assert.ok(Math.abs(p.y - expected) < 1e-8, 'DOM/world alignment after scrolling');
    for (const card of cards) assert.ok(card.root.position.toArray().every(Number.isFinite));
    assert.equal(flow.active, true);
  });
}

test('Escape로 선택 버튼에 포커스 복귀, 리사이즈 후 상태 유지', () => {
  const sample = setup(); sample.tick(1.4); sample.buttons[2].click(); sample.tick(1);
  sample.get('prize-preview').dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
  assert.equal(sample.get('prize-preview').hidden, true);
  assert.equal(document.activeElement, sample.buttons[2]);
  sample.get('stage').rect = { left: 0, top: 0, width: 844, height: 390 };
  sample.camera.aspect = 844 / 390; sample.camera.updateProjectionMatrix();
  sample.resize(); sample.tick(1);
  for (const card of sample.cards) assert.ok(Number.isFinite(card.root.parent.scale.x));
});

for (let selected = 0; selected < prizes.length; selected++) {
  test(`${prizes[selected].rarity}: 선택 밝기·배경 감광·요약 복귀·홀로 유지`, () => {
    const s = setup(); s.tick(1.4);
    const keys = s.cards.map(c => c.mesh.material[0].customProgramCacheKey());
    s.buttons[selected].click(); s.tick(1);
    assert.ok(s.flow.backgroundBrightness < 0.23);
    for (let i = 0; i < s.cards.length; i++) {
      assert.ok(Math.abs(s.cards[i].brightness.value - (i === selected ? 1 : 0.012)) < 0.001);
      const mat = s.cards[i].mesh.material[0];
      const shader = { uniforms: {}, vertexShader: '', fragmentShader: '#include <common>\n#include <emissivemap_fragment>\n#include <opaque_fragment>' };
      mat.onBeforeCompile(shader, {});
      assert.equal(shader.uniforms.uCardBrightness, s.cards[i].brightness);
      assert.ok(shader.fragmentShader.includes('outgoingLight *= uCardBrightness;'));
      if (s.cards[i].rarity !== 'C') assert.ok(shader.fragmentShader.includes('uHoloStrength'));
      assert.equal(mat.customProgramCacheKey(), keys[i]);
    }
    s.get('change-prize').click(); s.tick(1);
    assert.ok(s.flow.backgroundBrightness > 0.999);
    for (const card of s.cards) assert.ok(card.brightness.value > 0.999);
  });
}
