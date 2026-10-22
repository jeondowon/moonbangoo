(function (P) {
  'use strict';
  // Distances use the usable screen's short side S. Crossing the northeast outlet consumes a gesture immediately. Speed only affects flight.
  const THRESHOLDS = Object.freeze({ edgeBand: .14, corner: .10, opening: .24, approach: .12, releaseDepth: .10, releaseFlare: .04, releaseProgress: .025, windowMs: 160 });
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const valid = (x, y, time) => Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(time) && time >= 0;
  function bounds(area) {
    const usable = area && area.s > 0 && Number.isFinite(area.w) && Number.isFinite(area.h);
    return { halfWidth: usable ? (area.w / 2 - 16) / area.s : .5,
      halfHeight: usable ? (area.h / 2 - 24) / area.s : .5 };
  }
  function signed(x, y, frame, band) {
    const hw = Math.max(.1, frame.halfWidth - band), hh = Math.max(.1, frame.halfHeight - band);
    const r = Math.min(THRESHOLDS.corner, hw, hh);
    const qx = Math.abs(x) - hw + r, qy = Math.abs(y) - hh + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  }
  function opening(frame) {
    const right = Math.max(.1, frame.halfWidth - THRESHOLDS.edgeBand);
    const top = -Math.max(.1, frame.halfHeight - THRESHOLDS.edgeBand);
    const span = Math.min(THRESHOLDS.opening, right, -top);
    return { x: right - span / 2, y: top + span / 2, span,
      topX: right - span, topY: top, sideX: right, sideY: top + span };
  }
  function openingDistance(x, y, mouth) { return ((x - mouth.x) - (y - mouth.y)) * Math.SQRT1_2; }
  function openingAlong(x, y, mouth) { return ((x - mouth.x) + (y - mouth.y)) * Math.SQRT1_2; }
  // The same inward funnel is drawn on screen and used for release assistance.
  function releaseZone(mouth) {
    const half = mouth.span * Math.SQRT1_2, depth = THRESHOLDS.releaseDepth;
    return [[0, -half], [0, half], [-depth, half + THRESHOLDS.releaseFlare], [-depth, -half - THRESHOLDS.releaseFlare]]
      .map(([outward, along]) => ({ x: mouth.x + (outward + along) * Math.SQRT1_2, y: mouth.y + (along - outward) * Math.SQRT1_2 }));
  }
  function inReleaseZone(x, y, mouth) {
    const depth = openingDistance(x, y, mouth);
    return depth >= -THRESHOLDS.releaseDepth && depth <= 1e-9 &&
      Math.abs(openingAlong(x, y, mouth)) <= mouth.span * Math.SQRT1_2 - depth / THRESHOLDS.releaseDepth * THRESHOLDS.releaseFlare;
  }
  class ThrowGate {
    constructor() { this.cancel(); }
    begin(x, y, timeMs, area) {
      this.cancel();
      if (!valid(x, y, timeMs)) return false;
      this.bounds = bounds(area); this.active = true;
      this.insideSeen = signed(x, y, this.bounds, THRESHOLDS.edgeBand) <= 0;
      this.start = { x, y, time: timeMs }; this.samples = [{ x, y, time: timeMs }];
      return true;
    }
    move(x, y, timeMs, interacted = false) {
      if (!this.active || !valid(x, y, timeMs)) return false;
      const last = this.samples[this.samples.length - 1];
      if (timeMs < last.time || (timeMs === last.time && (x !== last.x || y !== last.y))) return false;
      const mouth = opening(this.bounds), beforeExit = openingDistance(last.x, last.y, mouth), afterExit = openingDistance(x, y, mouth);
      if ((this.interacted || interacted) && this.insideSeen && beforeExit <= 0 && afterExit > 1e-9 && signed(last.x, last.y, this.bounds, THRESHOLDS.edgeBand) <= 1e-9) {
        const t = -beforeExit / (afterExit - beforeExit);
        const along = openingAlong(last.x + (x - last.x) * t, last.y + (y - last.y) * t, mouth);
        this.exitCrossed ||= Math.abs(along) < mouth.span * Math.SQRT1_2 - 1e-9;
      }
      // A segment entering from outside a closed wall cannot arm the release.
      // Stationary pointerup preserves the last real movement's qualification.
      if (x !== last.x || y !== last.y) this.releasePathInside = signed(last.x, last.y, this.bounds, THRESHOLDS.edgeBand) <= 1e-9 && signed(x, y, this.bounds, THRESHOLDS.edgeBand) <= 1e-9;
      const next = { x, y, time: timeMs };
      if (timeMs === last.time) this.samples[this.samples.length - 1] = next;
      else this.samples.push(next);
      const cutoff = timeMs - THRESHOLDS.windowMs;
      while (this.samples.length > 2 && this.samples[1].time < cutoff) this.samples.shift();
      this.interacted = this.interacted || interacted === true;
      this.distance = Math.max(this.distance, Math.hypot(x - this.start.x, y - this.start.y));
      if (signed(x, y, this.bounds, THRESHOLDS.edgeBand) <= 0) this.insideSeen = true;
      return true;
    }
    positionAt(timeMs) {
      const first = this.samples[0];
      if (timeMs <= first.time) return first;
      for (let i = 1; i < this.samples.length; i++) {
        const next = this.samples[i]; if (timeMs > next.time) continue;
        const prior = this.samples[i - 1], amount = (timeMs - prior.time) / (next.time - prior.time);
        return { x: prior.x + (next.x - prior.x) * amount, y: prior.y + (next.y - prior.y) * amount };
      }
      return this.samples[this.samples.length - 1];
    }
    evaluate(timeMs) {
      const last = this.samples.length ? this.samples[this.samples.length - 1] : { x: 0, y: 0, time: 0 };
      const radius = Math.hypot(last.x, last.y), dx = Math.SQRT1_2, dy = -Math.SQRT1_2;
      const now = Math.max(last.time, Number.isFinite(timeMs) ? timeMs : last.time);
      const before = this.active ? this.positionAt(now - THRESHOLDS.windowMs) : last;
      const inputSpeed = Math.hypot(last.x - before.x, last.y - before.y) * 1000 / THRESHOLDS.windowMs;
      const qualified = this.active && this.interacted && this.insideSeen;
      const edge = opening(this.bounds), proximity = openingDistance(last.x, last.y, edge);
      const nearOpening = Math.abs(openingAlong(last.x, last.y, edge)) < edge.span * Math.SQRT1_2 + THRESHOLDS.approach;
      const releaseReady = !!(qualified && this.releasePathInside && inReleaseZone(last.x, last.y, edge) &&
        proximity - openingDistance(this.start.x, this.start.y, edge) >= THRESHOLDS.releaseProgress);
      return { releaseReady, eligible: !!(qualified && this.exitCrossed && proximity > 1e-9), distance: this.distance, radius, interacted: this.interacted,
        approach: qualified && nearOpening ? clamp(1 + proximity / THRESHOLDS.approach, 0, 1) : 0,
        dx, dy, edgeX: edge.x, edgeY: edge.y, inputSpeed };
    }
    takeExit(timeMs) {
      const result = this.evaluate(timeMs);
      if (result.eligible) { this.active = false; this.fired = true; }
      return Object.assign(result, { fired: result.eligible });
    }
    release(x, y, timeMs, interacted = false) {
      if (!this.active) return Object.assign(this.evaluate(timeMs), { fired: false });
      if (!this.move(x, y, timeMs, interacted)) { this.cancel(); return Object.assign(this.evaluate(timeMs), { fired: false }); }
      const result = this.takeExit(timeMs);
      if (!result.fired && result.releaseReady) {
        result.fired = true; result.eligible = true; result.method = 'release-zone'; this.fired = true;
      } else if (result.fired) result.method = 'crossing';
      this.active = false;
      return result;
    }
    cancel() {
      this.active = false; this.fired = false; this.insideSeen = false; this.exitCrossed = false; this.releasePathInside = false; this.interacted = false;
      this.distance = 0; this.start = null; this.samples = []; this.bounds = bounds();
    }
  }
  P.THROW_THRESHOLDS = THRESHOLDS;
  P.EDGE_GEOMETRY = Object.freeze({ bounds, signed, opening, openingDistance, openingAlong, releaseZone, inReleaseZone });
  P.ThrowGate = ThrowGate;
})(window.CosmicPinball = window.CosmicPinball || {});
