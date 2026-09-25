// 등급별 카드 재질 (명세 R6 반사 · R9 긴장감 연출, M4).
//  - 앞면: 등급별 금속감·클리어코트 + 시야각·기울기에 반응하는 무지개 홀로 스트릭
//    (레어는 일러스트 창에만, 슈퍼레어·최고등급은 전면)
//  - 뒷면: 테두리 암시 발광 — 카드를 넘기기 전(뒷면 상태)부터 등급을 은은히 암시
import { Color, type IUniform, type Material } from 'three';
import { CARD, WINDOW_BOX } from '../../design/lib/card.js';

export type RarityCode = 'C' | 'R' | 'SR' | 'UR';

interface RarityStyle {
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  /** 카드 표면 홀로 범위: 0=없음, 1=일러스트 창만, 2=전면 */
  holoArea: 0 | 1 | 2;
  /** 테두리 암시 발광 세기: 0=없음, 1(레어)~3(최고등급) */
  rimTier: 0 | 1 | 2 | 3;
}

export const RARITY_STYLE: Record<RarityCode, RarityStyle> = {
  C: { metalness: 0, roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.28, holoArea: 0, rimTier: 0 },
  R: { metalness: 0.2, roughness: 0.4, clearcoat: 0.55, clearcoatRoughness: 0.18, holoArea: 1, rimTier: 1 },
  SR: { metalness: 0.35, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.12, holoArea: 2, rimTier: 2 },
  // 최고등급 반사는 슈퍼레어와 동일 (더 강하면 밝은 파스텔 시안이 반사광에 하얗게 날아감)
  UR: { metalness: 0.35, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.12, holoArea: 2, rimTier: 3 },
};

/** 등급별 홀로 스트릭 강도 (일러스트·텍스트가 가려지지 않도록 등급별로 세밀 조정) */
const HOLO_STRENGTH: Record<RarityCode, number> = { C: 0, R: 0.09, SR: 0.12, UR: 0.06 };

// 일러스트 창을 UV 공간으로 변환 (텍스처 v는 아래쪽이 0, 위쪽이 1 — 디자인 픽셀은 위가 0이라 뒤집는다)
const winU0 = WINDOW_BOX.x / CARD.W;
const winU1 = (WINDOW_BOX.x + WINDOW_BOX.w) / CARD.W;
const winV0 = 1 - (WINDOW_BOX.y + WINDOW_BOX.h) / CARD.H;
const winV1 = 1 - WINDOW_BOX.y / CARD.H;
/** holoArea === 2(전면)일 때 쓰는 항상-통과 사각형 */
const FULL_RECT: [number, number, number, number] = [-1, 2, -1, 2];

const GLSL_COMMON = /* glsl */ `
vec3 holoHsl2rgb(vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
}
// 사각형 r=(x0,x1,y0,y1) 안쪽에서 1, 바깥에서 0 (soft만큼 부드럽게)
float holoRect(vec2 uv, vec4 r, float soft) {
  float mx = smoothstep(r.x - soft, r.x + soft, uv.x) * (1.0 - smoothstep(r.y - soft, r.y + soft, uv.x));
  float my = smoothstep(r.z - soft, r.z + soft, uv.y) * (1.0 - smoothstep(r.w - soft, r.w + soft, uv.y));
  return mx * my;
}
`;

const holoUniforms: { uTime: IUniform<number> } = { uTime: { value: 0 } };

/** 매 프레임 카드 홀로·테두리 발광 애니메이션 시각을 갱신한다 */
export function updateHoloTime(t: number) {
  holoUniforms.uTime.value = t;
}

/** 카드 앞면 재질에 등급별 홀로 스트릭을 끼워 넣는다 (일반은 아무것도 하지 않음) */
export function applyHoloFront(material: Material, rarity: RarityCode) {
  const style = RARITY_STYLE[rarity];
  if (!style.holoArea) return;
  const own = {
    uHoloRect: { value: style.holoArea === 2 ? FULL_RECT : [winU0, winU1, winV0, winV1] },
    uHoloStrength: { value: HOLO_STRENGTH[rarity] },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, holoUniforms, own);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${GLSL_COMMON}\nuniform float uTime, uHoloStrength;\nuniform vec4 uHoloRect;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        {
          // 보는 각도가 가장자리에 가까울수록(기울일수록) 강해지는 무지개 스트릭 — 틸트에 반응
          vec3 vDir = normalize(vViewPosition);
          float fres = pow(1.0 - clamp(abs(dot(vDir, normal)), 0.0, 1.0), 1.6);
          float area = holoRect(vMapUv, uHoloRect, 0.015);
          float streak = fract(vMapUv.x * 1.4 + vMapUv.y * 2.1 + fres * 2.6 + uTime * 0.12);
          vec3 rainbow = holoHsl2rgb(vec3(streak, 0.75, 0.5));
          totalEmissiveRadiance += rainbow * area * uHoloStrength * (0.06 + 0.3 * fres);
        }`,
      );
  };
  material.customProgramCacheKey = () => `card-holo-${rarity}`;
}

const RIM_BY_TIER: Record<1 | 2 | 3, { color: Color; strength: number; rainbow: boolean }> = {
  1: { color: new Color(0.75, 0.8, 0.9), strength: 0.12, rainbow: false }, // 레어: 은빛
  2: { color: new Color(1.3, 0.95, 0.4), strength: 0.2, rainbow: false }, // 슈퍼레어: 금빛 발광
  3: { color: new Color(1, 1, 1), strength: 0.22, rainbow: true }, // 최고등급: 무지개 발광
};

/** 카드 뒷면 재질에 테두리 암시 발광을 끼워 넣는다 (명세 R9). 일반은 아무것도 하지 않음 */
export function applyRimGlow(material: Material, rarity: RarityCode) {
  const style = RARITY_STYLE[rarity];
  if (!style.rimTier) return;
  const cfg = RIM_BY_TIER[style.rimTier];
  const own = {
    uRimColor: { value: cfg.color },
    uRimStrength: { value: cfg.strength },
    uRimRainbow: { value: cfg.rainbow ? 1 : 0 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, holoUniforms, own);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${GLSL_COMMON}\nuniform float uTime, uRimStrength, uRimRainbow;\nuniform vec3 uRimColor;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        {
          const float RIM_W = 0.035;
          float rim = 1.0 - holoRect(vMapUv, vec4(RIM_W, 1.0 - RIM_W, RIM_W, 1.0 - RIM_W), 0.05);
          float flow = 0.75 + 0.25 * sin(uTime * 1.1 + (vMapUv.x + vMapUv.y) * 8.0);
          vec3 col = uRimRainbow > 0.5
            ? holoHsl2rgb(vec3(fract(uTime * 0.18 + vMapUv.x * 0.5 + vMapUv.y * 0.5), 0.85, 0.6))
            : uRimColor;
          totalEmissiveRadiance += col * rim * uRimStrength * flow;
        }`,
      );
  };
  material.customProgramCacheKey = () => `card-rim-${rarity}`;
}
