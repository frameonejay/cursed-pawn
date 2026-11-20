'use strict';

/* ══════════════════════════════════════════════════════════════════════════
   CURSED PAWN — js/audio.js
   외부 사운드 파일 없이 Web Audio API 로만 만드는 신디사이저 SFX.
   주사위 달그락 / 홀드 틱 / 정산 콤보 상승음 / 코인 짤랑 / 보스 경고 / 승리 팡파레
   ────────────────────────────────────────────────────────────────────────── */

(function (global) {
  var ctx = null;
  var master = null;
  var compressor = null;
  var noiseBuffer = null;
  var enabled = true;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      return ctx;
    }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;

    ctx = new AC();

    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 22;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    master = ctx.createGain();
    master.gain.value = enabled ? 0.5 : 0;
    master.connect(compressor);
    compressor.connect(ctx.destination);

    // 1초짜리 화이트노이즈 버퍼 (달그락/휘슬/타격음의 재료)
    var len = Math.floor(ctx.sampleRate * 1.0);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    return ctx;
  }

  function setEnabled(on) {
    enabled = !!on;
    if (master) master.gain.value = enabled ? 0.5 : 0;
  }

  function isEnabled() {
    return enabled;
  }

  /* ── 기본 음색 ─────────────────────────────────────────── */
  function tone(opt) {
    if (!enabled) return;
    var c = ensure();
    if (!c) return;

    var freq = opt.freq || 440;
    var freqTo = opt.freqTo || null;
    var type = opt.type || 'sine';
    var dur = opt.dur || 0.2;
    var gain = opt.gain == null ? 0.15 : opt.gain;
    var delay = opt.delay || 0;
    var attack = opt.attack == null ? 0.006 : opt.attack;
    var detune = opt.detune || 0;

    var t0 = c.currentTime + delay;
    var osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (freqTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t0 + dur);
    if (detune) osc.detune.value = detune;

    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    var node = osc;
    if (opt.filter) {
      var f = c.createBiquadFilter();
      f.type = opt.filter.type || 'lowpass';
      f.frequency.setValueAtTime(opt.filter.freq || 1200, t0);
      if (opt.filter.freqTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, opt.filter.freqTo), t0 + dur);
      f.Q.value = opt.filter.q == null ? 1 : opt.filter.q;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.06);
  }

  function noise(opt) {
    if (!enabled) return;
    var c = ensure();
    if (!c) return;

    var dur = opt.dur || 0.08;
    var gain = opt.gain == null ? 0.15 : opt.gain;
    var delay = opt.delay || 0;
    var freq = opt.freq || 1400;
    var freqTo = opt.freqTo || null;
    var q = opt.q == null ? 1.2 : opt.q;
    var type = opt.type || 'bandpass';

    var t0 = c.currentTime + delay;
    var src = c.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    var f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, freqTo), t0 + dur);
    f.Q.value = q;

    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /* ── 게임 사운드 ───────────────────────────────────────── */
  var Sound = {
    unlock: function () {
      ensure();
    },

    setEnabled: setEnabled,
    isEnabled: isEnabled,

    /* UI */
    click: function () {
      tone({ freq: 340, freqTo: 260, type: 'triangle', dur: 0.055, gain: 0.06 });
    },
    hover: function () {
      tone({ freq: 720, type: 'sine', dur: 0.03, gain: 0.018 });
    },
    error: function () {
      tone({ freq: 150, freqTo: 110, type: 'square', dur: 0.09, gain: 0.07 });
      tone({ freq: 120, freqTo: 90, type: 'square', dur: 0.12, gain: 0.05, delay: 0.1 });
    },
    select: function () {
      tone({ freq: 620, freqTo: 880, type: 'triangle', dur: 0.07, gain: 0.05 });
    },

    /* 주사위 굴림: 뼈 주사위가 나무 탁자에 부딪히는 소리 */
    dice: function (count) {
      var n = count || 5;
      for (var i = 0; i < n; i++) {
        var d = i * 0.048 + Math.random() * 0.045;
        noise({
          delay: d,
          dur: 0.06 + Math.random() * 0.05,
          gain: 0.14 + Math.random() * 0.06,
          freq: pick([900, 1200, 1600, 2100, 2600]),
          freqTo: pick([380, 520, 700]),
          q: 1.6
        });
        tone({
          delay: d + 0.005,
          freq: pick([140, 160, 190, 220]),
          freqTo: pick([90, 110]),
          type: 'triangle',
          dur: 0.055,
          gain: 0.05
        });
      }
      // 마지막에 굴러 멈추는 낮은 통통
      noise({ delay: n * 0.05 + 0.08, dur: 0.12, gain: 0.07, freq: 500, freqTo: 200, q: 0.9 });
    },

    reroll: function () {
      noise({ dur: 0.28, gain: 0.09, freq: 300, freqTo: 3200, q: 0.8, type: 'bandpass' });
      noise({ delay: 0.09, dur: 0.22, gain: 0.07, freq: 2600, freqTo: 500, q: 1.1 });
      Sound.dice(4);
    },

    hold: function (on) {
      if (on) {
        tone({ freq: 880, freqTo: 1180, type: 'square', dur: 0.045, gain: 0.035, filter: { type: 'lowpass', freq: 2400 } });
        noise({ dur: 0.03, gain: 0.05, freq: 3200, q: 2 });
      } else {
        tone({ freq: 620, freqTo: 420, type: 'square', dur: 0.05, gain: 0.03, filter: { type: 'lowpass', freq: 2000 } });
      }
    },

    /* 정산: 단계별로 음이 올라가는 콤보 상승음 */
    score: function (step, totalSteps) {
      var scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
      var idx = Math.max(0, Math.min(scale.length - 1, step));
      var freq = 392 * Math.pow(2, scale[idx] / 12);
      tone({ freq: freq, type: 'triangle', dur: 0.16, gain: 0.075, filter: { type: 'lowpass', freq: 4000 } });
      tone({ freq: freq * 2, type: 'sine', dur: 0.12, gain: 0.025 });
      if (step > 0 && step % 4 === 0) {
        tone({ freq: freq / 2, type: 'sine', dur: 0.22, gain: 0.05 });
      }
    },

    scoreTotal: function () {
      var notes = [523.25, 659.25, 783.99];
      for (var i = 0; i < notes.length; i++) {
        tone({ freq: notes[i], type: 'triangle', dur: 0.32, gain: 0.06, delay: i * 0.045 });
        tone({ freq: notes[i] * 2, type: 'sine', dur: 0.2, gain: 0.02, delay: i * 0.045 });
      }
      noise({ dur: 0.3, gain: 0.05, freq: 6000, q: 0.7, type: 'highpass', delay: 0.02 });
    },

    /* 동전 짤랑 */
    coins: function (count) {
      var n = count || 3;
      var base = [1568, 1760, 2093, 2349, 2637, 3136];
      for (var i = 0; i < n; i++) {
        var f = base[(i + Math.floor(Math.random() * 2)) % base.length];
        tone({ freq: f, type: 'sine', dur: 0.13, gain: 0.04, delay: i * 0.055 });
        tone({ freq: f * 1.5, type: 'sine', dur: 0.08, gain: 0.02, delay: i * 0.055 + 0.01 });
      }
      noise({ dur: 0.12, gain: 0.035, freq: 5200, q: 0.8, type: 'highpass' });
    },

    buy: function () {
      Sound.coins(2);
      tone({ freq: 180, freqTo: 120, type: 'triangle', dur: 0.12, gain: 0.06 });
    },

    curse: function () {
      tone({ freq: 58, type: 'sawtooth', dur: 1.4, gain: 0.07, attack: 0.08, filter: { type: 'lowpass', freq: 320, freqTo: 140 } });
      tone({ freq: 61.5, type: 'sawtooth', dur: 1.4, gain: 0.06, attack: 0.1, filter: { type: 'lowpass', freq: 280, freqTo: 120 } });
      tone({ freq: 87, type: 'sine', dur: 1.6, gain: 0.05, attack: 0.2 });
      noise({ dur: 1.2, gain: 0.05, freq: 220, freqTo: 90, q: 0.6, type: 'bandpass' });
    },

    boss: function () {
      Sound.curse();
      noise({ delay: 0.1, dur: 0.5, gain: 0.08, freq: 1200, freqTo: 200, q: 1.2 });
    },

    charm: function () {
      var notes = [1046.5, 1318.5, 1568, 2093];
      for (var i = 0; i < notes.length; i++) {
        tone({ freq: notes[i], type: 'sine', dur: 0.28, gain: 0.035, delay: i * 0.035 });
      }
      noise({ dur: 0.4, gain: 0.03, freq: 7000, q: 0.6, type: 'highpass' });
    },

    win: function () {
      var seq = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      for (var i = 0; i < seq.length; i++) {
        tone({ freq: seq[i], type: 'triangle', dur: 0.36, gain: 0.08, delay: i * 0.13 });
        tone({ freq: seq[i] * 2, type: 'sine', dur: 0.26, gain: 0.03, delay: i * 0.13 });
      }
      // 마지막 장화음
      var chord = [523.25, 659.25, 783.99, 1046.5];
      for (var j = 0; j < chord.length; j++) {
        tone({ freq: chord[j], type: 'triangle', dur: 1.2, gain: 0.05, delay: 0.72, attack: 0.02 });
      }
      noise({ dur: 1.1, gain: 0.035, freq: 6000, q: 0.5, type: 'highpass', delay: 0.7 });
    },

    lose: function () {
      var seq = [392, 349.23, 311.13, 261.63];
      for (var i = 0; i < seq.length; i++) {
        tone({ freq: seq[i], type: 'sawtooth', dur: 0.5, gain: 0.05, delay: i * 0.22, filter: { type: 'lowpass', freq: 900, freqTo: 300 } });
      }
      tone({ freq: 65.4, type: 'sine', dur: 1.8, gain: 0.08, delay: 0.5, attack: 0.05 });
    },

    roundClear: function () {
      Sound.scoreTotal();
      Sound.coins(4);
    },

    tick: function () {
      tone({ freq: 1200, type: 'square', dur: 0.02, gain: 0.02 });
    }
  };

  global.CPSound = Sound;
})(window);
