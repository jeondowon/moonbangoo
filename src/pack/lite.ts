// 캐러셀용 가벼운 팩 재질.
// 캐러셀은 팩 5장이 화면 절반 가까이를 덮어, 픽셀마다 빛·반사를 계산하는 실사 재질(MeshPhysicalMaterial)이 가장 무겁다.
// 그래서 같은 실사 재질·같은 환경맵으로 "구"를 한 번 그려 반사 그림(matcap)으로 구워 두고,
// 팩은 표면 방향에 맞는 구의 한 점을 읽어 색을 정한다 → 텍스처 몇 장 읽기만 남는다.
// 캐러셀 카메라는 회전하지 않으므로 구를 정면에서 그린 그림이 곧 팩이 보는 빛이다.
import {
  HalfFloatType,
  Mesh,
  MeshMatcapMaterial,
  MeshPhysicalMaterial,
  type IUniform,
  type Material,
  type MeshPhysicalMaterialParameters,
  OrthographicCamera,
  Scene,
  SphereGeometry,
  type Texture,
  Vector2,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { extendShader } from '../gfx/shader';
import { FILM, ROUGH } from './pack';
import type { SideTextures } from './textures';

/** 박(금속)과 종이 각각, 흰색으로 그린 구(전체 빛)와 검은색으로 그린 구(색에 물들지 않는 반사광만) */
export interface PackMatcaps {
  paper: Texture;
  paperGloss: Texture;
  foil: Texture;
  foilGloss: Texture;
}

const SIZE = 256;

/** 팩과 같은 환경맵·재질 값으로 반사 그림 4장을 굽는다 (HDR 그대로 → 밝은 반사는 Bloom도 그대로 받는다) */
export function bakePackMatcaps(renderer: WebGLRenderer, environment: Texture): PackMatcaps {
  const scene = new Scene();
  const sphere = new Mesh(new SphereGeometry(1, 128, 96));
  scene.add(sphere);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 5;
  const previous = renderer.getRenderTarget();
  const bake = (params: MeshPhysicalMaterialParameters) => {
    const target = new WebGLRenderTarget(SIZE, SIZE, { type: HalfFloatType });
    const material = new MeshPhysicalMaterial({ envMap: environment, ...FILM, ...params });
    sphere.material = material;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    material.dispose();
    return target.texture;
  };
  const paper = { roughness: ROUGH.paper, metalness: 0 };
  const foil = { roughness: ROUGH.foil, metalness: 1 };
  const matcaps = {
    paper: bake({ ...paper, color: 0xffffff }),
    paperGloss: bake({ ...paper, color: 0x000000 }),
    foil: bake({ ...foil, color: 0xffffff }),
    foilGloss: bake({ ...foil, color: 0x000000 }),
  };
  renderer.setRenderTarget(previous);
  sphere.geometry.dispose();
  return matcaps;
}

export function liteMaterial(t: SideTextures) {
  return new MeshMatcapMaterial({
    map: t.albedo,
    normalMap: t.normal,
    normalScale: new Vector2(1, 1),
    alphaTest: 0.5,
    alphaToCoverage: false,
  });
}

/**
 * 가벼운 팩의 색 = 인쇄 색 × (흰 구 − 검은 구) + 검은 구. 종이와 박은 금속도 텍스처(orm.b)로 섞는다.
 * 구 위의 읽을 자리는 three.js 매트캡과 같은 규칙 (보는 방향 기준 표면 방향)
 */
const LITE_GLSL = /* glsl */ `
uniform sampler2D uOrm, uPaper, uPaperGloss, uFoil, uFoilGloss;
vec3 liteLight(vec3 albedo, vec3 n, vec3 viewPosition, vec2 mapUv) {
  vec3 viewDir = normalize(viewPosition);
  vec3 x = normalize(vec3(viewDir.z, 0.0, -viewDir.x));
  vec3 y = cross(viewDir, x);
  vec2 uv = vec2(dot(x, n), dot(y, n)) * 0.495 + 0.5;
  vec3 paperGloss = texture2D(uPaperGloss, uv).rgb;
  vec3 foilGloss = texture2D(uFoilGloss, uv).rgb;
  vec3 paperLight = albedo * (texture2D(uPaper, uv).rgb - paperGloss) + paperGloss;
  vec3 foilLight = albedo * (texture2D(uFoil, uv).rgb - foilGloss) + foilGloss;
  return mix(paperLight, foilLight, texture2D(uOrm, mapUv).b);
}
`;

/**
 * 팩 재질에 가벼운 팩 색 계산을 끼운다. 절취 셰이더(applyTear)를 먼저 적용한 재질에 이어서 끼운다.
 *   amount 없음: 가벼운 팩 재질(liteMaterial)의 색을 이것으로 바꾼다
 *   amount 있음: 실사 재질 팩이 amount(0~1)만큼 가벼운 팩 색으로 보인다.
 *     캐러셀에서 고른 가벼운 팩을 실제 팩으로 바꿔 끼울 때 같은 색에서 시작해 실사 재질로 서서히 넘어가도록 (툭 바뀌지 않게).
 */
export function applyLiteShading(material: Material, t: SideTextures, matcaps: PackMatcaps, amount?: IUniform<number>) {
  const own = {
    uOrm: { value: t.orm },
    uPaper: { value: matcaps.paper },
    uPaperGloss: { value: matcaps.paperGloss },
    uFoil: { value: matcaps.foil },
    uFoilGloss: { value: matcaps.foilGloss },
    uLiteMix: amount ?? { value: 1 },
  };
  const lite = 'liteLight(diffuseColor.rgb, normal, vViewPosition, vMapUv)';
  const [from, to] = amount
    ? ['#include <opaque_fragment>', `if (uLiteMix > 0.0) outgoingLight = mix(outgoingLight, ${lite}, uLiteMix);\n#include <opaque_fragment>`]
    : ['vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;', `vec3 outgoingLight = ${lite};`];
  extendShader(material, `-lite${amount ? '-mix' : ''}`, (shader) => {
    Object.assign(shader.uniforms, own);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${LITE_GLSL}\nuniform float uLiteMix;`)
      .replace(from, to);
  });
}
