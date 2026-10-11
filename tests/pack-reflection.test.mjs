import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Mesh, ShaderLib, Texture, Vector3 } from 'three';
import { Pack, PACK_H } from '../src/pack/pack.ts';
import { PackReflection, PACK_FLOOR_Y } from '../src/pack/reflection.ts';
import { PackCarousel, POOL_SIDE } from '../src/pack/carousel.ts';

const side = () => ({ albedo: new Texture(), orm: new Texture(), normal: new Texture() });
const textures = () => ({ front: side(), back: side() });
const surfaces = (root) => {
  const result = [];
  root.traverse((node) => { if (node instanceof Mesh) result.push(node); });
  return result;
};

function assertMirrored(source, mirror, floorY) {
  source.updateWorldMatrix(true, false);
  mirror.updateWorldMatrix(true, false);
  for (const local of [new Vector3(0, 0, 0), new Vector3(.3, -.9, .04), new Vector3(-.4, .8, -.03)]) {
    const actual = local.clone().applyMatrix4(source.matrixWorld);
    const reflected = local.clone().applyMatrix4(mirror.matrixWorld);
    assert.ok(Math.abs(actual.x - reflected.x) < 1e-9, '좌우 위치 일치');
    assert.ok(Math.abs(actual.z - reflected.z) < 1e-9, '앞뒤 위치 일치');
    assert.ok(Math.abs(actual.y + reflected.y - 2 * floorY) < 1e-9, '바닥까지의 거리가 대칭');
  }
}

test('바닥 반사: 부모 이동·크기·세 축 기울기·뒤집기를 월드 바닥 기준으로 따라간다', () => {
  const scene = new Group();
  const stage = new Group();
  scene.add(stage);
  const pack = new Pack(textures(), new Texture());
  const reflection = new PackReflection(pack.root);
  stage.add(pack.root, reflection.group);
  stage.position.set(.3, .4, -.2);
  stage.scale.setScalar(.6);
  const floorY = .4 + PACK_FLOOR_Y * .6;
  for (const yaw of [0, .3, Math.PI / 2, Math.PI]) {
    stage.rotation.set(.2, yaw, -.15);
    reflection.update(floorY, PACK_H * .6);
    surfaces(pack.root).forEach((source, i) => assertMirrored(source, reflection.group.children[i], floorY));
  }
});

test('절취 상태와 날아가는 윗조각을 반사에 공유하고, 나중에 추가한 카드는 제외한다', () => {
  const scene = new Group();
  const pack = new Pack(textures(), new Texture());
  const reflection = new PackReflection(pack.root);
  scene.add(pack.root, reflection.group);
  const original = surfaces(pack.root);
  pack.root.add(new Mesh());
  assert.equal(reflection.group.children.length, original.length);
  pack.tear.cut(0, .5, 0);
  pack.update(.1, .1);
  const material = reflection.group.children[0].material;
  const shader = { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
  material.onBeforeCompile(shader, {});
  assert.equal(shader.uniforms.uCut, pack.uniforms.uCut);
  assert.equal(shader.uniforms.uGuide, pack.uniforms.uGuide);
  assert.ok(shader.fragmentShader.includes('float tearEdge'));
  assert.ok(shader.fragmentShader.includes('vReflectionY > uReflectionFloor'));
  assert.equal(material.side, original[0].material.side, '음수 배율의 면 방향은 Three.js가 보정');
  pack.detachTop(scene, new Vector3(2, 3, 1), new Vector3(1, 2, 3));
  pack.update(.1, .2);
  reflection.update(PACK_FLOOR_Y);
  original.forEach((source, i) => assertMirrored(source, reflection.group.children[i], PACK_FLOOR_Y));
  pack.lining.visible = false;
  reflection.update(PACK_FLOOR_Y);
  assert.equal(reflection.group.children[original.indexOf(pack.lining)].visible, false);
});

test('캐러셀과 개봉용의 표면·절취 구조가 같고 선택 완료 시에도 반사를 유지한다', () => {
  const tex = textures();
  const environment = new Texture();
  const carousel = new PackCarousel(tex, environment);
  carousel.group.visible = true;
  carousel.setLayout(.4, .6);
  carousel.pick();
  for (let t = 0; t < 5; t += 1 / 60) carousel.update(1 / 60);
  assert.equal(carousel.opened, true);
  const [shell, reflection] = carousel.group.children[POOL_SIDE].children;
  const source = surfaces(shell);
  const opened = surfaces(new Pack(tex, environment).root);
  assert.equal(source.length, opened.length);
  source.forEach((surface, i) => {
    assert.deepEqual(surface.geometry.attributes.position.array, opened[i].geometry.attributes.position.array);
    assert.deepEqual(surface.geometry.attributes.normal.array, opened[i].geometry.attributes.normal.array);
    assert.equal(surface.material.map, opened[i].material.map);
    assert.equal(surface.material.customProgramCacheKey(), opened[i].material.customProgramCacheKey());
    assert.equal(reflection.children[i].visible, true);
    assert.ok(reflection.children[i].material.opacity > 0, '선택 후에도 반사가 사라지지 않음');
  });
});
