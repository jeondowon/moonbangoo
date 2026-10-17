// 매장에서 은하까지의 일러스트풍 배경. 지구 육지 윤곽 이미지 두 장 말고는 셰이더와, 불러올 때 코드로 그린 텍스처만 쓴다.
// 하늘·지구·천체는 cosmos.ts의 실제 거리 배치를 고도에 맞춰 줄인 별도 장면(cosmos)에 그리고,
// 구름·먼지는 코인과 같은 장면(group)에서 코인 곁을 지나간다.
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LinearMipmapLinearFilter,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  type Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  RedFormat,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
  type Texture,
} from 'three';
import { smooth } from '../core/math';
import { altitudeAt } from './altitude';
import {
  AU, cosmosView, EARTH_R, earthRotation, eclipticNormal, GALAXIES, galaxyNormal, galaxyPos, GALAXY_R, HOME, logAlt, MIN_PLANET, MOON_R, moonPos, PLANETS, planetPos,
  shownRadius, sunPos, SUN_R, systemFade,
} from './cosmos';
import landKoreaUrl from './earth-land-korea.png';
import landUrl from './earth-land.png';

const SUN = new Vector3(-0.5, 0.6, 0.6).normalize();

// ---- 텍스처용 값 잡음 (구름·먼지 자리 뽑기와 토성 고리) ----
function hash(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
/** 1차원 값 잡음 */
function noise1(t: number, seed: number) {
  const i = Math.floor(t);
  return lerp(hash(i, seed, 0), hash(i + 1, seed, 0), smooth(0, 1, t - i));
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function canvasTexture(c: HTMLCanvasElement) {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

// ---- 행성 표면: GLSL로 그려 불러올 때 GPU에서 한 번만 텍스처로 굽는다 (CPU로 그리면 몇 초 걸린다) ----
/** '#rrggbb' → GLSL vec3 (sRGB 값 그대로. 섞은 뒤 마지막에 선형으로 바꾼다) */
const v3 = (hex: string) => `vec3(${rgb(hex).map((c) => (c / 255).toFixed(4)).join(', ')})`;

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
function bake(renderer: WebGLRenderer, w: number, h: number, glsl: string) {
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
function bakeEarth(renderer: WebGLRenderer, earthMap: Texture) {
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
const bakePlanet = (renderer: WebGLRenderer, paint: string, w: number) =>
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

/** 일러스트풍 행성: 경계가 또렷한 명암 + 테두리 빛 */
function planetMaterial(map: Texture, rim: string) {
  return new ShaderMaterial({
    uniforms: {
      map: { value: map },
      uSun: { value: SUN },
      uRim: { value: new Color(rim) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal, vView;
      varying vec2 vUv;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - world.xyz);
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 uSun, uRim;
      varying vec3 vNormal, vView;
      varying vec2 vUv;
      void main() {
        vec3 n = normalize(vNormal);
        float sun = dot(n, uSun);
        float light = 0.2 + 0.8 * smoothstep(-0.05, 0.25, sun);
        // 밤낮 경계에 따뜻한 노을 띠
        vec3 dusk = vec3(1.0, 0.55, 0.3) * (smoothstep(-0.12, 0.05, sun) - smoothstep(0.05, 0.3, sun)) * 0.25;
        float rim = pow(1.0 - max(dot(n, normalize(vView)), 0.0), 3.0);
        vec3 col = texture2D(map, vUv).rgb * (light + dusk) + uRim * rim * 0.8;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

const UNIT_SPHERE = new SphereGeometry(1, 64, 32);
/** 반지름 1인 행성. 매 프레임 실제 크기에 맞춰 늘려 놓는다 */
const planet = (map: Texture, rim: string) => new Mesh(UNIT_SPHERE, planetMaterial(map, rim));

function saturnRing(radius: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  const inner = (256 * 1.35) / 2.3;
  const pale = rgb('#ecdcb4'), dusty = rgb('#b39f7c');
  for (let r = inner; r < 256; r += 1) {
    const t = (r - inner) / (256 - inner);
    const n = noise1(t * 40, 1) * 0.6 + noise1(t * 140, 2) * 0.4;
    const gap = t > 0.6 && t < 0.66 ? 0.08 : t > 0.9 && t < 0.91 ? 0.3 : 1; // 카시니·엥케 간극
    const a = (0.25 + 0.65 * n) * smooth(0, 0.08, t) * gap;
    const [cr, cg, cb] = mixRgb(dusty, pale, smooth(0.15, 0.55, t) * (0.6 + 0.4 * n));
    ctx.strokeStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${a})`;
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  const ring = new Mesh(
    new RingGeometry(radius * 1.35, radius * 2.3, 96),
    new ShaderMaterial({
      uniforms: { map: { value: canvasTexture(c) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); #include <colorspace_fragment>\n }',
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2 + 0.45;
  return ring;
}

// ---- 하늘: 화면 전체 사각형. 카메라 방향마다 색을 정하고 별·은하수를 얹는다 ----
const SKY: readonly [number, string, string][] = [
  [0, '#f8f3e6', '#f8f3e6'],
  [4, '#f8f8f7', '#f0f3f2'],
  [8, '#dcedf5', '#a9d3ef'],
  [16, '#c2e1f3', '#5e9fdc'],
  [21, '#5d7fbd', '#1c3670'],
  [26, '#141b33', '#04060d'],
  [57, '#141b33', '#04060d'],
  [74, '#1c1233', '#07040f'],
  [106, '#07060d', '#020206'],
];

/** 하늘과 지구. 지구는 화면 픽셀마다 광선이 구에 닿는지 계산해 그려, 땅에 붙어 있을 때부터 은하 밖까지 어느 배율에서도 둥글고 매끈하다 */
function createSky(camera: PerspectiveCamera, surface: ReturnType<typeof bakeEarth>) {
  const mat = new ShaderMaterial({
    uniforms: {
      uHorizon: { value: new Color() },
      uZenith: { value: new Color() },
      uStars: { value: 0 },
      uBand: { value: 0 },
      uTime: { value: 0 },
      uInvProj: { value: camera.projectionMatrixInverse },
      uCamWorld: { value: camera.matrixWorld },
      uEarthMap: { value: surface.earthMap },
      uLand: { value: surface.world.land },
      uLandKr: { value: surface.korea.land },
      uSurface: { value: surface.world.surface },
      uSurfaceKr: { value: surface.korea.surface },
      uEarthRot: { value: earthRotation() }, // 땅 위 카메라 바로 아래가 포항, 화면 안쪽이 북쪽
      uEarthC: { value: new Vector3() }, // 카메라에서 지구 중심 (장면 단위)
      uEarthR: { value: 1 },
      uEarthQ: { value: 1 }, // |c|² - r²: 땅에 가까울 때 float로 빼면 깨져 JS에서 미리 구한다
      uMeter: { value: 1 }, // 장면 단위 → m
      uFar: { value: 1 }, // 먼 땅이 대기에 옅어지는 정도 (지구를 공으로 볼 즈음엔 끈다)
      uHaze: { value: 1 },
      uAir: { value: 0 },
      uSun: { value: SUN },
    },
    vertexShader: /* glsl */ `
      uniform mat4 uInvProj, uCamWorld;
      varying vec3 vDir;
      void main() {
        vec4 p = uInvProj * vec4(position.xy, 1.0, 1.0);
        vDir = (uCamWorld * vec4(p.xyz / p.w, 0.0)).xyz;
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uHorizon, uZenith, uEarthC, uSun;
      uniform float uStars, uBand, uTime, uEarthR, uEarthQ, uMeter, uFar, uHaze, uAir;
      uniform sampler2D uEarthMap, uLand, uLandKr, uSurface, uSurfaceKr;
      uniform mat3 uEarthRot;
      varying vec3 vDir;
      // 정밀 육지 윤곽(earth-land-korea.png)의 범위: 동경 124~134°, 북위 31~41°
      const vec2 KR0 = vec2(124.0, 31.0) * 0.01745329;
      const float KR_SPAN = 10.0 * 0.01745329;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      // 방향을 격자로 나눠 칸마다 별 하나를 둘지 정한다
      float stars(vec3 d, float scale, float density) {
        vec3 p = d * scale, c = floor(p);
        if (hash(c) > density) return 0.0;
        vec3 o = vec3(hash(c + 1.7), hash(c + 3.1), hash(c + 5.9)) - 0.5;
        float r = length(fract(p) - 0.5 - o * 0.6);
        float twinkle = 0.75 + 0.25 * sin(uTime * (1.5 + hash(c + 9.0) * 3.0) + hash(c) * 40.0);
        return smoothstep(0.12, 0.0, r) * twinkle * (0.4 + 0.6 * hash(c + 2.3));
      }
      /** 지구 표면 색: 구워 둔 표면 지도 + 행성 재질과 같은 명암 + 멀수록 옅은 하늘색 대기, 낮은 고도에선 지평선 색 안개 */
      vec3 earth(vec3 d, float t) {
        vec3 n = normalize(d * t - uEarthC);
        vec3 e = uEarthRot * n;
        vec2 uv = vec2(atan(e.z, e.x) / 6.2831853, asin(clamp(e.y, -1.0, 1.0)) / 3.14159265 + 0.5);
        // 경도가 한 바퀴 넘어가는 이음매에서 밉맵이 튀지 않게 기울기를 감아서 넘긴다
        vec2 dx = dFdx(uv), dy = dFdy(uv);
        dx.x -= floor(dx.x + 0.5);
        dy.x -= floor(dy.x + 0.5);
        float sun = dot(n, uSun);
        float light = 0.2 + 0.8 * smoothstep(-0.05, 0.25, sun);
        vec3 dusk = vec3(1.0, 0.55, 0.3) * (smoothstep(-0.12, 0.05, sun) - smoothstep(0.05, 0.3, sun)) * 0.25;
        float rim = pow(1.0 - max(dot(n, -d), 0.0), 3.0);
        // 포항 주변은 정밀 지도, 나머지는 세계 지도. 육지·바다는 화면 픽셀마다 갈라 해안선이 또렷하다
        float lon = atan(-e.z, e.x), lat = asin(clamp(e.y, -1.0, 1.0));
        vec2 gw = vec2(lon / 6.2831853 + 0.5, lat / 3.14159265 + 0.5);
        vec2 gdx = dFdx(gw), gdy = dFdy(gw);
        gdx.x -= floor(gdx.x + 0.5);
        gdy.x -= floor(gdy.x + 0.5);
        vec2 kr = (vec2(lon, lat) - KR0) / KR_SPAN;
        float inKr = smoothstep(0.0, 0.15, min(min(kr.x, kr.y), 1.0 - max(kr.x, kr.y))); // 두 지도의 결이 달라 넓게 섞는다
        vec4 land = mix(textureGrad(uSurface, fract(gw), gdx, gdy), texture(uSurfaceKr, kr), inKr);
        float coast = mix(textureGrad(uLand, fract(gw), gdx * 16.0, gdy * 16.0).r, texture(uLandKr, kr, 4.0).r, inKr); // 번진 윤곽: 해안 가까울수록 얕게
        float m = land.a;
        float aa = fwidth(m) * 0.7 + 1e-3;
        vec3 water = mix(${v3('#123f8c')}, ${v3('#1f5fb3')}, smoothstep(0.0, 0.3, coast));
        water = mix(water, ${v3('#4a9fd6')}, smoothstep(0.3, 0.5, m) * smoothstep(0.02, 0.1, coast)); // 먼 바다엔 얕은 빛이 안 뜨게
        vec3 ground = mix(${v3('#ecdcaa')}, land.rgb, smoothstep(0.5, 0.62, m));
        vec3 surface = mix(mix(water, ground, smoothstep(0.5 - aa, 0.5 + aa, m)), ${v3('#f7f8f6')}, textureGrad(uEarthMap, fract(uv), dx, dy).a);
        vec3 col = surface * (light + dusk) + vec3(0.1, 0.27, 0.55) * rim * 0.8 * uAir;
        float distant = 1.0 - exp(-t * uMeter / 6e5);
        col = mix(col, vec3(0.42, 0.62, 0.85), distant * 0.8 * light * uFar);
        return mix(col, uHorizon, uHaze);
      }
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(uHorizon, uZenith, smoothstep(-0.15, 0.6, d.y));
        if (uStars > 0.0) col += uStars * (stars(d, 110.0, 0.05) * vec3(1.0, 0.95, 0.85) + stars(d, 240.0, 0.08) * 0.6);
        if (uBand > 0.0) {
          // 은하 안에서 보이는 별무리 띠
          float lat = dot(d, normalize(vec3(0.35, 0.25, 0.9)));
          float n = noise(d * 5.0) * 0.6 + noise(d * 13.0) * 0.4;
          float band = exp(-lat * lat * 18.0) * smoothstep(0.3, 0.8, n);
          col += uBand * band * mix(vec3(0.45, 0.35, 0.9), vec3(1.0, 0.6, 0.75), n) * 0.6;
          col += uBand * stars(d, 400.0, 0.25 * exp(-lat * lat * 10.0)) * 0.8;
        }
        float b = dot(d, uEarthC);
        float disc = b * b - uEarthQ;
        // 낮은 고도에선 땅이 지평선 색 안개에 완전히 묻히므로 무거운 지구 계산을 건너뛴다
        if (b > 0.0 && disc > 0.0) col = uHaze < 1.0 ? earth(d, uEarthQ / (b + sqrt(disc))) : uHorizon; // 가까운 교점 (뺄셈 없이)
        else if (b > 0.0 && uAir > 0.0) {
          // 우주에서 본 지구 윤곽 바깥의 얇은 대기 띠
          float h = sqrt(max(dot(uEarthC, uEarthC) - b * b, 0.0)) - uEarthR;
          float lit = 0.25 + 0.75 * smoothstep(-0.3, 0.4, dot(normalize(d * b - uEarthC), uSun));
          col += vec3(0.44, 0.71, 1.0) * exp(-max(h, 0.0) / (0.012 * uEarthR)) * lit * uAir * 0.8;
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new Mesh(new PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10; // 가장 먼 깊이에 불투명 물체 다음 그려 가려진 픽셀은 건너뛴다. 지구도 여기 있어 다른 천체는 늘 지구 앞에 온다
  return { mesh, uniforms: mat.uniforms };
}

/** 우리 은하: 구워 둔 큰 구조 위에 낱별을 화면 픽셀 크기로 얹는다.
 * 별 칸을 여러 크기로 두고, 화면에서 칸이 몇 px 이상일 때만 그려 다가갈수록 별이 하나씩 더 드러난다 */
function createGalaxy(map: Texture) {
  const mat = new ShaderMaterial({
    uniforms: { map: { value: map }, uOpacity: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float uOpacity;
      varying vec2 vUv;
      float hash(vec2 p) {
        vec3 q = fract(vec3(p.xyx) * 0.1031);
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }
      /** 한 변에 n칸, 칸마다 확률 density로 별 하나. px: 화면 1px에 해당하는 uv 길이 */
      float stars(float n, float density, float px) {
        float cellPx = 1.0 / (n * px);
        if (cellPx < 3.0) return 0.0;
        vec2 g = vUv * n, c = floor(g);
        float h = hash(c);
        if (h > density) return 0.0;
        vec2 o = vec2(hash(c + 7.1), hash(c + 3.3)) * 0.6 + 0.2;
        float d = length(fract(g) - o) * cellPx; // px 단위 거리
        return smoothstep(1.4, 0.3, d) * (0.4 + 0.6 * hash(c + 1.9)) * smoothstep(3.0, 8.0, cellPx);
      }
      void main() {
        vec3 base = texture2D(map, vUv).rgb;
        float px = max(length(fwidth(vUv)) * 0.7, 1e-7);
        float lum = dot(base, vec3(0.3, 0.5, 0.2));
        float density = clamp(lum * 0.6, 0.01, 0.25) * (1.0 - smoothstep(0.85, 1.0, length(vUv * 2.0 - 1.0)));
        float s = stars(256.0, density, px) + stars(768.0, density, px) + stars(2304.0, density, px) + stars(6912.0, density, px);
        vec3 tint = mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.92, 0.8), smoothstep(0.2, 0.6, lum));
        gl_FragColor = vec4((base + tint * min(s, 1.5) * 0.8) * uOpacity, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  return { mesh: new Mesh(new PlaneGeometry(2, 2), mat), uniforms: mat.uniforms };
}

/** 다른 은하 하나: 구워 둔 은하 그림을 색만 조금 바꿔 그린다. uOpacity는 모두 같은 값을 나눠 쓴다 */
function farGalaxy(map: Texture, tint: Color, opacity: { value: number }) {
  return new Mesh(PLANE, new ShaderMaterial({
    uniforms: { map: { value: map }, uTint: { value: tint }, uOpacity: opacity },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 uTint;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        gl_FragColor = vec4(texture2D(map, vUv).rgb * uTint * uOpacity, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  }));
}
const PLANE = new PlaneGeometry(2, 2);

function mistTexture(seed: number) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  // 옅은 빛 덩어리를 가로로 길게 흩뿌려 겹친다: 테두리 없이 번지는 안개 띠
  for (let i = 0; i < 40; i++) {
    const t = hash(seed, i, 1);
    const x = 128 + (t - 0.5) * 190;
    const y = 64 + (hash(seed, i, 2) - 0.5) * 40 * Math.sin(t * Math.PI);
    const r = 18 + hash(seed, i, 3) * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return canvasTexture(c);
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return canvasTexture(c);
}

const DUST = 220;
const DUST_SPAN = 30; // 카메라 주변 이 높이 안에서 먼지를 되감아 돌린다

/** 육지 윤곽 지도 (Natural Earth 육지를 등장방형으로 그린 것, 흰색이 육지) */
function landMap(url: string, onLoad: () => void) {
  const t = new TextureLoader().load(url, onLoad);
  t.format = RedFormat;
  return t;
}

/** 실제 위치(m)·반지름(m)인 천체를 카메라 기준으로 줄여 놓는다 */
function place(obj: Object3D, pos: Vector3, radius: number, cam: Vector3, k: number) {
  obj.position.subVectors(pos, cam).multiplyScalar(k);
  obj.scale.setScalar(radius * k);
}

const ORBIT_SEGMENTS = 256;

export function createScenery(camera: PerspectiveCamera, renderer: WebGLRenderer) {
  const group = new Group();
  // 하늘·지구·천체는 따로 그린다: 코인 카메라와 같은 방향으로 원점에서 본다
  const cosmos = new Scene();
  const cosmosCamera = new PerspectiveCamera(camera.fov, 1, 1, 1e7);
  const sky = createSky(cosmosCamera, bakeEarth(renderer, bake(renderer, 2048, 1024, EARTH)));
  const moon = planet(bakePlanet(renderer, MOON, 1024), '#ffffff');
  const paints = {
    mercury: [MERCURY, '#e8e0d6'],
    venus: [VENUS, '#fff0d0'],
    mars: [MARS, '#ffb38a'],
    jupiter: [JUPITER, '#ffe2b8'],
    saturn: [SATURN, '#fff0c8'],
    uranus: [URANUS, '#d8fbff'],
    neptune: [NEPTUNE, '#9cc0ff'],
  } as const;
  const planets = PLANETS.map((p) => {
    const [paint, rim] = paints[p.name];
    return { ...p, pos: planetPos(p.orbit, p.angle), mesh: planet(bakePlanet(renderer, paint, 512), rim) };
  });
  planets.find((p) => p.name === 'saturn')!.mesh.add(saturnRing(1));
  const sunAt = sunPos();
  const sun = new Sprite(new SpriteMaterial({ map: dotTexture(), color: '#ffe6a8', blending: AdditiveBlending, transparent: true, depthWrite: false }));
  const circle = new BufferGeometry().setFromPoints(
    Array.from({ length: ORBIT_SEGMENTS }, (_, i) => new Vector3(Math.cos((i / ORBIT_SEGMENTS) * Math.PI * 2), 0, Math.sin((i / ORBIT_SEGMENTS) * Math.PI * 2))),
  );
  const orbitMat = new LineBasicMaterial({ color: '#9fb4e0', transparent: true, depthWrite: false, opacity: 0 });
  const orbits = [AU, ...PLANETS.map((p) => p.orbit)].map((r) => ({ r, line: new LineLoop(circle, orbitMat) }));
  for (const o of orbits) o.line.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), eclipticNormal());
  const moonAt = moonPos();
  const galaxyAt = galaxyPos();
  const galaxyAxis = new Vector3(0, 0, 1); // 원판(PlaneGeometry)의 법선
  const galaxyTilt = new Quaternion().setFromUnitVectors(galaxyAxis, galaxyNormal());
  const galaxySpin = new Quaternion();
  const galaxyMap = bake(renderer, 2048, 2048, GALAXY);
  const galaxy = createGalaxy(galaxyMap);
  const ellipticalMap = bake(renderer, 128, 128, ELLIPTICAL);
  const fieldOpacity = { value: 0 };
  const field = GALAXIES.map((g) => {
    const tint = g.spiral ? new Color().lerpColors(new Color('#c9d6ff'), new Color('#fff0dc'), g.hue) : new Color('#fff4e6');
    const mesh = farGalaxy(g.spiral ? galaxyMap : ellipticalMap, tint, fieldOpacity);
    // 같은 그림이 같은 모양으로 보이지 않게 원판 안에서도 제각각 돌려 둔다
    mesh.quaternion.setFromUnitVectors(galaxyAxis, g.normal).multiply(new Quaternion().setFromAxisAngle(galaxyAxis, g.hue * Math.PI * 2));
    return { ...g, mesh };
  });
  cosmos.add(sky.mesh, moon, sun, galaxy.mesh, ...planets.map((p) => p.mesh), ...orbits.map((o) => o.line), ...field.map((g) => g.mesh));

  // 안개 구름: 높이 10~15(약 1~8km) 사이를 실제로 지나간다. 코인 앞 가운데는 비워 둔다
  const clouds: Sprite[] = [];
  const mists = [0, 1, 2].map((k) => new SpriteMaterial({ map: mistTexture(k), fog: false, depthWrite: false, transparent: true }));
  for (let i = 0; i < 42; i++) {
    let x = 0, z = 0;
    for (let k = 0; k === 0 || (Math.abs(x) < 2.6 && z > -4); k++) {
      x = (hash(i, 1, k) - 0.5) * 26;
      z = -18 + hash(i, 2, k) * 20;
    }
    const s = new Sprite(mists[i % 3]);
    const size = 4 + hash(i, 3, 0) * 6;
    s.scale.set(size, size / 2.5, 1);
    s.position.set(x, 10 + hash(i, 4, 0) * 5, z);
    clouds.push(s);
    group.add(s);
  }

  // 먼지: 카메라 주변을 감싸며 지나가 어디서든 오르내리는 느낌을 준다
  const base = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    base[i * 3] = (hash(i, 7, 0) - 0.5) * 22;
    base[i * 3 + 1] = hash(i, 8, 0) * DUST_SPAN;
    base[i * 3 + 2] = -16 + hash(i, 9, 0) * 20;
  }
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute('position', new Float32BufferAttribute(base.slice(), 3));
  const dustMat = new PointsMaterial({ map: dotTexture(), size: 0.09, transparent: true, depthWrite: false, fog: false, opacity: 0 });
  const dust = new Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  group.add(dust);

  const horizon = new Color();
  const zenith = new Color();
  const tmp = new Color();
  const toEarth = new Vector3();

  return {
    group,
    /** 하늘·지구·천체 장면과 카메라. 코인 장면보다 먼저 그린다 */
    cosmos,
    cosmosCamera,
    /** 높이 h에서의 지평선 색 (바닥 안개 색과 맞춘다) */
    horizon,
    update(h: number, time: number) {
      let i = 0;
      while (i < SKY.length - 2 && h > SKY[i + 1][0]) i++;
      const [h0, hz0, zn0] = SKY[i];
      const [h1, hz1, zn1] = SKY[i + 1];
      const t = smooth(h0, h1, h);
      horizon.set(hz0).lerp(tmp.set(hz1), t);
      zenith.set(zn0).lerp(tmp.set(zn1), t);
      const u = sky.uniforms;
      (u.uHorizon.value as Color).copy(horizon);
      (u.uZenith.value as Color).copy(zenith);
      u.uTime.value = time;

      cosmosCamera.fov = camera.fov;
      cosmosCamera.aspect = camera.aspect;
      cosmosCamera.updateProjectionMatrix();
      cosmosCamera.quaternion.copy(camera.quaternion);
      const a = altitudeAt(h);
      const L = logAlt(a);
      const { cam, k } = cosmosView(a);
      const fade = systemFade(a);
      // 태양계 과장은 태양 쪽으로 돌아볼 즈음부터 (지구 곁에선 행성이 공처럼 떠 보이지 않게)
      const planetMin = MIN_PLANET * fade * smooth(9, 10, L);

      // 지구: 6km 아래는 지평선 색 안개에 묻혀 있다가 100km쯤 또렷해지고, 그 위로 얇은 대기 띠가 생긴다
      toEarth.copy(cam).negate();
      const dist = toEarth.length();
      const earthR = shownRadius(EARTH_R, dist, MIN_PLANET * fade);
      (u.uEarthC.value as Vector3).copy(toEarth).multiplyScalar(k);
      u.uEarthR.value = earthR * k;
      u.uEarthQ.value = (dist - earthR) * (dist + earthR) * k * k;
      u.uMeter.value = 1 / k;
      u.uFar.value = 1 - smooth(5.6, 6.6, L);
      u.uHaze.value = 1 - smooth(3.8, 5, L);
      u.uAir.value = smooth(4.7, 5.4, L);
      // 은하 밖에선 주변 별이 옅어지고 다른 은하들이 눈에 띈다
      u.uStars.value = smooth(19, 27, h) * (1 - 0.65 * smooth(20.2, 21, L));
      // 은하 안에서 보이던 별무리 띠는 은하를 밖에서 보게 되면 원판으로 바뀐다
      u.uBand.value = smooth(12.15, 12.65, L) * (1 - smooth(19, 20.2, L));

      place(moon, moonAt, MOON_R, cam, k);
      moon.rotation.y = time * 0.05;
      for (const p of planets) {
        place(p.mesh, p.pos, shownRadius(p.r, p.pos.distanceTo(cam), planetMin * p.boost), cam, k);
        p.mesh.rotation.y = time * 0.05;
      }
      // 태양은 빛무리로, 태양계를 벗어나면 점보다 작아진다
      place(sun, sunAt, shownRadius(SUN_R, sunAt.distanceTo(cam), 0.012 * (1 - smooth(13.5, 15, L))) * 5, cam, k);
      orbitMat.opacity = smooth(9.8, 10.6, L) * fade * 0.45;
      for (const o of orbits) {
        o.line.visible = orbitMat.opacity > 0;
        place(o.line, sunAt, o.r, cam, k);
      }
      place(galaxy.mesh, galaxyAt, GALAXY_R, cam, k);
      galaxy.mesh.quaternion.copy(galaxyTilt).multiply(galaxySpin.setFromAxisAngle(galaxyAxis, time * 0.01));
      galaxy.uniforms.uOpacity.value = smooth(19, 20.2, L);
      galaxy.mesh.visible = galaxy.uniforms.uOpacity.value > 0;
      // 우리 은하를 벗어나면 그 너머의 은하들이 보인다
      fieldOpacity.value = smooth(20.2, 20.9, L);
      for (const g of field) {
        g.mesh.visible = fieldOpacity.value > 0;
        place(g.mesh, g.pos, g.r, cam, k);
        if (!g.spiral) g.mesh.scale.y *= 0.6;
      }

      // 구름 위로 올라서면 아래에 깔린 채 보이다가, 지구가 드러날 즈음(약 13~50km) 걷힌다
      const mist = 1 - smooth(17, 21, h);
      for (const m of mists) m.opacity = mist;
      for (const c of clouds) c.visible = mist > 0;

      const cy = camera.position.y - DUST_SPAN / 2;
      const pos = dustGeo.getAttribute('position');
      for (let k = 0; k < DUST; k++) {
        const y = base[k * 3 + 1];
        pos.setY(k, cy + ((((y - cy) % DUST_SPAN) + DUST_SPAN) % DUST_SPAN));
      }
      pos.needsUpdate = true;
      dustMat.opacity = smooth(3, 9, h) * 0.45 + smooth(20, 28, h) * 0.4;
    },
  };
}
