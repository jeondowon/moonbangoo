(function (P) {
  'use strict';
  const TAU = Math.PI * 2;
  const FIRE_MOMENT = .12;
  // Visual pacing is independent of the four-second seeded chamber simulation.
  const TIMING = Object.freeze({ mixing: 3.4, aiming: 2.8, flight: 3.2, blurClear: .8, chamberMix: 1.8, chamberAim: 2.2 });
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const interval = (a, b, x) => smooth((x - a) / (b - a));
  const easeCamera = x => { x = clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };
  const COATS = [
    ['#faf7e8', '#ded1b5', '#a99678'], ['#fff0ba', '#d6a340', '#927027'],
    ['#d8eedc', '#81ac8b', '#466853'], ['#fbf9ed', '#e7dfcd', '#b0a08a'],
    ['#ffe2a0', '#c69331', '#7e5c21'], ['#d4e7d9', '#8eb89e', '#536f61'],
    ['#f4f5f0', '#cfcec8', '#939994'], ['#f1ded2', '#c4a18c', '#8f7766']
  ];
  const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function rng(seed) {
    let h = 2166136261;
    for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return () => { h += 0x6d2b79f5; let n = Math.imul(h ^ h >>> 15, 1 | h); n ^= n + Math.imul(n ^ n >>> 7, 61 | n); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
  }
  function descriptors(physics, fallbackCount) {
    const source = physics && physics.marbles && physics.marbles.length ? physics.marbles : Array.from({ length: fallbackCount || 36 }, (_, i) => ({ id: 'preview-' + i, name: '', r: 12, colorIndex: i }));
    if (P.Pinball) P.Pinball.configureGroups(source);
    const seed = String(physics && physics.seed || 'mungbanggu-cinema') + '|independent-cinema|';
    const lanes = Array.from({ length: source.length }, (_, i) => i), laneRandom = rng(seed + 'release-lanes');
    for (let i = lanes.length - 1; i > 0; i--) { const j = Math.floor(laneRandom() * (i + 1)); [lanes[i], lanes[j]] = [lanes[j], lanes[i]]; }
    return source.map((m, i) => {
      const random = rng(seed + m.id + '|' + m.name + '|' + (m.copy || 1));
      return {
        id: m.id, name: m.name || '', index: i, colorIndex: m.colorIndex === undefined ? i : m.colorIndex,
        radius: m.r || 12, axial: random() * 1.7 - .85, radial: .12 + Math.sqrt(random()) * .78,
        phase: random() * TAU, spin: random() * TAU, delay: random() * .04,
        lane: (lanes[i] + .5) / source.length * 2 - 1,
        curve: random() - .5, height: .1 + random() * .18, coat: i % COATS.length
      };
    });
  }
  function tubePose(entry, time, swirl) {
    const a = entry.phase + time * (.55 + entry.radial * .24) + (swirl || 0);
    return {
      x: clamp(entry.axial + Math.sin(time * .39 + entry.phase + (swirl || 0)) * .09, -.9, .9),
      y: Math.sin(a) * entry.radial * .79,
      z: Math.cos(a) * entry.radial,
      spin: entry.spin + time * .22 + (swirl || 0) * .2
    };
  }
  function layout(width, height, shot, orbit, flight) {
    const mobile = width < 700, aspect = 1678 / 937;
    const w = Math.min(width * (mobile ? 1.28 : .99), height * aspect * .94), h = w / aspect;
    const q = smooth(orbit || 0), f = smooth(flight || 0);
    if (shot === 'front') return {
      w, h, anchorX: .49, anchorY: .548,
      x: width * .5 - width * .12 * q, y: height * (.53 + q * .045),
      scaleX: 1 - q * .22, scaleY: 1 + q * .035, shear: -q * .04, rotation: q * .025
    };
    const dolly = mobile ? 1.14 : 1.06;
    return {
      w, h, anchorX: .255, anchorY: .615,
      x: width * (.355 - q * .065 - f * .19), y: height * (.59 + q * .02 + f * .095),
      scaleX: dolly * (1 + f * .09), scaleY: dolly * (1 + f * .09), shear: (1 - q) * .035,
      rotation: (1 - q) * -.025
    };
  }
  function pointInPlate(view, u, v) {
    if (view.matrix) {
      const m = view.matrix, x = u * view.w, y = v * view.h;
      return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
    }
    const x = (u - view.anchorX) * view.w, y = (v - view.anchorY) * view.h;
    const sx = x * view.scaleX + y * view.shear, sy = y * view.scaleY, c = Math.cos(view.rotation), s = Math.sin(view.rotation);
    return { x: view.x + sx * c - sy * s, y: view.y + sx * s + sy * c };
  }
  function matchedViews(width, height, orbit, flight) {
    const front = layout(width, height, 'front', 0, 0), angle = layout(width, height, 'angle', 1, flight || 0), t = easeCamera(orbit || 0);
    const f1 = pointInPlate(front, .31, .548), f2 = pointInPlate(front, .697, .548);
    const a1 = pointInPlate(angle, .193, .66), a2 = pointInPlate(angle, .317, .537);
    const fl = Math.hypot(f2.x - f1.x, f2.y - f1.y), al = Math.hypot(a2.x - a1.x, a2.y - a1.y);
    const rotation = lerp(Math.atan2(f2.y - f1.y, f2.x - f1.x), Math.atan2(a2.y - a1.y, a2.x - a1.x), t);
    const frame = {
      x: lerp((f1.x + f2.x) / 2, (a1.x + a2.x) / 2, t),
      y: lerp((f1.y + f2.y) / 2, (a1.y + a2.y) / 2, t),
      length: lerp(fl, al, t), thickness: lerp(front.h * .264, angle.h * .156 * angle.scaleY, t),
      rotation, axisX: Math.cos(rotation), axisY: Math.sin(rotation), baseThickness: front.h * .264
    };
    function register(view, p1, p2, sourceThickness) {
      const x1 = p1[0] * view.w, y1 = p1[1] * view.h, x2 = p2[0] * view.w, y2 = p2[1] * view.h;
      const length = Math.hypot(x2 - x1, y2 - y1), sx = (x2 - x1) / length, sy = (y2 - y1) / length;
      const nx = -sy, ny = sx, tx = frame.axisX, ty = frame.axisY, tnX = -ty, tnY = tx;
      const longitudinal = frame.length / length, transverse = frame.thickness / sourceThickness;
      const m = {
        a: tx * sx * longitudinal + tnX * nx * transverse,
        b: ty * sx * longitudinal + tnY * nx * transverse,
        c: tx * sy * longitudinal + tnX * ny * transverse,
        d: ty * sy * longitudinal + tnY * ny * transverse
      };
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      m.e = frame.x - m.a * cx - m.c * cy; m.f = frame.y - m.b * cx - m.d * cy;
      view.matrix = m; view.frame = frame; return view;
    }
    const bridge = register(layout(width, height, 'front', 0, 0), [.32, .504], [.68, .504], front.h * .30);
    return { bridge, front: register(front, [.31, .548], [.697, .548], front.h * .264), angle: register(angle, [.193, .66], [.317, .537], angle.h * .156), frame };
  }
  function project(local, front, angle, orbit) {
    if (front.frame) {
      const f = front.frame, lateral = local.y * f.thickness * .54;
      const axial = local.x * f.length * .45;
      return { x: f.x + f.axisX * axial - f.axisY * lateral, y: f.y + f.axisY * axial + f.axisX * lateral,
        depth: local.z, scale: f.thickness / f.baseThickness };
    }
    const a = pointInPlate(front, .49 + local.x * .173 + local.z * .005, .548 + local.y * .111 + local.z * .008);
    const b = pointInPlate(angle, .248 + local.x * .070 + local.y * .029 + local.z * .008, .600 - local.x * .066 + local.y * .071 + local.z * .012);
    return { x: lerp(a.x, b.x, orbit), y: lerp(a.y, b.y, orbit), depth: local.z, scale: lerp(front.scaleY, angle.scaleY * .71, orbit) };
  }
  function blastPose(progress, reduced) {
    const after = progress - FIRE_MOMENT;
    const active = after >= 0;
    return {
      fired: active,
      compression: reduced ? 0 : active ? 1 - interval(0, .07, after) : interval(.015, FIRE_MOMENT, progress),
      recoil: !reduced && active && after < .28 ? interval(0, .015, after) * Math.exp(-after * 18) * (1 - interval(.18, .28, after)) : 0,
      flash: !reduced && active && after < .14 ? Math.exp(-after * 32) * interval(0, .004, after) : 0,
      shock: !reduced && active ? clamp(after / .17, 0, 1) : 0,
      shake: !reduced && active ? Math.exp(-after * 29) * (1 - interval(.15, .23, after)) : 0,
      smoke: !reduced && active ? interval(0, .025, after) * (1 - interval(.10, .25, after)) : 0,
      after: Math.max(0, after)
    };
  }
  function barrelOffset(progress, frame, width, reduced) {
    const blast = blastPose(progress, reduced), distance = reduced ? 0 : blast.recoil * Math.min(22, width * .017) + blast.compression * 2.5;
    return { x: -frame.axisX * distance, y: -frame.axisY * distance };
  }
  function flightOffset(entry, progress, frame, width, reduced) {
    const offset = barrelOffset(progress, frame, width, reduced), release = FIRE_MOMENT + (entry.delay || 0);
    // Follow the moving muzzle until release; detach smoothly without moving the landing.
    const attachment = 1 - interval(release, release + .035, progress);
    return { x: offset.x * attachment, y: offset.y * attachment };
  }
  function assemblyPose(progress, view, finalView, reduced) {
    const p = clamp(progress, 0, 1), amount = interval(.34, .84, p);
    const finalCenter = pointInPlate(finalView, .244, .769), finalFrame = finalView.frame, frame = view.frame;
    const m = finalView.matrix;
    const axisX = { x: m.a * finalView.w * .083, y: m.b * finalView.w * .083 };
    const axisY = { x: m.c * finalView.h * .137, y: m.d * finalView.h * .137 };
    const radius = Math.max(Math.hypot(axisX.x, axisX.y), Math.hypot(axisY.x, axisY.y));
    // Use the completed wheel dimensions. Registering a wheel to the long front barrel
    // would stretch it several times before the orbit has completed.
    const dx = finalCenter.x - finalFrame.x, dy = finalCenter.y - finalFrame.y;
    const along = dx * finalFrame.axisX + dy * finalFrame.axisY, across = -dx * finalFrame.axisY + dy * finalFrame.axisX;
    const center = { x: frame.x + frame.axisX * along - frame.axisY * across,
      y: frame.y + frame.axisY * along + frame.axisX * across };
    const settle = reduced ? 0 : Math.sin((p - .79) * 28) * Math.exp(-Math.max(0, p - .79) * 18) * interval(.79, .82, p) * (1 - interval(.95, 1, p));
    return {
      x: center.x - (reduced ? 0 : (1 - amount) * radius * 1.75), y: center.y + (reduced ? 0 : (1 - amount) * radius * .12 + settle * radius * .035),
      axisX, axisY, radius, alpha: interval(.29, .40, p),
      scale: .94 + amount * .06, rotation: reduced || p === 1 ? 0 : (1 - amount) * -1.75 + settle * .012,
      support: amount, complete: p === 1
    };
  }
  function dischargeOrigin(entry, muzzle, radius, screen) {
    const lane = entry.lane === undefined ? Math.sin(entry.phase || 0) * (entry.radial || .7) : entry.lane;
    const across = lane * (screen.muzzleRadius || radius * 1.7) * .8;
    const ax = screen.axisX === undefined ? .85 : screen.axisX, ay = screen.axisY === undefined ? -.5267826876 : screen.axisY;
    return { x: muzzle.x - ay * across, y: muzzle.y + ax * across };
  }
  function flightPose(entry, progress, start, muzzle, target, startRadius, endRadius, screen) {
    if (progress >= 1) return { x: target.x, y: target.y, radius: endRadius, depth: 0, amount: 1, focus: 1 };
    const release = FIRE_MOMENT + (entry.delay || 0), gatherEnd = .073;
    const arrival = screen.arrival || 1;
    if (progress >= arrival) return { x: target.x, y: target.y, radius: endRadius, depth: 0, amount: 1, focus: 1, contained: false };
    const axisLength = Math.hypot(muzzle.x - start.x, muzzle.y - start.y) || 1;
    const ax = screen.axisX === undefined ? (muzzle.x - start.x) / axisLength : screen.axisX;
    const ay = screen.axisY === undefined ? (muzzle.y - start.y) / axisLength : screen.axisY;
    const origin = dischargeOrigin(entry, muzzle, startRadius, { ...screen, axisX: ax, axisY: ay });
    const fan = (entry.lane || 0) * .18, cos = Math.cos(fan), sin = Math.sin(fan);
    const dx = ax * cos - ay * sin, dy = ax * sin + ay * cos;
    const first = { x: origin.x + dx * screen.width * (.31 + entry.curve * .02), y: origin.y + dy * screen.width * (.31 + entry.curve * .02) };
    const second = { x: target.x - screen.width * .075 + screen.width * entry.curve * .075,
      y: target.y - screen.height * (entry.height + .06) };
    const chamber = { x: origin.x - ax * screen.width * .07, y: origin.y - ay * screen.width * .07 };
    if (progress < gatherEnd) {
      const u = smooth(progress / gatherEnd);
      return { x: lerp(start.x, chamber.x, u), y: lerp(start.y, chamber.y, u), radius: startRadius,
        depth: start.depth || 0, amount: 0, focus: .78, contained: true };
    }
    if (progress < release) {
      const u = clamp((progress - gatherEnd) / (release - gatherEnd), 0, 1), v = 1 - u;
      const velocityScale = (release - gatherEnd) * 2.4 / (arrival - release);
      const beforeMuzzle = { x: origin.x - (first.x - origin.x) * velocityScale, y: origin.y - (first.y - origin.y) * velocityScale };
      return { x: v * v * v * chamber.x + 3 * v * v * u * chamber.x + 3 * v * u * u * beforeMuzzle.x + u * u * u * origin.x,
        y: v * v * v * chamber.y + 3 * v * v * u * chamber.y + 3 * v * u * u * beforeMuzzle.y + u * u * u * origin.y,
        radius: startRadius, depth: start.depth || 0, amount: 0, focus: .78, contained: true };
    }
    // Discharge begins with velocity at the muzzle, then decelerates as the camera
    // meets the board. Its first derivative matches the in-barrel acceleration.
    const t = clamp((progress - release) / (arrival - release), 0, 1), u = 1 - Math.pow(1 - t, 2.4), v = 1 - u;
    return {
      x: v * v * v * origin.x + 3 * v * v * u * first.x + 3 * v * u * u * second.x + u * u * u * target.x,
      y: v * v * v * origin.y + 3 * v * v * u * first.y + 3 * v * u * u * second.y + u * u * u * target.y,
      radius: lerp(startRadius * (1 + Math.sin(u * Math.PI) * .27), endRadius, interval(.48, 1, u)),
      depth: Math.sin(u * Math.PI) * entry.curve, amount: t, focus: lerp(.78, 1, interval(.45, .96, u)), contained: false
    };
  }
  // A fixed-step physical cross-section: contacts and visible spheres use one plane.
  const CHAMBER_HALF = .45 * (1678 / 937) * .387 / (.54 * .264);
  function pressureAt(seconds, enabled) {
    const cycle = 1.65, phase = seconds % cycle, burst = phase >= .18 && phase < .40;
    const pulse = burst ? Math.sin((phase - .18) / .22 * Math.PI) : 0;
    return { x: enabled ? (Math.floor(seconds / cycle) % 2 ? -1 : 1) * pulse * 24 : 0,
      y: 7 - (enabled ? pulse * 55 : 0), pressure: enabled ? pulse : 0,
      charge: enabled && phase >= 0 && phase < .18 ? phase / .18 : 0 };
  }
  class Chamber {
    constructor(entries, seed) {
      this.random = rng(String(seed) + '|physical-cross-section');
      this.ticks = 0; this.collisions = 0; this.wallHits = 0; this.pressureOrigin=0;
      this.radius = Math.min(.28, Math.sqrt(1.35 / Math.max(1, entries.length)));
      this.bodies = [];
      for (let index = 0; index < entries.length; index++) {
        let body, attempts = 0;
        do {
          body = { x: (this.random() * 2 - 1) * (CHAMBER_HALF - this.radius),
            y: (this.random() * 2 - 1) * (1 - this.radius), z: 0 };
          const cx = clamp(body.x, -(CHAMBER_HALF - 1), CHAMBER_HALF - 1);
          if (Math.hypot(body.x - cx, body.y) > 1 - this.radius) continue;
          if (!this.bodiesNear(body, this.bodies, this.radius * 2 + .001)) break;
        } while (++attempts < 10000);
        Object.assign(body, { index, r: this.radius, vx: 0, vy: 0, vz: 0, spin: this.random() * TAU });
        this.wall(body); this.bodies.push(body);
      }
    }
    rest() {
      // Supported hexagonal layers start at the flat glass floor. Keep the
      // seeded ownership order, with no suspended random positions.
      const r = this.radius = Math.min(.28, Math.sqrt(.9 / Math.max(1, this.bodies.length))), diameter = 2 * r;
      const columns = Math.max(1, Math.floor((2 * (CHAMBER_HALF - 1) - r) / diameter) + 1);
      const order = this.bodies.slice().sort((a, b) => a.x - b.x || a.index - b.index);
      for (let start = 0, row = 0; start < order.length; start += columns, row++) {
        const count = Math.min(columns, order.length - start);
        const first = Math.floor((columns - count) / 2);
        for (let col = 0; col < count; col++) {
          const b = order[start + col]; b.r = r;
          b.x = (first + col - (columns - 1) / 2) * diameter + (row % 2) * r;
          if (order.length <= columns) b.x = (col - (count - 1) / 2) * diameter;
          b.y = 1 - r - row * Math.sqrt(3) * r;
          b.vx = 0; b.vy = 0; this.wall(b);
        }
      }
    }
    bodiesNear(body, bodies, distance) { return bodies.some(b => Math.hypot(body.x-b.x, body.y-b.y) < distance); }
    wall(b) {
      const cx = clamp(b.x, -(CHAMBER_HALF - 1), CHAMBER_HALF - 1), dx = b.x - cx;
      const limit = 1-b.r, d2=dx*dx+b.y*b.y;
      if(d2<=limit*limit)return;
      const d=Math.sqrt(d2);
      const nx = dx / d, ny = b.y / d, outward = b.vx * nx + b.vy * ny;
      b.x = cx + nx * limit; b.y = ny * limit;
      if (outward > 0) {
        b.vx -= 1.62 * outward * nx; b.vy -= 1.62 * outward * ny;
        const tangent = -b.vx * ny + b.vy * nx;
        b.vx += ny * tangent * .08; b.vy -= nx * tangent * .08;
      }
      this.wallHits++;
    }
    pairs() {
      // Cache broad-phase candidates within a substep, with a margin for corrections.
      const cell=this.radius*2.1,grid=new Map(),pairs=[];
      for(const b of this.bodies) {
        const gx=Math.floor(b.x/cell),gy=Math.floor(b.y/cell),key=gy*512+gx;
        if(!grid.has(key))grid.set(key,[]);grid.get(key).push(b);
      }
      for(const b of this.bodies) {
        const gx=Math.floor(b.x/cell),gy=Math.floor(b.y/cell);
        for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++) {
          const near=grid.get((gy+dy)*512+gx+dx);if(!near)continue;
          for(const a of near)if(a.index<b.index)pairs.push([a,b]);
        }
      }
      return pairs;
    }
    contacts(pairs) {
      let worst=0;
      for(const [a,b] of pairs) {
        let nx=b.x-a.x,ny=b.y-a.y;const diameter=a.r+b.r,d2=nx*nx+ny*ny;
        if(d2>=diameter*diameter)continue;
        const d=Math.sqrt(d2);
        if(d<1e-9){nx=1;ny=0;}else{nx/=d;ny/=d;}
        worst=Math.max(worst,(diameter-d)/diameter);
        const correction=(diameter-d)*.505;
        a.x-=nx*correction;a.y-=ny*correction;b.x+=nx*correction;b.y+=ny*correction;
        const approach=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
        if(approach<0) {
          const impulse=-approach*.89;
          a.vx-=nx*impulse;a.vy-=ny*impulse;b.vx+=nx*impulse;b.vy+=ny*impulse;this.collisions++;
        }
      }
      for(const b of this.bodies)this.wall(b);
      return worst;
    }
    step(run) {
      // Derive substeps from travel distance, rather than increasing all iterations blindly.
      const speed=Math.max(...this.bodies.map(b=>Math.max(Math.abs(b.vx),Math.abs(b.vy))));
      const steps=clamp(Math.ceil((speed+55/120)/120/(this.radius*.25)),2,4),dt=1/120/steps;
      for (let sub=0;sub<steps;sub++) {
        const force=pressureAt(this.ticks/120+sub*dt-this.pressureOrigin,run);
        for (const b of this.bodies) {
          const drag=Math.exp(-dt*(b.y>1-b.r-.03?.9:.12));
          b.vx=clamp((b.vx+force.x*dt)*drag,-4.8,4.8);
          b.vy=clamp((b.vy+force.y*dt)*drag,-4.8,4.8);
          b.x+=b.vx*dt;b.y+=b.vy*dt;b.spin+=b.vx*dt/Math.max(.04,b.r);this.wall(b);
        }
        let pairs=this.pairs();
        for(let pass=0;pass<6;pass++) {
          if(pass===3)pairs=this.pairs();
          const remaining=this.contacts(pairs);
          if(pass>=1 && remaining<.015)break;
        }
      }
      this.ticks++;
    }
    seek(seconds, run) {
      const target=Math.max(this.ticks,Math.round(Math.max(0,seconds)*120));
      while(this.ticks<target)this.step(run);
    }
    pose(index) { const b=this.bodies[index];return {x:b.x/CHAMBER_HALF,y:b.y,z:0,spin:b.spin,radius:b.r}; }
  }
  function mapPoint(m, x, y) { return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }; }
  function inverseMatrix(m) {
    const determinant = m.a * m.d - m.b * m.c;
    return { a: m.d / determinant, b: -m.b / determinant, c: -m.c / determinant, d: m.a / determinant,
      e: (m.c * m.f - m.d * m.e) / determinant, f: (m.b * m.e - m.a * m.f) / determinant };
  }
  function multiplyMatrix(a, b) {
    return { a: a.a * b.a + a.c * b.b, b: a.b * b.a + a.d * b.b,
      c: a.a * b.c + a.c * b.d, d: a.b * b.c + a.d * b.d,
      e: a.a * b.e + a.c * b.f + a.e, f: a.b * b.e + a.d * b.f + a.f };
  }
  function boardView(width, height, camera, progress, reduced) {
    const small = width < 700, zoom = camera && camera.zoom || .7;
    const bottom = Math.max(1700, (camera && camera.y || 380) + height / (2 * zoom) + 160);
    const scale = Math.min(width * (small ? .40 : .24), height * .76 * 1000 / (bottom + 500)) / 1000;
    const initial = { a: scale, b: -.012 * scale, c: .025 * scale, d: scale,
      e: width - scale * 1060 - (small ? 12 : 25), f: height * (small ? .275 : .25) };
    const origin = camera ? camera.worldToScreen(0, 0) : { x: 30, y: 100 };
    const final = { a: zoom, b: 0, c: 0, d: zoom, e: origin.x, f: origin.y };
    const focus = { x: camera && camera.x || 500, y: camera && camera.y || 380 };
    const u = reduced ? progress >= .98 ? 1 : 0 : easeCamera(((progress || 0) - .18) / .82);
    const anchor = mapPoint(initial, focus.x, focus.y), target = mapPoint(final, focus.x, focus.y);
    const size = Math.exp(lerp(Math.log(scale), Math.log(zoom), u));
    const current = { a: size, b: initial.b * (1 - u), c: initial.c * (1 - u), d: size, e: 0, f: 0 };
    current.e = lerp(anchor.x, target.x, u) - current.a * focus.x - current.c * focus.y;
    current.f = lerp(anchor.y, target.y, u) - current.b * focus.x - current.d * focus.y;
    const scene = multiplyMatrix(current, inverseMatrix(initial));
    return { initial, current, final, scene, bottom, amount: u, scale: Math.sqrt(Math.abs(scene.a * scene.d - scene.b * scene.c)) };
  }
  function pill(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function sparkle(ctx, x, y, r) {
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + r * .18, y - r * .18, x + r, y); ctx.quadraticCurveTo(x + r * .18, y + r * .18, x, y + r); ctx.quadraticCurveTo(x - r * .18, y + r * .18, x - r, y); ctx.quadraticCurveTo(x - r * .18, y - r * .18, x, y - r); ctx.fill();
  }
  class Cinematic {
    constructor(canvas, renderer) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.renderer = renderer;
      this.quality = 'high'; this.sprites = new Map(); this.labels = new Map(); this.bodyPlates = new Map(); this.morphLayers = new Map(); this.wheelLight = null; this.plates = {}; this.cache = null;
      this.lastStage = null; this.lastTime = 0; this.frozenTube = null;
      const random = rng('mungbanggu-gold-dust');
      this.dust = Array.from({ length: 100 }, (_, i) => ({ x: random(), y: random(), phase: random() * TAU, r: .4 + random() * 1.4, index: i }));
      this.ready = Promise.all(['front', 'angle', 'barrel', 'wheel', 'bridge'].map(shot => this.loadPlate(shot, './assets/cannon-' + shot + '.png')));
    }
    loadPlate(shot, path) {
      return new Promise(resolve => {
        if (typeof Image === 'undefined') { resolve(false); return; }
        const image = new Image(); image.onload = () => { this.plates[shot] = image; resolve(true); };
        image.onerror = () => resolve(false); image.src = path;
      });
    }
    setQuality(quality) { this.quality = ['high', 'medium', 'low'].includes(quality) ? quality : 'high'; }
    resize() {
      this.width = this.canvas.clientWidth || innerWidth; this.height = this.canvas.clientHeight || innerHeight;
      this.dpr = P.renderDensity(this.width, this.height, devicePixelRatio) * (this.renderer && this.renderer.renderScale || 1);
      const w = Math.round(this.width * this.dpr), h = Math.round(this.height * this.dpr);
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    entries(physics) {
      const count = physics && physics.marbles && physics.marbles.length || 36;
      if (!this.cache || this.cache.physics !== physics || this.cache.count !== count) {
        const next = descriptors(physics,36), old = this.cache;
        const carry = old && ['intro','setup'].includes(this.lastStage) && old.count === count &&
          old.entries.every((entry,i)=>entry.name===next[i].name && entry.id===next[i].id);
        const live = carry ? this.previewChamber : null;
        this.cache = { physics, count, entries: next }; this.frozenTube = null;
        this.chamber = live || new Chamber(this.cache.entries, physics && physics.seed || 'preview');
        if (!live) this.chamber.rest();
        this.previewChamber = this.chamber; this.launchBirth = null; this.previewBirth = this.chamber.ticks/120;
        this.stillTube = this.cache.entries.map(entry => this.chamber.pose(entry.index));
        this.chamberBirth = this.lastTime || 0; this.shuffleCommitted = false; this.boardCache = null;
      }
      return this.cache.entries;
    }
    commitHandSlots(physics, bodies) {
      this.entries(physics);
      if (this.shuffleCommitted) return physics.handStart;
      const start = P.commitHandStart(physics, bodies);
      this.shuffleCommitted = true;
      return start;
    }
    commitShuffle(physics) {
      const entries = this.entries(physics); if (this.shuffleCommitted) return;
      this.chamber.seek((this.launchBirth === null ? 0 : this.launchBirth) + 4, true);
      const order = this.chamber.bodies.slice().sort((a, b) => b.x - a.x || a.index - b.index);
      const slots = physics.marbles.map(m => ({ x: m.x, y: m.y, vx: m.vx, vy: m.vy, _anchorX: m._anchorX, _anchorY: m._anchorY }))
        .sort((a, b) => a.y - b.y || a.x - b.x);
      const lanes = this.chamber.bodies.slice().sort((a, b) => a.y - b.y || a.index - b.index);
      const ownership = entries.slice().sort((a,b)=>a.lane-b.lane || a.index-b.index);
      // Capture the seeded permutation before live lane values are replaced below.
      ownership.forEach((entry,rank)=>Object.assign(physics.marbles[entry.index],slots[rank]));
      lanes.forEach((body,rank)=>{entries[body.index].lane=(rank+.5)/lanes.length*2-1;});
      order.forEach((body,rank)=>{ entries[body.index].delay=order.length<2?0:rank/(order.length-1)*.04; });
      this.frozenTube = entries.map(entry => this.chamber.pose(entry.index));
      this.shuffleCommitted = true;
    }
    drawPlate(shot, view, alpha, morph = null, transparentTube = false) {
      if (alpha <= .001 || morph !== null && (shot === 'front' ? morph >= 1 : morph <= 0)) return;
      const asset = shot === 'angle' && this.plates.barrel ? 'barrel' : shot;
      const ctx = this.ctx, image = this.plates[asset]; ctx.save(); ctx.globalAlpha = alpha;
      if (view.matrix) { const m = view.matrix; ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f); }
      else { ctx.translate(view.x, view.y); ctx.rotate(view.rotation); ctx.transform(view.scaleX, 0, view.shear, view.scaleY, 0, 0); }
      if (image) {
        const left = view.matrix ? 0 : -view.anchorX * view.w, top = view.matrix ? 0 : -view.anchorY * view.h;
        ctx.drawImage(transparentTube && asset === 'front' ? this.tubePlateFor(image) : morph === null ? this.bodyFor(asset, image) : this.morphFor(asset, image, morph), left, top, view.w, view.h);
      }
      else {
        const x = (.31 - view.anchorX) * view.w, y = (.4 - view.anchorY) * view.h, w = view.w * .4, h = view.h * .29;
        const glass = ctx.createLinearGradient(0, y, 0, y + h); glass.addColorStop(0, 'rgba(255,253,236,.85)'); glass.addColorStop(.5, 'rgba(209,189,147,.16)'); glass.addColorStop(1, 'rgba(197,168,112,.5)');
        ctx.fillStyle = glass; pill(ctx, x, y, w, h, 35); ctx.fill(); ctx.strokeStyle = '#d2b06b'; ctx.lineWidth = 10; ctx.stroke();
      }
      ctx.restore();
    }
    bodyFor(shot, image) {
      if (this.bodyPlates.has(shot)) return this.bodyPlates.get(shot);
      const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
      const front = shot === 'front' || shot === 'bridge', bridge = shot === 'bridge', a = { x: w * (bridge ? .32 : front ? .31 : .193), y: h * (bridge ? .504 : front ? .548 : .66) };
      const b = { x: w * (bridge ? .68 : front ? .697 : .317), y: h * (bridge ? .504 : front ? .548 : .537) };
      const length = Math.hypot(b.x - a.x, b.y - a.y), thickness = h * (bridge ? .30 : front ? .264 : .156);
      const rear = length * (front ? .48 : .86), fore = length * (front ? .43 : .72);
      const c = makeCanvas(w, h), ctx = c.getContext('2d'), mask = makeCanvas(w, h), m = mask.getContext('2d');
      ctx.drawImage(image, 0, 0, w, h);
      m.translate(a.x, a.y); m.rotate(Math.atan2(b.y - a.y, b.x - a.x));
      m.filter = 'blur(10px)'; m.fillStyle = '#fff';
      pill(m, -rear, -thickness * .90, length + rear + fore, thickness * 1.80, thickness * .62); m.fill();
      ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(mask, 0, 0); ctx.globalCompositeOperation = 'source-over';
      this.bodyPlates.set(shot, c); return c;
    }
    tubePlateFor(image) {
      if (this.transparentTubePlate) return this.transparentTubePlate;
      const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
      const layer = makeCanvas(w, h), ctx = layer.getContext('2d');
      ctx.drawImage(image, 0, 0, w, h);
      ctx.save(); ctx.scale(w / 1678, h / 937);
      // Retain the original photographed gold and glass, with a close-fitting
      // silhouette instead of the studio backdrop and shadow around it.
      ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(237, 482);
      ctx.bezierCurveTo(237, 474, 264, 479, 274, 458);
      ctx.bezierCurveTo(287, 413, 295, 348, 329, 337);
      ctx.bezierCurveTo(335, 304, 357, 302, 374, 332);
      ctx.lineTo(523, 337); ctx.lineTo(1155, 337); ctx.lineTo(1290, 332);
      ctx.bezierCurveTo(1307, 302, 1329, 304, 1345, 336);
      ctx.bezierCurveTo(1392, 395, 1402, 643, 1341, 702);
      ctx.bezierCurveTo(1325, 724, 1307, 719, 1292, 697);
      ctx.lineTo(1154, 697); ctx.lineTo(1116, 683); ctx.lineTo(530, 683); ctx.lineTo(498, 697); ctx.lineTo(377, 697);
      ctx.bezierCurveTo(362, 724, 337, 717, 321, 694);
      ctx.bezierCurveTo(294, 654, 286, 598, 273, 558);
      ctx.bezierCurveTo(263, 537, 235, 546, 237, 530); ctx.closePath(); ctx.fill();
      // The central photographed glass includes an opaque view of the studio.
      // Only its reflection remains; all ornamental metal pixels stay intact.
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,.92)';
      ctx.beginPath(); ctx.moveTo(527, 363); ctx.lineTo(1150, 363);
      ctx.bezierCurveTo(1148, 398, 1240, 435, 1240, 515);
      ctx.bezierCurveTo(1240, 594, 1149, 635, 1152, 660);
      ctx.lineTo(529, 660); ctx.bezierCurveTo(524, 628, 441, 600, 441, 515);
      ctx.bezierCurveTo(441, 437, 525, 398, 527, 363); ctx.closePath(); ctx.fill();
      ctx.restore(); ctx.globalCompositeOperation = 'source-over';
      this.transparentTubePlate = layer; return layer;
    }
    morphFor(shot, image, amount) {
      const body = this.bodyFor(shot, image), w = body.width, h = body.height;
      if (amount <= 0 || amount >= 1) return body;
      let layer = this.morphLayers.get(shot);
      if (!layer) { layer = makeCanvas(w, h); this.morphLayers.set(shot, layer); }
      const ctx = layer.getContext('2d'), front = shot === 'front'; ctx.clearRect(0, 0, w, h); ctx.drawImage(body, 0, 0);
      const a = { x: w * (front ? .31 : .193), y: h * (front ? .548 : .66) }, b = { x: w * (front ? .697 : .317), y: h * (front ? .548 : .537) };
      const dx = b.x - a.x, dy = b.y - a.y, t = lerp(-1.65, 1.65, amount);
      const x = (a.x + b.x) / 2 + dx * t, y = (a.y + b.y) / 2 + dy * t;
      const mask = ctx.createLinearGradient(x - dx * .045, y - dy * .045, x + dx * .045, y + dy * .045);
      mask.addColorStop(0, front ? 'rgba(255,255,255,0)' : '#fff'); mask.addColorStop(1, front ? '#fff' : 'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = mask; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over';
      return layer;
    }
    drawStudioShadow(frame, wheel, orbit) {
      const ctx = this.ctx, ground = lerp(frame.y + frame.thickness * .96, wheel.y + wheel.radius * .92, easeCamera(orbit));
      ctx.save(); ctx.translate(frame.x + frame.thickness * .20, ground); ctx.scale(1, .14);
      const radius = frame.length * .72 + frame.thickness * .65;
      const shadow = ctx.createRadialGradient(0, 0, radius * .08, 0, 0, radius);
      shadow.addColorStop(0, 'rgba(93,67,30,.23)'); shadow.addColorStop(.5, 'rgba(110,81,38,.12)'); shadow.addColorStop(1, 'rgba(110,81,38,0)');
      ctx.fillStyle = shadow; ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.fill(); ctx.restore();
    }
    glassPath(front, angle, orbit, inside = false) {
      if (front.frame) {
        const f=front.frame,ctx=this.ctx;
        ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.rotation);
        ctx.scale(f.length*.45/CHAMBER_HALF,f.thickness*.54);
        pill(ctx,-CHAMBER_HALF,-1,CHAMBER_HALF*2,2,1);ctx.restore();return;
      }
      const ctx = this.ctx, a = pointInPlate(front, .31, .548), b = pointInPlate(front, .697, .548);
      const c = pointInPlate(angle, .193, .66), d = pointInPlate(angle, .317, .537);
      const x1 = lerp(a.x, c.x, orbit), y1 = lerp(a.y, c.y, orbit), x2 = lerp(b.x, d.x, orbit), y2 = lerp(b.y, d.y, orbit);
      const radius = lerp(front.h * .132 * front.scaleY, angle.h * .078 * angle.scaleY, orbit), distance = Math.hypot(x2 - x1, y2 - y1), rotation = Math.atan2(y2 - y1, x2 - x1);
      ctx.save(); ctx.translate(x1, y1); ctx.rotate(rotation); pill(ctx, -radius * .35, -radius, distance + radius * .7, radius * 2, radius * .56); ctx.restore();
    }
    drawGlass(front, angle, orbit, time, alpha, pressure = 0) {
      const ctx = this.ctx, f = front.frame; ctx.save(); this.glassPath(front, angle, orbit); ctx.clip();
      // The studio key light stays above-left in screen space throughout the turn.
      const span = f.length * .68 + f.thickness;
      const light = ctx.createLinearGradient(f.x - f.thickness * .65, f.y - f.thickness * .76, f.x + f.thickness * .65, f.y + f.thickness * .76);
      light.addColorStop(0, 'rgba(255,255,245,.22)'); light.addColorStop(.45, 'rgba(255,255,245,.025)'); light.addColorStop(1, 'rgba(120,89,43,.10)');
      ctx.globalAlpha = alpha; ctx.fillStyle = light; ctx.fillRect(f.x - span, f.y - span, span * 2, span * 2);
      if (this.quality !== 'low') {
        const side = (-f.axisY * -.65 + f.axisX * -.76) < 0 ? -1 : 1;
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rotation);
        ctx.strokeStyle = 'rgba(255,253,237,.48)'; ctx.lineWidth = Math.max(.8, f.thickness * .016); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-f.length * .48, side * f.thickness * .32);
        ctx.quadraticCurveTo(0, side * f.thickness * .37, f.length * .48, side * f.thickness * .32); ctx.stroke();
        ctx.strokeStyle = 'rgba(125,100,64,.12)'; ctx.lineWidth = Math.max(.6, f.thickness * .010);
        ctx.beginPath(); ctx.moveTo(-f.length * .48, -side * f.thickness * .44); ctx.lineTo(f.length * .48, -side * f.thickness * .44); ctx.stroke(); ctx.restore();
      }
      if (pressure > .001) {
        const charge = ctx.createRadialGradient(f.x - f.axisX * f.length * .36, f.y - f.axisY * f.length * .36, 0, f.x, f.y, f.length * .8);
        charge.addColorStop(0, 'rgba(255,225,143,.38)'); charge.addColorStop(.5, 'rgba(255,242,196,.17)'); charge.addColorStop(1, 'rgba(255,243,208,0)');
        ctx.globalAlpha = pressure * alpha; ctx.fillStyle = charge; ctx.fillRect(f.x - span, f.y - span, span * 2, span * 2);
      }
      ctx.restore();
    }
    drawChamberShadow(entry, local, radius, front, angle, orbit) {
      if (this.quality === 'low') return;
      const ctx = this.ctx, x=local.x*CHAMBER_HALF, dx=x-clamp(x,-(CHAMBER_HALF-1),CHAMBER_HALF-1), floorY=Math.sqrt(Math.max(0,1-dx*dx));
      const floor = project({ x: local.x, y: floorY, z: 0 }, front, angle, orbit);
      const distance = clamp(floorY - local.y - this.chamber.radius, 0, 2), size = radius * (1.15 + distance * .35);
      ctx.save(); ctx.translate(floor.x + radius * .18, floor.y); ctx.rotate(front.frame.rotation); ctx.scale(1, .24 + distance * .06);
      const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
      shadow.addColorStop(0, 'rgba(87,68,38,' + (.18 / (1 + distance)) + ')'); shadow.addColorStop(1, 'rgba(87,68,38,0)');
      ctx.fillStyle = shadow; ctx.beginPath(); ctx.arc(0, 0, size, 0, TAU); ctx.fill(); ctx.restore();
    }
    drawCarriage(pose, frame, alpha) {
      if (pose.alpha * alpha <= .001) return; const ctx = this.ctx, radius = pose.radius;
      ctx.save(); ctx.globalAlpha = pose.alpha * alpha * pose.support;
      ctx.save(); ctx.translate(pose.x + radius * .25, pose.y + radius * .92); ctx.scale(1, .19);
      const shadow = ctx.createRadialGradient(0, 0, radius * .05, 0, 0, radius * 1.8);
      shadow.addColorStop(0, 'rgba(97,69,27,.2)'); shadow.addColorStop(1, 'rgba(97,69,27,0)');
      ctx.fillStyle = shadow; ctx.beginPath(); ctx.arc(0, 0, radius * 1.8, 0, TAU); ctx.fill(); ctx.restore();
      const socket = { x: frame.x - frame.axisX * frame.length * .10 - frame.axisY * frame.thickness * .40,
        y: frame.y - frame.axisY * frame.length * .10 + frame.axisX * frame.thickness * .40 };
      const gold = ctx.createLinearGradient(pose.x - radius * .2, pose.y, socket.x, socket.y);
      gold.addColorStop(0, '#8c6a31'); gold.addColorStop(.33, '#e6d093'); gold.addColorStop(.55, '#b99a5e'); gold.addColorStop(1, '#8b6529');
      ctx.lineCap = 'round'; ctx.strokeStyle = '#84612e'; ctx.lineWidth = radius * .15;
      ctx.beginPath(); ctx.moveTo(pose.x, pose.y); ctx.lineTo(socket.x, socket.y); ctx.stroke();
      ctx.strokeStyle = gold; ctx.lineWidth = radius * .115; ctx.stroke(); ctx.restore();
    }
    drawWheel(pose, alpha, rock) {
      const image = this.plates.wheel || this.plates.angle; if (!image || pose.alpha * alpha <= .001) return;
      const ctx = this.ctx, rotation = pose.rotation + (rock || 0);
      ctx.save(); ctx.globalAlpha = pose.alpha * alpha; ctx.translate(pose.x, pose.y);
      ctx.transform(pose.axisX.x * pose.scale, pose.axisX.y * pose.scale, pose.axisY.x * pose.scale, pose.axisY.y * pose.scale, 0, 0);
      if (this.plates.wheel) {
        if (this.quality === 'low') { ctx.rotate(rotation); ctx.drawImage(image, -1 / .85, -1 / .85, 2 / .85, 2 / .85); }
        else {
          const size = this.quality === 'high' ? 512 : 256;
          if (!this.wheelLight || this.wheelLight.width !== size) this.wheelLight = makeCanvas(size, size);
          const light = this.wheelLight.getContext('2d'); light.clearRect(0, 0, size, size);
          light.save(); light.translate(size / 2, size / 2); light.rotate(rotation); light.drawImage(image, -size / 2, -size / 2, size, size); light.restore();
          // Rotate the spokes, then light their actual alpha silhouette from a
          // fixed studio direction; never overlay a second, unrotated set of spokes.
          light.globalCompositeOperation = 'source-atop';
          const g = light.createLinearGradient(size * .125, size * .094, size * .90, size * .90);
          g.addColorStop(0, 'rgba(255,250,221,.24)'); g.addColorStop(.45, 'rgba(255,245,205,.01)'); g.addColorStop(1, 'rgba(66,46,18,.19)');
          light.fillStyle = g; light.fillRect(0, 0, size, size); light.globalCompositeOperation = 'source-over';
          ctx.drawImage(this.wheelLight, -1 / .85, -1 / .85, 2 / .85, 2 / .85);
        }
      } else {
        ctx.rotate(rotation); ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.clip();
        const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
        ctx.drawImage(image, iw * .161, ih * .632, iw * .166, ih * .274, -1, -1, 2, 2);
      }
      ctx.restore();
    }
    drawDischarge(origin, frame, blast, width, height, barrelShift = { x: 0, y: 0 }) {
      if (!blast.fired || blast.after > .5) return;
      const ctx = this.ctx, axisX = frame.axisX, axisY = frame.axisY, radius = clamp(frame.thickness * .56, 12, 58);
      ctx.save(); ctx.translate(origin.x + barrelShift.x, origin.y + barrelShift.y); ctx.rotate(frame.rotation);
      if (blast.flash > .01) {
        ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = blast.flash;
        const flare = ctx.createRadialGradient(radius * .2, 0, radius * .025, radius * .5, 0, radius * 2.7);
        flare.addColorStop(0, '#fffef2'); flare.addColorStop(.13, '#fff4b7'); flare.addColorStop(.36, 'rgba(248,199,96,.78)'); flare.addColorStop(1, 'rgba(235,160,53,0)');
        ctx.save(); ctx.scale(1.8, .72); ctx.fillStyle = flare; ctx.fillRect(-radius * 2.4, -radius * 3, radius * 6.2, radius * 6); ctx.restore();
        // Rounded, uneven lobes read as a short pressure plume rather than a
        // solid triangular beam. The hot core falls off into translucent amber.
        const plume = ctx.createRadialGradient(radius * .12, 0, radius * .03, radius * .42, 0, radius * 2.25);
        plume.addColorStop(0, 'rgba(255,255,240,.96)'); plume.addColorStop(.18, 'rgba(255,244,190,.93)');
        plume.addColorStop(.45, 'rgba(251,199,97,.58)'); plume.addColorStop(.78, 'rgba(230,151,51,.2)'); plume.addColorStop(1, 'rgba(221,143,46,0)');
        const flutter = Math.sin(blast.after * 157) * .065;
        ctx.fillStyle = plume; ctx.beginPath(); ctx.moveTo(-radius * .15, -radius * .32);
        ctx.bezierCurveTo(radius * .3, -radius * .44, radius * .45, -radius * (.75 + flutter), radius * .92, -radius * .43);
        ctx.bezierCurveTo(radius * 1.26, -radius * .76, radius * 1.72, -radius * .48, radius * 1.6, -radius * .24);
        ctx.bezierCurveTo(radius * 2.1, -radius * .3, radius * 2.42, -radius * .11, radius * 2.03, radius * .08);
        ctx.bezierCurveTo(radius * 2.35, radius * .4, radius * 1.66, radius * .58, radius * 1.47, radius * .32);
        ctx.bezierCurveTo(radius * 1.21, radius * (.66 - flutter), radius * .68, radius * .65, radius * .65, radius * .34);
        ctx.bezierCurveTo(radius * .36, radius * .59, -radius * .01, radius * .44, -radius * .15, radius * .32);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      if (blast.shock > 0 && blast.shock < 1) {
        const distance = radius * (1 + blast.shock * 4.3);
        ctx.save(); ctx.globalAlpha = (1 - blast.shock) * .62; ctx.strokeStyle = '#fff8dc'; ctx.lineWidth = 1.5 + (1 - blast.shock) * 5;
        ctx.beginPath(); ctx.ellipse(blast.shock * radius * 3, 0, distance * .38, distance, 0, 0, TAU); ctx.stroke(); ctx.restore();
      }
      ctx.restore();
      if (blast.smoke > .001) {
        const amount = this.quality === 'low' ? 5 : this.quality === 'medium' ? 9 : 15;
        for (let i = 0; i < amount; i++) {
          const d = this.dust[i], age = blast.after, spread = radius * (1 + age * 11);
          const travel = width * age * (.16 + d.x * .13), side = (d.y - .5) * spread * 1.15;
          const x = origin.x + axisX * travel - axisY * side, y = origin.y + axisY * travel + axisX * side - height * age * age * .1;
          const size = radius * (.43 + d.y * .31) * (1 + age * 3);
          const smoke = ctx.createRadialGradient(x, y, 0, x, y, size);
          smoke.addColorStop(0, 'rgba(247,237,216,.36)'); smoke.addColorStop(.34, 'rgba(223,210,186,.31)');
          smoke.addColorStop(.63, 'rgba(157,141,111,.2)'); smoke.addColorStop(.82, 'rgba(188,169,137,.1)'); smoke.addColorStop(1, 'rgba(222,205,176,0)');
          ctx.save(); ctx.globalAlpha = blast.smoke * .9; ctx.fillStyle = smoke; ctx.fillRect(x - size, y - size, size * 2, size * 2); ctx.restore();
        }
      }
      const sparks = this.quality === 'low' ? 17 : this.quality === 'medium' ? 34 : 62;
      for (let i = 0; i < sparks; i++) {
        const d = this.dust[i], age = blast.after, life = .14 + d.y * .25; if (age >= life) continue;
        const direction = frame.rotation + (d.y - .5) * 1.05, speed = width * (.32 + d.x * .48);
        const x = origin.x + Math.cos(direction) * speed * age, y = origin.y + Math.sin(direction) * speed * age + height * age * age * .3;
        ctx.save(); ctx.globalAlpha = (1 - age / life) * .85; ctx.strokeStyle = i % 3 ? '#d2a65a' : '#fff8d4'; ctx.lineWidth = Math.max(.7, d.r * .75); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - Math.cos(direction) * speed * .009, y - Math.sin(direction) * speed * .009); ctx.lineTo(x, y); ctx.stroke(); ctx.restore();
      }
    }
    drawLabel(entry, x, y, radius, alpha) {
      if (!entry.name || alpha <= .01) return; const ctx = this.ctx, text = entry.name.length > 12 ? entry.name.slice(0, 11) + '…' : entry.name;
      const key=text+':'+(P.Pinball?P.Pinball.group(entry.name).color:'');let label = this.labels.get(key);
      if (!label) {
        ctx.font = '500 10px Pretendard Variable,sans-serif'; const w = Math.ceil(ctx.measureText(text).width) + 16, h = 20;
        const sprite = makeCanvas((w + 2) * 2, (h + 2) * 2), c = sprite.getContext('2d'); c.scale(2, 2); c.translate(1, 1);
        c.fillStyle = 'rgba(251,247,239,.9)'; pill(c, 0, 0, w, h, 10); c.fill(); c.strokeStyle = 'rgba(151,118,66,.3)'; c.lineWidth = .75; c.stroke();if(P.Pinball){c.strokeStyle=P.Pinball.group(entry.name).color;c.lineWidth=2;c.beginPath();c.moveTo(w*.3,h-2);c.lineTo(w*.7,h-2);c.stroke();}
        c.fillStyle = '#4a3a28'; c.font = '500 10px Pretendard Variable,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + .5);
        label = { sprite, w: w + 2, h: h + 2 }; this.labels.set(key, label);
      }
      ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(label.sprite, x - label.w / 2, y - radius - label.h - 7, label.w, label.h); ctx.restore();
    }
    drawOrb(entry, pose, gameBlend, marble, total, reduced) {
      const ctx = this.ctx, radius = pose.radius, alpha = pose.alpha === undefined ? 1 : pose.alpha;
      if (radius <= 0 || alpha <= .001 || !this.renderer) return;
      // Material never crossfades during handoff; every stage shares this sprite.
      const size = radius * 5.12;
      ctx.save(); ctx.globalAlpha = alpha;
      const sprite = this.renderer.marbleSprite(P.Pinball ? P.Pinball.group(marble && marble.name || entry.name).color : '#167aaf', size * (this.dpr || 1));
      if (pose.aspect !== undefined && pose.aspect !== 1) {
        ctx.translate(pose.x,pose.y); ctx.rotate(pose.orientation || 0); ctx.scale(pose.aspect,1); ctx.rotate(-(pose.orientation || 0));
        ctx.drawImage(sprite, -size/2, -size/2, size, size);
        if(P.Pinball)P.Pinball.mark(ctx,marble&&marble.name||entry.name,0,0,radius);
      } else {ctx.drawImage(sprite, pose.x-size/2, pose.y-size/2, size, size);if(P.Pinball)P.Pinball.mark(ctx,marble&&marble.name||entry.name,pose.x,pose.y,radius);}
      ctx.restore();
    }
    drawDust(front, angle, orbit, time, alpha, reduced) {
      if (alpha < .01) return; const ctx = this.ctx, count = reduced ? 8 : this.quality === 'low' ? 18 : this.quality === 'medium' ? 42 : 76;
      ctx.save();
      for (let i = 0; i < count; i++) {
        const d = this.dust[i], local = { x: (d.x - .5) * 1.9, y: (d.y - .5) * 2.05, z: 0 }, p = project(local, front, angle, orbit);
        const twinkle = reduced ? .2 : .28 + Math.sin(time * .85 + d.phase) * .17;
        ctx.globalAlpha = alpha * twinkle; ctx.fillStyle = i % 3 ? '#fff9db' : '#d7b875';
        if (i % 7 === 0) sparkle(ctx, p.x, p.y, d.r * 2); else { ctx.beginPath(); ctx.arc(p.x, p.y, d.r, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }
    targetBoard(view, physics, aiming, stage) {
      if (!physics || !this.renderer || aiming <= .38) return;
      const ctx = this.ctx, m = view.initial, bottom = view.bottom;
      const key = physics.map.id + ':' + physics.seed + ':' + this.renderer.theme.id + ':' + Math.ceil(bottom) + ':' + (this.renderer.backgroundRevision || 0);
      if (!this.boardCache || this.boardCache.key !== key) {
        this.boardCache = { key, image: this.renderer.cinemaBoard ? this.renderer.cinemaBoard(physics, bottom) : null };
      }
      ctx.save(); ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      const slide = stage === 'aiming' ? 1 - interval(.38, .93, aiming) : 0;
      ctx.translate(slide * this.width * .7 / m.a, 0);
      // The same map surface stays opaque while the camera travels toward it.
      ctx.save(); ctx.globalAlpha = 1 - interval(.25, .82, view.amount);
      ctx.save(); ctx.translate(580, bottom + 90); ctx.scale(1, .1);
      const shadow = ctx.createRadialGradient(0, 0, 20, 0, 0, 800);
      shadow.addColorStop(0, 'rgba(110,80,37,.23)'); shadow.addColorStop(1, 'rgba(110,80,37,0)');
      ctx.fillStyle = shadow; ctx.fillRect(-800, -800, 1600, 1600); ctx.restore();
      const arch = inset => {
        ctx.beginPath(); ctx.moveTo(-45 + inset, bottom); ctx.lineTo(-45 + inset, 30);
        ctx.bezierCurveTo(-45 + inset, -545 + inset, 1045 - inset, -545 + inset, 1045 - inset, 30);
        ctx.lineTo(1045 - inset, bottom); ctx.closePath();
      };
      ctx.save(); ctx.translate(28, 10); arch(0); ctx.fillStyle = '#bba47a'; ctx.fill(); ctx.restore();
      arch(0); const paper = ctx.createLinearGradient(-40, -420, 1050, bottom);
      paper.addColorStop(0, '#f9f3e3'); paper.addColorStop(.5, '#f3e9d4'); paper.addColorStop(1, '#e9dabe');
      ctx.fillStyle = paper; ctx.fill();
      const gold = ctx.createLinearGradient(-45, -400, 1045, 80);
      gold.addColorStop(0, '#9f7c40'); gold.addColorStop(.24, '#eee0b8'); gold.addColorStop(.55, '#c9ad70'); gold.addColorStop(.8, '#f3e7c8'); gold.addColorStop(1, '#a2844e');
      ctx.strokeStyle = gold; ctx.lineWidth = 13; ctx.stroke(); arch(16); ctx.strokeStyle = 'rgba(166,132,72,.55)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.textAlign = 'center'; ctx.font = '500 47px Pretendard Variable,sans-serif';
      ctx.fillStyle = '#fff8e5'; ctx.fillText('핀볼', 502, -222);
      ctx.fillStyle = '#b19459'; ctx.fillText('핀볼', 500, -224);
      ctx.font = '400 24px Pretendard Variable,sans-serif'; ctx.fillStyle = '#a38855'; ctx.fillText((P.mapInfo ? P.mapInfo(physics.map.id).name : physics.map.name) || '오늘의 놀이판', 500, -135);
      ctx.restore();
      if (this.boardCache.image) ctx.drawImage(this.boardCache.image, 0, 0, 1000, bottom);
      ctx.restore();
    }
    drawSceneBackground(blend = 0) {
      const ctx = this.ctx, w = this.width, h = this.height;
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#faf6eb'); bg.addColorStop(.57, '#f2e9d6'); bg.addColorStop(1, '#e9dec7');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      const amount = clamp(blend, 0, 1);
      if (amount > 0 && this.renderer && this.renderer.background) {
        ctx.save(); ctx.globalAlpha = amount;
        ctx.drawImage(this.renderer.background, 0, 0, w, h); ctx.restore();
      }
    }
    render(state) {
      state = state || {}; this.resize(); const ctx = this.ctx, w = this.width, h = this.height;
      const stage = state.stage || 'intro', p = clamp(Number(state.progress) || 0, 0, 1), time = Number(state.time) || 0, reduced = !!state.reducedMotion;
      const entries = this.entries(state.physics), count = entries.length, marbles = state.physics && state.physics.marbles || [];
      const active = ['mixing', 'aiming', 'flight'].includes(stage);
      const still = stage === 'intro' || stage === 'setup';
      const stillKey = [stage, w, h, this.dpr, this.quality, reduced, Object.keys(this.plates).length, P.Pinball && P.Pinball.revision || 0, state.physics && state.physics.map && state.physics.map.id, this.renderer && this.renderer.backgroundRevision || 0].join('|');
      if (still && this.stillCache && this.stillCache.physics === state.physics && this.stillCache.key === stillKey) {
        this.lastStage = stage; this.lastTime = time;
        return { reveal: 0 };
      }
      if (active) {
        if (this.launchBirth === null) {
          this.launchBirth = this.chamber.ticks / 120;
          // Re-arm the common air supply after the existing blur clears; keep momentum.
          this.chamber.pressureOrigin=this.launchBirth+TIMING.blurClear/TIMING.mixing*TIMING.chamberMix;
        }
        this.chamber.seek(this.launchBirth + (stage === 'mixing' ? p*TIMING.chamberMix : stage === 'aiming' ? TIMING.chamberMix+p*TIMING.chamberAim : TIMING.chamberMix+TIMING.chamberAim),true);
      }
      // The welcome/setup tube is a still arrangement, never an air-driven
      // preview. Only an explicit game transition may move these marbles.
      if(reduced && !this.lastReduced)this.stillTube=entries.map(entry=>this.chamber.pose(entry.index));
      this.lastReduced=reduced;
      const air=pressureAt(this.chamber.ticks/120-this.chamber.pressureOrigin,true);
      if(this.canvas.dataset) {
        this.canvas.dataset.chamberPhase=active ? (air.pressure>.25?'burst':air.charge>0?'charging':'settling') : 'still';
      }
      ctx.clearRect(0, 0, w, h);
      if (stage === 'flight' && p === 1 && state.camera) {
        for (const entry of entries) { const m = marbles[entry.index]; if (!m) continue; const target = state.camera.worldToScreen(m.x, m.y); this.drawOrb(entry, { x: target.x, y: target.y, radius: m.r * state.camera.zoom, focus: 1 }, 1, m, count, reduced); }
        this.lastStage = stage; this.lastTime = time; return { reveal: 1 };
      }
      const aiming = stage === 'aiming' ? reduced ? p < .5 ? 0 : 1 : p : stage === 'flight' ? 1 : 0, orbit = smooth(aiming);
      const flight = stage === 'flight' ? p : 0;
      const views = matchedViews(w, h, aiming, 0), front = views.front, angle = views.angle, resting = matchedViews(w, h, 1, 0);
      const travel = boardView(w, h, state.camera, flight, reduced);
      const dissolve = interval(.27, .82, aiming), reveal = stage === 'flight' ? interval(.72, 1, p) : 0;
      const frontWeight = reduced && stage === 'aiming' ? 1 - interval(0, .46, p) : 1 - dissolve;
      const angleWeight = reduced && stage === 'aiming' ? interval(.54, 1, p) : dissolve;
      const reducedFade = reduced && stage === 'aiming' ? frontWeight + angleWeight : 1;
      const blast = blastPose(flight, reduced), wheel = assemblyPose(aiming, angle, resting.angle, reduced);
      const barrelShift = stage === 'flight' ? barrelOffset(p, views.frame, w, reduced) : { x: 0, y: 0 };
      const movingFrame = Object.assign({}, views.frame, { x: views.frame.x + barrelShift.x, y: views.frame.y + barrelShift.y });
      this.drawSceneBackground(stage === 'intro' ? 0 : stage === 'setup' ? .35 : 1);
      ctx.save();
      if (stage === 'flight') {
        if (blast.shake > .001) { const strength = Math.min(8, w * .005) * blast.shake; ctx.translate(Math.sin(blast.after * 183) * strength, Math.cos(blast.after * 141) * strength * .68); }
        const c = travel.scene; ctx.transform(c.a, c.b, c.c, c.d, c.e, c.f);
      }
      this.drawStudioShadow(movingFrame, wheel, aiming);
      this.drawCarriage(wheel, movingFrame, 1);
      ctx.save();
      ctx.translate(barrelShift.x, barrelShift.y);
      if (this.plates.bridge && !reduced) {
        // All three plates share the same glass axis; show an actual intermediate view.
        if (dissolve < .5) {
          this.drawPlate('front', front, 1);
          this.drawPlate('bridge', views.bridge, smooth(dissolve * 2));
        } else {
          this.drawPlate('bridge', views.bridge, 1);
          this.drawPlate('angle', angle, smooth((dissolve - .5) * 2));
        }
      } else {
        this.drawPlate('front', front, reduced ? frontWeight : 1, reduced ? null : dissolve);
        this.drawPlate('angle', angle, reduced ? angleWeight : 1, reduced ? null : dissolve);
      }
      ctx.restore();
      this.targetBoard(travel, state.physics, aiming, stage);
      if (stage === 'flight' && !this.frozenTube) this.frozenTube = entries.map(entry => this.chamber.pose(entry.index));
      const baseRadius = views.frame.thickness * .54 * this.chamber.radius;
      // Project the same contact plane during the existing camera orbit.
      const aspect=views.frame.length*.45/CHAMBER_HALF/(views.frame.thickness*.54),orientation=Math.atan2(views.frame.axisY,views.frame.axisX);
      const drawn = entries.map(entry => {
        const local = reduced ? this.stillTube[entry.index] : stage === 'flight' ? this.frozenTube[entry.index] : (active ? this.chamber : this.previewChamber).pose(entry.index);
        const screen = project(local, front, angle, orbit), radius = baseRadius;
        if (stage !== 'flight') return { entry, local, pose: { x: screen.x, y: screen.y, radius, aspect, orientation, depth: local.z, focus: local.z < -.35 ? .45 : 1, alpha: reducedFade }, blend: 0 };
        const start = project(local, resting.front, resting.angle, 1), muzzle = pointInPlate(resting.angle, .359, .511), m = marbles[entry.index];
        const target = m ? mapPoint(travel.initial, m.x, m.y) : { x: w * .82, y: h * .28 };
        const endRadius = m ? m.r * travel.initial.a : radius * .4;
        const parameters = { width: w, height: h, axisX: resting.frame.axisX, axisY: resting.frame.axisY, muzzleRadius: resting.frame.thickness * .43, arrival: .74 };
        const startRadius = resting.frame.thickness * .54 * this.chamber.radius;
        const at = progress => {
          const pose = flightPose(entry, progress, start, muzzle, target, startRadius, endRadius, parameters);
          const offset = flightOffset(entry, progress, resting.frame, w, reduced); pose.x += offset.x; pose.y += offset.y;
          pose.aspect=lerp(aspect,1,smooth(pose.amount)); pose.orientation=orientation*(1-smooth(pose.amount)); return pose;
        };
        const pose = at(p);
        if (reduced) { const beginning = p < .65; pose.x = beginning ? start.x : target.x; pose.y = beginning ? start.y : target.y; pose.radius = beginning ? startRadius : endRadius; pose.alpha = beginning ? 1 - interval(.15, .55, p) : interval(.65, .8, p); }
        return { entry, pose, at, blend: interval(.56, .74, p) };
      });
      drawn.sort((a, b) => a.pose.depth - b.pose.depth);
      if (stage !== 'flight') { ctx.save(); this.glassPath(front, angle, orbit); ctx.clip();
        for (const item of drawn) if (count <= 50 || item.local.y > .25 && item.entry.index % Math.ceil(count / 48) === 0) this.drawChamberShadow(item.entry, item.local, item.pose.radius, front, angle, orbit);
      }
      for (const item of drawn) {
        const { entry, pose } = item, m = marbles[entry.index];
        if (stage === 'flight' && !reduced && p > FIRE_MOMENT + entry.delay && p < .76 && (count <= 24 || entry.index % Math.ceil(count / 24) === 0)) {
          ctx.save(); ctx.globalAlpha = (1 - interval(.55, .76, p)) * .7; ctx.strokeStyle = '#e5c47e'; ctx.lineWidth = Math.max(.8, pose.radius * .12); ctx.lineCap = 'round';
          ctx.beginPath(); const from = Math.max(FIRE_MOMENT + entry.delay, p - .23);
          for (let i = 0; i <= 22; i++) { const old = item.at(lerp(from, p, i / 22)); if (!i) ctx.moveTo(old.x, old.y); else ctx.lineTo(old.x, old.y); } ctx.stroke();
          if (this.quality === 'high') { ctx.globalAlpha *= .25; ctx.lineWidth *= 3; ctx.stroke(); }
          for (let i = 0; i < 8; i++) { const dust = this.dust[(entry.index * 7 + i) % this.dust.length], old = item.at(lerp(from, p, i / 8)); ctx.globalAlpha = Math.sin(i / 8 * Math.PI) * .8; ctx.fillStyle = i % 3 ? '#d5b36c' : '#fff9df'; sparkle(ctx, old.x + Math.sin(dust.phase + time * 3) * 5, old.y + Math.cos(dust.phase) * 5, dust.r * 1.4); }
          ctx.restore();
        }
        if (stage === 'flight' && pose.contained) { ctx.save(); ctx.translate(barrelShift.x, barrelShift.y); this.glassPath(front, angle, orbit, true); ctx.clip(); ctx.translate(-barrelShift.x, -barrelShift.y); }
        if (stage === 'flight' && !reduced && !pose.contained && p < FIRE_MOMENT + .14 && this.quality !== 'low' && (count <= 24 || entry.index % Math.ceil(count / 24) === 0)) {
          const old = item.at(Math.max(FIRE_MOMENT + entry.delay, p - .012));
          ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = pose.radius * 1.25;
          const streak = ctx.createLinearGradient(old.x, old.y, pose.x, pose.y);
          streak.addColorStop(0, 'rgba(248,224,157,0)'); streak.addColorStop(1, 'rgba(255,246,212,.55)'); ctx.strokeStyle = streak;
          ctx.beginPath(); ctx.moveTo(old.x, old.y); ctx.lineTo(pose.x, pose.y); ctx.stroke(); ctx.restore();
        }
        this.drawOrb(entry, pose, item.blend, m, count, reduced);
        if (stage === 'flight' && pose.contained) ctx.restore();
        if (count <= 16 && ['aiming', 'setup'].includes(stage)) this.drawLabel(entry, pose.x, pose.y, pose.radius, .68);
      }
      if (stage !== 'flight') ctx.restore();
      if (stage !== 'flight' || p < FIRE_MOMENT + .025) {
        ctx.save(); ctx.translate(barrelShift.x, barrelShift.y);
        const pressure = reduced ? 0 : stage === 'mixing' ? air.pressure*.28+air.charge*.08 : stage === 'aiming' ? interval(.82, 1, p) * .45 : stage === 'flight' ? blast.fired ? blast.flash : .45 + blast.compression * .55 : 0;
        this.drawGlass(front, angle, orbit, reduced ? 0 : time, reducedFade, pressure); ctx.restore();
      }
      this.drawWheel(wheel, 1, stage === 'flight' ? blast.recoil * .018 : 0);
      this.drawDust(front, angle, orbit, reduced ? 0 : time, reducedFade, reduced);
      if (stage === 'flight' && !reduced) this.drawDischarge(pointInPlate(resting.angle, .359, .511), resting.frame, blast, w, h, barrelShift);
      ctx.restore();
      if (stage === 'flight' && this.renderer && this.renderer.vignette) ctx.drawImage(this.renderer.vignette, 0, 0, w, h);
      if (stage === 'flight' && this.quality === 'high' && this.renderer && this.renderer.noise) { ctx.save(); ctx.globalAlpha = .26; ctx.fillStyle = ctx.createPattern(this.renderer.noise, 'repeat'); ctx.fillRect(0, 0, w, h); ctx.restore(); }
      this.stillCache = still ? { physics: state.physics, key: stillKey } : null;
      this.lastStage = stage; this.lastTime = time;
      return { reveal, fired: stage === 'flight' && blast.fired, cameraAmount: travel.amount };
    }
  }
  P.CINEMA = { smooth, interval, easeCamera, timing: TIMING, descriptors, tubePose, layout, matchedViews, pointInPlate, project, flightPose, dischargeOrigin, assemblyPose, blastPose, barrelOffset, flightOffset, Chamber, chamberHalfLength: CHAMBER_HALF, pressureAt, boardView, mapPoint, fireMoment: FIRE_MOMENT };
  P.Cinematic = Cinematic;
})(window.CosmicPinball = window.CosmicPinball || {});
