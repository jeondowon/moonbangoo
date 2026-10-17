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
import { boxBlur, HeightField, readChannel } from '../gfx/surface';
import { parseSvg, rasterize, toTexture } from '../gfx/svg';
import { COIN_R, COIN_T } from './physics';

const FRONT_LOGO = new URL('../../design/logo/logo-mono.svg', import.meta.url).href;
const BACK_LOGO = new URL('../../design/logo/coin-back.svg', import.meta.url).href;
const SIZE = 1024;
const LOGO_WIDTH = 0.72; // 지름 대비
// 차분하고 따뜻한 금색. 로고는 색 차이보다 광택 차이로 도드라지게 아주 조금만 밝게
const BASE = '#f5d48f';
const RAISED = '#fadfa6';
const RELIEF = 2.5; // 로고 가장자리 경사의 세기

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

async function faceMaterial(renderer: WebGLRenderer, url: string) {
  const logo = await logoLayer(url);

  const color = canvas2d();
  color.ctx.fillStyle = BASE;
  color.ctx.fillRect(0, 0, SIZE, SIZE);
  color.ctx.drawImage(tinted(logo, RAISED), 0, 0);

  // 거칠기(G 채널): 프루프 주화처럼 바탕은 광택, 로고는 무광이라 밝고 부드럽게 도드라진다.
  // 바탕을 완전한 거울로 하면 어두운 방 벽이 그대로 비쳐 금색이 어두워지므로 광택을 조금 풀어 조명이 퍼지게 한다
  const rough = canvas2d();
  rough.ctx.fillStyle = '#4a4a4a';
  rough.ctx.fillRect(0, 0, SIZE, SIZE);
  rough.ctx.drawImage(tinted(logo, '#8c8c8c'), 0, 0);

  // 높이: 로고만 살짝 솟게. 번지게 해 모서리가 둥글게 보이게.
  // bumpMap은 화면에서 8비트 높이를 미분해 가장자리가 계단처럼 지글거리므로 미리 노멀맵으로 굽는다
  const height = canvas2d();
  height.ctx.fillStyle = '#000';
  height.ctx.fillRect(0, 0, SIZE, SIZE);
  height.ctx.drawImage(tinted(logo, '#fff'), 0, 0);
  const relief = new HeightField(SIZE, SIZE);
  relief.data.set(boxBlur(boxBlur(readChannel(height.c), SIZE, SIZE, 1), SIZE, SIZE, 1));

  return new MeshStandardMaterial({
    map: toTexture(color.c, renderer),
    roughnessMap: toTexture(rough.c, renderer, false),
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
  return new MeshStandardMaterial({ color: BASE, metalness: 1, roughness: 0.38, bumpMap: bump, bumpScale: 1.5 });
}

export type CoinMaterials = [front: Material, back: Material, edge: Material];

export async function createCoinMaterials(renderer: WebGLRenderer): Promise<CoinMaterials> {
  const [front, back] = await Promise.all([faceMaterial(renderer, FRONT_LOGO), faceMaterial(renderer, BACK_LOGO)]);
  return [front, back, edgeMaterial(renderer)];
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
