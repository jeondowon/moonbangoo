// M9 핵심 효과음. AudioContext는 브라우저의 첫 사용자 입력에서만 생성한다.
type Clip = 'tear' | 'swipe' | 'confirm';

const URLS: Record<Clip, string> = {
  tear: new URL('./assets/tear.mp3', import.meta.url).href,
  swipe: new URL('./assets/swipe.mp3', import.meta.url).href,
  confirm: new URL('./assets/confirm.mp3', import.meta.url).href,
};

const CLIPS: Clip[] = ['tear', 'swipe', 'confirm'];
const GRAIN_LENGTH = 0.12;
const GRAIN_INTERVAL = 0.045;

export class SoundEffects {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private downloads: Partial<Record<Clip, Promise<ArrayBuffer | null>>> = {};
  private buffers: Partial<Record<Clip, AudioBuffer>> = {};
  private grains: { gain: GainNode; startsAt: number; endsAt: number; level: number }[] = [];
  private lastCutAt = -Infinity;
  private lastGrainAt = -Infinity;
  private grainIndex = 0;

  /** 다운로드만 미리 시작한다. 오디오 장치는 아직 열지 않는다. */
  preload() {
    for (const clip of CLIPS) {
      this.downloads[clip] ??= fetch(URLS[clip])
        .then((response) => response.ok ? response.arrayBuffer() : null)
        .catch(() => null);
    }
  }

  /** 인트로 클릭·키 입력 핸들러에서 직접 호출해야 모바일 자동재생 제한을 통과한다. */
  async unlock() {
    if (typeof AudioContext === 'undefined') return;
    if (!this.context) {
      try {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0.55;
        this.master.connect(this.context.destination);
      } catch {
        return;
      }
    }
    const context = this.context;
    try {
      await context.resume();
    } catch {
      return;
    }
    this.preload();
    await Promise.all(CLIPS.map(async (clip) => {
      if (this.buffers[clip]) return;
      const bytes = await this.downloads[clip];
      if (!bytes) return;
      try {
        this.buffers[clip] = await context.decodeAudioData(bytes.slice(0));
      } catch {
        // 효과음 하나가 손상되어도 나머지 연출은 계속한다.
      }
    }));
  }

  /** 실제로 새로 잘린 구간에서만 호출한다. speed는 팩 폭 비율/초. */
  cut(amount: number, speed: number) {
    if (amount <= 0 || !Number.isFinite(speed)) return;
    const context = this.context;
    const buffer = this.buffers.tear;
    if (!context || context.state !== 'running' || !buffer || !this.master) return;
    const now = context.currentTime;
    this.lastCutAt = now;
    if (now - this.lastGrainAt < GRAIN_INTERVAL) return;
    this.lastGrainAt = now;
    this.grains = this.grains.filter((grain) => grain.endsAt > now);

    const motion = Math.min(1, Math.max(0, speed / 3));
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = 0.75 + motion * 0.65;
    source.connect(gain).connect(this.master);
    const level = 0.035 + motion * 0.11;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + 0.015);
    gain.gain.setValueAtTime(level, now + 0.085);
    gain.gain.linearRampToValueAtTime(0, now + GRAIN_LENGTH);
    // 팩 개봉 원본의 초반 마찰 구간만 순환한다. 뒷부분은 거의 무음이라 연속 절취에 맞지 않는다.
    const offset = Math.min(Math.max(0, buffer.duration - GRAIN_LENGTH), 0.055 + (this.grainIndex++ % 3) * 0.04);
    source.start(now, offset, Math.min(GRAIN_LENGTH, buffer.duration - offset));
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    this.grains.push({ gain, startsAt: now, endsAt: now + GRAIN_LENGTH, level });
  }

  /** 절취선 이탈·입력 종료·정지 시 남은 마찰음을 바로 줄인다. */
  updateCut(active: boolean) {
    const now = this.context?.currentTime;
    if (now === undefined || (active && now - this.lastCutAt < 0.08)) return;
    this.stopCut();
  }

  completeCut() {
    this.stopCut();
    this.play('tear', 0.18, 1.05);
  }

  swipe() { this.play('swipe', 0.16); }
  confirm() { this.play('confirm', 0.045); }

  private stopCut() {
    const context = this.context;
    if (!context || !this.grains.length) return;
    const now = context.currentTime;
    for (const { gain, startsAt, endsAt, level } of this.grains) {
      if (endsAt <= now) continue;
      const age = now - startsAt;
      const current = age < 0.015 ? level * Math.max(0, age / 0.015)
        : age < 0.085 ? level
          : level * Math.max(0, (GRAIN_LENGTH - age) / (GRAIN_LENGTH - 0.085));
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(current, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.02);
    }
    this.grains = [];
    this.lastGrainAt = -Infinity;
  }

  private play(clip: Clip, level: number, rate = 1) {
    const context = this.context;
    const buffer = this.buffers[clip];
    if (!context || context.state !== 'running' || !buffer || !this.master) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.value = level;
    source.connect(gain).connect(this.master);
    source.start();
    source.onended = () => { source.disconnect(); gain.disconnect(); };
  }
}
