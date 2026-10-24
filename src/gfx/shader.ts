// 재질 셰이더 확장(onBeforeCompile)을 겹쳐 끼우는 공통 규칙.
import type { Material, WebGLProgramParametersWithUniforms } from 'three';

/**
 * from 재질에 이미 끼운 셰이더 수정을 먼저 적용한 뒤 patch를 덧붙이고, 프로그램 캐시 키에 suffix를 붙인다.
 * from: 기존 수정을 이어받을 재질 (기본은 자기 자신. clone()은 onBeforeCompile을 복사하지 않아 원본을 넘긴다)
 */
export function extendShader(
  material: Material,
  suffix: string,
  patch: (shader: WebGLProgramParametersWithUniforms) => void,
  from: Material = material,
) {
  const compile = from.onBeforeCompile;
  const cacheKey = from.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(from, shader, renderer);
    patch(shader);
  };
  material.customProgramCacheKey = () => `${cacheKey}${suffix}`;
}
