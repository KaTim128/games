/* Boot: canvas sizing, the frame loop, and wiring the DOM chrome. */
(function (FROG) {
  'use strict';

  const CFG = FROG.CFG;
  const input = FROG.input;
  const sfx = FROG.sfx;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const el = (id) => document.getElementById(id);

  const screens = {
    title: el('screen-title'),
    pause: el('screen-pause'),
    over: el('screen-over')
  };

  const ui = {
    score: el('hud-score'),
    best: el('hud-best'),
    speed: el('hud-speed'),
    dist: el('hud-dist'),
    level: el('hud-level'),
    heatBar: el('heat-bar'),
    heatFill: el('heat-fill'),
    nitroBar: el('nitro-bar'),
    nitroFill: el('nitro-fill'),

    showScreen(name, data) {
      Object.keys(screens).forEach((k) => screens[k].classList.toggle('show', k === name));
      document.body.classList.toggle('playing', name === null);
      if (name === 'over' && data) {
        el('over-reason').textContent = data.reason;
        el('over-score').textContent = data.score.toLocaleString();
        el('over-dist').textContent = data.dist.toLocaleString() + ' m';
        el('over-best').textContent = data.best.toLocaleString();
        el('over-level').textContent = data.level;
        el('over-cops').textContent = data.cops;
        el('over-misses').textContent = data.misses;
        el('over-record').classList.toggle('show', data.score >= data.best && data.score > 0);
      }
    }
  };

  /* Keep a crisp backing store while the game keeps drawing in 1280x720. */
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(w / CFG.width, 0, 0, h / CFG.height, 0, 0);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  const game = new FROG.Game(canvas, ui);
  window.__game = game;          // handle for debugging and smoke tests
  ui.showScreen('title');
  el('title-best').textContent = game.best.toLocaleString();

  input.attach(canvas, () => sfx.resume());

  /* Buttons */
  el('btn-start').addEventListener('click', () => game.start());
  el('btn-restart').addEventListener('click', () => game.start());
  el('btn-resume').addEventListener('click', () => game.resume());
  el('btn-quit').addEventListener('click', () => {
    game.state = 'menu';
    sfx.silence();
    el('title-best').textContent = game.best.toLocaleString();
    ui.showScreen('title');
  });

  const btnMute = el('btn-mute');
  function paintMute() {
    btnMute.textContent = sfx.muted ? '🔇' : '🔊';
    btnMute.setAttribute('aria-label', sfx.muted ? 'Unmute' : 'Mute');
  }
  btnMute.addEventListener('click', () => { sfx.resume(); sfx.setMuted(!sfx.muted); paintMute(); });
  paintMute();

  el('btn-pause').addEventListener('click', () => {
    if (game.state === 'playing') game.pause();
    else if (game.state === 'paused') game.resume();
  });

  /* Touch nitro pedal */
  const pedal = el('btn-nitro');
  const setBoost = (v) => (e) => { e.preventDefault(); input.touchBoost = v; };
  pedal.addEventListener('pointerdown', setBoost(true));
  pedal.addEventListener('pointerup', setBoost(false));
  pedal.addEventListener('pointercancel', setBoost(false));
  pedal.addEventListener('pointerleave', setBoost(false));

  /* Global keys: start, pause, mute. */
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'm') { sfx.resume(); sfx.setMuted(!sfx.muted); paintMute(); }
    if (k === 'p' || k === 'escape') {
      if (game.state === 'playing') game.pause();
      else if (game.state === 'paused') game.resume();
    }
    if (k === 'enter' || k === ' ') {
      if (game.state === 'menu' || game.state === 'over') game.start();
      else if (game.state === 'paused') game.resume();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.pause();
  });

  let last = performance.now();
  let fpsAcc = 0, fpsFrames = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    fpsAcc += dt; fpsFrames++;
    if (fpsAcc >= 0.5) { window.__fps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
    resize();
    game.update(dt);
    game.render();
    input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})(window.FROG);
