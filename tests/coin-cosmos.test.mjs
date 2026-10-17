import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { altitudeAt, MILESTONES } from '../src/coin/altitude.ts';
import {
  cosmosView, EARTH_R, earthDir, earthRotation, GALAXIES, galaxyPos, GALAXY_R, HOME, LINE, MIN_PLANET, PITCH, PLANETS, shownRadius, sunPos, systemFade,
} from '../src/coin/cosmos.ts';

const DEG = Math.PI / 180;
const HALF_FOV = 15 * DEG; // main.ts 카메라 세로 시야각 30°의 절반
const FORWARD = new Vector3(0, -Math.sin(PITCH), -Math.cos(PITCH)); // 하늘에 뜬 뒤 카메라가 보는 방향 (바뀌지 않는다)
const at = (name) => altitudeAt(MILESTONES.find((m) => m.name === name).height);
const inView = (cam, target) => target.clone().sub(cam).angleTo(FORWARD) < HALF_FOV;

/** 카메라에서 본 지구의 겉보기 반지름(rad) */
function earthRadius(a) {
  const dist = cosmosView(a).cam.length();
  return Math.asin(Math.min(1, shownRadius(EARTH_R, dist, MIN_PLANET * systemFade(a)) / dist));
}

test('카메라는 발사 지점에서 한 직선 위로만 멀어진다', () => {
  const start = cosmosView(1).cam;
  for (let L = 0.5; L <= 22; L += 0.5) {
    const step = cosmosView(10 ** L).cam.sub(start).normalize();
    assert.ok(step.angleTo(LINE) < 1e-6, `10^${L}m에서 직선을 벗어났다`);
  }
});

test('100km 아래에선 지평선이 화면 가운데보다 위에 거의 평평하게 걸려 있다', () => {
  for (const a of [10, 1e3, 1e4, 1e5]) {
    const dip = Math.acos(EARTH_R / cosmosView(a).cam.length()); // 지평선이 수평 아래로 내려간 각도
    assert.ok(dip < PITCH - 5 * DEG, `${a}m: 지평선 ${(dip / DEG).toFixed(1)}° 아래`);
  }
});

test('지구는 오를수록 계속 작아지고, 우주에선 화면 안의 공이 된다', () => {
  let prev = Infinity;
  for (let L = 4; L <= 13; L += 0.05) {
    const r = earthRadius(10 ** L);
    assert.ok(r <= prev + 1e-12, `10^${L.toFixed(2)}m에서 커졌다`);
    prev = r;
    const { cam } = cosmosView(10 ** L);
    // 지구 윗가장자리는 늘 화면 안 (처음엔 화면 아래쪽 곡면으로 걸쳐 있다가), 지구 중심은 1만 km 넘어서부터 화면 안
    const top = new Vector3().sub(cam).angleTo(FORWARD) - r;
    assert.ok(top < HALF_FOV, `10^${L.toFixed(2)}m: 지구가 화면 밖`);
    if (L >= 8) assert.ok(inView(cam, new Vector3()), `10^${L.toFixed(2)}m: 지구 중심이 화면 밖`);
  }
  assert.ok(earthRadius(at('달')) < 1.5 * DEG, '달 거리에선 작은 공');
});

test('행성 구간에선 태양과 지구가 함께 화면 안에 있고, 지구는 점처럼 작다', () => {
  for (const name of ['화성', '목성', '토성', '태양계 밖']) {
    const { cam } = cosmosView(at(name));
    assert.ok(inView(cam, sunPos()), `${name}: 태양이 화면 안`);
    assert.ok(inView(cam, new Vector3()), `${name}: 지구가 화면 안`);
  }
  assert.ok(earthRadius(at('목성')) < 0.3 * DEG);
});

test('은하 밖에선 은하가 화면에 다 들어오고, 태양계는 1px보다 작아 보이지 않는다', () => {
  const a = altitudeAt(105);
  const { cam } = cosmosView(a);
  const toGalaxy = galaxyPos().sub(cam);
  assert.ok(inView(cam, galaxyPos()), '은하 중심이 화면 안');
  assert.ok(Math.atan(GALAXY_R / toGalaxy.length()) < 30 * DEG, '은하 원판이 화면 크기쯤');
  const px = (2 * HALF_FOV) / 2160; // 4K 화면 세로 1px
  const sunDist = sunPos().distanceTo(cam);
  assert.ok(PLANETS.at(-1).orbit / sunDist < px, '해왕성 궤도까지 담은 태양계 전체가 1px 미만');
  for (const p of PLANETS) assert.ok(shownRadius(p.r, sunDist, MIN_PLANET * systemFade(a)) / sunDist < px);
});

test('우주에서는 줌 속도가 고르다: 높이 1당 2.5배를 넘지 않는다', () => {
  for (let h = 24; h < 105; h += 0.1) {
    const ratio = altitudeAt(h + 1) / altitudeAt(h);
    assert.ok(ratio < 2.5, `높이 ${h.toFixed(1)}: ${ratio.toFixed(1)}배`);
  }
});

test('은하 밖으로 나오면 안드로메다와 다른 은하들이 화면 안에 보인다', () => {
  const { cam } = cosmosView(altitudeAt(105));
  assert.ok(inView(cam, GALAXIES[0].pos), '안드로메다가 화면 안');
  const seen = GALAXIES.filter((g) => inView(cam, g.pos)).length;
  assert.ok(seen >= 15, `화면 안의 은하 ${seen}개`);
});

test('발사 지점 바로 아래는 포항이고, 화면 안쪽이 북쪽이다', () => {
  const rot = earthRotation();
  const below = new Vector3(0, 1, 0).applyMatrix3(rot); // 지구 중심에서 발사 지점으로
  const pohang = earthDir(36.02 * DEG, 129.37 * DEG);
  const seoul = earthDir(37.57 * DEG, 126.98 * DEG);
  const busan = earthDir(35.18 * DEG, 129.08 * DEG);
  assert.ok(below.angleTo(HOME) < 1e-9);
  assert.ok(below.angleTo(pohang) * EARTH_R < 10e3, '포항에서 10km 안');
  // 화면 안쪽(-z)은 서울 쪽(북서), 오른쪽(+x)은 부산 쪽(남동)보다 동쪽: 거울에 비친 지도가 아니다
  const north = new Vector3(0, 0, -1).applyMatrix3(rot);
  const east = new Vector3(1, 0, 0).applyMatrix3(rot);
  assert.ok(seoul.clone().sub(busan).dot(north) > 0, '서울이 부산보다 북쪽(화면 안쪽)');
  assert.ok(busan.clone().sub(seoul).dot(east) > 0, '부산이 서울보다 동쪽(화면 오른쪽)');
  assert.ok(Math.abs(rot.determinant() - 1) < 1e-9, '뒤집힘 없는 회전');
});
