// 코인 효과음. 파일 없이 합성한다: 금속 울림(비조화 배음), 바람 소리(걸러낸 잡음), 바닥 두드림.
// AudioContext는 첫 터치 핸들러에서만 만든다 (모바일 자동재생 제한).

// 동전이 부딪힐 때 울리는 비조화 배음 (Hz)과 감쇠 시간
const PARTIALS = [
  [3150, 0.32],
  [4870, 0.22],
  [7130, 0.14],
  [9620, 0.09],
] as const;

export class CoinSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;

  unlock() {
    if (typeof AudioContext === 'undefined') return;
    if (!this.ctx) {
      try {
        const ctx = new AudioContext();
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.gain.value = 0.7;
        this.master.connect(ctx.destination);
        this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        // 바람 소리는 계속 틀어 두고 크기만 바꾼다
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 1.4;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(filter).connect(gain).connect(this.master);
        src.start();
        this.wind = { gain, filter };
      } catch {
        return;
      }
    }
    this.ctx.resume().catch(() => {});
  }

  private get live() {
    return this.ctx?.state === 'running' ? this.ctx : null;
  }

  /** 공중 회전 소리. spin: 0~1 */
  setWind(spin: number) {
    const ctx = this.live;
    if (!ctx || !this.wind) return;
    const now = ctx.currentTime;
    this.wind.gain.gain.setTargetAtTime(spin * spin * 0.22, now, 0.06);
    this.wind.filter.frequency.setTargetAtTime(380 + spin * 1600, now, 0.06);
  }

  /** 금속끼리·바닥에 부딪히는 소리. pitch: 배음 배율 */
  clink(strength: number, pitch = 1) {
    const ctx = this.live;
    if (!ctx) return;
    const now = ctx.currentTime;
    const detune = 0.97 + Math.random() * 0.06;
    for (const [freq, decay] of PARTIALS) {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq * pitch * detune;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12 * strength, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay * (0.5 + strength));
      osc.connect(gain).connect(this.master!);
      osc.start(now);
      osc.stop(now + decay * 1.5 + 0.05);
    }
    this.burst(now, 0.015, 0.5 * strength, 3200);
  }

  /** 눕기 직전 가장자리가 바닥을 두드리는 소리 */
  tick(strength: number) {
    const ctx = this.live;
    if (!ctx) return;
    this.burst(ctx.currentTime, 0.008, 0.08 + 0.3 * strength, 2600);
  }

  private burst(at: number, length: number, level: number, freq: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(at, Math.random() * 0.5, length + 0.01);
  }
}
