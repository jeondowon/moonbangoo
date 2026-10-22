(function (global) {
  'use strict';
  var P = global.CosmicPinball = global.CosmicPinball || {};
  var STEP = 1 / 120;
  var clamp = function (value, low, high) { return Math.max(low, Math.min(high, value)); };

  P.MAX_MARBLES = 50;
  P.PHYSICS_STEP = STEP;
  P.PHYSICS_TUNING = { gravity: 620, fallSoftThreshold: 540, fallDrag: 5, fallMax: 700, velocityMax: 1050, rescueDelay: 3, rescueProgress: 24 };
  // Renderer and simulation share the same deterministic pulse clock.
  P.windPulse = function (field, time) {
    var cycle = Math.floor((time + (field.phase || 0)) / field.period);
    var elapsed = time + (field.phase || 0) - cycle * field.period;
    return { cycle: cycle, active: elapsed < field.duration - 1e-9, progress: elapsed / field.duration };
  };
  P.seedRandom = function (seed) {
    var hash = 2166136261;
    var input = String(seed);
    for (var i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return function () {
      hash += 0x6D2B79F5;
      var value = Math.imul(hash ^ (hash >>> 15), 1 | hash);
      value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  };

  P.COLOR_GROUPS = [
    { id: 'red', name: '빨강', color: '#c8786d' },
    { id: 'green', name: '초록', color: '#8aa478' },
    { id: 'blue', name: '파랑', color: '#7e96b6' },
    { id: 'yellow', name: '노랑', color: '#d7ba72' },
    { id: 'cyan', name: '청록', color: '#80b1ac' },
    { id: 'magenta', name: '자홍', color: '#b58ba9' },
    { id: 'white', name: '흰색', color: '#eee5d5' },
    { id: 'black', name: '검정', color: '#666158' }
  ];
  P.colorSelection = function (text) {
    var counts = {}, legacy = new Map();
    if (text === '') return counts;
    try { P.parseNames(text).forEach(function (entry) { legacy.set(entry.name, (legacy.get(entry.name) || 0) + 1); }); }
    catch (_) { legacy = new Map([['빨강', 2], ['초록', 2], ['파랑', 2]]); }
    var index = 0;
    legacy.forEach(function (count, name) {
      var group = P.COLOR_GROUPS.find(function (item) { return item.name === name; });
      if (!group) group = P.COLOR_GROUPS[index++ % P.COLOR_GROUPS.length];
      counts[group.id] = (counts[group.id] || 0) + count;
    });
    return counts;
  };
  P.colorNames = function (counts) {
    var total = 0;
    P.COLOR_GROUPS.forEach(function (group) {
      var count = counts[group.id] || 0;
      if (!Number.isInteger(count) || count < 0) throw new Error('수량은 0 이상의 정수여야 합니다.');
      total += count;
    });
    if (total > P.MAX_MARBLES) throw new Error('핀볼은 최대 50개까지 만들 수 있어요.');
    return P.COLOR_GROUPS.filter(function (group) { return counts[group.id] > 0; })
      .map(function (group) { return group.name + '*' + counts[group.id]; }).join(',');
  };

  // Versioned JSON avoids treating punctuation in directly typed names as syntax.
  P.readGroups = function (text) {
    if (String(text).startsWith('{"groupVersion":')) {
      var data = JSON.parse(text);
      if (data.groupVersion !== 1 || !Array.isArray(data.groups) || data.groups.length > P.MAX_MARBLES) throw new Error('그룹 설정 형식이 올바르지 않아요.');
      var ids = new Set(), names = new Set(), total = 0;
      return data.groups.map(function (group) {
        if (!group || typeof group.id !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(group.id) || ids.has(group.id)) throw new Error('그룹 식별자가 올바르지 않아요.');
        var name = typeof group.name === 'string' ? group.name.trim().normalize('NFC') : '';
        if (!name || name.length > 40 || /[\u0000-\u001f\u007f<>]/.test(name)) throw new Error('그룹 이름은 빈칸 없이 1~40자로 입력하고, 제어 문자와 꺾쇠 괄호는 빼 주세요.');
        if (names.has(name)) throw new Error('“' + name + '” 그룹 이름이 중복돼요.');
        if (!P.COLOR_GROUPS.some(function (item) { return item.id === group.color; })) throw new Error('그룹 색상이 올바르지 않아요.');
        total += group.count;
        if (!Number.isInteger(group.count) || group.count < 1 || total > P.MAX_MARBLES) throw new Error('핀볼은 총 1~50개로 설정해 주세요.');
        ids.add(group.id); names.add(name);
        return { id: group.id, name: name, color: group.color, count: group.count };
      });
    }
    var groups = [], seen = new Map();
    if (text === '') return groups;
    P.parseNames(text).forEach(function (entry) {
      if (seen.has(entry.name)) { seen.get(entry.name).count++; return; }
      var fixed = P.COLOR_GROUPS.find(function (item) { return item.name === entry.name; });
      var group = { id: fixed ? fixed.id : 'custom-' + groups.length, name: entry.name, color: fixed ? fixed.id : P.COLOR_GROUPS[groups.length % P.COLOR_GROUPS.length].id, count: 1 };
      seen.set(entry.name, group); groups.push(group);
    });
    return groups;
  };
  P.writeGroups = function (groups) {
    return JSON.stringify({ groupVersion: 1, groups: groups });
  };

  P.parseNames = function (text) {
    if (String(text).startsWith('{"groupVersion":')) {
      var entries = [];
      P.readGroups(text).forEach(function (group) {
        for (var copy = 1; copy <= group.count; copy++) entries.push({ id: 'marble-' + (entries.length + 1), name: group.name, copy: copy, copies: group.count, groupId: group.id, groupColor: group.color });
      });
      if (!entries.length) throw new Error('그룹을 하나 이상 추가해 주세요.');
      return entries;
    }
    var input = String(text == null ? '' : text).replace(/\r\n?/g, '\n').trim();
    if (!input) throw new Error('참가자 이름을 한 명 이상 입력해 주세요.');
    var tokens = input.split(/[,\n]/);
    var seen = new Set();
    var names = [];
    tokens.forEach(function (token) {
      var value = token.trim();
      if (!value) throw new Error('빈 이름이 있어요. 연속된 쉼표나 빈 줄을 확인해 주세요.');
      var name = value;
      var count = 1;
      var star = value.lastIndexOf('*');
      if (star >= 0) {
        name = value.slice(0, star).trim();
        var copies = value.slice(star + 1).trim();
        if (!/^[1-9]\d*$/.test(copies) || name.indexOf('*') >= 0) {
          throw new Error('핀볼 개수는 이름*2처럼 1 이상의 정수로 입력해 주세요.');
        }
        count = Number(copies);
      }
      if (!name) throw new Error('핀볼 개수 앞에 참가자 이름을 입력해 주세요.');
      if (name.length > 40) throw new Error('참가자 이름은 40자 이내로 입력해 주세요.');
      if (/[\u0000-\u001f\u007f<>]/.test(name)) throw new Error('이름에는 제어 문자나 꺾쇠 괄호를 사용할 수 없어요.');
      if (seen.has(name)) throw new Error('“' + name + '” 이름이 중복돼요. 같은 이름은 ' + name + '*2처럼 입력해 주세요.');
      seen.add(name);
      if (!Number.isSafeInteger(count) || names.length + count > P.MAX_MARBLES) throw new Error('핀볼은 최대 50개까지 만들 수 있어요.');
      for (var copy = 1; copy <= count; copy++) {
        names.push({ id: 'marble-' + (names.length + 1), name: name, copy: copy, copies: count });
      }
    });
    return names;
  };

  function Physics(options) {
    options = options || {};
    if (!options.names || !options.names.length || options.names.length > P.MAX_MARBLES) throw new Error('참가자는 1~50개의 핀볼로 설정해 주세요.');
    this.map = options.map || P.MAPS.classic;
    this.bounds = P.boardBounds(this.map);
    this.seed = String(options.seed == null ? 'cosmic' : options.seed);
    this.random = P.seedRandom(this.seed);
    this.radius = clamp(Number(options.radius) || 12, 7, 18);
    this.gravity = clamp(Number(options.gravity) || P.PHYSICS_TUNING.gravity, 300, 1800);
    this.restitution = clamp(Number(options.restitution) || 0.72, 0.3, 0.95);
    this.mapPolicy = P.mapInfo ? P.mapInfo(this.map.id) : { skills: true, recovery: true };
    this.skills = this.mapPolicy.skills && !!options.skills;
    this.time = 0;
    this.ticks = 0;
    this.finished = [];
    this.events = [];
    this.complete = false;
    this.marbles = [];
    var spawn = this.map.spawn;
    // Build the full-width launch grid, then choose occupied slots and permute
    // their owners with the seed. A small group must not always start centrally.
    var spawnRandom = P.seedRandom(this.seed + '|launch');
    var spacing = this.radius * 2 + 1.5;
    var jitter = 0.75;
    var columns = Math.floor((spawn.width - this.radius * 2 - spacing / 2 - jitter * 2) / spacing) + 1;
    var rows = Math.ceil(options.names.length / columns);
    var slots = [];
    var positions = [];
    for (var index = 0; index < columns * rows; index++) {
      var column = index % columns;
      var row = Math.floor(index / columns);
      slots.push({
        x: spawn.x + spawn.width / 2 + (column - (columns - 1) / 2) * spacing + (row % 2 ? 1 : -1) * spacing / 4,
        y: spawn.y + this.radius + row * spacing * Math.sqrt(3) / 2
      });
    }
    if (options.names.length === 1) {
      positions.push(slots[Math.floor(spawnRandom() * columns)]);
    } else if (options.names.length <= Math.floor(columns / 2)) {
      // Separate horizontal strata include the outer lanes, even with two names.
      var laneGap = (columns - 1) / (options.names.length - 1);
      for (var lane = 0; lane < options.names.length; lane++) {
        var anchor = lane * laneGap;
        var first = Math.max(0, Math.ceil(anchor - laneGap * 0.24));
        var last = Math.min(columns - 1, Math.floor(anchor + laneGap * 0.24));
        if (first > last) first = last = Math.round(anchor);
        positions.push(slots[first + Math.floor(spawnRandom() * (last - first + 1))]);
      }
    } else {
      // Dense groups sample without replacement from all rows of the same grid.
      for (var slotIndex = slots.length - 1; slotIndex > 0; slotIndex--) {
        var picked = Math.floor(spawnRandom() * (slotIndex + 1));
        var slot = slots[slotIndex]; slots[slotIndex] = slots[picked]; slots[picked] = slot;
      }
      positions = slots.slice(0, options.names.length);
    }
    for (var shuffle = positions.length - 1; shuffle > 0; shuffle--) {
      var other = Math.floor(spawnRandom() * (shuffle + 1));
      var temp = positions[shuffle]; positions[shuffle] = positions[other]; positions[other] = temp;
    }
    var rowInset = spacing / 4;
    var gridHalfWidth = (columns - 1) * spacing / 2 + rowInset;
    var xSlack = spawn.width / 2 - gridHalfWidth - this.radius - jitter;
    var offsetX = (spawnRandom() * 2 - 1) * Math.max(0, xSlack);
    var ySlack = spawn.height - this.radius * 2 - (rows - 1) * spacing * Math.sqrt(3) / 2;
    var offsetY = spawnRandom() * Math.max(0, ySlack);
    for (var n = 0; n < options.names.length; n++) {
      var entry = options.names[n];
      var position = positions[n];
      this.marbles.push({
        id: entry.id, name: entry.name, groupId: entry.groupId, groupColor: entry.groupColor, copy: entry.copy || 1, copies: entry.copies || 1,
        x: position.x + offsetX + (spawnRandom() * 2 - 1) * jitter, y: position.y + offsetY,
        vx: (this.random() - 0.5) * 60, vy: 0, r: this.radius, baseRadius: this.radius,
        angle: this.random() * Math.PI * 2, finished: false, finishTime: null,
        colorIndex: n, trail: [], skill: null,
        _anchorY: position.y + offsetY, _stuckAt: 0, _rescues: 0,
        _rescueDirection: P.seedRandom(this.seed + '|rescue|' + entry.id)() < 0.5 ? -1 : 1, _nextSkill: 4 + this.random() * 8,
        _contacts: Object.create(null), _portalAt: -2, _boostAt: -2
      });
    }
    this._staticGrid = new Map();
    this._dynamic = [];
    this._dynamicPoses = [];
    this._dynamicGrid = new Map();
    this._fields = [];
    this._boostShapes = new Map();
    this._indexObstacles();
  }

  Physics.prototype._event = function (type, marble, obstacle, intensity, extra) {
    if (this.events.length > 300) return;
    var event = { type: type, x: marble.x, y: marble.y, marble: marble, id: marble.id, obstacle: obstacle || null, intensity: intensity || 1 };
    if (extra) Object.assign(event, extra);
    this.events.push(event);
  };

  Physics.prototype._indexObstacles = function () {
    var self = this;
    (this.map.obstacles || []).forEach(function (obstacle, index) {
      if (!obstacle.id) obstacle.id = 'obstacle-' + index;
      if (obstacle.type === 'rotor' || obstacle.type === 'moving') { self._dynamic.push(obstacle); return; }
      if (obstacle.type === 'boost' || obstacle.type === 'portal' || obstacle.type === 'wind') {
        self._fields.push(obstacle);
        if (obstacle.type === 'boost') {
          var shape = P.boostShape(obstacle);
          shape.cos = Math.cos(shape.angle); shape.sin = Math.sin(shape.angle);
          self._boostShapes.set(obstacle, shape);
        }
        return;
      }
      var bounds = self._bounds(obstacle);
      for (var gx = Math.floor(bounds.minX / 96); gx <= Math.floor(bounds.maxX / 96); gx++) {
        for (var gy = Math.floor(bounds.minY / 96); gy <= Math.floor(bounds.maxY / 96); gy++) {
          var key = gx + ':' + gy;
          if (!self._staticGrid.has(key)) self._staticGrid.set(key, []);
          self._staticGrid.get(key).push(obstacle);
        }
      }
    });
  };

  Physics.prototype._bounds = function (obstacle) {
    if (obstacle.type === 'polygon') {
      var xs = obstacle.points.map(function (p) { return p.x; });
      var ys = obstacle.points.map(function (p) { return p.y; });
      return { minX: Math.min.apply(null, xs) - 24, minY: Math.min.apply(null, ys) - 24, maxX: Math.max.apply(null, xs) + 24, maxY: Math.max.apply(null, ys) + 24 };
    }
    if (obstacle.type === 'segment') {
      var padding = (obstacle.thickness || 6) + 24;
      return { minX: Math.min(obstacle.x1, obstacle.x2) - padding, minY: Math.min(obstacle.y1, obstacle.y2) - padding, maxX: Math.max(obstacle.x1, obstacle.x2) + padding, maxY: Math.max(obstacle.y1, obstacle.y2) + padding };
    }
    var radius = (obstacle.r || 8) + 24;
    return { minX: obstacle.x - radius, minY: obstacle.y - radius, maxX: obstacle.x + radius, maxY: obstacle.y + radius };
  };

  Physics.prototype.getObstaclePose = function (obstacle) {
    if (obstacle.type === 'segment') return obstacle;
    if (obstacle.type !== 'rotor' && obstacle.type !== 'moving') return obstacle;
    var x = obstacle.x, y = obstacle.y;
    var angle = obstacle.angle || 0;
    var speed = obstacle.speed || 1;
    var vx = 0, vy = 0;
    if (obstacle.type === 'rotor') angle += this.time * speed;
    else {
      var phase = this.time * speed + (obstacle.phase || 0);
      var offset = Math.sin(phase) * (obstacle.amplitude || 90);
      var velocity = Math.cos(phase) * (obstacle.amplitude || 90) * speed;
      if (obstacle.axis === 'y') { y += offset; vy = velocity; }
      else { x += offset; vx = velocity; }
    }
    var dx = Math.cos(angle) * obstacle.length / 2;
    var dy = Math.sin(angle) * obstacle.length / 2;
    return { x: x, y: y, angle: angle, x1: x - dx, y1: y - dy, x2: x + dx, y2: y + dy, thickness: obstacle.thickness || 7, vx: vx, vy: vy };
  };

  Physics.prototype._respond = function (marble, nx, ny, obstacle, surfaceVx, surfaceVy) {
    var rvx = marble.vx - (surfaceVx || 0);
    var rvy = marble.vy - (surfaceVy || 0);
    var normalVelocity = rvx * nx + rvy * ny;
    if (normalVelocity >= 0) return;
    var bounce = obstacle && obstacle.type === 'bumper' ? 1.08 : this.restitution;
    var impulse = -(1 + bounce) * normalVelocity;
    if (obstacle && obstacle.type === 'bumper') impulse += obstacle.power || 90;
    marble.vx += impulse * nx;
    marble.vy += impulse * ny;
    if (obstacle && -normalVelocity > 40 && this.time - (marble._contacts[obstacle.id] || -1) > 0.085) {
      marble._contacts[obstacle.id] = this.time;
      this._event(obstacle.type === 'bumper' ? 'bumper' : 'hit', marble, obstacle, clamp(-normalVelocity / 450, 0.15, 1.8));
    }
  };

  // A contact describes a constraint at the current position. Do not move the ball
  // while gathering contacts: a sweeping bar may share a contact with a static pin.
  Physics.prototype._contact = function (marble, obstacle, pose, margin) {
    margin = margin || 0;
    var x, y, distance, nx, ny, depth, surfaceVx = 0, surfaceVy = 0;
    if (obstacle.type === 'pin' || obstacle.type === 'bumper' || obstacle.type === 'circle') {
      x = marble.x - obstacle.x; y = marble.y - obstacle.y;
      var radius = marble.r + obstacle.r;
      if (x * x + y * y >= (radius + margin) * (radius + margin)) return null;
      distance = Math.hypot(x, y);
      if (distance > 0.000001) { nx = x / distance; ny = y / distance; }
      else { nx = 0; ny = -1; }
      depth = radius - distance;
    } else if (obstacle.type === 'polygon') {
      var points = obstacle.points, inside = false, nearest = null, area = 0;
      for (var i = 0, j = points.length - 1; i < points.length; j = i++) {
        var a = points[j], b = points[i], ex = b.x - a.x, ey = b.y - a.y;
        area += a.x * b.y - b.x * a.y;
        if ((a.y > marble.y) !== (b.y > marble.y) && marble.x < ex * (marble.y - a.y) / ey + a.x) inside = !inside;
        var t = clamp(((marble.x - a.x) * ex + (marble.y - a.y) * ey) / (ex * ex + ey * ey || 1), 0, 1);
        var px = a.x + ex * t, py = a.y + ey * t, d2 = (marble.x - px) ** 2 + (marble.y - py) ** 2;
        if (!nearest || d2 < nearest.d2) nearest = { x: px, y: py, d2: d2, ex: ex, ey: ey };
      }
      distance = Math.sqrt(nearest.d2);
      if (!inside && distance >= marble.r + 1 + margin) return null;
      if (distance > 0.000001) {
        var side = inside ? -1 : 1;
        nx = (marble.x - nearest.x) / distance * side; ny = (marble.y - nearest.y) / distance * side;
      } else {
        var length = Math.hypot(nearest.ex, nearest.ey) || 1, winding = area >= 0 ? 1 : -1;
        nx = nearest.ey / length * winding; ny = -nearest.ex / length * winding;
      }
      depth = marble.r + 1 + (inside ? distance : -distance);
    } else {
      var sx = pose.x2 - pose.x1, sy = pose.y2 - pose.y1;
      var along = clamp(((marble.x - pose.x1) * sx + (marble.y - pose.y1) * sy) / (sx * sx + sy * sy || 1), 0, 1);
      var closestX = pose.x1 + sx * along, closestY = pose.y1 + sy * along;
      x = marble.x - closestX; y = marble.y - closestY;
      var reach = marble.r + (pose.thickness == null ? 6 : pose.thickness);
      if (x * x + y * y >= (reach + margin) * (reach + margin)) return null;
      distance = Math.hypot(x, y);
      if (distance > 0.000001) { nx = x / distance; ny = y / distance; }
      else {
        var normalLength = Math.hypot(sx, sy) || 1;
        nx = sy / normalLength; ny = -sx / normalLength;
        if ((marble._previousX - closestX) * nx + (marble._previousY - closestY) * ny < 0) { nx = -nx; ny = -ny; }
      }
      depth = reach - distance; surfaceVx = pose.vx || 0; surfaceVy = pose.vy || 0;
      if (obstacle.type === 'rotor') {
        surfaceVx = -(closestY - obstacle.y) * obstacle.speed;
        surfaceVy = (closestX - obstacle.x) * obstacle.speed;
      }
    }
    return { nx: nx, ny: ny, depth: depth, obstacle: obstacle, vx: surfaceVx, vy: surfaceVy };
  };

  Physics.prototype._wallContacts = function (marble, contacts, margin) {
    margin = margin || 0;
    var b = this.bounds, r = marble.r;
    var inset = Math.max(r + margin, b.radius);
    if (marble.x >= b.left + inset && marble.x <= b.right - inset && marble.y >= b.top + inset && marble.y <= b.bottom - inset) return;
    function add(nx, ny, depth) { if (depth > -margin) contacts.push({ nx: nx, ny: ny, depth: depth, obstacle: null, vx: 0, vy: 0 }); }
    add(1, 0, b.left + r - marble.x); add(-1, 0, marble.x + r - b.right);
    add(0, 1, b.top + r - marble.y); add(0, -1, marble.y + r - b.bottom);
    var cx = marble.x < b.left + b.radius ? b.left + b.radius : marble.x > b.right - b.radius ? b.right - b.radius : null;
    var cy = marble.y < b.top + b.radius ? b.top + b.radius : marble.y > b.bottom - b.radius ? b.bottom - b.radius : null;
    if (cx !== null && cy !== null && r < b.radius) {
      var dx = cx - marble.x, dy = cy - marble.y, d = Math.hypot(dx, dy);
      if (d > 0) add(dx / d, dy / d, d + r - b.radius);
    }
  };

  Physics.prototype._contactsAt = function (marble, margin) {
    margin = margin || 0;
    var contacts = [], seen = margin ? new Set() : null;
    for (var gx = Math.floor((marble.x - margin) / 96); gx <= Math.floor((marble.x + margin) / 96); gx++) {
      for (var gy = Math.floor((marble.y - margin) / 96); gy <= Math.floor((marble.y + margin) / 96); gy++) {
        var key = gx + ':' + gy, candidates = this._staticGrid.get(key) || [];
        for (var i = 0; i < candidates.length; i++) {
          var obstacle = candidates[i];
          if (seen) { if (seen.has(obstacle)) continue; seen.add(obstacle); }
          var contact = this._contact(marble, obstacle, obstacle, margin);
          if (contact) contacts.push(contact);
        }
        var dynamic = this._dynamicGrid.get(key) || [];
        for (var j = 0; j < dynamic.length; j++) {
          var entry = dynamic[j];
          if (seen) { if (seen.has(entry.obstacle)) continue; seen.add(entry.obstacle); }
          var moving = this._contact(marble, entry.obstacle, entry.pose, margin);
          if (moving) contacts.push(moving);
        }
      }
    }
    this._wallContacts(marble, contacts, margin);
    return contacts;
  };

  // Minimum translation satisfying all current contact planes. In 2D the optimum
  // lies on one plane or at the intersection of two; no global iteration increase.
  function contactCorrection(contacts) {
    var best = null, bestLength = Infinity, slop = 0.015;
    function consider(x, y) {
      var length = x * x + y * y;
      if (length >= bestLength) return;
      for (var k = 0; k < contacts.length; k++) {
        var c = contacts[k];
        if (c.nx * x + c.ny * y < c.depth + slop - 0.000001) return;
      }
      best = { x: x, y: y }; bestLength = length;
    }
    for (var i = 0; i < contacts.length; i++) {
      var a = contacts[i], da = a.depth + slop;
      consider(a.nx * da, a.ny * da);
      for (var j = 0; j < i; j++) {
        var b = contacts[j], db = b.depth + slop, det = a.nx * b.ny - a.ny * b.nx;
        if (Math.abs(det) > 0.000001) consider((da * b.ny - a.ny * db) / det, (a.nx * db - da * b.nx) / det);
      }
    }
    return best;
  }

  Physics.prototype._obstacles = function (marble) {
    // Re-query only this ball after a correction, including a changed grid cell.
    // Curved surfaces need a new normal; most contacts finish on the first pass.
    for (var attempt = 0; attempt < 6; attempt++) {
      var contacts = this._contactsAt(marble);
      if (!contacts.length) return;
      // Nearby surfaces contribute signed separation constraints too, so pushing
      // out of a pin cannot immediately move back into the neighbouring bar.
      contacts = this._contactsAt(marble, marble.r * 2 + 0.015);
      var correction = contactCorrection(contacts);
      if (!correction) {
        // Exactly opposed planes between a curved pin and bar have no linear
        // solution. A bounded tangent move exposes the curved escape direction.
        var c = contacts.reduce(function (a, b) { return a.depth > b.depth ? a : b; }), direction = marble._rescueDirection;
        correction = { x: -c.ny * marble.r * direction, y: c.nx * marble.r * direction };
      }
      var length = Math.hypot(correction.x, correction.y), limit = marble.r * 2;
      var scale = length > limit ? limit / length : 1;
      marble.x += correction.x * scale; marble.y += correction.y * scale;
      for (var n = 0; n < contacts.length; n++) {
        var contact = contacts[n];
        if (contact.depth > 0) this._respond(marble, contact.nx, contact.ny, contact.obstacle, contact.vx, contact.vy);
      }
    }
  };

  Physics.prototype._walls = function (marble) {
    var contacts = [];
    this._wallContacts(marble, contacts);
    if (!contacts.length) return;
    var correction = contactCorrection(contacts);
    if (!correction) return;
    marble.x += correction.x; marble.y += correction.y;
    for (var i = 0; i < contacts.length; i++) this._respond(marble, contacts[i].nx, contacts[i].ny, null, 0, 0);
  };

  Physics.prototype._pairs = function () {
    var grid = new Map();
    var size = 48;
    var active = this.marbles;
    for (var i = 0; i < active.length; i++) {
      var marble = active[i];
      if (marble.finished) continue;
      var gx = Math.floor(marble.x / size), gy = Math.floor(marble.y / size);
      for (var xx = gx - 1; xx <= gx + 1; xx++) {
        for (var yy = gy - 1; yy <= gy + 1; yy++) {
          var bucket = grid.get(xx + ':' + yy);
          if (!bucket) continue;
          for (var b = 0; b < bucket.length; b++) {
            var other = bucket[b];
            var dx = marble.x - other.x, dy = marble.y - other.y;
            var radius = marble.r + other.r;
            var d2 = dx * dx + dy * dy;
            if (d2 >= radius * radius) continue;
            var distance = Math.sqrt(d2);
            if (distance < 0.00001) { dx = 1; dy = 0; distance = 1; }
            var nx = dx / distance, ny = dy / distance;
            var correction = (radius - distance + 0.01) * 0.5;
            marble.x += nx * correction; marble.y += ny * correction;
            other.x -= nx * correction; other.y -= ny * correction;
            marble._needsContactSolve = true; other._needsContactSolve = true;
            var rv = (marble.vx - other.vx) * nx + (marble.vy - other.vy) * ny;
            if (rv < 0) {
              var impulse = -(1 + this.restitution) * rv * 0.5;
              marble.vx += impulse * nx; marble.vy += impulse * ny;
              other.vx -= impulse * nx; other.vy -= impulse * ny;
            }
          }
        }
      }
      var key = gx + ':' + gy;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(marble);
    }
  };

  Physics.prototype._fieldsStep = function (marble) {
    for (var i = 0; i < this._fields.length; i++) {
      var field = this._fields[i];
      if (field.type === 'wind') {
        var pulse = P.windPulse(field, this.time);
        if (!pulse.active || marble.vy <= 0 || Math.abs(marble.x - field.x) > field.width / 2 ||
            marble.y < field.y - field.height || marble.y > field.y) continue;
        var history = marble._windHistory || (marble._windHistory = Object.create(null));
        var last = history[field.id];
        // A scattered ball gets time to fall out before a later gust can catch it.
        if (last && (last.cycle === pulse.cycle || this.time - last.time < field.cooldown)) continue;
        var direction = marble.x < field.x ? -1 : marble.x > field.x ? 1 : marble.vx < 0 ? -1 : 1;
        marble.vy = -Math.sqrt(2 * this.gravity * field.liftHeight);
        marble.vx = direction * field.spread;
        history[field.id] = { cycle: pulse.cycle, time: this.time };
        this._event('wind', marble, field, 0.7);
      } else if (field.type === 'boost') {
        var shape = this._boostShapes.get(field), dx = marble.x - field.x, dy = marble.y - field.y;
        var localX = Math.abs(dx * shape.cos + dy * shape.sin), localY = Math.abs(-dx * shape.sin + dy * shape.cos);
        if (localX > shape.width / 2 || localY > shape.height / 2) continue;
        var cornerX = Math.max(0, localX - (shape.width / 2 - shape.radius));
        var cornerY = Math.max(0, localY - (shape.height / 2 - shape.radius));
        if (cornerX * cornerX + cornerY * cornerY > shape.radius * shape.radius) continue;
        marble.vx += (field.dx || 0) * field.power * STEP;
        marble.vy += (field.dy == null ? 1 : field.dy) * field.power * STEP;
        if (this.time - marble._boostAt > 0.45) {
          marble._boostAt = this.time;
          this._event('boost', marble, field, 0.9);
        }
      } else if (field.type === 'portal' && !field.exit && this.time - marble._portalAt > 0.85) {
        var dx = marble.x - field.x, dy = marble.y - field.y;
        if (dx * dx + dy * dy > (field.r - marble.r * 0.25) * (field.r - marble.r * 0.25)) continue;
        this._event('portal', marble, field, 1, { targetX: field.targetX, targetY: field.targetY });
        marble.x = field.targetX;
        marble.y = field.targetY;
        marble.vx = field.exitVx == null ? marble.vx : field.exitVx;
        marble.vy = field.exitVy == null ? Math.max(120, marble.vy) : field.exitVy;
        marble._portalAt = this.time;
        marble._anchorY = marble.y;
        marble._stuckAt = this.time;
        marble.trail.length = 0;
      }
    }
  };

  Physics.prototype._skillsStep = function (marble) {
    if (marble.skill && this.time >= marble.skill.until) { marble.skill = null; marble.r = marble.baseRadius; }
    if (!this.skills || this.time < marble._nextSkill) return;
    marble._nextSkill = this.time + 5 + this.random() * 7;
    if (this.random() > 0.3) return;
    var kind = ['haste', 'pulse', 'grow'][Math.floor(this.random() * 3)];
    marble.skill = { kind: kind, until: this.time + 1.2 };
    if (kind === 'haste') marble.vy += 135;
    else if (kind === 'grow') marble.r = marble.baseRadius * 1.22;
    else {
      for (var i = 0; i < this.marbles.length; i++) {
        var other = this.marbles[i];
        if (other === marble || other.finished) continue;
        var dx = other.x - marble.x, dy = other.y - marble.y;
        var distance = Math.hypot(dx, dy);
        if (distance > 0 && distance < 110) {
          var force = (1 - distance / 110) * 145;
          other.vx += dx / distance * force; other.vy += dy / distance * force;
        }
      }
    }
    this._event('skill', marble, null, 1, { skill: kind });
  };

  Physics.prototype.step = function () {
    if (this.complete) return;
    this.ticks++;
    this.time = this.ticks * STEP;
    // All marbles see the same pose; avoid repeated trigonometry in the solver.
    this._dynamicGrid.clear();
    for (var poseIndex = 0; poseIndex < this._dynamic.length; poseIndex++) {
      var dynamicObstacle = this._dynamic[poseIndex];
      var dynamicPose = this.getObstaclePose(dynamicObstacle);
      this._dynamicPoses[poseIndex] = dynamicPose;
      var dynamicEntry = { obstacle: dynamicObstacle, pose: dynamicPose };
      var pad = dynamicPose.thickness + 24;
      var minGX = Math.floor((Math.min(dynamicPose.x1, dynamicPose.x2) - pad) / 96);
      var maxGX = Math.floor((Math.max(dynamicPose.x1, dynamicPose.x2) + pad) / 96);
      var minGY = Math.floor((Math.min(dynamicPose.y1, dynamicPose.y2) - pad) / 96);
      var maxGY = Math.floor((Math.max(dynamicPose.y1, dynamicPose.y2) + pad) / 96);
      for (var gridX = minGX; gridX <= maxGX; gridX++) {
        for (var gridY = minGY; gridY <= maxGY; gridY++) {
          var gridKey = gridX + ':' + gridY;
          if (!this._dynamicGrid.has(gridKey)) this._dynamicGrid.set(gridKey, []);
          this._dynamicGrid.get(gridKey).push(dynamicEntry);
        }
      }
    }
    var crossings = [];
    for (var i = 0; i < this.marbles.length; i++) {
      var marble = this.marbles[i];
      if (marble.finished) continue;
      marble._previousX = marble.x; marble._previousY = marble.y;
      this._skillsStep(marble);
      marble.vy += this.gravity * STEP;
      if (marble.vy > P.PHYSICS_TUNING.fallSoftThreshold) {
        marble.vy -= (marble.vy - P.PHYSICS_TUNING.fallSoftThreshold) * P.PHYSICS_TUNING.fallDrag * STEP;
      }
      marble.vy = Math.min(marble.vy, P.PHYSICS_TUNING.fallMax);
      marble.vx *= 0.9998;
      var speed = Math.hypot(marble.vx, marble.vy);
      if (speed > P.PHYSICS_TUNING.velocityMax) { marble.vx *= P.PHYSICS_TUNING.velocityMax / speed; marble.vy *= P.PHYSICS_TUNING.velocityMax / speed; }
      marble.x += marble.vx * STEP;
      marble.y += marble.vy * STEP;
      marble.angle += marble.vx / marble.r * STEP;
      this._fieldsStep(marble);
      this._obstacles(marble);
    }
    for (var pass = 0; pass < 2; pass++) {
      this._pairs();
      for (var solve = 0; solve < this.marbles.length; solve++) {
        var item = this.marbles[solve];
        if (!item.finished && item._needsContactSolve) { this._obstacles(item); item._needsContactSolve = false; }
      }
    }
    for (var n = 0; n < this.marbles.length; n++) {
      var ball = this.marbles[n];
      if (ball.finished) continue;
      if (ball.y > ball._anchorY + P.PHYSICS_TUNING.rescueProgress) { ball._anchorY = ball.y; ball._stuckAt = this.time; ball._rescues = 0; }
      if (this.mapPolicy.recovery && this.time - ball._stuckAt >= P.PHYSICS_TUNING.rescueDelay) {
        // A separate, disclosed stuck-recovery rule; never consume the skill RNG.
        // Alternate sides on repeated attempts instead of repeatedly pushing into a wall.
        var direction = ball._rescueDirection * (ball._rescues % 2 ? -1 : 1);
        ball.vx += direction * (ball._rescues ? 300 : 240);
        ball.vy += 150;
        ball._rescues++;
        ball._stuckAt = this.time;
        ball._anchorY = ball.y;
        this._event('rescue', ball, null, 0.55);
      }
      if (ball.y >= this.map.finish.y) {
        var crossed = clamp((this.map.finish.y - ball._previousY) / (ball.y - ball._previousY || 1), 0, 1);
        ball.finishTime = (this.ticks - 1 + crossed) * STEP;
        crossings.push(ball);
      }
      if (this.ticks % 3 === 0) {
        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 14) ball.trail.shift();
      }
    }
    crossings.sort(function (a, b) { return a.finishTime - b.finishTime || a.colorIndex - b.colorIndex; });
    for (var finish = 0; finish < crossings.length; finish++) {
      var winner = crossings[finish];
      winner.finished = true;
      winner.r = winner.baseRadius;
      winner.y = this.map.finish.y;
      winner.x = clamp(winner.x, this.bounds.left + winner.r, this.bounds.right - winner.r);
      winner.vx = 0; winner.vy = 0;
      this.finished.push(winner);
      this._event('finish', winner, null, 1, { rank: this.finished.length });
    }
    this.complete = this.finished.length === this.marbles.length;
  };

  Physics.prototype.drainEvents = function () { var events = this.events; this.events = []; return events; };
  Physics.prototype.getRanking = function () {
    var active = this.marbles.filter(function (marble) { return !marble.finished; });
    active.sort(function (a, b) { return b.y - a.y || a.colorIndex - b.colorIndex; });
    return this.finished.concat(active);
  };
  P.Physics = Physics;
})(window);
