// Procedural audio for backrooms ambience
export class BackroomsAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private started = false;
  private lastFootstep = 0;

  async start() {
    if (this.started) return;
    this.started = true;

    try {
      this.ctx = new AudioContext();
      // Browser blocks audio until user interaction — resume it
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.6;
      this.masterGain.connect(this.ctx.destination);

      // Fluorescent light buzzing (120Hz hum)
      const buzzGain = this.ctx.createGain();
      buzzGain.gain.value = 0.25;
      buzzGain.connect(this.masterGain);

      const buzzOsc = this.ctx.createOscillator();
      buzzOsc.type = 'sawtooth';
      buzzOsc.frequency.value = 120;

      const buzzFilter = this.ctx.createBiquadFilter();
      buzzFilter.type = 'bandpass';
      buzzFilter.frequency.value = 120;
      buzzFilter.Q.value = 5;

      buzzOsc.connect(buzzFilter);
      buzzFilter.connect(buzzGain);
      buzzOsc.start();

      // Second harmonic (60Hz mains hum)
      const buzzOsc2 = this.ctx.createOscillator();
      buzzOsc2.type = 'sine';
      buzzOsc2.frequency.value = 60;
      const buzzGain2 = this.ctx.createGain();
      buzzGain2.gain.value = 0.15;
      buzzOsc2.connect(buzzGain2);
      buzzGain2.connect(this.masterGain);
      buzzOsc2.start();

      // Low rumble / ambient noise
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.02 * white) / 1.02;
        data[i] = lastOut * 3.5;
      }

      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;

      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.value = 200;

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.value = 0.4;

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noiseSource.start();
    } catch {
      // Audio not supported
    }
  }

  playFootstep() {
    if (!this.ctx || !this.masterGain) return;
    // Resume if suspended (e.g. after tab switch)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    const now = this.ctx.currentTime;
    if (now - this.lastFootstep < 0.2) return;
    this.lastFootstep = now;

    try {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 70 + Math.random() * 50;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.15);

      // Add a noise click for carpet sound
      const bufLen = Math.floor(this.ctx.sampleRate * 0.06);
      const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        d[i] = (Math.random() * 2 - 1) * (1 - i / bufLen) * 0.5;
      }
      const nSrc = this.ctx.createBufferSource();
      nSrc.buffer = buf;
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.15, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      const nFilt = this.ctx.createBiquadFilter();
      nFilt.type = 'highpass';
      nFilt.frequency.value = 300;
      nSrc.connect(nFilt);
      nFilt.connect(nGain);
      nGain.connect(this.masterGain);
      nSrc.start(now);
      nSrc.stop(now + 0.06);
    } catch {
      // ignore
    }
  }

  // Ceiling tile crash — heavy thud + crumble
  playCrash() {
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    try {
      const now = this.ctx.currentTime;

      // Low impact thud
      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(65, now);
      osc1.frequency.exponentialRampToValueAtTime(25, now + 0.3);
      const gain1 = this.ctx.createGain();
      gain1.gain.setValueAtTime(0.7, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc1.connect(gain1);
      gain1.connect(this.masterGain);
      osc1.start(now);
      osc1.stop(now + 0.5);

      // Noise burst — crumble / debris
      const bufLen = Math.floor(this.ctx.sampleRate * 0.4);
      const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buf;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.5, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      const noiseFilt = this.ctx.createBiquadFilter();
      noiseFilt.type = 'lowpass';
      noiseFilt.frequency.value = 900;
      noise.connect(noiseFilt);
      noiseFilt.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.4);

      // Mid crack
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(220, now);
      osc2.frequency.exponentialRampToValueAtTime(80, now + 0.12);
      const gain2 = this.ctx.createGain();
      gain2.gain.setValueAtTime(0.35, now);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc2.connect(gain2);
      gain2.connect(this.masterGain);
      osc2.start(now);
      osc2.stop(now + 0.15);
    } catch {
      // ignore
    }
  }

  stop() {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.started = false;
  }
}
