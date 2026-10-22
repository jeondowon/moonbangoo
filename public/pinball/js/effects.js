(function (P) {
  'use strict';
  class Effects {
    constructor() { this.particles = []; this.rings = []; this.pool = []; this.hits = new Map(); this.shake = 0; this.flash = 0; this.lead = null; this.quality = 'high'; this.reducedMotion = false; this.maxParticles = P.CONFIG.particles.high; }
    setQuality(quality) { this.quality = quality; this.maxParticles = P.CONFIG.particles[quality] || 420; while (this.particles.length > this.maxParticles) this.pool.push(this.particles.pop()); }
    clear() { this.pool.push(...this.particles); this.particles.length = 0; this.rings.length = 0; this.hits.clear(); this.shake = 0; this.flash = 0; this.lead = null; }
    update(dt) {
      this.shake = Math.max(0, this.shake - dt * 5); this.flash = Math.max(0, this.flash - dt * 4);
      for (let i = this.particles.length - 1; i >= 0; i--) { const p = this.particles[i]; p.life -= dt; if (p.life <= 0) { this.pool.push(p); this.particles[i] = this.particles[this.particles.length - 1]; this.particles.pop(); continue; } p.vx *= Math.exp(-dt * 1.6); p.vy += p.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.angle += p.spin * dt; }
      for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.life -= dt; r.radius += r.speed * dt; if (r.life <= 0) this.rings.splice(i, 1); }
      for (const [key, hit] of this.hits) { hit.life -= dt; if (hit.life <= 0) this.hits.delete(key); }
      if (this.lead) { if (Number.isFinite(this.lead.life)) { this.lead.life -= dt; if (this.lead.life <= 0) this.lead = null; } else { this.lead.time -= dt; if (this.lead.time <= 0) this.lead = null; } }
    }
    burst(x, y, color, type, intensity) {
      intensity = Math.max(.2, Math.min(3, intensity || 1)); const count = Math.round((this.reducedMotion ? 3 : 13) * intensity * (this.quality === 'low' ? .3 : this.quality === 'medium' ? .65 : 1));
      for (let i = 0; i < count && this.particles.length < this.maxParticles; i++) { const p = this.pool.pop() || {}; const a = Math.random() * Math.PI * 2, speed = (30 + Math.random() * 115) * intensity; p.x = x; p.y = y; p.vx = Math.cos(a) * speed; p.vy = Math.sin(a) * speed - (type === 'confetti' || type === 'gold' ? 60 : 0); p.r = (1 + Math.random() * 3) * Math.sqrt(intensity); p.life = p.duration = .35 + Math.random() * .65 * intensity; p.color = color; p.type = type || 'spark'; p.gravity = type === 'confetti' || type === 'gold' ? 140 : type === 'ice' ? 45 : 24; p.angle = a; p.spin = (Math.random() - .5) * 9; this.particles.push(p); }
    }
    ring(x, y, color, radius, intensity) { if (this.rings.length > 70) this.rings.shift(); const duration = this.reducedMotion ? .25 : .55; this.rings.push({ x, y, color, radius: radius || 8, speed: (intensity || 1) * 110, life: duration, duration }); }
    handle(event, theme, total) {
      theme = theme || P.THEMES.cosmic; const m = event.marble, color = m && P.marbleColor ? P.marbleColor(m.colorIndex === undefined ? m.id : m.colorIndex, total, theme) : theme.primary; const strength = Math.min(1.7, Math.max(.2, event.intensity || .6));
      if (event.type === 'hit' || event.type === 'bumper') { if (event.obstacle) this.hits.set(event.obstacle.id || event.obstacle, { life: .3 }); this.burst(event.x, event.y, event.type === 'bumper' ? theme.secondary : theme.primary, theme.particle, event.type === 'bumper' ? strength * 1.4 : strength * .6); if (event.type === 'bumper') { this.ring(event.x, event.y, theme.secondary, event.obstacle ? event.obstacle.r : 24, strength); if (!this.reducedMotion) this.shake = Math.max(this.shake, Math.min(.5, strength * .22)); } }
      else if (event.type === 'portal') { this.burst(event.x, event.y, theme.secondary, theme.particle, 2); this.ring(event.x, event.y, theme.primary, 12, 2); if (!this.reducedMotion) this.flash = .2; }
      else if (event.type === 'boost' || event.type === 'rescue') { this.burst(event.x, event.y, theme.accents[2], theme.particle, .7); }
      else if (event.type === 'skill') {
        if (event.skill === 'haste') { this.burst(event.x, event.y, theme.accents[2], 'spark', 2.3); this.burst(event.x, event.y - 35, color, 'spark', 1); }
        else if (event.skill === 'pulse') { this.ring(event.x, event.y, theme.accents[3], 12, 3); this.ring(event.x, event.y, theme.primary, 35, 2); this.burst(event.x, event.y, theme.accents[3], theme.particle, 1.8); }
        else { this.ring(event.x, event.y, theme.accents[4], 20, 1); this.burst(event.x, event.y, theme.accents[4], theme.particle, 1.8); }
      }
      else if (event.type === 'finish') { this.burst(event.x, event.y, color, theme.particle, 2.5); this.ring(event.x, event.y, color, 15, 2); }
      else if (event.type === 'lead') { this.lead = { x: event.x, y: event.y, life: 1.4, color }; this.ring(event.x, event.y, theme.primary, 22, 2); }
    }
    celebrate(winner, theme) { theme = theme || P.THEMES.cosmic; const tones = theme.material === 'gold' ? [theme.primary, '#e3c88b', '#b68c47'] : theme.material === 'silver' ? ['#a3aab3', '#c9ced4', '#7d848d'] : theme.accents; for (let i = 0; i < 6; i++) { this.burst(winner.x + (i - 2.5) * 70, winner.y - 120, tones[i % tones.length], theme.particle, 3); } this.ring(winner.x, winner.y, theme.primary, 40, 3); if (!this.reducedMotion) { this.shake = .35; this.flash = .18; } }
  }
  P.Effects = Effects;
})(window.CosmicPinball = window.CosmicPinball || {});
