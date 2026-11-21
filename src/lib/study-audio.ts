/**
 * 书斋清音：纯 Web Audio API 程序化合成（零外部音频文件）。
 *
 * 独立成模块，由 ReadingSettings 在读者**首次选择音效时**动态 import ——
 * 它只在极少数会话里用到，不该进每个路由都要下载的共享 JS。
 */
export type SoundMode = "none" | "guqin" | "rain";

export class StudyAudioEngine {
  private ctx: AudioContext | null = null;
  private noiseNode: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private guqinTimer: number | null = null;
  private currentMode: SoundMode = "none";

  private ensureContext(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private createPinkNoiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
    const bufferSize = ctx.sampleRate * seconds;
    const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.76160 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    }
    return buffer;
  }

  public stop() {
    this.currentMode = "none";
    if (this.guqinTimer) {
      window.clearTimeout(this.guqinTimer);
      this.guqinTimer = null;
    }
    if (this.lfo) {
      try { this.lfo.stop(); this.lfo.disconnect(); } catch {}
      this.lfo = null;
    }
    if (this.noiseNode) {
      try { this.noiseNode.stop(); this.noiseNode.disconnect(); } catch {}
      this.noiseNode = null;
    }
    if (this.noiseGain) {
      try { this.noiseGain.disconnect(); } catch {}
      this.noiseGain = null;
    }
    if (this.filter) {
      try { this.filter.disconnect(); } catch {}
      this.filter = null;
    }
    if (this.ctx && this.ctx.state !== "closed") {
      try { this.ctx.suspend(); } catch {}
    }
  }

  public playRain() {
    this.stop();
    this.currentMode = "rain";
    const ctx = this.ensureContext();

    // 竹林听雨：双声道粉红噪声缓冲区 + BiquadFilterNode (lowpass 800Hz + 缓慢 LFO 调制)
    // 音量控制在 gain = 0.04
    const pinkBuffer = this.createPinkNoiseBuffer(ctx, 4);
    const noise = ctx.createBufferSource();
    noise.buffer = pinkBuffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(800, ctx.currentTime);
    filter.Q.setValueAtTime(1.2, ctx.currentTime);

    // 缓慢 LFO 调制 0.15Hz（沙沙微风雨韵）
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.15, ctx.currentTime);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(150, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.04, ctx.currentTime);

    noise.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(ctx.destination);
    noise.start();

    this.noiseNode = noise;
    this.filter = filter;
    this.lfo = lfo;
    this.noiseGain = masterGain;
  }

  public playGuqin() {
    this.stop();
    this.currentMode = "guqin";
    const ctx = this.ensureContext();

    // 极轻柔底噪（超低音量粉红噪声）
    const pinkBuffer = this.createPinkNoiseBuffer(ctx, 4);
    const noise = ctx.createBufferSource();
    noise.buffer = pinkBuffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(320, ctx.currentTime);

    const floorGain = ctx.createGain();
    floorGain.gain.setValueAtTime(0.008, ctx.currentTime);

    noise.connect(filter);
    filter.connect(floorGain);
    floorGain.connect(ctx.destination);
    noise.start();

    this.noiseNode = noise;
    this.noiseGain = floorGain;

    // 中国五声音阶：宫商角徵羽
    const PENTATONIC = [130.81, 146.83, 164.81, 196.00, 220.00, 261.63];

    const pluck = (freq: number) => {
      if (this.currentMode !== "guqin" || !this.ctx || this.ctx.state === "closed") return;
      const now = this.ctx.currentTime;

      // 古琴正弦 + 泛音包络：快速起音 0.08s，悠长古琴余韵指数衰减 4.2s
      const harmonics = [
        { mult: 1, gain: 0.08, decay: 4.2 },
        { mult: 2, gain: 0.035, decay: 3.2 },
        { mult: 3, gain: 0.015, decay: 2.4 },
      ];

      harmonics.forEach(({ mult, gain, decay }) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq * mult, now);

        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(gain, now + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, now + decay);

        osc.connect(g);
        g.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + decay + 0.1);
      });
    };

    const scheduleNext = () => {
      if (this.currentMode !== "guqin") return;
      const freq = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)] ?? 196.00;
      pluck(freq);

      const nextDelay = 4500 + Math.random() * 2500;
      this.guqinTimer = window.setTimeout(scheduleNext, nextDelay);
    };

    scheduleNext();
  }
}

