// 팩 재질에 절취 표현을 끼워 넣는다 (MeshStandard/Physical 셰이더 확장).
//   - 윗조각/본체는 같은 불규칙 찢김 곡선을 기준으로 서로 반대쪽만 그린다 → 안 잘린 곳은 이음새 없이 한 장처럼 보임
//   - 잘린 곳: 두 조각 사이가 벌어지고(틈), 가장자리에 흰 종이 단면 + 막 잘린 곳을 따라 잔광
//   - 윗조각은 잘린 만큼 바깥으로 살짝 들뜬다 (명세 R7: 절취 중 포장지가 휘는 변형)
//   - 앞면에는 자르기 전 절취선을 따라 흐르는 안내 반짝임
import { Color, type IUniform, type Material, type Texture } from 'three';
import { TEAR_V } from './tear';

export interface TearUniforms {
  [name: string]: IUniform;
  uCut: IUniform<Texture>;
  uTearV: IUniform<number>;
  uGap: IUniform<number>;
  uFiber: IUniform<number>;
  uLift: IUniform<number>;
  uTime: IUniform<number>;
  uGuide: IUniform<number>;
  uGlowColor: IUniform<Color>;
  uGuideColor: IUniform<Color>;
}

export function createTearUniforms(cut: Texture): TearUniforms {
  return {
    uCut: { value: cut },
    uTearV: { value: TEAR_V },
    uGap: { value: 0.0022 }, // 틈 절반 폭 (팩 높이 비율)
    uFiber: { value: 0.0035 }, // 종이 단면 폭
    uLift: { value: 0.012 }, // 윗조각이 들뜨는 정도 (월드 단위)
    uTime: { value: 0 },
    uGuide: { value: 0 },
    uGlowColor: { value: new Color(3.2, 2.1, 0.9) }, // HDR → Bloom
    uGuideColor: { value: new Color(1.6, 1.25, 0.7) },
  };
}

export type TearPiece = 'top' | 'body';

const COMMON = /* glsl */ `
uniform sampler2D uCut;
uniform float uTearV, uPiece, uFlipU;
varying vec2 vPackUv;
`;

const FRAG_PARS = /* glsl */ `
uniform float uGap, uFiber, uTime, uGuide, uGuideMask;
uniform vec3 uGlowColor, uGuideColor;
float tearHash(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float tearNoise(float x) {
  float i = floor(x);
  float f = fract(x);
  return mix(tearHash(i), tearHash(i + 1.0), f * f * (3.0 - 2.0 * f));
}
// 찢김 곡선: 절취선 주변으로 여러 주파수의 불규칙한 요철
float tearCurve(float u) {
  return uTearV
    + (tearNoise(u * 38.0) - 0.5) * 0.007
    + (tearNoise(u * 140.0 + 7.0) - 0.5) * 0.003
    + (tearNoise(u * 520.0 + 3.0) - 0.5) * 0.0014;
}
`;

export function applyTear(
  material: Material,
  shared: TearUniforms,
  { piece, flipU, side, guide }: { piece: TearPiece; flipU: boolean; side: number; guide: boolean },
) {
  const own = {
    uPiece: { value: piece === 'top' ? 0 : 1 },
    uFlipU: { value: flipU ? 1 : 0 },
    uSide: { value: side },
    uGuideMask: { value: guide ? 1 : 0 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}\nuniform float uSide, uLift;`)
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vPackUv = vec2(mix(uv.x, 1.0 - uv.x, uFlipU), 1.0 - uv.y);
        if (uPiece < 0.5) {
          float tearOpen = texture2D(uCut, vec2(vPackUv.x, 0.5)).r;
          // 절취선에 가까울수록 많이 들뜸 (위쪽 봉합부는 고정)
          float tearNear = smoothstep(uTearV - 0.09, uTearV, vPackUv.y);
          transformed.z += uSide * uLift * tearOpen * tearNear;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}\n${FRAG_PARS}`)
      .replace(
        '#include <clipping_planes_fragment>',
        /* glsl */ `#include <clipping_planes_fragment>
        float tearU = vPackUv.x;
        float tearV = vPackUv.y;
        vec4 tearCut = texture2D(uCut, vec2(tearU, 0.5));
        float tearC = tearCurve(tearU);
        float tearHalfGap = tearCut.r * uGap;
        float tearEdge = uPiece < 0.5 ? (tearC - tearHalfGap) - tearV : tearV - (tearC + tearHalfGap);
        if (tearEdge < 0.0) discard;
        // 종이 단면: 폭이 들쭉날쭉한 흰 띠
        float tearFiber = tearCut.r * (1.0 - smoothstep(0.0, uFiber * (0.45 + tearNoise(tearU * 900.0)), tearEdge));`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.95, 0.9), tearFiber);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.9, tearFiber);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - tearFiber;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        totalEmissiveRadiance += uGlowColor * tearCut.g * exp(-tearEdge / (uFiber * 1.6));
        // 안내 반짝임: 절취선을 따라 좌→우로 흐르는 빛 (아직 안 잘린 곳에만)
        float tearSweep = fract(uTime / 2.6) * 1.8 - 0.4;
        totalEmissiveRadiance += uGuideColor * uGuide * uGuideMask * (1.0 - tearCut.r)
          * exp(-pow((tearU - tearSweep) / 0.08, 2.0))
          * exp(-pow((tearV - uTearV) / 0.0045, 2.0));`,
      );
  };
  // 같은 소스라도 조각별 유니폼이 다르므로 프로그램은 공유해도 된다 (소스 동일 → 캐시 키 동일)
  material.customProgramCacheKey = () => 'pack-tear';
}
