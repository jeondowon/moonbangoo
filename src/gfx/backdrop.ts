// 배경(화면 전체 사각형)과 팩 아래 부드러운 그림자.
import {
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
} from 'three';

export function createBackdrop() {
  const mat = new ShaderMaterial({
    uniforms: {
      uAspect: { value: 1 },
      uBrightness: { value: 1 },
      uCenter: { value: new Color('#3d3226') },
      uMid: { value: new Color('#241d16') },
      uEdge: { value: new Color('#110d0a') },
      uGlow: { value: new Color('#6b5534') },
      uFocus: { value: new Vector2(0.5, 0.56) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAspect, uBrightness;
      uniform vec3 uCenter, uMid, uEdge, uGlow;
      uniform vec2 uFocus;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 p = (vUv - uFocus) * vec2(uAspect, 1.0);
        float r = length(p);
        vec3 col = mix(uCenter, uMid, smoothstep(0.0, 0.45, r));
        col = mix(col, uEdge, smoothstep(0.35, 1.05, r));
        col += uGlow * 0.35 * exp(-r * r * 9.0);
        col *= uBrightness;
        // 밴딩 방지 디더: 최종 출력(sRGB 8비트) 한 단계 크기로 흔든다.
        // 후처리 때문에 여기서는 선형 값으로 출력하므로 sRGB로 바꿔 흔든 뒤 다시 선형으로.
        vec3 s = pow(col, vec3(1.0 / 2.2)) + (hash(gl_FragCoord.xy) - 0.5) / 255.0;
        col = pow(max(s, 0.0), vec3(2.2));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new Mesh(new PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return {
    mesh,
    resize(aspect: number) {
      mat.uniforms.uAspect.value = aspect;
    },
    setBrightness(value: number) {
      mat.uniforms.uBrightness.value = value;
    },
  };
}

/** 가장자리가 부드러운 사각 그림자 텍스처 */
function shadowTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.filter = 'blur(22px)';
  ctx.fillStyle = '#000';
  ctx.fillRect(s * 0.24, s * 0.2, s * 0.52, s * 0.6);
  const t = new CanvasTexture(c);
  // canvas filter 미지원 브라우저(구형 Safari)는 경계가 딱딱해지므로 방사형 그라디언트로 대체
  if (!('filter' in ctx) || ctx.filter === 'none') {
    ctx.clearRect(0, 0, s, s);
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.55, 'rgba(0,0,0,.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    t.needsUpdate = true;
  }
  return t;
}

export function createShadow(width: number, height: number) {
  const mesh = new Mesh(
    new PlaneGeometry(width * 1.9, height * 1.6),
    new MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
  );
  mesh.renderOrder = -5;
  return mesh;
}
