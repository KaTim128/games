/* Procedural sound — no asset files. Everything is built from a couple of
   oscillators and one noise buffer, created lazily on the first gesture. */
(function (FROG) {
  'use strict';

  const { clamp, storage } = FROG.util;

  const Sfx = {
    ctx: null,
    ready: false,
    muted: storage.get('froggy.muted', false),

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { return; }
      const ctx = this.ctx;

      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(ctx.destination);

      /* Engine: two detuned saws through a lowpass. */
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineFilter = ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 700;
      this.engineGain.connect(this.master);
      this.engineFilter.connect(this.engineGain);
      this.engineOsc = [];
      for (let i = 0; i < 2; i++) {
        const o = ctx.createOscillator();
        o.type = i ? 'square' : 'sawtooth';
        o.frequency.value = 60;
        o.detune.value = i ? 12 : -8;
        o.connect(this.engineFilter);
        o.start();
        this.engineOsc.push(o);
      }

      /* Siren: two-tone wail, volume follows how close the cops are. */
      this.sirenGain = ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenGain.connect(this.master);
      this.sirenOsc = ctx.createOscillator();
      this.sirenOsc.type = 'square';
      this.sirenOsc.frequency.value = 700;
      const sirenShape = ctx.createGain();
      sirenShape.gain.value = 0.09;
      this.sirenOsc.connect(sirenShape);
      sirenShape.connect(this.sirenGain);
      this.sirenOsc.start();

      /* Noise buffer reused by crashes, tyre scrub and boost. */
      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 900;
      windFilter.Q.value = 0.7;
      this.windGain.connect(this.master);
      windFilter.connect(this.windGain);
      const wind = ctx.createBufferSource();
      wind.buffer = this.noiseBuf;
      wind.loop = true;
      wind.connect(windFilter);
      wind.start();

      this.ready = true;
    },

    resume() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    setMuted(m) {
      this.muted = m;
      storage.set('froggy.muted', m);
      if (this.master) this.master.gain.value = m ? 0 : 0.6;
    },
    toggleMute() { this.setMuted(!this.muted); return this.muted; },

    /* Continuous layers, driven every frame. */
    drive(speed01, boosting, sirenLevel, offRoad) {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      const f = 58 + speed01 * 150 + (boosting ? 26 : 0);
      this.engineOsc[0].frequency.setTargetAtTime(f, t, 0.05);
      this.engineOsc[1].frequency.setTargetAtTime(f * 1.5, t, 0.05);
      this.engineFilter.frequency.setTargetAtTime(500 + speed01 * 1500, t, 0.1);
      this.engineGain.gain.setTargetAtTime(0.16 + speed01 * 0.12, t, 0.1);
      this.windGain.gain.setTargetAtTime(speed01 * 0.05 + (offRoad ? 0.09 : 0), t, 0.12);
      this.sirenGain.gain.setTargetAtTime(clamp(sirenLevel, 0, 1) * 0.9, t, 0.2);
      if (sirenLevel > 0.02) {
        const wail = 620 + 320 * (0.5 + 0.5 * Math.sin(t * 5.2));
        this.sirenOsc.frequency.setTargetAtTime(wail, t, 0.05);
      }
    },

    silence() {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      this.engineGain.gain.setTargetAtTime(0, t, 0.1);
      this.sirenGain.gain.setTargetAtTime(0, t, 0.15);
      this.windGain.gain.setTargetAtTime(0, t, 0.1);
    },

    noise(dur, freq, gain, type) {
      if (!this.ready) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = type || 'lowpass';
      f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t);
      src.stop(t + dur + 0.05);
    },

    blip(freq, dur, type, gain) {
      if (!this.ready) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'triangle';
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(gain == null ? 0.22 : gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    },

    crash() { this.noise(0.5, 1400, 0.6); this.blip(90, 0.4, 'square', 0.2); },
    scrape() { this.noise(0.25, 2600, 0.22, 'highpass'); },
    pickup() { this.blip(880, 0.1); setTimeout(() => this.blip(1320, 0.12), 70); },
    boost() { this.noise(0.6, 600, 0.3, 'highpass'); this.blip(200, 0.3, 'sawtooth', 0.12); },
    nearMiss() { this.noise(0.3, 1800, 0.18, 'bandpass'); },
    wreck() { this.noise(0.7, 900, 0.55); this.blip(140, 0.6, 'square', 0.18); },
    busted() {
      [520, 440, 330, 220].forEach((f, i) => setTimeout(() => this.blip(f, 0.35, 'square', 0.2), i * 180));
    },
    levelUp() {
      [660, 880, 1100].forEach((f, i) => setTimeout(() => this.blip(f, 0.14), i * 90));
    }
  };

  FROG.sfx = Sfx;
})(window.FROG);
