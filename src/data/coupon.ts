// M5 시연용 쿠폰. 실제 발급·저장·교환 처리는 M7에서 서버 응답으로 교체한다.
import { VISIT_DAYS } from '../../design/lib/data.js';
import type { Prize } from './draw';

export interface MockCoupon {
  prize: Prize;
  code: string;
  issuedAt: string;
  expiresAt: string;
}

/** 미리보기 시점이 아니라 최종 확인 시점부터 14일. 호출한 화면이 결과를 한 번만 보관한다. */
export function createMockCoupon(prize: Prize, now = new Date()): MockCoupon {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const suffix = Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('');
  return {
    prize,
    code: `DEMO-MB-${suffix}`,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + VISIT_DAYS * 86400000).toISOString(),
  };
}

/** 해외 시간대에서도 매장(한국) 기준 방문 날짜를 표시한다. */
export function formatVisitDate(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso));
  return ['year', 'month', 'day'].map((type) => parts.find((p) => p.type === type)!.value).join('.');
}
