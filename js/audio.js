'use strict';

/* ══════════════════════════════════════════════════════════════════════════
   CURSED PAWN — js/audio.js
   외부 사운드 파일 없이 Web Audio API 로만 만드는 신디사이저 SFX + BGM.
   주사위 달그락 / 홀드 틱 / 정산 콤보 상승음 / 코인 짤랑 / 보스 경고 / 승리 팡파레

   ── BGM (프로시저럴 다크 전당포 로파이 재즈) ────────────────────────────────
   Am7 - Dm7 - Fmaj7 - E7 을 도는 느린 4분의 4박자 루프.
   부드러운 피아노 컴핑 + 콘트라베이스 워킹 + 브러시 스네어/하이햇
   + 은은한 패드와 바이닐 크래클, 살짝 걸린 딜레이로 전당포 공기의 습기를 만든다.
   모든 음은 스케줄러가 미리 예약하는 방식이라 프레임 드랍과 무관하게 흔들리지 않는다.

   공개 API (모두 window.CPSound 에서 접근)
   ─ 기존(하위 호환): unlock, setEnabled, isEnabled, click, hover, error, select,
                      dice, reroll, hold, score, scoreTotal, coins, buy, curse,
                      boss, charm, win, lose, roundClear, tick
   ─ 별칭: playRoll, playHold, playScore, playCoin, playBuy, playBoss, playWin, playLose
   ─ 신규 SFX: playComboHit(step), playRelicTrigger(), playCharm(),
               playAchievement(), playButton()
   ─ BGM: startBgm(mode?), stopBgm(), setBgmEnabled(on), isBgmEnabled(),
          setBgmMode(mode), getBgmMode()
   ─ 볼륨: setMasterVolume(0~1), getMasterVolume()
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  var ctx = null;
  var master = null;
  var compressor = null;
  var noiseBuffer = null;
  var enabled = true;
  var masterVolume = 0.5;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended' && ctx.resume) {
        try { ctx.resume(); } catch (e) { /* 사용자 제스처 전이면 조용히 무시 */ }
      }
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
    master.gain.value = enabled ? masterVolume : 0;
    master.connect(compressor);
    compressor.connect(ctx.destination);

    // 1초짜리 화이트노이즈 버퍼 (달그락/휘슬/타격음의 재료)
    var len = Math.floor(ctx.sampleRate * 1.0);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    buildBgmGraph();

    return ctx;
  }

  /* ══════════════════════════ 공통 유틸 ══════════════════════════ */

  function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  function rampParam(param, to, dur) {
    if (!ctx || !param) return;
    var t = ctx.currentTime;
    try { param.cancelScheduledValues(t); } catch (e) { /* noop */ }
    try { param.setValueAtTime(param.value, t); } catch (e) { /* noop */ }
    try { param.linearRampToValueAtTime(to, t + Math.max(0.02, dur)); } catch (e) { /* noop */ }
  }

  function setEnabled(on) {
    enabled = !!on;
    if (master) rampParam(master.gain, enabled ? masterVolume : 0, 0.08);
    // 꺼져 있다가 다시 켜졌고, 이미 오디오가 열려 있으면 BGM 도 이어서 흐르게 한다
    if (enabled && bgm.enabled && !bgm.on && ctx && ctx.state === 'running') startBgm();
  }

  function isEnabled() {
    return enabled;
  }

  function setMasterVolume(v) {
    var vol = (typeof v === 'number' && isFinite(v)) ? v : masterVolume;
    masterVolume = Math.max(0, Math.min(1, vol));
    if (master) rampParam(master.gain, enabled ? masterVolume : 0, 0.1);
    return masterVolume;
  }

  function getMasterVolume() {
    return masterVolume;
  }

  /* ══════════════════════════ 기본 음색 ══════════════════════════ */
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

  /* ══════════════════════════════════════════════════════════════════════
     BGM — 프로시저럴 다크 전당포 로파이 재즈 엔진
     ══════════════════════════════════════════════════════════════════════ */

  var MODES = {
    // normal: 기본 영업 시간의 전당포. 68BPM, 따뜻한 로파이 톤.
    normal: { bpm: 68, cutoff: 3100, wet: 0.30, level: 0.62, brush: 1.0, kick: 0, sub: 0.55, comp: 1.0, pad: 0.024 },
    // shop: 상점 화면. 더 느리고 더 어둡고 더 비어 있는 앰비언트.
    shop: { bpm: 56, cutoff: 2000, wet: 0.46, level: 0.52, brush: 0.4, kick: 0, sub: 0.6, comp: 0.7, pad: 0.038 },
    // boss: 보스전. 빨라지고 베이스가 묵직해지며 킥이 들어온다.
    boss: { bpm: 90, cutoff: 4300, wet: 0.16, level: 0.72, brush: 0.9, kick: 1, sub: 1.0, comp: 1.35, pad: 0.03 }
  };

  // Am7 - Dm7 - Fmaj7 - E7 (부드러운 보이스 리딩)
  var PROG = [
    { bass: 45, notes: [55, 60, 64, 67] }, // Am7
    { bass: 38, notes: [53, 57, 60, 64] }, // Dm7
    { bass: 41, notes: [52, 57, 60, 65] }, // Fmaj7
    { bass: 40, notes: [56, 59, 62, 64] }  // E7
  ];

  // 멜로디에 쓸 A 마이너 펜타토닉 (위쪽 옥타브 위주, 드물게 낮게)
  var MELODY = [72, 74, 76, 79, 81, 84, 86, 69, 71];

  var bgm = {
    on: false,
    enabled: true,
    manual: false,
    mode: 'normal',
    timer: null,
    nextTime: 0,
    bar: 0,
    bus: null,
    tone: null,
    dry: null,
    wet: null,
    delay: null,
    delaySend: null,
    fb: null,
    vinyl: null
  };

  function buildBgmGraph() {
    bgm.bus = ctx.createGain();
    bgm.bus.gain.value = 0.0001;
    bgm.bus.connect(master);

    // 로파이 톤: 전체를 살짝 눌러 뭉근하게 만든다
    bgm.tone = ctx.createBiquadFilter();
    bgm.tone.type = 'lowpass';
    bgm.tone.frequency.value = MODES.normal.cutoff;
    bgm.tone.Q.value = 0.55;
    bgm.tone.connect(bgm.bus);

    bgm.dry = ctx.createGain();
    bgm.dry.gain.value = 1;
    bgm.dry.connect(bgm.tone);

    // 공간감: 짧은 피드백 딜레이 (연주 사이의 습기)
    bgm.delay = ctx.createDelay(1.5);
    bgm.delay.delayTime.value = 0.31;
    bgm.delaySend = ctx.createGain();
    bgm.delaySend.gain.value = 1;
    bgm.fb = ctx.createGain();
    bgm.fb.gain.value = 0.28;
    var fbFilter = ctx.createBiquadFilter();
    fbFilter.type = 'lowpass';
    fbFilter.frequency.value = 1700;
    bgm.wet = ctx.createGain();
    bgm.wet.gain.value = MODES.normal.wet;

    bgm.delaySend.connect(bgm.delay);
    bgm.delay.connect(fbFilter);
    fbFilter.connect(bgm.fb);
    bgm.fb.connect(bgm.delay);
    bgm.delay.connect(bgm.wet);
    bgm.wet.connect(bgm.tone);

    // 바이닐 크래클
    var vlen = Math.floor(ctx.sampleRate * 2);
    var vbuf = ctx.createBuffer(1, vlen, ctx.sampleRate);
    var vd = vbuf.getChannelData(0);
    for (var i = 0; i < vlen; i++) {
      vd[i] = (Math.random() * 2 - 1) * 0.16;
      if (Math.random() < 0.00035) vd[i] = (Math.random() * 2 - 1) * 0.95;
    }
    var vsrc = ctx.createBufferSource();
    vsrc.buffer = vbuf;
    vsrc.loop = true;
    var vhp = ctx.createBiquadFilter();
    vhp.type = 'highpass';
    vhp.frequency.value = 800;
    var vlp = ctx.createBiquadFilter();
    vlp.type = 'lowpass';
    vlp.frequency.value = 5400;
    var vg = ctx.createGain();
    vg.gain.value = 0.028;
    vsrc.connect(vhp);
    vhp.connect(vlp);
    vlp.connect(vg);
    vg.connect(bgm.dry);
    try { vsrc.start(); } catch (e) { /* noop */ }
    bgm.vinyl = vsrc;
  }

  /* ── BGM 악기 ─────────────────────────────────────────────── */

  // 졸린 전당포의 낡은 업라이트 피아노
  function pianoNote(time, midi, vel, dur) {
    var f = midiToFreq(midi);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(6200, f * 7 + 1400), time);
    lp.frequency.exponentialRampToValueAtTime(Math.max(400, f * 2.2), time + Math.max(0.2, dur * 0.7));
    lp.Q.value = 0.5;

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0004, vel), time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    lp.connect(g);
    g.connect(bgm.dry);

    var send = ctx.createGain();
    send.gain.value = 0.5;
    g.connect(send);
    send.connect(bgm.delaySend);

    var partials = [
      [1.0, 1.0, 'sine', 1.0],
      [2.0, 0.3, 'sine', 0.62],
      [3.01, 0.11, 'triangle', 0.44],
      [4.98, 0.045, 'sine', 0.3]
    ];
    for (var i = 0; i < partials.length; i++) {
      var o = ctx.createOscillator();
      o.type = partials[i][2];
      o.frequency.setValueAtTime(f * partials[i][0], time);
      o.detune.value = (i === 0 ? -3 : (i === 1 ? 2.5 : 0));
      var pg = ctx.createGain();
      pg.gain.setValueAtTime(0.0001, time);
      pg.gain.exponentialRampToValueAtTime(partials[i][1], time + 0.012);
      pg.gain.exponentialRampToValueAtTime(0.0001, time + dur * partials[i][3]);
      o.connect(pg);
      pg.connect(lp);
      o.start(time);
      o.stop(time + dur + 0.04);
    }

    // 해머가 줄을 때리는 아주 작은 소리
    var hn = ctx.createBufferSource();
    hn.buffer = noiseBuffer;
    var hf = ctx.createBiquadFilter();
    hf.type = 'bandpass';
    hf.frequency.value = Math.min(4200, f * 4);
    hf.Q.value = 1.6;
    var hg = ctx.createGain();
    hg.gain.setValueAtTime(Math.max(0.0002, vel * 0.22), time);
    hg.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
    hn.connect(hf);
    hf.connect(hg);
    hg.connect(bgm.dry);
    hn.start(time);
    hn.stop(time + 0.05);
  }

  // 콘트라베이스
  function bassNote(time, midi, dur, gain, p) {
    var f = midiToFreq(midi);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0004, gain), time + 0.018);
    g.gain.setValueAtTime(Math.max(0.0004, gain * 0.85), time + Math.max(0.06, dur * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    g.connect(bgm.dry);

    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(1000, f * 9), time);
    lp.Q.value = 0.7;
    lp.connect(g);

    var o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(f, time);
    o1.connect(lp);

    var o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(f * 2, time);
    var g2 = ctx.createGain();
    g2.gain.value = 0.28;
    o2.connect(g2);
    g2.connect(lp);

    o1.start(time);
    o1.stop(time + dur + 0.05);
    o2.start(time);
    o2.stop(time + dur + 0.05);

    // 보스 모드: 서브와 약간의 그로울로 배를 묵직하게
    if (p && p.sub > 0.8) {
      var sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(f / 2, time);
      var sg = ctx.createGain();
      sg.gain.value = 0.45 * p.sub;
      sub.connect(sg);
      sg.connect(g);
      sub.start(time);
      sub.stop(time + dur + 0.05);

      var saw = ctx.createOscillator();
      saw.type = 'sawtooth';
      saw.frequency.setValueAtTime(f, time);
      var slp = ctx.createBiquadFilter();
      slp.type = 'lowpass';
      slp.frequency.value = 280;
      var sg2 = ctx.createGain();
      sg2.gain.value = 0.1;
      saw.connect(slp);
      slp.connect(sg2);
      sg2.connect(g);
      saw.start(time);
      saw.stop(time + dur + 0.05);
    }
  }

  // 브러시 스네어
  function brush(time, gain, dur) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3400;
    bp.Q.value = 0.6;
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1000;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + 0.028);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(bp);
    bp.connect(hp);
    hp.connect(g);
    g.connect(bgm.dry);
    src.start(time);
    src.stop(time + dur + 0.04);
  }

  // 라이드/하이햇 틱
  function hat(time, gain) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 8200;
    bp.Q.value = 1.1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
    src.connect(bp);
    bp.connect(g);
    g.connect(bgm.dry);
    src.start(time);
    src.stop(time + 0.08);
  }

  // 보스 모드의 심장 박동 같은 킥
  function kick(time, gain) {
    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(82, time);
    o.frequency.exponentialRampToValueAtTime(40, time + 0.2);
    var g = ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, gain), time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.26);
    o.connect(g);
    g.connect(bgm.dry);
    o.start(time);
    o.stop(time + 0.3);
  }

  // 낮게 깔리는 패드 (전당포의 공기)
  function pad(time, chord, dur, gain) {
    var f = midiToFreq(chord.bass + 12);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 640;
    lp.Q.value = 0.6;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(Math.max(0.0004, gain), time + Math.min(1.2, dur * 0.35));
    g.gain.linearRampToValueAtTime(Math.max(0.0004, gain * 0.75), time + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.7);
    lp.connect(g);
    g.connect(bgm.dry);

    var intervals = [0, 7, 12];
    for (var i = 0; i < intervals.length; i++) {
      var o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * Math.pow(2, intervals[i] / 12), time);
      o.detune.value = (i % 2 ? 6 : -6);
      var og = ctx.createGain();
      og.gain.value = (i === 2 ? 0.25 : 0.5);
      o.connect(og);
      og.connect(lp);
      o.start(time);
      o.stop(time + dur + 0.8);
    }
  }

  // 드문드문 흐르는 멜로디 한 음
  function melodyNote(time, midi, gain) {
    var f = midiToFreq(midi);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0004, gain), time + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 1.7);
    lp.connect(g);
    g.connect(bgm.dry);

    var send = ctx.createGain();
    send.gain.value = 0.85;
    g.connect(send);
    send.connect(bgm.delaySend);

    var o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, time);
    var o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(f * 2, time);
    var g2 = ctx.createGain();
    g2.gain.value = 0.16;
    o.connect(lp);
    o2.connect(g2);
    g2.connect(lp);

    // 살짝 흔들리는 비브라토
    var lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 5.1;
    var lg = ctx.createGain();
    lg.gain.value = 4.5;
    lfo.connect(lg);
    lg.connect(o.detune);

    o.start(time);
    o.stop(time + 1.8);
    o2.start(time);
    o2.stop(time + 1.8);
    lfo.start(time);
    lfo.stop(time + 1.2);
  }

  /* ── BGM 편곡: 한 마디 예약 ─────────────────────────────────── */

  var COMP_PATTERNS = [
    [0, 1.5, 2.75],
    [0, 2, 3.25],
    [0.5, 2.5],
    [0, 1.75, 3]
  ];
  var BOSS_PATTERNS = [
    [0, 1, 2, 3],
    [0, 0.75, 1.5, 2.5, 3.5]
  ];

  function scheduleBar(time, barIndex) {
    if (!bgm.on || !ctx) return;
    var p = MODES[bgm.mode] || MODES.normal;
    var beat = 60 / p.bpm;
    var chord = PROG[barIndex % PROG.length];
    var jit = function (amt) { return (Math.random() - 0.5) * amt; };

    // 1) 공기: 낮은 패드
    pad(time, chord, beat * 4, p.pad);

    // 2) 베이스
    var fifth = chord.bass + 7;
    if (bgm.mode === 'boss') {
      var bsteps = [0, 1, 2, 3];
      for (var bi = 0; bi < bsteps.length; bi++) {
        var bn = (bi === 1) ? fifth : (bi === 3 ? chord.bass + 10 : chord.bass);
        bassNote(time + bsteps[bi] * beat + jit(0.012), bn, beat * 0.92, 0.085 * p.sub, p);
      }
    } else {
      bassNote(time + jit(0.01), chord.bass, beat * 1.9, 0.09, p);
      bassNote(time + beat * 2 + jit(0.015), (barIndex % 2 ? fifth : chord.bass + 10), beat * 1.35, 0.068, p);
      if (Math.random() < 0.32) bassNote(time + beat * 3.5 + jit(0.01), fifth - 2, beat * 0.55, 0.05, p);
    }

    // 3) 피아노 컴핑 (살짝 굴러 들어가는 롤링 코드)
    var pat = (bgm.mode === 'boss')
      ? BOSS_PATTERNS[barIndex % BOSS_PATTERNS.length]
      : COMP_PATTERNS[Math.floor(Math.random() * COMP_PATTERNS.length)];
    for (var hi = 0; hi < pat.length; hi++) {
      var pos = pat[hi];
      var accent = (pos % 1 === 0) ? 1.0 : 0.76;
      var vel = 0.052 * accent * (0.86 + Math.random() * 0.28) * Math.min(1.3, p.comp);
      var roll = 0.01 + Math.random() * 0.022;
      var dur = 1.7 + Math.random() * 0.8;
      for (var ni = 0; ni < chord.notes.length; ni++) {
        var note = chord.notes[ni];
        if (ni === chord.notes.length - 1 && Math.random() < 0.1) note += 12; // 가끔 톱노트가 반짝
        pianoNote(
          time + pos * beat + ni * roll + jit(0.012),
          note,
          vel * (ni === chord.notes.length - 1 ? 1.05 : 0.84),
          dur
        );
      }
    }

    // 4) 브러시 드럼
    if (p.brush > 0) {
      brush(time + beat * 1 + jit(0.02), 0.048 * p.brush, 0.22);
      brush(time + beat * 3 + jit(0.02), 0.055 * p.brush, 0.24);
      if (bgm.mode !== 'shop' && Math.random() < 0.45) {
        brush(time + beat * 2.5 + jit(0.03), 0.028 * p.brush, 0.16);
      }
      for (var e = 0; e < 8; e++) {
        if (bgm.mode === 'shop' && (e % 2 === 1)) continue;
        hat(time + e * beat * 0.5 + jit(0.014), (e % 2 ? 0.007 : 0.013) * p.brush);
      }
    }

    // 5) 보스 모드의 심장 박동
    if (p.kick > 0) {
      kick(time + jit(0.006), 0.085);
      kick(time + beat * 2.5 + jit(0.01), 0.055);
    }

    // 6) 드문드문 흐르는 멜로디
    if (barIndex % 2 === 1 && Math.random() < 0.55) {
      var count = (Math.random() < 0.35) ? 2 : 1;
      for (var mi = 0; mi < count; mi++) {
        melodyNote(
          time + (1 + Math.random() * 2.6) * beat,
          MELODY[Math.floor(Math.random() * MELODY.length)],
          0.026 + Math.random() * 0.014
        );
      }
    } else if (bgm.mode === 'boss' && Math.random() < 0.5) {
      melodyNote(time + beat * 2, chord.notes[1] + 12, 0.02);
    }
  }

  function applyMode(mode, dur) {
    var p = MODES[mode] || MODES.normal;
    if (!ctx || !bgm.tone) return;
    rampParam(bgm.tone.frequency, p.cutoff, dur || 0.9);
    rampParam(bgm.wet.gain, p.wet, dur || 0.9);
    rampParam(bgm.fb.gain, mode === 'boss' ? 0.13 : 0.28, dur || 0.9);
    if (bgm.on) rampParam(bgm.bus.gain, p.level, dur || 0.9);
  }

  // 게임 상태를 읽어 화면에 맞는 모드를 스스로 고른다 (game.js 수정 없이 동작)
  function autoMode() {
    if (bgm.manual) return bgm.mode;
    try {
      var CP = global.CP;
      if (!CP || !CP.state) return bgm.mode;
      var st = CP.state;
      if (st.screen === 'shop') return 'shop';
      if (st.screen === 'game' && CP.rounds && CP.rounds[st.roundIndex] && CP.rounds[st.roundIndex].type === 'boss') {
        return 'boss';
      }
    } catch (e) { /* 게임 쪽 상태를 못 읽어도 BGM 은 계속 돈다 */ }
    return 'normal';
  }

  function bgmTick() {
    if (!bgm.on || !ctx) return;
    var now = ctx.currentTime;
    // 탭이 잠들었다 깨어나면 밀린 마디를 몰아치지 않고 현재로 당긴다
    if (bgm.nextTime < now - 0.25) bgm.nextTime = now + 0.06;

    var guard = 0;
    while (bgm.nextTime < now + 0.7 && guard++ < 8) {
      var m = autoMode();
      if (m !== bgm.mode) {
        bgm.mode = m;
        applyMode(m, 1.1);
      }
      scheduleBar(bgm.nextTime, bgm.bar);
      var p = MODES[bgm.mode] || MODES.normal;
      bgm.nextTime += (60 / p.bpm) * 4;
      bgm.bar++;
    }
  }

  function startBgm(mode) {
    if (!bgm.enabled) return;
    var c = ensure();
    if (!c) return;
    if (mode && MODES[mode]) {
      bgm.mode = mode;
      bgm.manual = true;
    }
    if (bgm.on) {
      applyMode(bgm.mode, 0.9);
      return;
    }
    if (c.state === 'suspended' && c.resume) {
      try { c.resume(); } catch (e) { /* noop */ }
    }
    bgm.bar = 0;
    bgm.nextTime = c.currentTime + 0.15;
    // bgm.on 이 켜지기 전에 모드를 적용해야 bus 레벨이 튀지 않고 부드럽게 올라온다
    applyMode(bgm.mode, 0.05);
    bgm.on = true;
    rampParam(bgm.bus.gain, (MODES[bgm.mode] || MODES.normal).level, 1.8);
    if (bgm.timer) clearInterval(bgm.timer);
    bgm.timer = setInterval(bgmTick, 180);
    bgmTick();
  }

  function stopBgm() {
    if (!bgm.on) {
      if (bgm.timer) { clearInterval(bgm.timer); bgm.timer = null; }
      return;
    }
    bgm.on = false;
    if (bgm.timer) { clearInterval(bgm.timer); bgm.timer = null; }
    if (bgm.bus && ctx) {
      var t = ctx.currentTime;
      var g = bgm.bus.gain;
      try { g.cancelScheduledValues(t); } catch (e) { /* noop */ }
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.exponentialRampToValueAtTime(0.0001, t + 0.8);
    }
  }

  function setBgmEnabled(on) {
    bgm.enabled = !!on;
    if (bgm.enabled) {
      startBgm();
    } else {
      stopBgm();
    }
    return bgm.enabled;
  }

  function isBgmEnabled() {
    return bgm.enabled;
  }

  function setBgmMode(mode) {
    if (!MODES[mode]) return bgm.mode;
    bgm.mode = mode;
    bgm.manual = true;
    if (bgm.on) applyMode(mode, 0.9);
    return bgm.mode;
  }

  function getBgmMode() {
    return bgm.mode;
  }

  /* ══════════════════════════ 게임 사운드 ══════════════════════════ */
  var Sound = {
    unlock: function () {
      ensure();
      // 첫 제스처: BGM 도 함께 시작한다 (음소거 상태여도 master 가 0 이라 조용하다)
      if (bgm.enabled) startBgm();
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

    /* 깔끔한 UI 클릭 (버튼용) */
    playButton: function () {
      tone({ freq: 520, freqTo: 400, type: 'triangle', dur: 0.045, gain: 0.05, filter: { type: 'lowpass', freq: 3200 } });
      noise({ dur: 0.02, gain: 0.028, freq: 3400, q: 1.8, type: 'bandpass' });
      tone({ freq: 1040, type: 'sine', dur: 0.05, gain: 0.012, delay: 0.005 });
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

    /* 타격감 있는 콤보 히트: 단계가 오를수록 묵직하게, 음은 반음계 위로 */
    playComboHit: function (step) {
      if (!isEnabled()) return;
      var s = Math.max(0, Math.min(24, step | 0));
      var scale = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27, 29, 31, 34, 36];
      var semi = scale[Math.min(scale.length - 1, s)];
      var f = 110 * Math.pow(2, semi / 12);
      var weight = 1 + Math.min(0.9, s * 0.06);

      // 배를 때리는 서브 타격
      tone({ freq: 118, freqTo: 44, type: 'sine', dur: 0.26, gain: 0.13 * weight, attack: 0.003 });
      // 몸통 (피치가 단계마다 올라간다)
      tone({ freq: f, freqTo: f * 0.94, type: 'triangle', dur: 0.2, gain: 0.085 * weight, filter: { type: 'lowpass', freq: 2200 } });
      tone({ freq: f * 2, type: 'square', dur: 0.085, gain: 0.03 * weight, filter: { type: 'lowpass', freq: 3400 } });
      // 나무 탁자에 부딪히는 스냅
      noise({ dur: 0.055, gain: 0.08 * weight, freq: 2400, freqTo: 700, q: 1.4 });

      // 단계가 높아지면 금속 반짝임이 붙는다
      if (s >= 3) {
        var sparkle = Math.min(3, 1 + Math.floor(s / 4));
        for (var i = 0; i < sparkle; i++) {
          tone({ freq: f * 4 * (1 + i * 0.25), type: 'sine', dur: 0.16, gain: 0.016, delay: 0.02 + i * 0.03 });
        }
      }
      if (s >= 8) {
        noise({ dur: 0.3, gain: 0.03, freq: 7200, q: 0.7, type: 'highpass', delay: 0.03 });
      }
    },

    /* 유물 발동: 반짝이는 금속/마법 틱 */
    playRelicTrigger: function () {
      if (!isEnabled()) return;
      tone({ freq: 1760, type: 'triangle', dur: 0.1, gain: 0.042, filter: { type: 'highpass', freq: 500 } });
      tone({ freq: 2637, type: 'sine', dur: 0.22, gain: 0.026, delay: 0.02 });
      tone({ freq: 3520, type: 'sine', dur: 0.16, gain: 0.014, delay: 0.045 });
      noise({ dur: 0.05, gain: 0.045, freq: 5200, q: 2.4, type: 'bandpass' });
      tone({ freq: 220, freqTo: 330, type: 'sine', dur: 0.12, gain: 0.028 });
    },

    /* 업적 달성 팡파레 */
    playAchievement: function () {
      if (!isEnabled()) return;
      var seq = [587.33, 739.99, 880, 1174.66];
      for (var i = 0; i < seq.length; i++) {
        tone({ freq: seq[i], type: 'triangle', dur: 0.34, gain: 0.06, delay: i * 0.1, filter: { type: 'lowpass', freq: 5000 } });
        tone({ freq: seq[i] * 2, type: 'sine', dur: 0.22, gain: 0.02, delay: i * 0.1 });
      }
      var chord = [587.33, 739.99, 880, 1174.66];
      for (var j = 0; j < chord.length; j++) {
        tone({ freq: chord[j], type: 'triangle', dur: 1.1, gain: 0.038, delay: 0.44, attack: 0.02 });
      }
      noise({ dur: 0.9, gain: 0.028, freq: 6200, q: 0.6, type: 'highpass', delay: 0.42 });
      tone({ freq: 293.66, type: 'sine', dur: 0.9, gain: 0.03, delay: 0.44 });
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
      // 보스 등장과 함께 BGM 이 무거워진다
      if (!bgm.manual) {
        bgm.mode = 'boss';
        if (bgm.on) applyMode('boss', 1.2);
      }
    },

    /* 부적 사용: 신비로운 종소리 + 위로 스윕 */
    charm: function () {
      var notes = [1046.5, 1318.5, 1568, 2093];
      for (var i = 0; i < notes.length; i++) {
        tone({ freq: notes[i], type: 'sine', dur: 0.28, gain: 0.035, delay: i * 0.035 });
      }
      noise({ dur: 0.4, gain: 0.03, freq: 7000, q: 0.6, type: 'highpass' });
    },

    playCharm: function () {
      if (!isEnabled()) return;
      var notes = [880, 1046.5, 1318.5, 1760, 2349.3];
      for (var i = 0; i < notes.length; i++) {
        tone({ freq: notes[i], type: 'sine', dur: 0.5, gain: 0.03, delay: i * 0.055, attack: 0.01 });
        tone({ freq: notes[i] * 2.01, type: 'triangle', dur: 0.22, gain: 0.012, delay: i * 0.055 });
      }
      noise({ dur: 0.6, gain: 0.028, freq: 1200, freqTo: 8200, q: 0.9, type: 'bandpass' });
      tone({ freq: 220, freqTo: 660, type: 'sine', dur: 0.55, gain: 0.03, attack: 0.06 });
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
      Sound.playRelicTrigger();
    },

    tick: function () {
      tone({ freq: 1200, type: 'square', dur: 0.02, gain: 0.02 });
    },

    /* ── BGM 공개 API ─────────────────────────────────────── */
    startBgm: startBgm,
    stopBgm: stopBgm,
    setBgmEnabled: setBgmEnabled,
    isBgmEnabled: isBgmEnabled,
    setBgmMode: setBgmMode,
    getBgmMode: getBgmMode,

    /* ── 볼륨 ─────────────────────────────────────────────── */
    setMasterVolume: setMasterVolume,
    getMasterVolume: getMasterVolume
  };

  /* ── 이름 별칭 (playX 형태로 부르는 쪽도 그대로 동작) ─────── */
  Sound.playRoll = function (count) { Sound.dice(count); };
  Sound.playHold = function (on) { Sound.hold(on); };
  Sound.playScore = function (step, totalSteps) { Sound.score(step, totalSteps); };
  Sound.playCoin = function (count) { Sound.coins(count); };
  Sound.playBuy = function () { Sound.buy(); };
  Sound.playBoss = function () { Sound.boss(); };
  Sound.playWin = function () { Sound.win(); };
  Sound.playLose = function () { Sound.lose(); };

  global.CPSound = Sound;
})(typeof window !== 'undefined' ? window : this);
