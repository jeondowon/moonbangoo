// 배경 그림을 불러올 때 GPU에서 한 번만 굽는다: 지구·달·행성 표면, 지구 표면 지도, 은하.
import {
  LinearMipmapLinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RedFormat,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { earthRotation, HOME } from './cosmos';
import landKoreaUrl from './earth-land-korea.png';
import landUrl from './earth-land.png';
import { rgb } from './pixelTexture';

// ---- 행성 표면: GLSL로 그려 불러올 때 GPU에서 한 번만 텍스처로 굽는다 (CPU로 그리면 몇 초 걸린다) ----
/** '#rrggbb' → GLSL vec3 (sRGB 값 그대로. 섞은 뒤 마지막에 선형으로 바꾼다) */
export const v3 = (hex: string) => `vec3(${rgb(hex).map((c) => (c / 255).toFixed(4)).join(', ')})`;

const PAINT_LIB = /* glsl */ `
  float hash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p, int octaves) {
    float sum = 0.0, amp = 0.5, norm = 0.0;
    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      sum += noise(p) * amp;
      norm += amp;
      p = p * 2.0 + 17.3;
      amp *= 0.5;
    }
    return sum / norm;
  }
  /** a > b 이면 거꾸로 (GLSL smoothstep은 a < b 만 정의돼 있다) */
  float ramp(float a, float b, float x) { return a < b ? smoothstep(a, b, x) : 1.0 - smoothstep(b, a, x); }
  /** 경도 차이를 -π~π로 */
  float lonDiff(vec3 p, float lon) {
    float d = atan(p.z, p.x) - lon;
    return d - 6.2831853 * floor(d / 6.2831853 + 0.5);
  }
  /** 구 위에 흩어 놓은 크레이터 (작은 것이 많게). x: 움푹한 바닥, y: 솟은 테두리 */
  vec2 craters(vec3 p, int count, float seed, float minR, float maxR) {
    vec2 c = vec2(0.0);
    for (int i = 0; i < 128; i++) {
      if (i >= count) break;
      float fi = float(i);
      float y = hash(vec3(fi, seed, 1.0)) * 2.0 - 1.0;
      float a = hash(vec3(fi, seed, 2.0)) * 6.2831853;
      float s = sqrt(1.0 - y * y);
      float r = minR + (maxR - minR) * pow(hash(vec3(fi, seed, 3.0)), 3.0);
      float t = length(p - vec3(s * cos(a), y, s * sin(a))) / r;
      c.x = max(c.x, 1.0 - smoothstep(0.7, 0.9, t));
      c.y = max(c.y, smoothstep(0.65, 0.92, t) * (1.0 - smoothstep(1.0, 1.4, t)));
    }
    return c;
  }
  /** 가스 행성 줄무늬: 위도를 따라 팔레트를 오가고, 경계는 난류로 휘어 있다. 반환 w: 가는 흰 결 */
  vec2 bands(vec3 p, float lat, float freq, float turb) {
    float t1 = fbm(p * vec3(4.0, 10.0, 4.0), 4) - 0.5;
    float t2 = fbm(vec3(p.x * 9.0 + t1 * 3.0, p.y * 24.0, p.z * 9.0 + t1 * 3.0), 3) - 0.5;
    return vec2(sin(lat * freq + (t1 * 2.2 + t2 * 0.8) * turb) * 0.5 + 0.5, max(0.0, t2) * 0.25 * turb);
  }
  vec3 palette(float t, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4) {
    t *= 4.0;
    return t < 1.0 ? mix(c0, c1, t) : t < 2.0 ? mix(c1, c2, t - 1.0) : t < 3.0 ? mix(c2, c3, t - 2.0) : mix(c3, c4, t - 3.0);
  }
`;

/** 지구: 땅 색은 바다 자리까지 칠해 두고(육지·바다는 그릴 때 실제 윤곽으로 가른다), 알파에 구름 */
const EARTH = /* glsl */ `
  #define BAKE_RGBA
  vec4 bakeRGBA(vec2 uv) {
    float lat = (uv.y - 0.5) * 3.14159265, lon = uv.x * 6.2831853;
    vec3 p = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
    vec3 warp = vec3(fbm(p * 1.4 + vec3(7, 0, 0), 3), 0.0, fbm(p * 1.4 + vec3(0, 7, 0), 3)) - vec3(0.5, 0.0, 0.5);
    float alt = smoothstep(0.52, 0.7, fbm(p * 1.7 + warp * 1.6 + vec3(3, 0, 0), 7));
    float wet = fbm(p * 4.0 + vec3(20, 0, 0), 4);
    float a = abs(lat);
    float dry = smoothstep(0.12, 0.3, a) * (1.0 - smoothstep(0.55, 0.75, a)); // 아열대 사막대
    vec3 col = mix(${v3('#8cc363')}, ${v3('#4b8a47')}, smoothstep(0.45, 0.62, wet));
    col = mix(col, ${v3('#dfb878')}, dry * ramp(0.5, 0.4, wet));
    col = mix(col, ${v3('#9b8466')}, smoothstep(0.35, 0.75, alt));
    col = mix(col, ${v3('#f2f5f6')}, smoothstep(0.85, 0.95, alt));
    float ice = abs(lat) + (fbm(p * 5.0, 3) - 0.5) * 0.4;
    col = mix(col, ${v3('#f2f5f6')}, smoothstep(1.1, 1.16, ice));
    // 구름: 위도 방향으로 늘이고 비틀어 소용돌이처럼. 발사 지점(한반도) 위는 맑게
    float cw = fbm(p * 2.0 + vec3(11, 0, 0), 3) - 0.5;
    float cloud = smoothstep(0.55, 0.7, fbm(vec3(p.x * 3.0 + cw * 2.5, p.y * 6.0, p.z * 3.0 + cw * 2.5), 6));
    cloud *= smoothstep(0.08, 0.16, distance(p, vec3(${HOME.toArray().map((c) => c.toFixed(6)).join(', ')})));
    return vec4(col, cloud * 0.92);
  }`;

const MOON = /* glsl */ `
  vec3 paint(vec3 p, float lat) {
    float sea = smoothstep(0.5, 0.56, fbm(p * 1.6 + vec3(4, 0, 0), 4)); // 어두운 바다
    vec3 col = mix(${v3('#d9d5cc')}, ${v3('#8e8b85')}, sea * 0.85);
    col = mix(col, ${v3('#b3afa7')}, smoothstep(0.4, 0.65, fbm(p * 7.0, 4)) * 0.5);
    vec2 c = craters(p, 110, 21.0, 0.025, 0.32);
    col = mix(col, ${v3('#7d7a74')}, c.x * 0.55);
    return mix(col, ${v3('#f1eee6')}, c.y * 0.7);
  }`;

const MARS = /* glsl */ `
  vec3 paint(vec3 p, float lat) {
    float w = fbm(p * 2.0 + vec3(5, 0, 0), 3) - 0.5;
    vec3 col = mix(${v3('#e9a070')}, ${v3('#cf6e42')}, smoothstep(0.4, 0.55, fbm(p * 3.0 + vec3(w * 2.0, 0, w * 2.0), 5)));
    col = mix(col, ${v3('#8f4a30')}, smoothstep(0.56, 0.64, fbm(p * 2.2 + vec3(w, 0, 0), 5)) * 0.8); // 어두운 무늬
    vec2 c = craters(p, 40, 22.0, 0.03, 0.18);
    col = mix(mix(col, ${v3('#a9532f')}, c.x * 0.4), ${v3('#f2b98c')}, c.y * 0.5);
    float cap = abs(lat) + (fbm(p * 6.0, 3) - 0.5) * 0.3;
    return mix(col, ${v3('#f7f8f6')}, smoothstep(1.22, 1.27, cap));
  }`;

const JUPITER = /* glsl */ `
  vec3 paint(vec3 p, float lat) {
    vec2 b = bands(p, lat, 11.0, 1.0);
    vec3 col = palette(b.x, ${v3('#f2e6cc')}, ${v3('#d3a777')}, ${v3('#f6eedc')}, ${v3('#a86c4a')}, ${v3('#e9d2a8')});
    col = mix(col, vec3(1.0), b.y);
    // 대적점: 붉은 타원 + 옅은 테두리, 안쪽은 소용돌이 결
    vec2 d = vec2(lonDiff(p, 0.6) * 1.1, (lat + 0.35) * 2.6);
    float spot = length(d);
    float swirl = sin(spot * 60.0 + atan(d.y, d.x) * 2.0) * 0.5 + 0.5;
    col = mix(col, ${v3('#f6ead2')}, ramp(0.3, 0.24, spot) * 0.8);
    col = mix(col, mix(${v3('#c25a3a')}, ${v3('#e0865a')}, swirl * ramp(0.2, 0.06, spot)), ramp(0.24, 0.2, spot));
    // 작은 흰 타원들
    for (int k = 0; k < 4; k++) {
      float o = length(vec2(lonDiff(p, 2.0 + float(k) * 1.3) * 1.3, (lat + 0.62) * 3.5));
      col = mix(col, ${v3('#fbf6ec')}, ramp(0.09, 0.06, o));
    }
    return col;
  }`;

const SATURN = /* glsl */ `
  vec3 paint(vec3 p, float lat) {
    vec2 b = bands(p, lat, 8.0, 0.6);
    vec3 col = palette(b.x, ${v3('#f3e5bb')}, ${v3('#dcc492')}, ${v3('#f7edd0')}, ${v3('#cdb17d')}, ${v3('#ead7a8')});
    col = mix(col, vec3(1.0), b.y);
    return mix(col, ${v3('#a9a88f')}, smoothstep(1.05, 1.3, abs(lat)) * 0.6);
  }`;

const MERCURY = /* glsl */ `
  vec3 paint(vec3 p, float lat) {
    vec3 col = mix(${v3('#b5aca2')}, ${v3('#857c73')}, smoothstep(0.4, 0.62, fbm(p * 3.0, 5)));
    vec2 c = craters(p, 60, 23.0, 0.03, 0.2);
    return mix(mix(col, ${v3('#6f675f')}, c.x * 0.5), ${v3('#d8d0c4')}, c.y * 0.6);
  }`;

const VENUS = /* glsl */ `
  vec3 paint(vec3 p, float lat) {
    vec2 b = bands(p, lat, 5.0, 1.6);
    return mix(mix(${v3('#d9b479')}, ${v3('#f5e4bf')}, b.x), vec3(1.0), b.y);
  }`;

const URANUS = /* glsl */ `
  vec3 paint(vec3 p, float lat) {
    return mix(${v3('#9fd8e0')}, ${v3('#c9eff1')}, bands(p, lat, 6.0, 0.3).x * 0.6);
  }`;

const NEPTUNE = /* glsl */ `
  vec3 paint(vec3 p, float lat) {
    vec2 b = bands(p, lat, 7.0, 0.8);
    vec3 col = mix(${v3('#2f56b8')}, ${v3('#5d8ae2')}, b.x);
    float spot = length(vec2(lonDiff(p, 1.0) * 1.2, (lat + 0.4) * 3.0));
    return mix(mix(col, vec3(1.0), b.y), ${v3('#1c3580')}, ramp(0.2, 0.14, spot));
  }`;

/** 불러올 때 GPU에서 한 번 그려 두는 텍스처. glsl은 vec3 bakeColor(vec2 uv)를 정의한다 (sRGB 값).
 * BAKE_RGBA를 정의하면 대신 알파까지 담은 vec4 bakeRGBA(vec2 uv) */
export function bake(renderer: WebGLRenderer, w: number, h: number, glsl: string) {
  const target = bakeTarget(w, h);
  paint(renderer, target, glsl);
  return target.texture;
}

function bakeTarget(w: number, h: number) {
  return new WebGLRenderTarget(w, h, {
    colorSpace: SRGBColorSpace,
    generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter,
  });
}

/** bake와 같지만 이미 있는 타깃에 그린다 (다시 굽기용). uniforms는 glsl에서 쓰는 텍스처 등 */
function paint(renderer: WebGLRenderer, target: WebGLRenderTarget, glsl: string, uniforms: Record<string, { value: unknown }> = {}) {
  const mat = new ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      ${PAINT_LIB}
      ${glsl}
      void main() {
        #ifdef BAKE_RGBA
        vec4 c = clamp(bakeRGBA(vUv), 0.0, 1.0);
        #else
        vec4 c = vec4(clamp(bakeColor(vUv), 0.0, 1.0), 1.0);
        #endif
        // 렌더 타깃엔 선형 색으로 쓴다 (sRGB 타깃이 저장할 때 다시 바꾼다)
        gl_FragColor = vec4(mix(c.rgb / 12.92, pow((c.rgb + 0.055) / 1.055, vec3(2.4)), step(0.04045, c.rgb)), c.a);
      }`,
  });
  const quad = new Mesh(new PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const cam = new OrthographicCamera();
  renderer.setRenderTarget(target);
  renderer.render(quad, cam);
  renderer.setRenderTarget(null);
  quad.geometry.dispose();
  mat.dispose();
}

/** 지구 표면을 위경도 지도로 굽는다. 하늘 셰이더가 매 프레임 픽셀마다 하던 육지·바다 가르기와 해안선 잡음을 여기서 한 번만 한다.
 * 기본은 세계 지도(가로 경도 -180~180°, 세로 위도 -90~90°), KOREA를 정의하면 포항 주변 정밀 지도(동경 124~134°, 북위 31~41°).
 * rgb 땅 무늬, a 육지 정도(0.5가 해안선). 해안선과 모래톱·얕은 바다는 그릴 때 화면 픽셀 단위로 갈라 어느 배율에서도 또렷하다.
 * 값은 하늘 셰이더가 쓰던 그대로 담기게 sRGB로 바꿔 내보낸다 (bake가 다시 선형으로 바꿔 저장하고, 읽으면 원래 값이 나온다) */
const EARTH_SURFACE = /* glsl */ `
  #define BAKE_RGBA
  uniform sampler2D uEarthMap, uLand;
  uniform mat3 uEarthRot;
  const vec2 KR0 = vec2(124.0, 31.0) * 0.01745329;
  const float KR_SPAN = 10.0 * 0.01745329;
  float hash2(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
  }
  /** 윤곽 지도 한 칸(cell km)보다 잘고 지도 한 칸(px km)보다 굵은 결만 쌓은 잡음 (-0.5~0.5) */
  float detail(vec2 q, float cell, float px) {
    float sum = 0.0, amp = 0.25;
    for (int i = 0; i < 10; i++) {
      float fade = smoothstep(px * 1.5, px * 4.0, cell);
      if (fade <= 0.0) break;
      sum += (noise2(q / cell + float(i) * 17.0) - 0.5) * amp * fade;
      cell *= 0.5;
      amp *= 0.5;
    }
    return sum;
  }
  vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  vec4 bakeRGBA(vec2 uv) {
    #ifdef KOREA
    vec2 ll = KR0 + uv * KR_SPAN;
    float cell = 1.1;
    #else
    vec2 ll = vec2(uv.x - 0.5, (uv.y - 0.5) * 0.5) * 6.2831853;
    float cell = 20.0;
    #endif
    vec3 e = vec3(cos(ll.y) * cos(ll.x), sin(ll.y), -cos(ll.y) * sin(ll.x));
    vec3 n = transpose(uEarthRot) * e;
    vec4 tex = textureLod(uEarthMap, fract(vec2(atan(e.z, e.x) / 6.2831853, ll.y / 3.14159265 + 0.5)), 0.0);
    vec2 q = vec2(n.x, -n.z) * 6371.0; // 발사 지점 기준 동·북 km
    float fine = detail(q, cell, length(fwidth(q)) * 0.7);
    return vec4(toSrgb(tex.rgb * (1.0 + fine * 0.8)), texture(uLand, uv).r + fine);
  }`;

/** 지구 표면 지도 두 장(세계·포항 주변)과 그 재료. 육지 윤곽 이미지를 받는 대로 그 지역을 굽는다.
 * 받기 전엔 비어 있어 까맣지만 그땐 매장 바닥에 가려 있다 */
export function bakeEarth(renderer: WebGLRenderer, earthMap: Texture) {
  const region = (url: string, w: number, h: number, defines: string) => {
    const target = bakeTarget(w, h);
    const uniforms = { uEarthMap: { value: earthMap }, uLand: { value: null as Texture | null }, uEarthRot: { value: earthRotation() } };
    const land = landMap(url, () => paint(renderer, target, defines + EARTH_SURFACE, uniforms));
    uniforms.uLand.value = land;
    return { surface: target.texture, land };
  };
  return { earthMap, world: region(landUrl, 2048, 1024, ''), korea: region(landKoreaUrl, 2048, 2048, '#define KOREA\n') };
}

/** 행성 표면: 등장방형(가로 경도, 세로 위도) */
export const bakePlanet = (renderer: WebGLRenderer, paint: string, w: number) =>
  bake(renderer, w, w / 2, /* glsl */ `
    ${paint}
    vec3 bakeColor(vec2 uv) {
      float lat = (uv.y - 0.5) * 3.14159265, lon = uv.x * 6.2831853;
      return paint(vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon)), lat);
    }`);

/** 은하를 위에서 본 큰 구조: 길게 감긴 두 나선팔(사이사이 약한 두 팔), 팔 방향으로 늘어난 결, 끊기고 이어지는 마디,
 * 팔 안쪽의 가는 먼지띠와 팔을 가로지르는 먼지 깃털, 팔 위의 작은 별무리와 분홍 별 탄생 지역, 부드러운 크림색 중심부.
 * 낱별은 여기 굽지 않고 그릴 때 화면 픽셀 기준으로 얹는다 (가까이서도 또렷하게) */
const GALAXY = /* glsl */ `
  /** n칸 격자에서 칸마다 확률 p로 둥근 점 하나 (반지름 size칸) */
  float dots(vec2 uv, float n, float p, float size, float seed) {
    vec2 g = uv * n, c = floor(g);
    if (hash(vec3(c, seed)) > p) return 0.0;
    vec2 o = vec2(hash(vec3(c, seed + 10.0)), hash(vec3(c, seed + 20.0))) * 0.6 + 0.2;
    return (1.0 - smoothstep(0.3, 1.0, length(g - c - o) / size)) * (0.5 + 0.5 * hash(vec3(c, seed + 30.0)));
  }
  vec3 bakeColor(vec2 uv) {
    vec2 p = uv * 2.0 - 1.0;
    float r = length(p) + 1e-4, a = atan(p.y, p.x), lr = log(r);
    float warp = (fbm(vec3(p * 1.8, 4.0), 3) - 0.5) * 0.8;
    float tu = a - 3.4 * lr + warp; // 풀어 놓은 각: 팔은 tu가 일정한 선
    vec2 cs = vec2(cos(tu), sin(tu));
    float streak = fbm(vec3(cs * 6.0, lr * 1.3), 5); // 팔 방향으로 길쭉한 결
    float fine = fbm(vec3(cs * 20.0, lr * 5.0), 4);
    float segment = smoothstep(0.3, 0.7, fbm(vec3(cs * 1.5, lr * 2.5 + 3.0), 3)); // 팔 밝기 마디
    float w = 0.5 + 0.5 * cos(2.0 * tu);
    float w2 = 0.5 + 0.5 * cos(2.0 * tu + 1.6);
    float armMask = smoothstep(0.1, 0.32, r);
    float disk = exp(-r * 2.6) * (1.0 - smoothstep(0.5, 0.97, r));
    float arms = (pow(w, 5.0) * (0.45 + 0.9 * segment) + pow(w2, 6.0) * 0.35 * (1.0 - segment)) * armMask;
    float ridge = pow(w, 16.0) * armMask * segment;
    float lane = pow(0.5 + 0.5 * cos(2.0 * (tu - 0.33)), 26.0) * smoothstep(0.3, 0.6, streak);
    float feather = pow(0.5 + 0.5 * cos(10.0 * (a - 1.1 * lr) + warp * 6.0), 6.0)
      * smoothstep(0.5, 0.7, fbm(vec3(p * 5.0, 11.0), 3)) * w * w;
    float dust = min(1.0, lane + feather * 0.7) * smoothstep(0.08, 0.22, r);
    float knots = dots(uv, 140.0, pow(w, 6.0) * armMask * 0.55, 0.32, 1.0);
    float pink = dots(uv, 110.0, ridge * 0.9, 0.42, 2.0);
    float core = exp(-r * r * 70.0) * 0.45 + exp(-r * r * 14.0) * 0.25;
    vec3 blue = vec3(0.62, 0.76, 1.0), warm = vec3(1.0, 0.84, 0.64);
    vec3 armCol = mix(blue, warm, smoothstep(0.45, 0.1, r) * 0.85);
    float inter = 0.12 + 0.22 * fbm(vec3(p * 4.0, 13.0), 4);
    vec3 col = disk * (warm * inter * 0.7 + armCol * (arms * (0.45 + streak) * 1.6 + ridge * fine * 0.9));
    col *= 1.0 - dust * 0.75;
    col += warm * core;
    col += vec3(0.85, 0.92, 1.0) * knots * disk * 2.2;
    col += vec3(1.0, 0.45, 0.7) * pink * disk * 1.8;
    return 1.0 - exp(-col * 1.6); // 밝은 곳을 부드럽게 눌러 가운데가 하얗게 타지 않게
  }`;

/** 멀리 있는 타원 은하: 노란빛이 가운데서 부드럽게 퍼진다 */
const ELLIPTICAL = /* glsl */ `
  vec3 bakeColor(vec2 uv) {
    float r = length(uv * 2.0 - 1.0);
    return (1.0 - exp(-vec3(1.0, 0.85, 0.68) * (exp(-r * r * 9.0) * 0.9 + exp(-r * 5.0) * 0.3))) * (1.0 - smoothstep(0.8, 1.0, r));
  }`;

/** 육지 윤곽 지도 (Natural Earth 육지를 등장방형으로 그린 것, 흰색이 육지) */
function landMap(url: string, onLoad: () => void) {
  const t = new TextureLoader().load(url, onLoad);
  t.format = RedFormat;
  return t;
}

/** 굽는 그림: earth·galaxy·elliptical은 bake, 나머지는 bakePlanet으로 굽는다 */
export const PAINT = {
  earth: EARTH,
  moon: MOON,
  mercury: MERCURY,
  venus: VENUS,
  mars: MARS,
  jupiter: JUPITER,
  saturn: SATURN,
  uranus: URANUS,
  neptune: NEPTUNE,
  galaxy: GALAXY,
  elliptical: ELLIPTICAL,
};
