(function () {
  'use strict';
  const P = window.CosmicPinball;
  const STORAGE_KEY = 'mungbanggu-pinball-settings-v2';
  const STEP = 1 / 120;
  const QUALITY_ORDER = ['high', 'medium', 'low'];
  const defaults = {
    names: '빨강*2,초록*2,파랑*2', rule: 'first', rankN: 1, map: 'classic', theme: 'cosmic',
    radius: 12, gravity: 620, restitution: 0.72, speed: 1, sound: true, volume: 0.35,
    quality: 'high', seed: '', skills: false,
    reducedMotion: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  };
  function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }
  function normalize(input) {
    const s = Object.assign({}, defaults, input || {});
    s.names = typeof s.names === 'string' ? s.names : defaults.names;
    s.seed = typeof s.seed === 'string' ? s.seed.trim().slice(0, 128) : defaults.seed;
    s.map = P.resolveMapId(s.map);
    s.theme = defaults.theme;
    s.rule = ['first', 'last', 'nth', 'top'].includes(s.rule) ? s.rule : 'first';
    s.rankN = Number(s.rankN);
    s.radius = clamp(s.radius, 8, 16, defaults.radius);
    s.gravity = clamp(s.gravity, 350, 1500, defaults.gravity);
    s.restitution = clamp(s.restitution, 0.35, 0.92, defaults.restitution);
    s.speed = clamp(s.speed, 0.5, 3, defaults.speed);
    s.volume = clamp(s.volume, 0, 1, defaults.volume);
    s.quality = QUALITY_ORDER.includes(s.quality) ? s.quality : 'high';
    s.sound = !!s.sound; s.skills = P.mapInfo(s.map).skills && !!s.skills; s.reducedMotion = !!s.reducedMotion;
    return s;
  }
  function readSaved() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const values = JSON.parse(saved);
        // Earlier builds persisted the built-in/generated seed, unintentionally replaying each round.
        if (values.seedMode !== 'manual' && (values.seed === 'MUNGBANGGU-2026' || /^MUNGBANGGU-[0-9A-Z]{1,7}$/.test(values.seed || ''))) values.seed = '';
        try { P.parseNames(values.names || defaults.names); } catch (_) { values.names = defaults.names; values.seed = ''; values.replayStart = null; values.participantReset = true; }
        return normalize(values);
      }
      const legacy = JSON.parse(localStorage.getItem('orbit-pinball-settings-v1') || 'null');
      if (!legacy) return normalize(defaults);
      // Keep participant choices; adopt the gentler pacing when upgrading the original game.
      legacy.gravity = defaults.gravity; legacy.speed = defaults.speed;
      if (legacy.seed === 'ORBIT-2026') legacy.seed = '';
      try { P.parseNames(legacy.names || defaults.names); } catch (_) { legacy.names = defaults.names; legacy.seed = ''; legacy.replayStart = null; legacy.participantReset = true; }
      return normalize(legacy);
    }
    catch (_) { return normalize(defaults); }
  }
  let memorySettings = readSaved();
  function save(settings) {
    // Incomplete name edits remain a draft; keep the last valid saved settings.
    try { P.parseNames(settings.names); } catch (_) { return; }
    memorySettings = Object.assign({}, settings, { seedMode: settings.seed ? 'manual' : 'auto' });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(memorySettings)); } catch (_) {}
  }
  P.chooseWinners = function (ranking, settings) {
    if (!ranking.length) return [];
    if (settings.rule === 'last') return [ranking[ranking.length - 1]];
    if (settings.rule === 'nth') return ranking.slice(settings.rankN - 1, settings.rankN);
    if (settings.rule === 'top') return ranking.slice(0, settings.rankN);
    return [ranking[0]];
  };
  P.ruleLabel = function (settings) {
    return { first: '1등 당첨', last: '꼴등 당첨', nth: settings.rankN + '번째 당첨', top: '상위 ' + settings.rankN + '명 당첨' }[settings.rule];
  };
  const canvas = document.getElementById('game-canvas');
  const mini = document.getElementById('minimap');
  const ui = new P.UI();
  const renderer = new P.Renderer(canvas);
  const displayBudget = new P.DisplayBudget();
  let viewportSettle = 0;
  const camera = new P.Camera(canvas);
  const effects = new P.Effects();
  const cinematic = new P.Cinematic(document.getElementById('cinema-canvas'), renderer);
  const audio = new P.AudioEngine();
  const handScene = new P.HandScene(cinematic);
  const throwGate = new P.ThrowGate();
  handScene.gate = throwGate;
  const handFlight = new P.HandFlight(cinematic);
  const shufflePoint = point => ({ x: point.x / (handScene.viewScale || 1), y: point.y / (handScene.viewScale || 1), time: point.time });
  function acceptWallExit(decision) {
    handScene.lastDecision = decision;
    handScene.shuffle.release();
    if (decision.fired) { throwMarbles(decision); shuffleInput.cancel(true); }
  }
  let inputMode = null;
  const shuffleInput = new P.ShuffleInput(document.getElementById('cinema-canvas'), {
    enabled: () => status === 'mixing' && (handScene.ready || handScene.canTilt) && !handScene.launchDecision,
    area: () => handScene.area(),
    begin: point => {
      inputMode = handScene.ready ? 'shuffle' : 'tube';
      if (inputMode === 'tube') { handScene.beginTilt(point); return; }
      handScene.lastDecision = null; throwGate.begin(point.x, point.y, point.time, handScene.area());
      const local = shufflePoint(point); handScene.shuffle.begin(local.x, local.y, local.time);
    },
    move: point => {
      if (status !== 'mixing') return;
      if (inputMode === 'tube') { handScene.moveTilt(point); return; }
      if (!throwGate.active) return;
      const local = shufflePoint(point), contacted = handScene.shuffle.move(local.x, local.y, local.time);
      if (throwGate.move(point.x, point.y, point.time, contacted)) {
        const decision = throwGate.takeExit(point.time); if (decision.fired) acceptWallExit(decision);
      }
    },
    release: point => {
      if (inputMode === 'tube') { handScene.releaseTilt(point); inputMode = null; return; }
      inputMode = null;
      if (status !== 'mixing' || !throwGate.active) return;
      const local = shufflePoint(point), contacted = handScene.shuffle.move(local.x, local.y, local.time);
      const decision = throwGate.release(point.x, point.y, point.time, contacted); acceptWallExit(decision);
    },
    cancel: () => {
      if (inputMode === 'tube') handScene.cancelTilt();
      inputMode = null; throwGate.cancel(); if (handScene.shuffle) handScene.shuffle.release();
    }
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
    renderer.nameSprites.clear();
    cinematic.labels.clear();
  });
  let settings = normalize(memorySettings);
  let runSettings = null;
  let physics = null;
  let status = 'intro';
  let flightLanded = false;
  let flightDuration = 2.8;
  let launchElapsed = 0;
  let seedSerial = 0;
  let accumulator = 0;
  let lastFrame = 0;
  let elapsedVisual = 0;
  let fps = 60;
  let fpsElapsed = 0;
  let fpsFrames = 0;
  let lowFpsTime = 0;
  let qualityCooldown = 8;
  let hudElapsed = 0;
  let leaderId = null;
  let leadCooldown = 0;
  let leadCandidateId = null;
  let leadCandidateAge = 0;
  let leadNotices = 0;
  let photoFinish = false;
  let winner = null;
  let finalRanking = [];
  let resultDelay = 0;
  let resultShown = false;
  let stoppedEarly = false;
  const diagnostics = { leadChanges: 0, photoFinishes: 0, events: {}, autoQualityDrops: 0, frames: 0 };
  ui.load(settings);
  settings = normalize(ui.readSettings());
  function visualSettings() {
    ui.setTheme(settings.theme);
    renderer.setTheme(settings.theme);
    if (renderer.setMap) renderer.setMap(settings.map);
    renderer.setQuality(settings.quality);
    if (cinematic.setQuality) cinematic.setQuality(settings.quality);
    if (effects.setQuality) effects.setQuality(settings.quality);
    renderer.setReducedMotion(settings.reducedMotion);
    effects.reducedMotion = settings.reducedMotion;
    audio.configure(settings);
    document.documentElement.classList.toggle('reduced-motion', settings.reducedMotion);
  }
  function resize() {
    viewportSettle = .7;
    renderer.resize();
    camera.viewport = ui.getViewport();
  }
  function makePhysics(config, names) {
    return new P.Physics({
      names: names, map: P.MAPS[config.map], seed: config.seed,
      radius: config.radius, gravity: config.gravity, restitution: config.restitution, skills: config.skills
    });
  }
  function resetEffects() {
    if (effects.clear) { effects.clear(); return; }
    effects.particles.length = 0;
    effects.rings.length = 0;
    effects.shake = 0; effects.flash = 0;
  }
  function setScene(scene) {
    status = scene;
    ui.setScene(scene);
    ui.setStatus(scene);
    audio.setMusicScene(scene === 'finished' && winner ? 'resultPending' : scene);
  }
  function preview(scene = 'setup') {
    launchElapsed = 0; flightLanded = false;
    winner = null; photoFinish = false; runSettings = null;
    accumulator = 0; finalRanking = []; resultShown = false; stoppedEarly = false;
    resetEffects();
    let names;
    try { names = P.parseNames(settings.names); } catch (_) { names = P.parseNames(defaults.names); }
    physics = makePhysics(Object.assign({}, settings, { seed: settings.seed || 'MUNGBANGGU-PREVIEW' }), names);
    camera.reset(P.MAPS[settings.map]);
    ui.hideResults(); ui.hideCountdown(); ui.setLocked(false);
    setScene(scene); resize();
    const ranking = physics.getRanking();
    ui.updateHUD({ ranking, remaining: names.length, total: names.length, time: 0, fps,
      leader: P.raceStanding(ranking).leader, seed: settings.seed || '매번 새 출발', map: P.MAPS[settings.map], quality: settings.quality });
  }
  function enterGame() {
    if (status !== 'intro') return;
    audio.unlock(); setScene('setup'); resize();
  }
  function newRoundSeed() {
    const values = new Uint32Array(4);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(values);
    else {
      values[0] = Date.now() >>> 0;
      for (let i = 1; i < values.length; i++) values[i] = Math.floor(Math.random() * 4294967296);
    }
    return 'MB-' + Array.from(values, value => value.toString(36).toUpperCase()).join('-') + '-' + (++seedSerial).toString(36);
  }
  function start(usePrevious) {
    if (!['setup', 'finished'].includes(status)) return;
    const next = usePrevious && runSettings ? Object.assign({}, runSettings, {
      seed: settings.seed, replayStart: null, theme: settings.theme, sound: settings.sound, volume: settings.volume,
      quality: settings.quality, reducedMotion: settings.reducedMotion, speed: settings.speed
    }) : normalize(ui.readSettings());
    let names;
    try {
      names = P.parseNames(next.names);
      if (['nth', 'top'].includes(next.rule) && (!Number.isInteger(next.rankN) || next.rankN < 1 || next.rankN > names.length)) {
        throw new Error('당첨 순위는 1부터 핀볼 수(' + names.length + ')까지의 정수로 입력해 주세요.');
      }
    } catch (error) { ui.showError(error.message); return; }
    const candidate = Object.assign({}, next, { seed: next.seed || newRoundSeed() });
    const nextPhysics = makePhysics(candidate, names);
    if (next.replayStart) {
      try { P.restoreHandStart(nextPhysics, next.replayStart); }
      catch (error) { ui.showError(error.message); return; }
    }
    settings = next; runSettings = candidate;
    ui.load(settings); save(settings); visualSettings();
    if (ui.rememberRound) ui.rememberRound(runSettings);
    physics = nextPhysics;
    resetEffects(); camera.reset(P.MAPS[runSettings.map]);
    ui.clearError(); ui.hideResults(); ui.hideCountdown(); ui.setLocked(true);
    winner = null; launchElapsed = 0; flightLanded = false;
    throwGate.cancel();
    if (next.replayStart) {
      camera.prepareLanding(P.MAPS[runSettings.map], physics);
      setScene('running');
    } else {
      handScene.begin(physics, settings.reducedMotion);
      setScene('mixing');
    }
    accumulator = 0; leaderId = null; leadCooldown = 0; leadCandidateId = null; leadCandidateAge = 0; leadNotices = 0; photoFinish = false;
    finalRanking = []; resultDelay = 0; resultShown = false; stoppedEarly = false;
    diagnostics.leadChanges = 0; diagnostics.photoFinishes = 0; diagnostics.events = {};
    audio.unlock(); resize();
  }
  function throwMarbles(decision) {
    if (status !== 'mixing' || handScene.launchDecision) return;
    handScene.launchDecision = decision;
    cinematic.commitHandSlots(physics, handScene.shuffle.bodies);
    runSettings.replayStart = JSON.parse(JSON.stringify(physics.handStart));
    if (ui.rememberRound) ui.rememberRound(runSettings);
    camera.viewport = ui.getViewport(); camera.prepareLanding(P.MAPS[runSettings.map], physics);
    handScene.camera = camera;
    flightDuration = settings.reducedMotion ? 1.2 : 2.8;
    handFlight.begin(physics, handScene, decision, flightDuration, settings.reducedMotion);
    launchElapsed = 0; setScene('flight'); audio.play('launch');
  }
  function updateLaunch(dt) {
    if (status === 'mixing') { handScene.update(dt); return; }
    if (flightLanded) {
      flightLanded = false; accumulator = 0; setScene('running'); return;
    }
    launchElapsed += dt;
  }
  function renderCinema(dt) {
    if (status === 'mixing') { ui.setSceneProgress(handScene.render({ physics, reducedMotion: settings.reducedMotion })); return; }
    const stage = status, map = P.MAPS[(runSettings || settings).map];
    if (stage === 'flight') {
      const progress = Math.min(1, launchElapsed / flightDuration);
      camera.viewport = ui.getViewport(); camera.prepareLanding(map, physics);
      // HandFlight paints the board with its exact interpolated camera once.
      ui.setSceneProgress(handFlight.render({ stage, progress, time: elapsedVisual, physics, camera, reducedMotion: settings.reducedMotion }));
      // Draw every exact endpoint before the following frame advances race time.
      if (progress === 1) flightLanded = true;
      return;
    }
    ui.setSceneProgress(cinematic.render({ stage, progress: 0, time: elapsedVisual, physics, camera, reducedMotion: settings.reducedMotion }) || { reveal: 0 });
  }
  function onChange() {
    const next = normalize(ui.readSettings());
    const needsPreview = ['intro', 'setup'].includes(status) && (next.names !== settings.names || next.map !== settings.map || next.radius !== settings.radius || next.gravity !== settings.gravity || next.restitution !== settings.restitution || next.seed !== settings.seed || next.skills !== settings.skills);
    settings = next; save(settings); visualSettings();
    if (settings.sound) audio.unlock();
    if (needsPreview) preview(status);
    resize();
  }
  function resultWinners() {
    // Unfinished balls never acquire a final rank when the user ends the race.
    if (runSettings.rule === 'last' && finalRanking.length < physics.marbles.length) return [];
    if (['nth', 'top'].includes(runSettings.rule) && finalRanking.length < runSettings.rankN) return [];
    return P.chooseWinners(finalRanking, runSettings);
  }
  function finish(early) {
    status = 'finished'; photoFinish = false;
    finalRanking = physics.finished.slice();
    stoppedEarly = !!early && finalRanking.length < physics.marbles.length;
    winner = resultWinners()[0];
    setScene('finished'); ui.setLocked(false);
    if (winner) { effects.celebrate(winner, P.THEMES[settings.theme]); audio.play('win'); }
    resultDelay = early ? 0 : 1.25;
  }
  function processEvents() {
    for (const event of physics.drainEvents()) {
      diagnostics.events[event.type] = (diagnostics.events[event.type] || 0) + 1;
      effects.handle(event, P.THEMES[settings.theme], physics.marbles.length);
      audio.play(event.type, event.intensity, event.skill);
      if (event.type === 'finish' && physics.finished.length === 1) ui.toast('첫 핀볼이 결승에 도착했습니다');
    }
  }
  function updateRace(dt) {
    const map = P.MAPS[runSettings.map];
    const ranking = physics.getRanking();
    const active = ranking.filter(m => !m.finished);
    const close = !physics.finished.length && active.length >= 2 && active[0].y > map.finish.y - 340 && Math.abs(active[0].y - active[1].y) < 95;
    if (close && !photoFinish) {
      diagnostics.photoFinishes++;
      ui.toast('접전 · 마지막 순간을 천천히');
    }
    photoFinish = close;
    accumulator += dt * settings.speed * (photoFinish ? 0.32 : 1);
    let ticks = 0;
    while (accumulator >= STEP && ticks < 48 && !physics.complete) {
      physics.step(STEP); accumulator -= STEP; ticks++;
    }
    processEvents();
    const leader = P.raceStanding(physics.getRanking()).leader;
    leadCooldown = Math.max(0, leadCooldown - dt);
    if (!leader) { leaderId = null; leadCandidateId = null; leadCandidateAge = 0; }
    if (leader && leaderId !== leader.id) {
      leadCandidateId = leaderId === null ? null : leader.id;
      leadCandidateAge = 0;
      leaderId = leader.id;
    }
    if (leader && leadCandidateId === leader.id && !leader.finished) {
      leadCandidateAge += dt;
      // A brief shuffle at the front is not an announcement. Give persistent
      // changes room to breathe, especially when hundreds of marbles race.
      if (leadCandidateAge >= .45 && leadCooldown <= 0 && leadNotices < 3) {
        diagnostics.leadChanges++;
        ui.toast('선두 교체 · ' + leader.name);
        effects.handle({ type: 'lead', x: leader.x, y: leader.y, marble: leader, intensity: 1 }, P.THEMES[settings.theme], physics.marbles.length);
        audio.play('lead'); leadCooldown = 7; leadNotices++; leadCandidateId = null;
      }
      else if (leadCandidateAge > 2 && leadCooldown > 0) leadCandidateId = null;
    }
    if (ui.setStopAvailable) ui.setStopAvailable(physics.finished.length > 0);
    if (physics.complete) finish();
  }
  function adjustQuality(dt) {
    qualityCooldown -= dt;
    const playing = ['mixing', 'flight', 'running'].includes(status);
    if (playing && fps < 22) lowFpsTime += dt;
    else lowFpsTime = Math.max(0, lowFpsTime - dt * 2);
    if (playing && lowFpsTime > 6 && qualityCooldown <= 0 && renderer.quality !== 'low') {
      const effectQuality = QUALITY_ORDER[QUALITY_ORDER.indexOf(renderer.quality) + 1];
      renderer.setQuality(effectQuality);
      if (cinematic.setQuality) cinematic.setQuality(effectQuality);
      if (effects.setQuality) effects.setQuality(effectQuality);
      // Temporary effects relief must not overwrite the user's quality setting.
      lowFpsTime = 0; qualityCooldown = 8; diagnostics.autoQualityDrops++;
      if (status === 'running') ui.toast('화면 선명도는 유지하며 효과를 줄였습니다');
    }
  }
  function frame(timestamp) {
    const dt = lastFrame ? Math.min(0.12, Math.max(0, (timestamp - lastFrame) / 1000)) : 1 / 60;
    lastFrame = timestamp;
    if (document.hidden) { lastFrame = 0; requestAnimationFrame(frame); return; }
    elapsedVisual += dt; hudElapsed += dt; fpsElapsed += dt; fpsFrames++; diagnostics.frames++;
    if (fpsElapsed >= 0.75) { fps = Math.round(fpsFrames / fpsElapsed); fpsElapsed = 0; fpsFrames = 0; }
    adjustQuality(dt);
    if(['mixing','flight','running'].includes(status)){
      const scale=displayBudget.sample(dt);renderer.setRenderScale(scale);
    }
    viewportSettle=Math.max(0,viewportSettle-dt);
    if (['mixing', 'flight'].includes(status)) updateLaunch(dt);
    if (['intro', 'setup', 'mixing', 'flight'].includes(status)) {
      renderCinema(dt); requestAnimationFrame(frame); return;
    }
    if (status === 'running') updateRace(dt);
    else if (status === 'finished' && !resultShown) {
      resultDelay -= dt;
      if (resultDelay <= 0) {
        resultShown = true;
        audio.setMusicScene(resultWinners().length ? 'result' : 'finished');
        ui.showResults({ winners: resultWinners(), ranking: finalRanking, stoppedEarly: stoppedEarly, total: physics.marbles.length, seed: runSettings.seed, time: physics.time, map: runSettings.map, ruleLabel: P.ruleLabel(runSettings) });
      }
    }
    const map = P.MAPS[(runSettings || settings).map];
    const ranking = physics.getRanking();
    if(viewportSettle>0||hudElapsed>=.1||!camera.viewport)camera.viewport=ui.getViewport();
    camera.update(dt, physics, map, { photoFinish: photoFinish, status: status, reducedMotion: settings.reducedMotion });
    effects.update(dt);
    renderer.render({ physics: physics, map: map, camera: camera, effects: effects, time: elapsedVisual, dt: dt, status: status, winner: winner, leader: P.raceStanding(ranking).leader || null, photoFinish: photoFinish });
    if (hudElapsed >= 0.1) {
      hudElapsed = 0;
      ui.updateHUD({ ranking: ranking, remaining: physics.marbles.length - physics.finished.length, total: physics.marbles.length, time: physics.time, fps: fps, leader: P.raceStanding(ranking).leader, seed: (runSettings || settings).seed || '매번 새 출발', map: map, quality: settings.quality });
      renderer.drawMinimap(mini, physics, camera);
    }
    requestAnimationFrame(frame);
  }
  ui.on('enter', enterGame);
  ui.on('start', () => start(false));
  ui.on('stop', () => { if (status === 'running' && physics.finished.length > 0) finish(true); });
  ui.on('setupcancel', () => { if (status === 'setup') { setScene('intro'); resize(); } });
  ui.on('restart', () => start(true));
  ui.on('replay', () => { settings = normalize(ui.readSettings()); preview(); });
  ui.on('reset', () => { settings = normalize(ui.readSettings()); preview(); });
  ui.on('change', next => { onChange(next); audio.unlock(); });
  ui.on('layout', resize);
  ui.on('follow', () => { if (['mixing', 'flight'].includes(status)) return; camera.follow = !camera.follow; camera.entrance = null; if (ui.setFollowing) ui.setFollowing(camera.follow); ui.toast(camera.follow ? '선두 추적을 켰습니다' : '자유롭게 코스를 둘러보세요'); });
  ui.on('camerazoom', factor => {
    if (!['running', 'finished'].includes(status)) return;
    camera.zoomBy(factor); ui.setFollowing(false);
  });
  ui.on('camerahome', () => {
    if (!['running', 'finished'].includes(status)) return;
    camera.resumeFollow(); ui.setFollowing(true);
  });
  camera.attach(canvas);
  window.addEventListener('resize', () => { displayBudget.resetTiming(); resize(); });
  document.addEventListener('visibilitychange', () => { lastFrame = 0; displayBudget.resetTiming(); audio.syncMusic(); });
  visualSettings(); preview('intro');
  P.app = { ui: ui, renderer: renderer, cinematic: cinematic, camera: camera, effects: effects, audio: audio,
    handScene, handFlight, shuffleInput, throwGate, get physics() { return physics; }, get status() { return status; }, get settings() { return Object.assign({}, settings); },
    get runSettings() { return runSettings && Object.assign({}, runSettings); },
    get diagnostics() { return Object.assign({}, diagnostics, {renderScale:renderer.renderScale}); }, start: start, reset: preview
  };
  requestAnimationFrame(frame);
})();
