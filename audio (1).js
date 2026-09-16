// Procedural monsoon: rain, waves, temple bell, a quiet raga-like pad.

let ctx, master, rainGain, waveGain, padGain, started = false;

function noiseBuffer(c, seconds = 2) {
  const n = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function makeNoise(c, dest, type, freq, q, vol) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 3);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(dest);
  src.start();
  return g;
}

export async function startAudio() {
  if (started) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") await ctx.resume();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);

  rainGain = makeNoise(ctx, master, "bandpass", 1200, 0.6, 0.0);
  waveGain = makeNoise(ctx, master, "lowpass", 380, 0.7, 0.0);
  windGain = makeNoise(ctx, master, "highpass", 220, 0.45, 0.0);

  padGain = ctx.createGain();
  padGain.gain.value = 0.0;
  padGain.connect(master);
  // Mohanam-ish: D E F# A B
  const notes = [146.83, 164.81, 185.0, 220.0, 246.94, 293.66];
  notes.forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = i % 2 ? "sine" : "triangle";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.04 / (i + 1);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.04 + i * 0.01;
    const lg = ctx.createGain();
    lg.gain.value = 4;
    lfo.connect(lg); lg.connect(o.frequency);
    o.connect(g); g.connect(padGain);
    o.start(); lfo.start();
  });

  started = true;
}

export function setAmbience({ rain = 0.2, waves = 0.05, pad = 0.08, wind = 0.08 } = {}) {
  if (!started) return;
  const t = ctx.currentTime;
  rainGain.gain.linearRampToValueAtTime(rain, t + 1.2);
  waveGain.gain.linearRampToValueAtTime(waves, t + 1.2);
  padGain.gain.linearRampToValueAtTime(pad, t + 1.6);
  if (windGain) windGain.gain.linearRampToValueAtTime(wind, t + 1.4);
}

export function bell() {
  if (!started) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(392, t);
  o.frequency.exponentialRampToValueAtTime(196, t + 2.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.18, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 2.6);
  const o2 = ctx.createOscillator();
  o2.frequency.value = 784;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.06, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
  o.connect(g); g.connect(master);
  o2.connect(g2); g2.connect(master);
  o.start(t); o.stop(t + 2.7);
  o2.start(t); o2.stop(t + 1.5);
}

export function click() {
  if (!started) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.frequency.value = 880;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.04, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + 0.09);
}

export function shutter() {
  if (!started) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = "square";
  o.frequency.value = 180;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.08, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + 0.13);
}
