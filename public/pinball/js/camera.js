(function (P) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // Critically damped display motion: velocity stays continuous on leader changes.
  function glide(camera, axis, target, dt, omega, maxSpeed) {
    const key = axis + 'Velocity', value = camera[axis], velocity = camera[key] || 0;
    target = value + clamp(target - value, -maxSpeed / omega, maxSpeed / omega);
    const offset = value - target, decay = Math.exp(-omega * dt);
    const impulse = (velocity + omega * offset) * dt;
    camera[axis] = target + (offset + impulse) * decay;
    camera[key] = (velocity - omega * impulse) * decay;
  }
  class Camera {
    constructor(canvas, options) {
      this.canvas = canvas; this.x = 500; this.y = 510; this.zoom = 1; this.follow = true; this.viewport = null; this.map = null; this.pointer = new Map(); this.drag = null; this.manualZoom = 1;
      if (!options || options.interactive !== false) this.attach(canvas);
    }
    area() {
      if (this.viewport) return this.viewport;
      const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
      return w > 1050 ? { x: 352, y: 0, w: Math.max(280, w - 632), h } : { x: 0, y: 0, w, h };
    }
    reset(map) {
      this.xVelocity = this.yVelocity = this.zoomVelocity = 0; this.entrance = null; this.map = map; this.lastPhysicsTime = null; const area = this.area(); this.x = map.width / 2; this.y = Math.min(540, area.h / (2 * Math.min(area.w / (map.width + 90), 1.15))); this.zoom = this.baseZoom() * .82; this.follow = true; this.manualZoom = 1; this.pointer.clear();
    }
    enter(map, options) {
      const area = this.area();
      this.entrance = { elapsed: 0, duration: options && options.reducedMotion ? .18 : 1.05,
        x: this.x, y: this.y, zoom: this.zoom,
        screenX: area.x + area.w / 2, screenY: area.y + area.h / 2 };
      this.map = map; this.lastPhysicsTime = null; this.follow = true; this.manualZoom = 1; this.pointer.clear(); this.drag = null;
    }
    prepareLanding(map, physics) {
      this.xVelocity = this.yVelocity = this.zoomVelocity = 0; this.map = map; this.entrance = null; this.lastPhysicsTime = physics && physics.time; this.follow = true; this.manualZoom = 1;
      this.pointer.clear(); this.drag = null; this.pinch = null;
      const area = this.area();
      const active = physics && physics.marbles ? physics.marbles.filter(m => !m.finished) : [];
      const spawn = map.spawn || { y: 50, height: 680 };
      let top = spawn.y, bottom = spawn.y + spawn.height;
      if (active.length) {
        top = Math.min(...active.map(m => m.y - (m.r || 12)));
        bottom = Math.max(...active.map(m => m.y + (m.r || 12)));
      }
      // The flight ends in this exact race viewport. Keep room around the actual
      // spawn bounds, including a tall 500-marble grid on a short desktop view.
      this.x = map.width / 2;
      this.zoom = Math.min(this.baseZoom() * 1.04, area.h / Math.max(1, bottom - top + 160));
      const minY = Math.max(220, area.h / (2 * this.zoom) - 30);
      const maxY = Math.max(minY, map.height - area.h / (2 * this.zoom) + 150);
      this.y = clamp((top + bottom) / 2, minY, maxY);
    }
    baseZoom() { const area = this.area(); return Math.min(area.w / ((this.map ? this.map.width : 1000) + 100), area.w > 2000 ? 2.4 : 1.15); }
    resumeFollow() { this.follow = true; this.manualZoom = 1; this.xVelocity = this.yVelocity = this.zoomVelocity = 0; }
    worldToScreen(x, y) { const area = this.area(); return { x: area.x + area.w / 2 + (x - this.x) * this.zoom, y: area.y + area.h / 2 + (y - this.y) * this.zoom }; }
    screenToWorld(x, y) { const area = this.area(); return { x: this.x + (x - area.x - area.w / 2) / this.zoom, y: this.y + (y - area.y - area.h / 2) / this.zoom }; }
    update(dt, physics, map, options) {
      this.map = map; options = options || {};
      if (!physics || !physics.marbles.length) return;
      if (!this.follow) return;
      const area = this.area(), active = physics.marbles.filter(m => !m.finished);
      if (this.entrance) {
        const e = this.entrance; e.elapsed += dt;
        const progress = clamp(e.elapsed / e.duration, 0, 1), ease = 1 - Math.pow(1 - progress, 3);
        const centerX = area.x + area.w / 2, centerY = area.y + area.h / 2;
        const targetZoom = this.baseZoom() * 1.04;
        this.zoom = e.zoom + (targetZoom - e.zoom) * ease;
        const spawnFront = active.reduce((furthest, marble) => Math.max(furthest, marble.y), 0);
        const targetY = Math.max(220, area.h / (2 * targetZoom) - 30, spawnFront - 35);
        // Interpolate the screen anchor too: collapsing the setup panel must not snap the board sideways.
        this.x = e.x + (map.width / 2 - e.x) * ease + (centerX - (e.screenX + (centerX - e.screenX) * ease)) / this.zoom;
        this.y = e.y + (targetY - e.y) * ease + (centerY - (e.screenY + (centerY - e.screenY) * ease)) / this.zoom;
        if (progress === 1) this.entrance = null;
        return;
      }
      if (options.status === 'finished') return;
      const ordered = active.slice().sort((a, b) => b.y - a.y);
      const front = ordered[0]; if (!front) return;
      const base = this.baseZoom(), finishY = map.finish && map.finish.y || map.height - 120;
      // Frame the leading pack, with a limited trail so a distant laggard cannot
      // pull the race out of view. No participant IDs affect this framing.
      const pack = ordered.slice(0, 3), trail = area.h / Math.max(.01, this.zoom) * .24;
      const packY = pack.reduce((sum, m) => sum + Math.max(m.y, front.y - trail), 0) / pack.length;
      const spread = pack.length > 1 ? Math.max(...pack.map(m => m.x)) - Math.min(...pack.map(m => m.x)) : 0;
      const finishBlend = clamp((front.y - (finishY - 500)) / 500, 0, 1);
      let targetZoom = base * (1 - .07 * clamp(spread / map.width, 0, 1) + .06 * finishBlend) * this.manualZoom;
      let targetX = map.width / 2;
      if (options.photoFinish && !options.reducedMotion) {
        targetZoom = base * 1.16 * this.manualZoom;
        targetX = map.width / 2 * .7 + pack.reduce((sum, m) => sum + m.x, 0) / pack.length * .3;
      }
      const ahead = Math.min(95, area.h / Math.max(.01, targetZoom) * .12);
      const targetY = options.status === 'idle' ? Math.max(460, packY - 35) : options.status === 'countdown' ? Math.max(220, packY - 35) : packY + ahead;
      const minY = Math.max(220, area.h / (2 * targetZoom) - 30), maxY = Math.max(minY, map.height - area.h / (2 * targetZoom) + 150);
      const omega = options.reducedMotion ? 4 : 5;
      glide(this, 'x', targetX, dt, omega, 360 / Math.max(.01, this.zoom));
      glide(this, 'zoom', targetZoom, dt, 3, .45);
      glide(this, 'y', clamp(targetY, minY, maxY), dt, omega, 1400 / Math.max(.01, this.zoom));
      if (options.status === 'running') {
        // Spring lag must not hide the leader on a short viewport or at 3x speed.
        // Use actual positions rather than collision velocity or participant IDs.
        const inset = Math.min(20, area.h * .12);
        const halfView = Math.max(0, (area.h / 2 - inset) / this.zoom - (front.r || 12));
        const safeY = clamp(this.y, front.y - halfView, front.y + halfView);
        if (safeY > this.y) this.yVelocity = Math.max(0, this.yVelocity);
        else if (safeY < this.y) this.yVelocity = Math.min(0, this.yVelocity);
        this.y = safeY;
      }

    }
    zoomBy(factor) {
      this.entrance = null; this.follow = false;
      this.zoom = clamp(this.zoom * factor, .16, 2.8);
      this.canvas.dispatchEvent(new CustomEvent('followchange', { detail: false }));
    }
    attach(canvas) {
      if (this.attached) return; this.attached = true;
      const position = e => { const rect = canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; };
      const stopFollowing = () => { this.entrance = null; if (this.follow) { this.follow = false; canvas.dispatchEvent(new CustomEvent('followchange', { detail: false })); } };
      const scaleAt = (next, x, y) => { const before = this.screenToWorld(x, y); this.zoom = clamp(next, .16, 2.8); const after = this.screenToWorld(x, y); this.x += before.x - after.x; this.y += before.y - after.y; };
      canvas.addEventListener('pointerdown', e => {
        if (e.button !== undefined && e.button > 0) return; const p = position(e); this.pointer.set(e.pointerId, p); canvas.setPointerCapture(e.pointerId);
        if (this.pointer.size === 1) this.drag = { x: p.x, y: p.y, originalX: p.x, originalY: p.y };
        else if (this.pointer.size === 2) { const points = [...this.pointer.values()]; this.pinch = { distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y), zoom: this.zoom }; stopFollowing(); }
      });
      canvas.addEventListener('pointermove', e => {
        if (!this.pointer.has(e.pointerId)) return; const p = position(e); this.pointer.set(e.pointerId, p);
        if (this.pointer.size === 2 && this.pinch) { const points = [...this.pointer.values()], d = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y); scaleAt(this.pinch.zoom * d / Math.max(1, this.pinch.distance), (points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2); }
        else if (this.pointer.size === 1 && this.drag) { if (Math.hypot(p.x - this.drag.originalX, p.y - this.drag.originalY) > 4) stopFollowing(); if (!this.follow) { this.x -= (p.x - this.drag.x) / this.zoom; this.y -= (p.y - this.drag.y) / this.zoom; } this.drag.x = p.x; this.drag.y = p.y; }
      });
      const release = e => { this.pointer.delete(e.pointerId); this.pinch = null; if (!this.pointer.size) this.drag = null; else { const p = [...this.pointer.values()][0]; this.drag = { x: p.x, y: p.y, originalX: p.x, originalY: p.y }; } };
      canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
      const clear = () => { this.pointer.clear(); this.drag = null; this.pinch = null; };
      canvas.addEventListener('lostpointercapture', release);
      if (typeof window.addEventListener === 'function') {
        window.addEventListener('blur', clear); window.addEventListener('resize', clear); window.addEventListener('orientationchange', clear);
      }
    }
  }
  P.Camera = Camera;
})(window.CosmicPinball = window.CosmicPinball || {});
