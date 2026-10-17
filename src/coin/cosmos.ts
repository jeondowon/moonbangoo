// 천체를 실제 거리(m)로 놓고, 고도 a만큼 떨어진 것이 화면 단위 VIEW에 오도록 통째로 줄여 그린다 (Powers of Ten).
// 카메라는 발사 지점에서 비스듬한 직선 하나(LINE)만 따라 멀어지고, 보는 각도도 바뀌지 않는다.
// 지구는 화면 아래 지평선에서 출발해 가운데 조금 아래의 공이 되어 작아진다. 태양과 은하 중심은 미리 지구 너머
// 시선 방향(화면 위쪽)에 놓여 있어, 멀어질수록 위 가장자리에서 들어와 가운데로 모여든다.
import { Matrix3, Matrix4, Vector3 } from 'three';
import { smooth } from '../core/math';

/** 고도 a(m) 거리를 화면에서 이 거리(장면 단위)로 그린다 */
export const VIEW = 100;
export const EARTH_R = 6.371e6;
export const MOON_R = 1.737e6;
export const SUN_R = 6.96e8;
export const AU = 1.496e11;
export const GALAXY_R = 4.7e20;
const MOON_DIST = 3.844e8;
const MOON_SIDE = 2e7; // 달은 카메라가 지나는 직선에서 이만큼 비켜 있어, 옆을 스쳐 지나간다
const GALAXY_DIST = 2.6e20;
const DEG = Math.PI / 180;
/** 하늘에 뜬 뒤 카메라가 내려다보는 각도 (main.ts pitchAt) */
export const PITCH = 14 * DEG;
const TILT = 8 * DEG; // 멀리서 지구는 화면 가운데(코인)보다 이만큼 아래에 온다

const ELEV = PITCH + TILT;
/** 카메라가 멀어지는 직선 방향: 발사 지점에서 뒤로 비스듬히 위 */
export const LINE = new Vector3(0, Math.sin(ELEV), Math.cos(ELEV));
const SCREEN_UP = new Vector3(0, Math.cos(ELEV), -Math.sin(ELEV)); // 지구 너머에서 화면 위쪽
const RIGHT = new Vector3(1, 0, 0);
const LAUNCH = new Vector3(0, EARTH_R, 0); // 지구 중심이 원점

/** 지구 너머 시선 방향에서 화면 위로 tilt만큼 든 방향, 그리고 그 방향과 화면 가로를 품은 면의 두 축 */
const beyond = (tilt: number) => LINE.clone().multiplyScalar(-Math.cos(tilt)).addScaledVector(SCREEN_UP, Math.sin(tilt));
const SUN_DIR = beyond(40 * DEG); // 궤도면이 40° 기울어 보인다
const GALAXY_DIR = beyond(55 * DEG); // 은하 원판이 55° 기울어 보인다

/** 행성 최소 겉보기 반지름(rad). 실제 크기로는 궤도에 비해 너무 작아 과장해서 보여 준다 */
export const MIN_PLANET = 0.005;

export const sunPos = () => SUN_DIR.clone().multiplyScalar(AU);
export const galaxyPos = () => sunPos().addScaledVector(GALAXY_DIR, GALAXY_DIST);
/** 궤도면·은하 원판의 법선 (원판 위 두 축은 RIGHT와 각 방향) */
export const eclipticNormal = () => new Vector3().crossVectors(SUN_DIR, RIGHT).normalize();
export const galaxyNormal = () => new Vector3().crossVectors(GALAXY_DIR, RIGHT).normalize();

/** 행성: 반지름, 궤도 반지름, 궤도 위 각도(지구는 -π/2), 최소 크기 배율 (큰 행성이 조금 더 크게) */
export const PLANETS = [
  { name: 'mercury', r: 2.44e6, orbit: 5.79e10, angle: 3.5, boost: 0.75 },
  { name: 'venus', r: 6.05e6, orbit: 1.082e11, angle: 0.4, boost: 1 },
  { name: 'mars', r: 3.39e6, orbit: 2.279e11, angle: 2.6, boost: 0.85 },
  { name: 'jupiter', r: 6.99e7, orbit: 7.785e11, angle: 0.5, boost: 2.1 },
  { name: 'saturn', r: 5.82e7, orbit: 1.434e12, angle: 4.0, boost: 1.9 },
  { name: 'uranus', r: 2.54e7, orbit: 2.871e12, angle: 5.2, boost: 1.5 },
  { name: 'neptune', r: 2.46e7, orbit: 4.495e12, angle: 2.1, boost: 1.5 },
] as const;

export const planetPos = (orbit: number, angle: number) =>
  sunPos().addScaledVector(RIGHT, orbit * Math.cos(angle)).addScaledVector(SUN_DIR, orbit * Math.sin(angle));

export const logAlt = (a: number) => Math.log10(Math.max(a, 1));

/** 태양계(행성·궤도) 과장이 줄어드는 정도: 태양계를 벗어나자마자 실제 크기(점보다 작게)로 돌아간다 */
export const systemFade = (a: number) => 1 - smooth(12.65, 13.2, logAlt(a));

/** 지구 텍스처 좌표의 방향: 북극이 +y, 경도 0이 +x, 동쪽으로 갈수록 -z 쪽 */
export const earthDir = (lat: number, lon: number) =>
  new Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
/** 발사 지점: 포항 (북위 36.02°, 동경 129.36°) */
const HOME_LAT = 36.02 * DEG;
const HOME_LON = 129.36 * DEG;
export const HOME = earthDir(HOME_LAT, HOME_LON);
/** 장면 → 지구 텍스처 좌표 회전: 발사 지점 바로 아래가 HOME, 화면 안쪽(-z)이 북쪽 */
export function earthRotation() {
  const north = earthDir(HOME_LAT + Math.PI / 2, HOME_LON); // 발사 지점에서 북쪽으로 향하는 방향
  const east = new Vector3().crossVectors(north, HOME);
  return new Matrix3().setFromMatrix4(new Matrix4().makeBasis(east, HOME, north.negate()));
}

/** 고도 a(m)에서 카메라의 실제 위치(지구 중심 기준 m)와 축소 배율 */
export function cosmosView(a: number) {
  return { cam: LAUNCH.clone().addScaledVector(LINE, Math.max(a, 1)), k: VIEW / Math.max(a, 1) };
}

/** 달: 직선에서 옆으로 비켜, 38만 km를 지날 때 옆을 스친다 */
export const moonPos = () => LINE.clone().multiplyScalar(MOON_DIST).addScaledVector(RIGHT, MOON_SIDE);

/** 그릴 반지름(m): 실제 반지름과, 카메라에서 minAngle(rad)로 보이는 크기 중 큰 쪽 */
export const shownRadius = (r: number, dist: number, minAngle: number) => Math.max(r, minAngle * dist);

/** 우리 은하 밖의 다른 은하들: 지구 너머 시선 방향 원뿔 안 멀리 흩어 둔다. 첫째는 비스듬히 누운 안드로메다 */
export const GALAXIES = (() => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const at = (theta: number, phi: number, dist: number) =>
    LINE.clone().multiplyScalar(-Math.cos(theta))
      .addScaledVector(RIGHT, Math.sin(theta) * Math.cos(phi))
      .addScaledVector(SCREEN_UP, Math.sin(theta) * Math.sin(phi))
      .multiplyScalar(dist);
  const list = [{
    pos: at(14 * DEG, 0.6, 2.4e22),
    r: 6e20,
    spiral: true,
    normal: SCREEN_UP.clone().multiplyScalar(0.97).addScaledVector(LINE, 0.24).normalize(),
    hue: 0.5,
  }];
  for (let i = 0; i < 60; i++) {
    const spiral = rnd() < 0.6;
    const z = rnd() * 2 - 1, w = rnd() * Math.PI * 2;
    list.push({
      pos: at(rnd() * 35 * DEG, rnd() * Math.PI * 2, 6e21 * 33 ** rnd()),
      r: 8e19 * 5 ** rnd(),
      spiral,
      // 나선 은하는 아무 방향으로나 기울고, 타원 은하는 대체로 이쪽을 본다
      normal: spiral
        ? new Vector3(Math.sqrt(1 - z * z) * Math.cos(w), z, Math.sqrt(1 - z * z) * Math.sin(w))
        : LINE.clone().add(new Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.6)).normalize(),
      hue: rnd(),
    });
  }
  return list;
})();
