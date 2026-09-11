/* Keyboard + touch. Exposes a tiny axis/button surface the game polls. */
(function (FROG) {
  'use strict';

  const { clamp } = FROG.util;

  const Input = {
    keys: Object.create(null),
    steer: 0,          // -1 .. 1 from touch drag
    touching: false,
    touchBoost: false,
    pressed: Object.create(null),   // edge-triggered, cleared each frame

    attach(canvas, onAnyInput) {
      const self = this;

      window.addEventListener('keydown', function (e) {
        if (e.repeat) { e.preventDefault(); return; }
        const k = e.key.toLowerCase();
        if (self.OWNED[k] || self.OWNED[e.code]) e.preventDefault();
        self.keys[k] = true;
        self.keys[e.code] = true;
        self.pressed[k] = true;
        self.pressed[e.code] = true;
        onAnyInput && onAnyInput();
      });

      window.addEventListener('keyup', function (e) {
        const k = e.key.toLowerCase();
        self.keys[k] = false;
        self.keys[e.code] = false;
      });

      window.addEventListener('blur', function () { self.keys = Object.create(null); });

      /* Drag anywhere on the canvas to steer. */
      let startX = 0, startSteer = 0, pointerId = null;
      canvas.addEventListener('pointerdown', function (e) {
        pointerId = e.pointerId;
        startX = e.clientX;
        startSteer = self.steer;
        self.touching = true;
        canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
        onAnyInput && onAnyInput();
      });
      canvas.addEventListener('pointermove', function (e) {
        if (pointerId !== e.pointerId) return;
        const span = Math.max(90, canvas.clientWidth * 0.18);
        self.steer = clamp(startSteer + (e.clientX - startX) / span, -1, 1);
      });
      function release(e) {
        if (pointerId !== e.pointerId) return;
        pointerId = null;
        self.touching = false;
        self.steer = 0;
      }
      canvas.addEventListener('pointerup', release);
      canvas.addEventListener('pointercancel', release);
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    OWNED: {
      ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, Space: 1,
      arrowleft: 1, arrowright: 1, arrowup: 1, arrowdown: 1, ' ': 1
    },

    /* Analogue-ish steering: keys snap, touch is proportional. */
    steerAxis() {
      let v = 0;
      if (this.keys.arrowleft || this.keys.a || this.keys.KeyA) v -= 1;
      if (this.keys.arrowright || this.keys.d || this.keys.KeyD) v += 1;
      if (v === 0 && this.touching) v = this.steer;
      return clamp(v, -1, 1);
    },
    braking() {
      return !!(this.keys.arrowdown || this.keys.s || this.keys.KeyS);
    },
    boosting() {
      return !!(this.keys[' '] || this.keys.Space || this.keys.shift ||
                this.keys.ShiftLeft || this.keys.ShiftRight || this.touchBoost);
    },
    wasPressed(k) { return !!this.pressed[k]; },
    endFrame() { this.pressed = Object.create(null); }
  };

  FROG.input = Input;
})(window.FROG);
