// Synthesized sound effects (Web Audio, no audio files).
(function (root) {
  let ctx = null, on = true;
  try { on = localStorage.getItem('ca-sound') !== '0'; } catch (e) {}
  function ac() {
    if (!ctx) { const C = root.AudioContext || root.webkitAudioContext; if (!C) return null; ctx = new C(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // Mobile browsers only allow audio after a user gesture.
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => root.addEventListener(ev, ac, { once: true, passive: true }));

  // Wooden "tock": a filtered noise click plus a short low thump.
  function knock(t, freq, gain, dur) {
    const c = ctx, len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 5);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.4;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(bp).connect(g).connect(c.destination); src.start(t);
    const o = c.createOscillator(), og = c.createGain();
    o.frequency.setValueAtTime(freq / 6, t); o.frequency.exponentialRampToValueAtTime(freq / 12, t + dur);
    og.gain.setValueAtTime(gain * 0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(og).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function tone(t, f, dur, gain, type) {
    const c = ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const SOUNDS = {
    move: t => knock(t, 1700, 1.0, 0.07),
    capture: t => { knock(t, 1100, 1.4, 0.11); knock(t + 0.045, 2300, 0.8, 0.06); },
    castle: t => { knock(t, 1700, 1.0, 0.07); knock(t + 0.12, 1500, 0.9, 0.07); },
    check: t => { knock(t, 1700, 1.0, 0.07); tone(t + 0.02, 988, 0.22, 0.12, 'triangle'); },
    promote: t => { knock(t, 1700, 1.0, 0.07); [784, 988, 1319].forEach((f, i) => tone(t + 0.06 + i * 0.07, f, 0.2, 0.09, 'triangle')); },
    start: t => [523, 784].forEach((f, i) => tone(t + i * 0.12, f, 0.3, 0.12, 'triangle')),
    win: t => [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.11, f, 0.4, 0.12, 'triangle')),
    lose: t => [440, 349, 262].forEach((f, i) => tone(t + i * 0.16, f, 0.45, 0.12, 'sine')),
    draw: t => [523, 523].forEach((f, i) => tone(t + i * 0.16, f, 0.3, 0.1, 'triangle')),
    low: t => tone(t, 1200, 0.08, 0.08, 'square')
  };
  function play(kind) {
    if (!on || !SOUNDS[kind]) return;
    const c = ac(); if (!c) return;
    try { SOUNDS[kind](c.currentTime + 0.01); } catch (e) {}
  }
  const kindForSan = san => /#|\+/.test(san) ? 'check' : /=/.test(san) ? 'promote' : /^O-O/.test(san) ? 'castle' : /x/.test(san) ? 'capture' : 'move';
  root.Sound = {
    play, forSan: san => play(kindForSan(san)),
    get on() { return on; },
    toggle() { on = !on; try { localStorage.setItem('ca-sound', on ? '1' : '0'); } catch (e) {} if (on) play('move'); return on; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
