// 앱 공통 렌더링 설정. 화면 흐름과 분리해 GPU 품질 설정을 한곳에서 관리한다.
import {
  HalfFloatType,
  NeutralToneMapping,
  PerspectiveCamera,
  Scene,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createBackdrop } from './backdrop';
import { createStudioEnv } from './env';

export function createRendering(canvas: HTMLCanvasElement) {
  // 장면은 composer의 MSAA 타깃에 그리므로 캔버스의 중복 안티앨리어싱은 끈다.
  const renderer = new WebGLRenderer({ canvas, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.toneMapping = NeutralToneMapping; // 인쇄 색(시안 팔레트)을 최대한 유지
  renderer.toneMappingExposure = 1;

  const scene = new Scene();
  scene.environment = createStudioEnv(renderer);
  const camera = new PerspectiveCamera(26, 1, 0.1, 50);
  const backdrop = createBackdrop();
  scene.add(backdrop.mesh);

  // HDR의 밝은 부분(>1)만 번지게 해 커팅 헤드·불티·잔광을 표현한다 (명세 5.2).
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new Vector2(1, 1), 0.7, 0.45, 1.0));
  const output = new OutputPass();
  // 마지막 패스는 화면에 직접 출력. 버퍼 교환으로 MSAA 타깃이 추가 할당되는 것을 막는다.
  output.needsSwap = false;
  composer.addPass(output);

  return { renderer, scene, camera, backdrop, composer };
}
