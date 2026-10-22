(function (P) {
  'use strict';
  const clamp = value => Math.max(0, Math.min(1, value));
  const mix = (a, b, t) => a + (b - a) * t;
  // Fixed-step gravity and collisions respond to the user-controlled angle.
  // Reduced motion preserves the same IDs, positions and physical handoff.
  const POUR = { lift: .85, gravity: .72, scale: .10, openingAngle: .62 };
  class HandScene {
    constructor(cinematic) { this.cinema = cinematic; this.shuffle = null; }
    get viewScale() { return 1 - .16 * P.CINEMA.easeCamera(this.elapsed / POUR.lift); }
    get ready() { return this.remaining === 0 && this.withdraw >= 1; }
    get canTilt() { return this.elapsed >= POUR.lift && this.remaining > 0; }
    area() {
      this.cinema.resize();
      const w = this.cinema.width, h = this.cinema.height;
      return { x: w / 2, y: h / 2, s: Math.max(1, Math.min(w - 32, h - 48)), w, h };
    }
    begin(physics, reducedMotion = false) {
      const c = this.cinema, entries = c.entries(physics);
      this.sources = entries.map(entry => ({ ...c.chamber.pose(entry.index) }));
      this.entries = entries;
      this.shuffle = new P.HandShuffle(entries, physics.seed);
      this.shuffle.circleGrabEnabled = true;
      this.shuffle.gravity = POUR.gravity / .84;
      this.shuffle.radius = c.chamber.radius * POUR.scale / .84;
      this.shuffle.bodies.forEach(body => { body.pouring = true; body.r = this.shuffle.radius; });
      this.tube = Object.create(P.CINEMA.Chamber.prototype);
      this.tube.radius = c.chamber.radius;
      this.tube.bodies = c.chamber.bodies.map(body => ({ ...body }));
      this.tubeByIndex = this.tube.bodies.slice();
      this.tube.collisions = 0; this.tube.wallHits = 0;
      this.tube.wall = body => this.tubeWall(body);
      this.pours = entries.map(() => ({ release: null, arrival: null }));
      this.pourReduced = !!reducedMotion; this.geometry = null; this.remaining = entries.length;
      this.elapsed = 0; this.simulationTicks = 0; this.accumulator = 0;
      this.angle = 0; this.angularVelocity = 0; this.targetAngle = 0; this.lidOpen = 0; this.withdraw = 0; this.tiltPointer = null;
      this.pivot = { x: 0, y: 0 }; this.lidLatched = false;
      // Reused display buffers are isolated from both physical solvers.
      this.previousDisplay = new Float64Array(entries.length * 3);
      this.displayPoses = entries.map(entry => ({ id: entry.id, x: 0, y: 0, radius: 0, aspect: 1, orientation: 0, focus: 1 }));
      this.previousRig = null; this.displayArea = null;
      this.launchDecision = null; this.edgeGlow = 0;
    }
    views(area) {
      if (!this.geometry || this.geometry.w !== area.w || this.geometry.h !== area.h) {
        this.geometry = { w: area.w, h: area.h, views: P.CINEMA.matchedViews(area.w, area.h, 0, 0) };
      }
      return this.geometry.views;
    }
    rigAt(time, area) {
      const frame = this.views(area).frame;
      const lift = P.CINEMA.easeCamera(time / POUR.lift), leave = P.CINEMA.easeCamera(this.withdraw);
      const initialScale = frame.thickness * .54 / area.s;
      const scale = mix(initialScale, POUR.scale, lift);
      const px = this.pivot.x, py = this.pivot.y, rotation = this.angle;
      return { x: mix((frame.x - area.x) / area.s, -.035, lift) - leave * .12 + lift * scale * (px - Math.cos(rotation) * px + Math.sin(rotation) * py),
        y: mix((frame.y - area.y) / area.s, -.10, lift) - leave * .15 + lift * scale * (py - Math.sin(rotation) * px - Math.cos(rotation) * py),
        length: scale * P.CINEMA.chamberHalfLength / .45, thickness: scale / .54,
        rotation: mix(frame.rotation, this.angle, lift), scale, alpha: 1 - leave,
        opening: this.lidOpen, lidAngle: 1.45 * this.lidOpen };
    }
    centerOfMass() {
      // Shell mass stays at its center; each marble contributes its disk mass.
      const shellMass = this.entries.length * this.tube.radius ** 2 * .8;
      let mass = shellMass, x = 0, y = 0;
      for (const b of this.tube.bodies) { const m = b.r * b.r; mass += m; x += b.x * m; y += b.y * m; }
      return { x: x / mass, y: y / mass };
    }
    beginTilt(point) {
      if (!this.canTilt) return false;
      const rig = this.rigAt(this.elapsed, this.area()), dx = point.x - rig.x, dy = point.y - rig.y;
      const x = dx * Math.cos(rig.rotation) + dy * Math.sin(rig.rotation);
      const y = -dx * Math.sin(rig.rotation) + dy * Math.cos(rig.rotation);
      if (Math.abs(x) > rig.length * .95 || Math.abs(y) > rig.thickness * .8) return false;
      // Change supports without moving the tube or its contents on pointer down.
      const center = this.centerOfMass();
      if (this.angle === 0) this.pivot = center;
      const px = rig.x + rig.scale * (Math.cos(this.angle) * this.pivot.x - Math.sin(this.angle) * this.pivot.y);
      const py = rig.y + rig.scale * (Math.sin(this.angle) * this.pivot.x + Math.cos(this.angle) * this.pivot.y);
      let armX = point.x - px, armY = point.y - py;
      // A center grab has little leverage: use a short virtual grip on the rim.
      if (Math.hypot(armX, armY) < rig.thickness * .65) {
        armX = Math.cos(this.angle) * rig.length * .38;
        armY = Math.sin(this.angle) * rig.length * .38;
      }
      this.tiltPointer = { x: point.x, y: point.y, armX, armY,
        bearing: Math.atan2(armY, armX), angle: this.angle, moved: false };
      return true;
    }
    moveTilt(point) {
      const p = this.tiltPointer;
      if (!p) return;
      const dx = point.x - p.x, dy = point.y - p.y;
      if (Math.hypot(dx, dy) <= .012 && !p.moved) return;
      p.moved = true;
      const bearing = Math.atan2(p.armY + dy, p.armX + dx);
      const delta = Math.atan2(Math.sin(bearing - p.bearing), Math.cos(bearing - p.bearing));
      this.targetAngle = Math.max(0, Math.min(1.48, p.angle + delta));
    }
    releaseTilt(point) {
      if (!this.tiltPointer) return;
      this.moveTilt(point);
      this.tiltPointer = null;
    }
    cancelTilt() { this.tiltPointer = null; this.targetAngle = this.angle; }
    tubeWall(body) {
      if (this.lidOpen < .98 || body.x < 0) {
        P.CINEMA.Chamber.prototype.wall.call(this.tube, body); return;
      }
      // The opened end has no invisible cap. Top/bottom glass still collide.
      const limit = 1 - body.r;
      if (body.y > limit) { body.y = limit; if (body.vy > 0) body.vy *= -.22; body.vx *= .997; }
      if (body.y < -limit) { body.y = -limit; if (body.vy < 0) body.vy *= -.22; }
    }
    tubePose(i, time, area, displayRig) {
      const rig = displayRig || this.rigAt(time, area), b = this.tubeByIndex[i];
      if (!b) return this.pours[i].exit;
      return { x: rig.x + (Math.cos(rig.rotation) * b.x - Math.sin(rig.rotation) * b.y) * rig.scale,
        y: rig.y + (Math.sin(rig.rotation) * b.x + Math.cos(rig.rotation) * b.y) * rig.scale,
        r: b.r * rig.scale, aspect: 1, orientation: rig.rotation };
    }
    stepPour(dt, area) {
      const previousSpeed = this.angularVelocity;
      const targetSpeed = Math.max(-1, Math.min(1, (this.targetAngle - this.angle) * 4));
      this.angularVelocity += Math.max(-dt * 2.4, Math.min(dt * 2.4, targetSpeed - this.angularVelocity));
      this.angle += this.angularVelocity * dt;
      const angularAcceleration = (this.angularVelocity - previousSpeed) / dt;
      if (this.angle >= POUR.openingAngle) this.lidLatched = true;
      const opening = this.lidLatched ? 1 : 0;
      this.lidOpen += (opening - this.lidOpen) * Math.min(1, dt * 22);
      const rig = this.rigAt(this.simulationTicks / 120, area), angularSpeed = this.angularVelocity;
      const gravity = POUR.gravity / rig.scale;
      // Rotating-frame acceleration includes gravity and inertial terms.
      for (let sub = 0; sub < 3; sub++) {
        const h = dt / 3, damping = Math.exp(-h * .55);
        for (const b of this.tube.bodies) {
          const ax = gravity * Math.sin(rig.rotation) + 2 * angularSpeed * b.vy + angularSpeed * angularSpeed * (b.x - this.pivot.x) + angularAcceleration * (b.y - this.pivot.y);
          const ay = gravity * Math.cos(rig.rotation) - 2 * angularSpeed * b.vx + angularSpeed * angularSpeed * (b.y - this.pivot.y) - angularAcceleration * (b.x - this.pivot.x);
          b.vx = (b.vx + ax * h) * damping; b.vy = (b.vy + ay * h) * damping;
          b.x += b.vx * h; b.y += b.vy * h; b.spin += b.vx * h / b.r;
          this.tube.wall(b);
        }
        let pairs = this.tube.pairs();
        for (let pass = 0; pass < 8; pass++) {
          if (pass === 4) pairs = this.tube.pairs();
          if (this.tube.contacts(pairs) < .006) break;
        }
        const mouth = .49 * rig.length / rig.scale;
        for (const b of this.tube.bodies.slice()) {
          if (this.lidOpen < .98 || b.x < mouth + b.r) continue;
          const i = b.index, body = this.shuffle.bodies[i], pose = this.tubePose(i, this.elapsed, area);
          const vx = (Math.cos(rig.rotation) * (b.vx - angularSpeed * (b.y - this.pivot.y)) - Math.sin(rig.rotation) * (b.vy + angularSpeed * (b.x - this.pivot.x))) * rig.scale;
          const vy = (Math.sin(rig.rotation) * (b.vx - angularSpeed * (b.y - this.pivot.y)) + Math.cos(rig.rotation) * (b.vy + angularSpeed * (b.x - this.pivot.x))) * rig.scale;
          this.pours[i] = { release: this.simulationTicks / 120, arrival: this.simulationTicks / 120, exit: { ...pose, vx, vy } };
          // The same position, radius and velocity enter the receiving solver.
          Object.assign(body, { x: pose.x / this.viewScale, y: pose.y / this.viewScale,
            vx: vx / this.viewScale, vy: vy / this.viewScale, r: pose.r / this.viewScale, pouring: false });
          this.tubeByIndex[i] = null;
          this.tube.bodies.splice(this.tube.bodies.indexOf(b), 1); this.remaining--;
        }
      }
      if (!this.remaining) this.withdraw = Math.min(1, this.withdraw + dt / .55);
    }
    drawTube(area, glass = false, displayRig) {
      const c = this.cinema, ctx = c.ctx, rig = displayRig || this.rigAt(this.elapsed, area);
      if (rig.alpha <= .001) return;
      const views = this.views(area), frame = views.frame;
      const mouth = .49 * rig.length * area.s;
      const register = () => {
        ctx.scale(rig.length * area.s / frame.length, rig.thickness * area.s / frame.thickness);
        ctx.rotate(-frame.rotation); ctx.translate(-frame.x, -frame.y);
      };
      ctx.save(); ctx.translate(area.x + rig.x * area.s, area.y + rig.y * area.s); ctx.rotate(rig.rotation);
      // The same original tube moves and turns continuously. Its masked photo
      // retains the gold ornament; only the studio backdrop is made transparent.
      ctx.beginPath(); ctx.rect(-rig.length * area.s, -rig.thickness * area.s,
        rig.length * area.s + mouth, rig.thickness * area.s * 2); ctx.clip(); register();
      if (glass) c.drawGlass(views.front, views.angle, 0, 0, rig.alpha, 0);
      else c.drawPlate('front', views.front, rig.alpha, null, true);
      ctx.restore();
      if (glass) {
        const hingeY = -rig.thickness * .82 * area.s;
        ctx.save(); ctx.translate(area.x + rig.x * area.s, area.y + rig.y * area.s); ctx.rotate(rig.rotation);
        ctx.translate(mouth, hingeY); ctx.rotate(-rig.lidAngle); ctx.translate(-mouth, -hingeY);
        ctx.beginPath(); ctx.rect(mouth, -rig.thickness * area.s, rig.length * .55 * area.s, rig.thickness * area.s * 2); ctx.clip();
        register(); c.drawPlate('front', views.front, rig.alpha, null, true); ctx.restore();
        if (rig.opening > 0) {
          ctx.save(); ctx.globalAlpha = rig.alpha * rig.opening;
          ctx.translate(area.x + rig.x * area.s, area.y + rig.y * area.s); ctx.rotate(rig.rotation);
          ctx.strokeStyle = 'rgba(255,251,229,.65)'; ctx.lineWidth = Math.max(1, .003 * area.s);
          ctx.beginPath(); ctx.ellipse(mouth, 0, rig.thickness * .045 * area.s, rig.scale * area.s, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        }
      }
    }
    captureDisplay(area) {
      const rig = this.rigAt(this.elapsed, area);
      if (!this.previousRig) this.previousRig = {};
      Object.assign(this.previousRig, rig);
      this.displayArea = area;
      const zoom = this.viewScale;
      const cosine = Math.cos(rig.rotation), sine = Math.sin(rig.rotation);
      for (let i = 0; i < this.shuffle.bodies.length; i++) {
        const body = this.shuffle.bodies[i], offset = i * 3;
        const tube = body.pouring && this.tubeByIndex[i];
        this.previousDisplay[offset] = tube ? rig.x + (cosine * tube.x - sine * tube.y) * rig.scale : body.x * zoom;
        this.previousDisplay[offset + 1] = tube ? rig.y + (sine * tube.x + cosine * tube.y) * rig.scale : body.y * zoom;
        this.previousDisplay[offset + 2] = tube ? tube.r * rig.scale : body.r * zoom;
      }
    }
    update(dt) {
      // Do not replay hidden-tab time as a burst of pouring or physics.
      dt = Math.max(0, Math.min(.05, Number(dt) || 0));
      this.elapsed += dt;
      const feedback = this.gate && this.gate.evaluate(performance.now());
      const target = feedback ? (feedback.eligible || feedback.releaseReady ? 1 : feedback.approach * .65) : 0;
      this.edgeGlow += (target - this.edgeGlow) * Math.min(1, dt * 9);
      this.accumulator = Math.min(.05, this.accumulator + dt);
      const area = this.area(), zoom = this.viewScale;
      const frame = P.EDGE_GEOMETRY.bounds(area), edge = P.THROW_THRESHOLDS.edgeBand;
      const halfWidth = Math.max(.1, frame.halfWidth - edge), halfHeight = Math.max(.1, frame.halfHeight - edge);
      this.shuffle.bounds = { left: -halfWidth / zoom, right: halfWidth / zoom,
        top: -halfHeight / zoom, bottom: halfHeight / zoom,
        cornerRadius: Math.min(P.THROW_THRESHOLDS.corner, halfWidth, halfHeight) / zoom,
        opening: P.EDGE_GEOMETRY.opening(frame).span / zoom,
        outer: { left: -frame.halfWidth / zoom, right: frame.halfWidth / zoom, top: -frame.halfHeight / zoom, bottom: frame.halfHeight / zoom } };
      while (this.accumulator >= 1 / 120) {
        if (this.accumulator < 2 / 120) this.captureDisplay(area);
        if (this.simulationTicks >= Math.ceil(POUR.lift * 120) && (this.angle || this.targetAngle || !this.remaining)) this.stepPour(1 / 120, area);
        if (this.remaining < this.entries.length) this.shuffle.step(1 / 120);
        this.simulationTicks++; this.accumulator -= 1 / 120;
      }
    }
    render(state) {
      const c = this.cinema, ctx = c.ctx, area = this.area(), ready = this.ready;
      ctx.clearRect(0, 0, area.w, area.h);
      // Use visual elapsed time only: no shuffle state, seed or release timing changes.
      const fade = clamp(this.elapsed / (state.reducedMotion ? .12 : 1.6));
      const blend = .35 + .65 * fade * fade * (3 - 2 * fade);
      P.Cinematic.prototype.drawSceneBackground.call(c, blend);
      if (this.gate) {
        const thresholds = P.THROW_THRESHOLDS, band = thresholds.edgeBand * area.s, radius = thresholds.corner * area.s;
        const feedback = this.gate.evaluate(performance.now());
        const mouth = P.EDGE_GEOMETRY.opening(P.EDGE_GEOMETRY.bounds(area));
        const left = 16 + band, right = area.w - 16 - band, top = 24 + band, bottom = area.h - 24 - band;
        const span = mouth.span * area.s, r = Math.min(radius, (right-left)/2, (bottom-top)/2);
        const wallPath = () => {
          ctx.beginPath(); ctx.moveTo(right-span, top); ctx.lineTo(left+r, top);
          ctx.quadraticCurveTo(left,top,left,top+r); ctx.lineTo(left,bottom-r);
          ctx.quadraticCurveTo(left,bottom,left+r,bottom); ctx.lineTo(right-r,bottom);
          ctx.quadraticCurveTo(right,bottom,right,bottom-r); ctx.lineTo(right,top+span);
        };
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        // A continuous warm rail closes three corners. Its only break is the
        // same diagonal outlet used by the collision walls and input gate.
        wallPath(); ctx.strokeStyle = '#c6b38f'; ctx.lineWidth = Math.max(7, Math.min(13, .022 * area.s));
        ctx.shadowColor = 'rgba(89,68,35,.18)'; ctx.shadowBlur = state.reducedMotion ? 0 : 7; ctx.stroke();
        ctx.shadowBlur = 0; wallPath(); ctx.strokeStyle = '#eee3cd'; ctx.lineWidth = Math.max(3, Math.min(7, .012 * area.s)); ctx.stroke();
        if (ready) {
          const zone = P.EDGE_GEOMETRY.releaseZone(mouth);
          ctx.beginPath(); zone.forEach((point, i) => {
            const px = area.x + point.x * area.s, py = area.y + point.y * area.s;
            if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }); ctx.closePath();
          ctx.fillStyle = feedback.releaseReady ? 'rgba(210,164,62,.34)' : 'rgba(210,164,62,.12)'; ctx.fill();
          ctx.strokeStyle = feedback.releaseReady ? '#a16f18' : '#bfa36d'; ctx.lineWidth = feedback.releaseReady ? 3 : 1.5; ctx.stroke();
        }
        const qualified = this.gate.active && feedback.interacted && this.gate.insideSeen;
        const alpha = qualified ? Math.max(this.edgeGlow, feedback.approach * .65) : 0;
        const x = area.x + mouth.x * area.s, y = area.y + mouth.y * area.s;
        const dx = Math.SQRT1_2, dy = -Math.SQRT1_2;
        ctx.strokeStyle = feedback.eligible || feedback.releaseReady ? '#c9a24f' : '#ad8a45'; ctx.lineWidth = 2 + alpha;
        if (!state.reducedMotion && alpha > .01) { ctx.shadowColor = '#e7c77b'; ctx.shadowBlur = feedback.eligible || feedback.releaseReady ? 8 : 3; }
        ctx.beginPath();
        ctx.moveTo(right-span-.024*area.s,top); ctx.lineTo(right-span,top);
        ctx.moveTo(right,top+span); ctx.lineTo(right,top+span+.024*area.s); ctx.stroke();
        const length = .036 * area.s, head = .018 * area.s;
        const ax = x + dx * .045 * area.s, ay = y + dy * .045 * area.s;
        ctx.beginPath(); ctx.moveTo(ax-dx*length,ay-dy*length); ctx.lineTo(ax+dx*length,ay+dy*length);
        ctx.moveTo(ax+dx*length-dx*head+dy*head,ay+dy*length-dy*head-dx*head);
        ctx.lineTo(ax+dx*length,ay+dy*length);
        ctx.lineTo(ax+dx*length-dx*head-dy*head,ay+dy*length-dy*head+dx*head); ctx.stroke();
        ctx.restore();
        c.canvas.dataset.throwReady = String(feedback.eligible || feedback.releaseReady);
        c.canvas.dataset.releaseReady = String(ready && feedback.releaseReady);
      }
      if (ready && this.shuffle.pointer) {
        const pointer = this.shuffle.grab || this.shuffle.pointer, x = area.x + pointer.x * area.s * this.viewScale, y = area.y + pointer.y * area.s * this.viewScale;
        const radius = this.shuffle.pointerRadius * area.s * this.viewScale;
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(55,43,32,.48)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
      }
      const currentRig = this.rigAt(this.elapsed, area);
      const sameArea = this.displayArea && this.displayArea.w === area.w && this.displayArea.h === area.h;
      // During a captured gesture use exact collision positions, including the outlet.
      const alpha = this.previousRig && sameArea && !this.tiltPointer && !this.shuffle.pointer && !(this.gate && this.gate.active)
        ? clamp(this.accumulator * 120) : 1;
      const rig = { ...currentRig };
      if (alpha < 1) for (const key of Object.keys(rig)) rig[key] = mix(this.previousRig[key], currentRig[key], alpha);
      this.drawTube(area, false, rig);
      this.lastPoses = this.displayPoses; this.lastPoseArea = area;
      const draw = (body, i) => {
        const local = body.pouring ? this.tubePose(i, this.elapsed, area)
          : { x: body.x * this.viewScale, y: body.y * this.viewScale, r: body.r * this.viewScale };
        const offset = i * 3, pose = this.displayPoses[i];
        pose.x = area.x + mix(this.previousDisplay[offset], local.x, alpha) * area.s;
        pose.y = area.y + mix(this.previousDisplay[offset + 1], local.y, alpha) * area.s;
        pose.radius = mix(this.previousDisplay[offset + 2], local.r, alpha) * area.s;
        pose.orientation = body.pouring ? rig.rotation : 0;
        c.drawOrb(this.entries[i], pose, 0, state.physics.marbles[i], this.entries.length, state.reducedMotion);
        if (this.entries.length <= 16 && ready) c.drawLabel(this.entries[i], pose.x, pose.y, pose.radius, .68);
      };
      // Inside marbles sit behind the glass; released marbles stay in front of it.
      for (let i = 0; i < this.shuffle.bodies.length; i++) if (this.shuffle.bodies[i].pouring) draw(this.shuffle.bodies[i], i);
      this.drawTube(area, true, rig);
      for (let i = 0; i < this.shuffle.bodies.length; i++) if (!this.shuffle.bodies[i].pouring) draw(this.shuffle.bodies[i], i);
      if (!ready && this.canTilt) {
        ctx.fillStyle = c.renderer && c.renderer.mapStyle && c.renderer.mapStyle.id === 'rhythm' ? '#F4DDB9' : '#69583F'; ctx.font = '12px "Pretendard Variable", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('유리관 오른쪽을 아래로 끌어 충분히 기울여 주세요', area.x, area.y + .38 * area.s);
      }
      if (ready && this.gate) {
        const feedback = this.gate.evaluate(performance.now()), mouth = P.EDGE_GEOMETRY.opening(P.EDGE_GEOMETRY.bounds(area));
        const text = feedback.releaseReady ? '놓으면 발사!' : '출구 쪽으로 끌어 놓으세요';
        const x = Math.max(94, Math.min(area.w - 94, area.x + mouth.x * area.s - .10 * area.s));
        const y = Math.max(32, Math.min(area.h - 28, area.y + mouth.y * area.s + .13 * area.s));
        ctx.save(); ctx.fillStyle = feedback.releaseReady ? '#f4dfaa' : 'rgba(251,247,239,.94)'; ctx.fillRect(x - 90, y - 16, 180, 32);
        ctx.fillStyle = '#684a20'; ctx.font = '600 13px "Pretendard Variable", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y); ctx.restore();
        if (c.canvas.dataset.throwHint !== text) {
          c.canvas.dataset.throwHint = text;
          if (c.canvas.setAttribute) c.canvas.setAttribute('aria-label', text);
        }
      }
      if (c.canvas.dataset) c.canvas.dataset.handPhase = !ready ? (this.elapsed < POUR.lift ? 'lifting' : this.remaining ? this.lidLatched ? 'pouring' : 'waiting-tilt' : 'settling-pour') : this.shuffle.pointer ? 'dragging' : 'settling';
      c.lastStage = 'mixing';
      return { reveal: 0 };
    }
  }
  P.HandScene = HandScene;
})(window.CosmicPinball = window.CosmicPinball || {});
