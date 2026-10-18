// 물리 높이(코인 반지름 0.5 단위) → 화면에 보여 줄 고도(m). 기준점 사이를 로그 곡선으로 매끄럽게 이어 매장에서 은하까지 간다.
// 우주에서는 높이 1당 약 1.7배(log 0.22)로 고르게 멀어져, 어느 구간도 멈춘 듯하거나 갑자기 튀지 않는다.

/** [물리 높이, log10(고도 m)] */
const ANCHORS: readonly (readonly [number, number])[] = [
  [4, 1], // 10m: 매장 천장쯤
  [12, 3.5], // 3km: 구름
  [16, 4], // 10km: 비행기
  [24, 5], // 100km: 우주 경계
  [40, 8.58], // 38만 km: 달
  [51, 11.35], // 화성
  [54, 11.89], // 목성
  [56, 12.15], // 토성
  [59, 12.65], // 해왕성 너머, 태양계 밖
  [96, 20.7], // 은하 가장자리
  [105, 21.3], // 은하를 밖에서 본다
];
const BEYOND = 0.1; // 마지막 기준점 이후 높이 1당 log10 증가
const GROUND = 2.5; // 첫 기준점 아래에서는 높이 1 = 2.5m

/** 기준점마다의 기울기: 양옆 구간 기울기의 조화평균이라 구간 경계에서 속도가 꺾이지 않고, 넘쳐 되돌아가지도 않는다 */
const SLOPES = ANCHORS.map((_, i) => {
  if (i === ANCHORS.length - 1) return BEYOND;
  const next = (ANCHORS[i + 1][1] - ANCHORS[i][1]) / (ANCHORS[i + 1][0] - ANCHORS[i][0]);
  if (i === 0) return next;
  const prev = (ANCHORS[i][1] - ANCHORS[i - 1][1]) / (ANCHORS[i][0] - ANCHORS[i - 1][0]);
  return (2 * prev * next) / (prev + next);
});

export const MILESTONES: readonly { height: number; name: string }[] = [
  { height: 12, name: '구름 위로' },
  { height: 24, name: '우주' },
  { height: 40, name: '달' },
  { height: 51, name: '화성' },
  { height: 54, name: '목성' },
  { height: 56, name: '토성' },
  { height: 59, name: '태양계 밖' },
  { height: 96, name: '은하 밖' },
];

export function altitudeAt(height: number) {
  const [h0] = ANCHORS[0];
  if (height <= h0) return Math.max(0, height) * GROUND;
  for (let i = 1; i < ANCHORS.length; i++) {
    const [h1, l1] = ANCHORS[i];
    const [ha, la] = ANCHORS[i - 1];
    if (height > h1) continue;
    // 3차 에르미트 곡선
    const w = h1 - ha, t = (height - ha) / w, t2 = t * t, t3 = t2 * t;
    const log = (2 * t3 - 3 * t2 + 1) * la + (t3 - 2 * t2 + t) * w * SLOPES[i - 1] + (-2 * t3 + 3 * t2) * l1 + (t3 - t2) * w * SLOPES[i];
    return 10 ** log;
  }
  const [hl, ll] = ANCHORS[ANCHORS.length - 1];
  return 10 ** (ll + (height - hl) * BEYOND);
}

/** altitudeAt의 역함수: 고도 m에 닿는 물리 높이 (고도가 계속 커지므로 이분법으로 찾는다) */
export function heightFor(m: number) {
  let lo = 0;
  let hi = 200;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (altitudeAt(mid) < m) lo = mid;
    else hi = mid;
  }
  return hi;
}

const LIGHT_YEAR = 9.4607e15;
/** 표시 고도와 물리가 공유하는 상한: 1억 광년. 변환 곡선 자체는 역함수 계산을 위해 유지한다. */
export const MAX_ALTITUDE = 1e8 * LIGHT_YEAR;
export const MAX_HEIGHT = heightFor(MAX_ALTITUDE);
const trim = (n: number) => (n < 10 ? n.toFixed(1).replace(/\.0$/, '') : Math.round(n).toLocaleString('ko-KR'));

/** 38만 km, 7.8억 km, 10만 광년처럼 한국어 큰 수 단위로 */
export function formatAltitude(m: number) {
  if (m < 1000) return `${Math.round(m)} m`;
  if (m < 1e7) return `${trim(m / 1000)} km`;
  if (m < 1e11) return `${trim(m / 1e7)}만 km`;
  if (m < 0.1 * LIGHT_YEAR) return `${trim(m / 1e11)}억 km`;
  const ly = m / LIGHT_YEAR;
  if (ly < 1e4) return `${trim(ly)} 광년`;
  if (ly < 1e8) return `${trim(ly / 1e4)}만 광년`;
  return `${trim(ly / 1e8)}억 광년`;
}
