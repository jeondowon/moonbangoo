// 코인 모양과 재질. 면은 거울처럼 광낸 금색 바탕에 무광 처리한 로고만 크게 얹는다 (프루프 주화풍).
// 로고는 색과 무관하게 모양(알파)만 쓰므로 뒷면 로고가 어떤 색 SVG여도 그대로 바꿔 끼우면 된다.
import {
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  type Material,
  type WebGLRenderer,
} from 'three';
import { createStudioEnv } from '../gfx/env';
import { smooth } from '../core/math';
import { boxBlur, HeightField, readChannel, valueNoise, whiteNoise } from '../gfx/surface';
import { parseSvg, rasterize, toTexture } from '../gfx/svg';
import { COIN_R, COIN_T } from './physics';

const FRONT_LOGO = new URL('../../design/logo/logo-mono.svg', import.meta.url).href;
const BACK_LOGO = new URL('../../design/logo/coin-back.svg', import.meta.url).href;
const SIZE = 1024;
const LOGO_WIDTH = 0.72; // 지름 대비
// 연한 샴페인 골드. 로고는 바탕보다 눈에 띄게 밝게
// light: 비치는 방을 이만큼 밝게 비춰 코인을 연하게 보이게 한다
const GOLD = { base: '#f3deae', raised: '#fff5df', light: 1.15 };
const RELIEF = 4.5; // 로고 가장자리 경사의 세기
// 실제 주화처럼: 바탕이 테두리 쪽으로 살짝 오목하게 올라가 반사가 한 면에서도 밝고 어둡게 흐르고, 가장자리엔 테두리 턱이 선다
const RIM = 0.9; // 반지름 대비 테두리 턱이 시작하는 곳
const DISH = 4; // 바탕이 테두리까지 올라가는 높이 (로고 높이 1 기준). 실제 주화처럼 눈으로는 평평해 보일 만큼만
const RIM_H = 3;
const SCRATCHES = 0; // 깔끔하게 보이도록 끔. 되살리려면 260
const GRIME = 0; // 손때 세기. 깔끔하게 보이도록 끔. 0.4면 은은하게, 1이면 눈에 띄게 얼룩진다

/** SIZE×SIZE 투명 캔버스에 모양만 그린다. 색·거칠기·높이 맵마다 tinted()로 칠해 겹친다 */
function layer(draw: (ctx: CanvasRenderingContext2D) => void) {
  const { c, ctx } = canvas2d();
  ctx.fillStyle = ctx.strokeStyle = '#fff';
  draw(ctx);
  return c;
}

function canvas2d() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  return { c, ctx: c.getContext('2d')! };
}

/** 모양을 한 가지 색으로 칠한 캔버스 */
function tinted(shape: HTMLCanvasElement, color: string) {
  const { c, ctx } = canvas2d();
  ctx.drawImage(shape, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SIZE, SIZE);
  return c;
}

async function logoLayer(url: string) {
  const svg = parseSvg(await (await fetch(url)).text());
  const box = svg.viewBox.baseVal;
  const scale = (SIZE * LOGO_WIDTH) / Math.max(box.width, box.height);
  const w = Math.round(box.width * scale);
  const h = Math.round(box.height * scale);
  const image = await rasterize(svg, w, h);
  return layer((ctx) => ctx.drawImage(image, (SIZE - w) / 2, (SIZE - h) / 2));
}

/** 넓은 얼룩(0~1). 손때로 색과 광택이 고르지 않은 곳 */
function blotches() {
  const out = new Float32Array(SIZE * SIZE);
  for (let y = 0, i = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++, i++) out[i] = valueNoise(x / 110, y / 110, 3) * 0.6 + valueNoise(x / 28, y / 28, 5) * 0.4;
  }
  return out;
}

/** 사방으로 난 잔 긁힘 (흰 선, 0~1) */
function scratches() {
  const { c, ctx } = canvas2d();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  const rand = (i: number, k: number) => whiteNoise(i, k, 11);
  for (let i = 0; i < SCRATCHES; i++) {
    const x = rand(i, 0) * SIZE;
    const y = rand(i, 1) * SIZE;
    const a = rand(i, 2) * Math.PI;
    const len = 15 + rand(i, 3) ** 2 * 160;
    ctx.globalAlpha = 0.15 + rand(i, 4) * 0.45;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.3) * len * 0.5, y + Math.sin(a + 0.3) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  return readChannel(c);
}

function grayCanvas(values: (i: number) => number) {
  const { c, ctx } = canvas2d();
  const img = ctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.min(1, Math.max(0, values(i))) * 255;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function colorMap(renderer: WebGLRenderer, logo: HTMLCanvasElement, grime: HTMLCanvasElement) {
  const color = canvas2d();
  color.ctx.fillStyle = GOLD.base;
  color.ctx.fillRect(0, 0, SIZE, SIZE);
  color.ctx.drawImage(tinted(logo, GOLD.raised), 0, 0);
  color.ctx.globalCompositeOperation = 'multiply';
  color.ctx.drawImage(grime, 0, 0);
  return toTexture(color.c, renderer);
}

async function faceMaterial(renderer: WebGLRenderer, url: string) {
  const logo = await logoLayer(url);
  const height = canvas2d();
  height.ctx.fillStyle = '#000';
  height.ctx.fillRect(0, 0, SIZE, SIZE);
  height.ctx.drawImage(tinted(logo, '#fff'), 0, 0);
  const mask = readChannel(height.c);
  const scratch = scratches();
  const blot = blotches();

  // 색: 손때 묻은 곳이 아주 조금 어둡다
  const grime = grayCanvas((i) => 1 - 0.07 * GRIME * blot[i]);

  // 거칠기(G 채널): 프루프 주화처럼 바탕은 광택, 로고는 무광이라 밝고 부드럽게 도드라진다.
  // 바탕을 완전한 거울로 하면 어두운 방 벽이 그대로 비쳐 금색이 어두워지므로 광택을 조금 풀어 조명이 퍼지게 한다.
  // 손때와 잔 긁힘으로 광택이 고르지 않게 한다
  const rough = grayCanvas((i) => 0.29 + 0.26 * mask[i] + 0.14 * GRIME * (blot[i] - 0.5) + 0.22 * scratch[i]);

  // 높이: 로고만 살짝 솟게. 번지게 해 모서리가 둥글게 보이게 (좁으면 멈췄을 때 선이 계단처럼 깨진다). 바탕은 오목하게, 가장자리엔 테두리 턱.
  // bumpMap은 화면에서 8비트 높이를 미분해 가장자리가 계단처럼 지글거리므로 미리 노멀맵으로 굽는다
  const relief = new HeightField(SIZE, SIZE);
  relief.data.set(boxBlur(boxBlur(mask, SIZE, SIZE, 2), SIZE, SIZE, 2));
  relief.add((x, y) => {
    const r = Math.hypot(x + 0.5 - SIZE / 2, y + 0.5 - SIZE / 2) / (SIZE / 2);
    return DISH * Math.min(r, RIM) ** 2 + RIM_H * smooth(RIM, RIM + 0.025, r);
  });

  return new MeshStandardMaterial({
    map: colorMap(renderer, logo, grime),
    roughnessMap: toTexture(rough, renderer, false),
    normalMap: toTexture(relief.toNormalCanvas(RELIEF), renderer, false),
    metalness: 1,
    roughness: 1,
  });
}

/** 옆면 톱니 (500원 동전처럼 세로 홈) */
function edgeMaterial(renderer: WebGLRenderer) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 4;
  const ctx = c.getContext('2d')!;
  const reeds = 64;
  for (let i = 0; i < reeds; i++) {
    const g = ctx.createLinearGradient((i * 512) / reeds, 0, ((i + 1) * 512) / reeds, 0);
    g.addColorStop(0, '#000');
    g.addColorStop(0.5, '#fff');
    g.addColorStop(1, '#000');
    ctx.fillStyle = g;
    ctx.fillRect((i * 512) / reeds, 0, 512 / reeds, 4);
  }
  const bump = toTexture(c, renderer, false);
  bump.wrapS = RepeatWrapping;
  bump.repeat.x = 2; // 한 바퀴 128개
  return new MeshStandardMaterial({ color: GOLD.base, metalness: 1, roughness: 0.38, bumpMap: bump, bumpScale: 1.5 });
}

export type CoinMaterials = [front: Material, back: Material, edge: Material];

export async function createCoinMaterials(renderer: WebGLRenderer): Promise<CoinMaterials> {
  const [front, back] = await Promise.all([faceMaterial(renderer, FRONT_LOGO), faceMaterial(renderer, BACK_LOGO)]);
  const mats: CoinMaterials = [front, back, edgeMaterial(renderer)];
  // 장면과 같은 베이지 방을 비춘다. 장면 환경(scene.environment)에 기대면 envMapIntensity가 듣지 않으므로 재질에 직접 단다
  const envMap = createStudioEnv(renderer, 'pack');
  for (const m of mats) Object.assign(m, { envMap, envMapIntensity: GOLD.light });
  return mats;
}

const faceGeometry = new CircleGeometry(COIN_R, 96);
const edgeGeometry = new CylinderGeometry(COIN_R, COIN_R, COIN_T, 96, 1, true);

/** 코인 한 개. 축은 +Y, 윗면(+Y)이 앞면. 원판은 정면(+Z)에서 그림이 바로 보이므로 눕혀서 쓴다 */
export function createCoin([front, back, edge]: CoinMaterials) {
  const group = new Group();
  const top = new Mesh(faceGeometry, front);
  top.rotation.x = -Math.PI / 2; // 그림 위쪽이 화면 안쪽(-Z)을 향한다
  top.position.y = COIN_T / 2;
  // 뒤집으면(X축 반 바퀴) 그림 위쪽이 다시 화면 안쪽을 향하도록
  const bottom = new Mesh(faceGeometry, back);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = -COIN_T / 2;
  group.add(top, bottom, new Mesh(edgeGeometry, edge));
  return group;
}
