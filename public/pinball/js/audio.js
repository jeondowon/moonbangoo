(function () {
  'use strict';
  const P = window.CosmicPinball = window.CosmicPinball || {};
  P.SOUND_CONFIG = {
    voices: 4, hitInterval: 0.30, master: 0.35,
    themes: {
      cosmic: { wave: 'sine', root: 130.81, filter: 2600, overtone: 2, decay: 1.05 },
      candy: { wave: 'triangle', root: 174.61, filter: 3400, overtone: 2.5, decay: 1.15 },
      gold: { wave: 'sine', root: 146.83, filter: 3100, overtone: 3, decay: 1.35 },
      ice: { wave: 'sine', root: 196, filter: 4600, overtone: 4, decay: 1.4 }
    }
  };
  class AudioEngine {
    constructor() {
      this.context = null;
      this.master = null;
      this.enabled = true;
      this.volume = P.SOUND_CONFIG.master;
      this.theme = 'cosmic';
      this.voices = 0;
      this.lastHit = -1;
      this.noiseBuffer = null;
      this.music = null;
      this.musicGain = null;
      this.musicNode = null;
      this.musicTrack = null;
      this.musicUnlocked = false;
      this.musicFinished = false;
      this.musicFade = null;
      this.musicScene = 'intro';
      this.musicDecks = new Map();
      this.musicTransition = null;
      this.musicFadeDuration = .36;
      this.activeDeck = null;
      this.finishedCuePlayed = false;
      this.lastNotice = -1;
    }
    unlock() {
      if (!this.enabled || !(this.volume > 0)) return;
      this.musicUnlocked = true;
      this.syncMusic();
      try {
        if (!this.context) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return;
          this.context = new AudioContext();
          this.master = this.context.createGain();
          this.master.gain.value = this.volume * 0.18;
          this.master.connect(this.context.destination);
        }
        if (this.context.state === 'suspended') this.context.resume().catch(function () {});
        this.syncMusic();
      } catch (_) { this.context = null; }
    }
    configure(settings) {
      this.enabled = !!settings.sound;
      this.volume = Math.max(0, Math.min(1, Number(settings.volume)));
      this.theme = settings.theme || 'cosmic';
      this.syncMusic();
      if (this.master && this.context) {
        this.master.gain.setTargetAtTime(this.enabled ? this.volume * 0.18 : 0, this.context.currentTime, 0.035);
      }
    }
    musicNow() { return window.performance ? window.performance.now() / 1000 : Date.now() / 1000; }
    musicAllowed() { return this.musicUnlocked && this.enabled && this.volume > 0 && !document.hidden; }
    setMusicScene(scene) {
      if (scene === 'running' && this.musicScene !== scene) this.finishedCuePlayed = false;
      this.musicScene = scene;
      const tracks = { intro: 'chipper-doodle-v2', setup: 'chipper-doodle-v2',
        mixing: 'electrodoodle', flight: 'electrodoodle', running: 'bit-quest',
        resultPending: 'bit-quest', result: 'winner-winner' };
      const track = tracks[scene] || null;
      if (track !== this.musicTrack) {
        this.musicTrack = track;
        this.musicFinished = false;
        this.musicFadeDuration = scene === 'result' ? .5 : .36;
        if (!this.musicAllowed() && this.activeDeck) { this.cancelMusicFade(); this.stopMusicDeck(this.activeDeck); this.activeDeck = null; }
      }
      this.syncMusic();
    }
    musicDeck(track) {
      let deck = this.musicDecks.get(track);
      if (deck) return deck;
      const media = new window.Audio('./assets/music/' + track + '.mp3');
      media.preload = 'auto'; media.hidden = true; media.loop = track !== 'winner-winner'; media.volume = 0;
      if (document.body) document.body.appendChild(media);
      deck = { track, media, gain: null, node: null, level: 0, ended: false, pending: false };
      media.addEventListener('ended', () => {
        if (!media.loop) {
          deck.ended = true; deck.level = 0;
          if (this.activeDeck === deck) { this.cancelMusicFade(); this.activeDeck = null; }
          this.musicLevel(deck);
          if (this.musicTrack === track) this.musicFinished = true;
        }
      });
      this.musicDecks.set(track, deck);
      return deck;
    }
    musicLevel(deck) {
      if (!deck.gain && this.context && this.context.createMediaElementSource) {
        try {
          deck.node = this.context.createMediaElementSource(deck.media);
          deck.gain = this.context.createGain(); deck.gain.gain.value = 0;
          deck.node.connect(deck.gain); deck.gain.connect(this.context.destination);
        } catch (_) { deck.gain = null; }
      }
      const volume = deck.level * this.volume * 0.55;
      if (deck.gain) {
        deck.media.volume = 1;
        deck.gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.025);
      } else deck.media.volume = volume;
      if (deck.media === this.music) { this.musicGain = deck.gain; this.musicNode = deck.node; }
    }
    cancelMusicFade() {
      if (this.musicFade) window.clearInterval(this.musicFade);
      this.musicFade = null; this.musicTransition = null;
    }
    stopMusicDeck(deck) {
      deck.request = (deck.request || 0) + 1; deck.pending = false;
      deck.media.pause(); deck.media.currentTime = 0; deck.level = 0;
      this.musicLevel(deck);
    }
    beginMusicFade(deck, target, duration) {
      this.cancelMusicFade();
      this.musicTransition = { deck, target, start: deck.level, elapsed: 0, duration };
      this.runMusicFade();
    }
    runMusicFade() {
      if (!this.musicAllowed() || !this.musicTransition || this.musicFade) return;
      const transition = this.musicTransition;
      if (transition.deck.pending) return;
      transition.started = this.musicNow() - transition.elapsed;
      const tick = () => {
        if (this.musicTransition !== transition) return;
        const t = Math.min(1, Math.max(0, (this.musicNow() - transition.started) / transition.duration));
        transition.elapsed = t * transition.duration;
        const ease = t * t * (3 - 2 * t);
        transition.deck.level = transition.start + (transition.target - transition.start) * ease;
        this.musicLevel(transition.deck);
        if (t === 1) {
          this.cancelMusicFade();
          if (transition.target === 0) {
            this.stopMusicDeck(transition.deck);
            if (this.activeDeck === transition.deck) this.activeDeck = null;
            this.syncMusic();
          }
        }
      };
      this.musicFade = window.setInterval(tick, 20); tick();
    }
    playMusicDeck(deck) {
      const request = deck.request = (deck.request || 0) + 1;
      deck.pending = true;
      const ready = () => {
        if (deck.request !== request) return;
        deck.pending = false;
        if (!this.musicAllowed()) { deck.media.pause(); return; }
        if (this.activeDeck !== deck || deck.track !== this.musicTrack || this.musicFinished) {
          this.stopMusicDeck(deck); return;
        }
        if (!this.musicTransition) this.beginMusicFade(deck, 1, this.musicFadeDuration);
        else this.runMusicFade();
      };
      const failed = () => {
        if (deck.request !== request) return;
        deck.pending = false; deck.media.pause(); deck.level = 0; this.musicLevel(deck);
        if (this.activeDeck === deck) { this.activeDeck = null; this.cancelMusicFade(); }
      };
      try { const playing = deck.media.play(); if (playing && playing.then) playing.then(ready, failed); else ready(); }
      catch (_) { failed(); }
    }
    syncMusic() {
      if (!window.Audio) return;
      if (!this.musicAllowed()) {
        if (this.musicFade) window.clearInterval(this.musicFade);
        this.musicFade = null;
        for (const deck of this.musicDecks.values()) { if (deck.pending) { deck.request = (deck.request || 0) + 1; deck.pending = false; } deck.media.pause(); }
        return;
      }
      let active = this.activeDeck;
      if (active && active.track !== this.musicTrack) {
        // A buffering request has no audible tail to preserve. Invalidate it so
        // its late play promise cannot revive music from a previous scene.
        if (active.pending || active.media.paused || active.level === 0) {
          this.cancelMusicFade(); this.stopMusicDeck(active); this.activeDeck = null;
        } else if (!this.musicTransition || this.musicTransition.target !== 0) {
          this.beginMusicFade(active, 0, .18);
        }
        if (this.activeDeck) return;
      }
      if (!this.musicTrack || this.musicFinished) return;
      active = this.activeDeck;
      if (!active) {
        active = this.musicDeck(this.musicTrack);
        // Enforce one background player, even after interrupted transitions.
        for (const deck of this.musicDecks.values()) if (deck !== active) this.stopMusicDeck(deck);
        if (this.music) this.music.id = '';
        active.ended = false; active.level = 0; active.media.currentTime = 0;
        this.activeDeck = active; this.music = active.media; this.music.id = 'background-music';
        this.musicLevel(active); this.playMusicDeck(active); return;
      }
      this.musicLevel(active);
      if (active.pending) return;
      if (active.media.paused) { this.playMusicDeck(active); return; }
      if (this.musicTransition && this.musicTransition.target === 0) this.beginMusicFade(active, 1, this.musicFadeDuration);
      else if (!this.musicTransition && active.level < 1) this.beginMusicFade(active, 1, this.musicFadeDuration);
      else this.runMusicFade();
    }
    tone(frequency, duration, strength, delay, glide) {
      const ctx = this.context;
      if (!this.enabled || !(this.volume > 0) || !ctx || ctx.state !== 'running' || this.voices >= P.SOUND_CONFIG.voices) return;
      const theme = P.SOUND_CONFIG.themes[this.theme] || P.SOUND_CONFIG.themes.cosmic;
      duration *= theme.decay || 1;
      const start = ctx.currentTime + (delay || 0);
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      oscillator.type = theme.wave;
      oscillator.frequency.setValueAtTime(frequency, start);
      if (glide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, glide), start + duration);
      filter.type = 'lowpass';
      filter.frequency.value = theme.filter;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, strength), start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      this.voices++;
      oscillator.onended = () => {
        this.voices--;
        oscillator.disconnect(); filter.disconnect(); gain.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    }
    blastBody(power) {
      const ctx = this.context;
      if (!this.enabled || !(this.volume > 0) || !ctx || ctx.state !== 'running' || this.voices >= P.SOUND_CONFIG.voices) return;
      const start = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(150 + power * 40, start);
      oscillator.frequency.exponentialRampToValueAtTime(48, start + 0.12);
      oscillator.frequency.exponentialRampToValueAtTime(34, start + 0.62);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2 + power * 0.14, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.035, start + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.62);
      oscillator.connect(gain);
      gain.connect(this.master);
      this.voices++;
      oscillator.onended = () => {
        this.voices--;
        oscillator.disconnect(); gain.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + 0.65);
    }
    air(duration, strength, delay, lowStart, lowEnd, highpass) {
      const ctx = this.context;
      if (!this.enabled || !(this.volume > 0) || !ctx || ctx.state !== 'running' || this.voices >= P.SOUND_CONFIG.voices) return;
      if (!this.noiseBuffer) {
        this.noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.9), ctx.sampleRate);
        const samples = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      const start = ctx.currentTime + (delay || 0);
      const source = ctx.createBufferSource();
      const high = ctx.createBiquadFilter();
      const low = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      source.buffer = this.noiseBuffer;
      high.type = 'highpass'; high.frequency.value = highpass;
      low.type = 'lowpass';
      low.Q.value = 0.55;
      low.frequency.setValueAtTime(lowStart, start);
      low.frequency.exponentialRampToValueAtTime(lowEnd, start + duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(strength, start + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(high); high.connect(low); low.connect(gain); gain.connect(this.master);
      this.voices++;
      source.onended = () => {
        this.voices--;
        source.disconnect(); high.disconnect(); low.disconnect(); gain.disconnect();
      };
      source.start(start);
      source.stop(start + duration + 0.02);
    }
    play(type, intensity, variant) {
      if (!this.enabled || !(this.volume > 0) || !this.context) return;
      const config = P.SOUND_CONFIG;
      // Music carries the melody. Visual leader/finish notifications need no
      // repeating fanfare, especially with fifty marbles and dense terrain.
      if (type === 'lead' || type === 'win') return;
      if (type === 'finish') {
        if (this.finishedCuePlayed) return;
        this.finishedCuePlayed = true;
      }
      if (type === 'hit' || type === 'bumper') {
        if (this.context.currentTime - this.lastHit < config.hitInterval) return;
        this.lastHit = this.context.currentTime;
      } else if (!['launch','cannon','finish'].includes(type)) {
        if (this.context.currentTime - this.lastNotice < .55) return;
        this.lastNotice = this.context.currentTime;
      }
      const theme = config.themes[this.theme] || config.themes.cosmic;
      const root = theme.root;
      const power = Math.max(0.1, Math.min(1, Number(intensity) || 0.5));
      if (type === 'launch') {
        this.air(.22, .045, 0, 3600, 800, 160);
      } else if (type === 'cannon') {
        // Three restrained layers give the muzzle flash a sharp attack and a deep tail.
        this.blastBody(power);
        this.air(0.19, 0.06 + power * 0.05, 0, 4600, 1000, 180);
        this.air(0.58, 0.04 + power * 0.045, 0.025, 2000, 300, 90);
      } else if (type === 'charge') {
        this.air(0.36, 0.022, 0, 700, 1500, 350);
        this.tone(root * 3.2, 0.075, 0.035, 0.12, root * 1.2);
      } else if (type === 'hit') {
        this.tone(root * 2, .055, .012 + power * .018, 0, root * 1.5);
      } else if (type === 'bumper') {
        this.tone(root * 2, .10, .04, 0, root * 1.5);
      } else if (type === 'skill' && variant === 'pulse') {
        this.tone(root * 0.75, 0.3, 0.18, 0, root * 0.35);
        this.tone(root * 3, 0.12, 0.07, 0.03, root * 1.5);
      } else if (type === 'skill' && variant === 'grow') {
        this.tone(root * 0.8, 0.4, 0.13, 0, root * 1.6);
        this.tone(root * 1.2, 0.3, 0.09, 0.12, root * 2.4);
      } else if (type === 'boost' || type === 'skill') {
        this.tone(root, 0.28, 0.15, 0, root * 4);
        this.tone(root * 1.5, 0.25, 0.06, 0.025, root * 6);
      } else if (type === 'portal') {
        this.tone(root * 4, 0.38, 0.18, 0, root * 0.5);
        this.tone(root * 3, 0.3, 0.08, 0.04, root);
      } else if (type === 'countdown') {
        this.tone(root * 2, 0.25, 0.2, 0);
        this.tone(root * 4, 0.15, 0.07, 0.03);
      } else if (type === 'go') {
        [1, 1.25, 1.5, 2].forEach((note, i) => this.tone(root * note * 2, 0.32, 0.17, i * 0.055));
      } else if (type === 'finish') {
        this.tone(root * 2, .10, .03, 0);

      }
    }
  }
  P.AudioEngine = AudioEngine;
})();
