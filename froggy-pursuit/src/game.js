/* Froggy Pursuit — endless highway escape.
   Drive, swerve through traffic, and keep the police off your bumper. */
(function (FROG) {
  'use strict';

  const CFG = FROG.CFG;
  const R = FROG.road;
  const S = FROG.sprites;
  const sfx = FROG.sfx;
  const input = FROG.input;
  const { clamp, lerp, rand, randInt, pick, chance, approach, hash, storage } = FROG.util;

  const W = CFG.width, H = CFG.height;
  const HALF = CFG.roadHalf;
  const LANES = CFG.lanes;
  const laneX = (i) => -HALF + CFG.laneWidth * (i + 0.5);

  const PLAYER = { w: 380, l: 640, h: 300 };

  /* Traffic catalogue. `speedF` is a fraction of the player's top speed. */
  const TYPES = [
    { kind: 'car',   w: 380, l: 640,  h: 290, roofW: 0.34, roofY: -0.58, speedF: [0.44, 0.62], weight: 5 },
    { kind: 'sport', w: 360, l: 660,  h: 250, roofW: 0.30, roofY: -0.64, speedF: [0.60, 0.80], weight: 2, spoiler: true },
    { kind: 'van',   w: 420, l: 740,  h: 430, roofW: 0.44, roofY: -0.80, speedF: [0.40, 0.56], weight: 3 },
    { kind: 'truck', w: 480, l: 1150, h: 640, paint: 'truck', speedF: [0.30, 0.44], weight: 2 },
    { kind: 'bus',   w: 470, l: 1280, h: 570, paint: 'bus',   speedF: [0.34, 0.48], weight: 1 }
  ];
  const CAR_COLORS = ['#c8442f', '#2f6fc8', '#d8a12f', '#8a4fc8', '#2fa88a', '#d9d9e2',
                      '#7a8290', '#e0692f', '#3b3f4a', '#c82f6f'];
  const TRUCK_COLORS = ['#dcdce4', '#c8ced8', '#a8b4c2', '#e0d2b4'];

  const TYPE_BAG = [];
  TYPES.forEach((t) => { for (let i = 0; i < t.weight; i++) TYPE_BAG.push(t); });

  class Game {
    constructor(canvas, ui) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ui = ui;
      this.state = 'menu';
      this.best = storage.get('froggy.best', 0);
      this.hudCache = {};
      this.reset();
      this.syncHud(true);
    }

    /* ---- lifecycle ------------------------------------------------- */

    reset() {
      this.player = {
        x: 0, z: 0, speed: 2600, vx: 0,
        crashT: 0, oilT: 0, nitro: 0.5, boosting: false, offRoad: false
      };
      this.cam = { x: 0, y: 0, z: -CFG.camBehind };
      this.traffic = [];
      this.cops = [];
      this.pickups = [];
      this.hazards = [];
      this.popups = [];
      this.dist = 0;
      this.score = 0;
      this.level = 1;
      this.heat = 0;
      this.combo = 0;
      this.comboT = 0;
      this.shake = 0;
      this.flash = 0;
      this.time = 0;
      this.copTimer = 5;
      this.pickupTimer = 1.4;
      this.hazardTimer = 9;
      this.copsWrecked = 0;
      this.nearMisses = 0;
      this.cashGrabbed = 0;
      this.reason = '';
      this.busted = false;
      for (let i = 0; i < 5; i++) this.spawnTraffic(CFG.drawDist * (0.25 + i * 0.16));
    }

    start() {
      this.reset();
      this.state = 'playing';
      sfx.resume();
      this.ui.showScreen(null);
      this.popup('GO!', '#7ee08a');
      this.syncHud(true);
    }

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      sfx.silence();
      this.ui.showScreen('pause');
    }

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'playing';
      sfx.resume();
      this.ui.showScreen(null);
    }

    gameOver(reason) {
      this.state = 'over';
      this.reason = reason;
      sfx.silence();
      sfx.busted();
      if (this.score > this.best) {
        this.best = Math.floor(this.score);
        storage.set('froggy.best', this.best);
      }
      this.ui.showScreen('over', {
        reason: reason,
        score: Math.floor(this.score),
        dist: Math.floor(this.metres()),
        best: this.best,
        level: this.level,
        cops: this.copsWrecked,
        misses: this.nearMisses
      });
      this.syncHud(true);
    }

    metres() { return this.dist / CFG.unitsPerMetre; }
    topSpeed() { return CFG.speedBase + (this.level - 1) * CFG.speedPerLevel; }
    speedRatio() { return clamp(this.player.speed / this.topSpeed(), 0, 1.4); }

    /* ---- update ---------------------------------------------------- */

    update(dt) {
      this.time += dt;
      if (this.state === 'menu') this.attract(dt);
      if (this.state === 'playing') {
        this.updatePlayer(dt);
        this.updateTraffic(dt);
        this.updateCops(dt);
        this.updateItems(dt);
        this.collisions(dt);
        this.updateHeat(dt);
        this.spawning(dt);
        this.progress(dt);
      }
      this.updateCamera(dt);
      this.updateEffects(dt);
      this.audio();
      this.syncHud(false);
    }

    /* Idle title-screen drive: the road keeps rolling behind the menu. */
    attract(dt) {
      const p = this.player;
      p.speed = 4200;
      p.z += p.speed * dt;
      p.x -= R.curveAt(p.z) * p.speed * dt * 0.42;
      p.x = clamp(p.x * 0.985, -HALF * 0.6, HALF * 0.6);
      for (const e of this.traffic) e.z += e.speed * dt;
      if (this.traffic.length < 7) this.spawnTraffic();
      for (let i = this.traffic.length - 1; i >= 0; i--) {
        if (this.traffic[i].z < p.z - 4500) this.traffic.splice(i, 1);
      }
    }

    updatePlayer(dt) {
      const p = this.player;
      const top = this.topSpeed();

      p.crashT = Math.max(0, p.crashT - dt);
      p.oilT = Math.max(0, p.oilT - dt);

      /* Nitro */
      const wantBoost = input.boosting() && p.nitro > 0.02 && p.crashT <= 0;
      if (wantBoost && !p.boosting) sfx.boost();
      p.boosting = wantBoost;
      if (p.boosting) p.nitro = Math.max(0, p.nitro - CFG.nitroBurn * dt);
      else p.nitro = Math.min(1, p.nitro + CFG.nitroRegen * dt);

      /* Longitudinal */
      let target = top * (p.boosting ? CFG.boostMult : 1);
      if (input.braking()) target = top * 0.4;
      p.offRoad = Math.abs(p.x) > HALF - PLAYER.w * 0.35;
      if (p.offRoad) target = Math.min(target, top * 0.55);
      if (p.crashT > 0) target = Math.min(target, top * 0.5);
      const rate = target > p.speed
        ? CFG.accel * (p.boosting ? 1.7 : 1)
        : (input.braking() ? CFG.brake : CFG.decel);
      p.speed = approach(p.speed, target, rate * dt);
      p.speed = Math.max(p.speed, CFG.speedMin);

      /* Lateral: steering, the bend throwing you outward, and oil slicks. */
      const grip = p.oilT > 0 ? 0.35 : 1;
      const steerPower = CFG.steer * grip * (p.crashT > 0 ? 0.5 : 1);
      p.vx = approach(p.vx, input.steerAxis() * steerPower, steerPower * 6 * dt);
      p.x += p.vx * dt;
      p.x -= R.curveAt(p.z) * p.speed * dt * 0.42;
      if (p.oilT > 0) p.x += Math.sin(this.time * 7) * 90 * dt * 6;

      const edge = HALF + CFG.shoulder;
      if (p.x < -edge) { p.x = -edge; p.vx = Math.abs(p.vx) * 0.2; }
      if (p.x > edge) { p.x = edge; p.vx = -Math.abs(p.vx) * 0.2; }

      p.z += p.speed * dt;
      this.dist += p.speed * dt;

      if (p.offRoad) this.shake = Math.max(this.shake, 0.25);
    }

    updateCamera(dt) {
      const p = this.player;
      const cam = this.cam;
      cam.z = p.z - CFG.camBehind;
      const targetX = R.centreAt(cam.z) + p.x * 0.9;
      const k = 1 - Math.exp(-dt * 7);
      cam.x = lerp(cam.x, targetX, k);
      cam.y = R.heightAt(cam.z) + CFG.camHeight;
    }

    updateTraffic(dt) {
      const p = this.player;
      for (let i = this.traffic.length - 1; i >= 0; i--) {
        const e = this.traffic[i];
        e.z += e.speed * dt;
        if (e.switchT != null) {
          e.switchT -= dt;
          if (e.switchT <= 0 && e.targetX == null && this.level >= 3) {
            const dir = chance(0.5) ? -1 : 1;
            const nx = e.x + CFG.laneWidth * dir;
            if (Math.abs(nx) < HALF - 200 && this.laneClear(nx, e.z, 2200, e)) e.targetX = nx;
            e.switchT = rand(4, 9);
          }
          if (e.targetX != null) {
            e.x = approach(e.x, e.targetX, 300 * dt);
            if (Math.abs(e.x - e.targetX) < 1) { e.x = e.targetX; e.targetX = null; }
          }
        }
        /* Near miss: it just slipped past our door. */
        if (!e.passed && e.z < p.z) {
          e.passed = true;
          const gap = Math.abs(e.x - p.x) - (e.w + PLAYER.w) / 2;
          if (gap < 130 && gap > -1) this.nearMiss();
          else this.score += 6;
        }
        if (e.z < p.z - 4500) this.traffic.splice(i, 1);
      }
    }

    updateCops(dt) {
      const p = this.player;
      const copTop = this.topSpeed() * CFG.copTopFactor;

      for (let i = this.cops.length - 1; i >= 0; i--) {
        const c = this.cops[i];
        const dz = p.z - c.z;                   // > 0 means the cop is behind us
        c.phase += dt * 11;

        /* Closing speed: they hang back until you stumble, then pounce. */
        let want;
        if (dz > 5000) want = p.speed * 1.22;
        else if (dz > 1600) want = p.speed * 1.09;
        else if (dz > 0) want = p.speed * (c.state === 'ram' ? 1.04 : 1.0);
        else want = p.speed * 0.99;
        if (p.crashT > 0 || p.offRoad) want *= 1.12;
        c.speed = approach(c.speed, Math.min(want, copTop * 1.25), 6000 * dt);
        c.z += c.speed * dt;

        /* Pick a lateral target: tail, flank, then lunge. */
        let tx;
        if (dz > 1800) { c.state = 'chase'; tx = p.x; }
        else if (dz > 700) { c.state = 'flank'; tx = p.x + c.side * 440; }
        else { c.state = 'ram'; tx = p.x; }

        /* They drive properly: pick the clearest line that still leans toward
           the target, and lift off when it closes up. Wrecking a cruiser
           means boxing it in, not waiting for it to blunder. */
        const line = this.copLine(c, tx);
        const agility = c.state === 'ram' ? 1500 : 1000;
        c.x = approach(c.x, line.x, agility * dt);
        if (line.clear < 1800) {
          c.speed = approach(c.speed, line.blockSpeed * 0.9, 11000 * dt);
        }

        if (c.z < p.z - 9000) {      // lost them for now; bring them back later
          this.cops.splice(i, 1);
          this.copTimer = Math.min(this.copTimer, 3);
        }
      }

      /* Reinforcements */
      this.copTimer -= dt;
      const wanted = Math.min(CFG.copMax, 1 + Math.floor((this.level - 1) / 2));
      if (this.copTimer <= 0 && this.cops.length < wanted) {
        this.spawnCop();
        this.copTimer = rand(7, 12);
      }
    }

    /* How far a cruiser could run at lateral position `x` before it meets
       traffic, plus the speed of whatever is in the way. */
    copClearance(c, x) {
      let clear = 6000, blockSpeed = Infinity;
      for (const list of [this.traffic, this.hazards]) {
        for (const e of list) {
          const dz = e.z - c.z;
          if (dz < -400 || dz > 6000) continue;
          if (Math.abs(e.x - x) > (e.w + 380) / 2 + 90) continue;
          const d = Math.max(0, dz);
          if (d < clear) { clear = d; blockSpeed = e.speed || 0; }
        }
      }
      return { clear: clear, blockSpeed: blockSpeed === Infinity ? c.speed : blockSpeed };
    }

    /* Best lateral line for a cruiser: open road, weighted toward `desired`. */
    copLine(c, desired) {
      const options = [];
      for (let i = 0; i < LANES; i++) options.push(laneX(i));
      if (Math.abs(desired) <= HALF) options.push(desired);
      let best = { x: desired, clear: 0, blockSpeed: c.speed }, bestScore = -Infinity;
      for (const x of options) {
        const info = this.copClearance(c, x);
        const score = Math.min(info.clear, 6000)
                    - Math.abs(x - desired) * 0.6
                    - Math.abs(x - c.x) * 0.25;
        if (score > bestScore) {
          bestScore = score;
          best = { x: clamp(x, -HALF - 120, HALF + 120), clear: info.clear, blockSpeed: info.blockSpeed };
        }
      }
      return best;
    }

    updateItems(dt) {
      const p = this.player;
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const it = this.pickups[i];
        it.phase += dt * 5;
        if (it.z < p.z - 2500) this.pickups.splice(i, 1);
      }
      for (let i = this.hazards.length - 1; i >= 0; i--) {
        if (this.hazards[i].z < p.z - 2500) this.hazards.splice(i, 1);
      }
    }

    /* ---- collisions ------------------------------------------------ */

    collisions(dt) {
      const p = this.player;

      /* Player into traffic */
      for (const e of this.traffic) {
        if (!this.overlap(p.x, p.z, PLAYER.w, PLAYER.l, e.x, e.z, e.w, e.l)) continue;
        if (e.hitT > 0) continue;
        e.hitT = 0.6;
        this.crash(e);
      }

      /* Cops: into us, or into traffic */
      for (let i = this.cops.length - 1; i >= 0; i--) {
        const c = this.cops[i];
        if (this.overlap(p.x, p.z, PLAYER.w, PLAYER.l, c.x, c.z, 380, 660)) {
          const side = p.x >= c.x ? 1 : -1;
          p.x += side * 90;
          p.vx += side * 450;
          p.speed *= 0.88;
          c.z -= 260;
          this.heat = Math.min(CFG.heatMax, this.heat + 7);
          this.shake = Math.max(this.shake, 0.7);
          this.flash = Math.max(this.flash, 0.35);
          sfx.scrape();
          if (!c.rammedT || this.time - c.rammedT > 1.2) {
            this.popup('RAMMED!', '#ff6b6b');
            c.rammedT = this.time;
          }
        }
        let wrecked = false;
        for (let j = this.traffic.length - 1; j >= 0; j--) {
          const e = this.traffic[j];
          if (!this.overlap(c.x, c.z, 380, 660, e.x, e.z, e.w, e.l)) continue;
          wrecked = true;
          break;
        }
        if (wrecked) {
          this.cops.splice(i, 1);
          this.copsWrecked++;
          this.score += 750;
          this.heat = Math.max(0, this.heat - 18);
          this.popup('CRUISER WRECKED  +750', '#ffd166');
          sfx.wreck();
          this.shake = Math.max(this.shake, 0.5);
          this.copTimer = rand(5, 9);
        }
      }

      /* Pickups */
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const it = this.pickups[i];
        if (!this.overlap(p.x, p.z, PLAYER.w + 60, PLAYER.l, it.x, it.z, 300, 400)) continue;
        this.pickups.splice(i, 1);
        sfx.pickup();
        if (it.type === 'nitro') {
          p.nitro = Math.min(1, p.nitro + 0.34);
          this.popup('NITRO +', '#57d8ff');
        } else {
          this.cashGrabbed++;
          const gain = 150 * Math.max(1, this.combo);
          this.score += gain;
          this.heat = Math.max(0, this.heat - 1.5);
          this.popup('CASH +' + gain, '#7ee08a');
        }
      }

      /* Hazards */
      for (let i = this.hazards.length - 1; i >= 0; i--) {
        const hz = this.hazards[i];
        if (!this.overlap(p.x, p.z, PLAYER.w, PLAYER.l, hz.x, hz.z, hz.w, hz.l)) continue;
        if (hz.type === 'oil') {
          if (p.oilT <= 0) {
            p.oilT = 1.7;
            this.popup('OIL SLICK!', '#b09cff');
            sfx.scrape();
          }
        } else {
          this.hazards.splice(i, 1);
          p.speed *= 0.9;
          this.heat = Math.min(CFG.heatMax, this.heat + 2);
          this.shake = Math.max(this.shake, 0.3);
          sfx.scrape();
        }
      }

      for (const e of this.traffic) if (e.hitT > 0) e.hitT -= dt;
    }

    overlap(x1, z1, w1, l1, x2, z2, w2, l2) {
      return Math.abs(x1 - x2) < (w1 + w2) / 2 * 0.92 &&
             Math.abs(z1 - z2) < (l1 + l2) / 2 * 0.9;
    }

    crash(e) {
      const p = this.player;
      const impact = this.speedRatio();
      p.speed = Math.min(p.speed * 0.4, e.speed * 0.85);
      p.z = e.z - (e.l + PLAYER.l) / 2 - 20;
      const side = p.x >= e.x ? 1 : -1;
      p.x += side * 60;
      p.vx = side * 500;
      p.crashT = 0.85;
      p.boosting = false;
      this.combo = 0;
      this.heat = Math.min(CFG.heatMax, this.heat + 10 + 18 * impact);
      this.shake = 1;
      this.flash = 0.8;
      sfx.crash();
      this.popup('CRASH!', '#ff5c5c');
    }

    nearMiss() {
      this.combo = Math.min(this.combo + 1, 20);
      this.comboT = 3;
      this.nearMisses++;
      const gain = 40 * this.combo;
      this.score += gain;
      this.heat = Math.max(0, this.heat - 0.8);
      sfx.nearMiss();
      if (this.combo >= 2) this.popup('NEAR MISS x' + this.combo + '  +' + gain, '#ffd166');
    }

    /* ---- pursuit pressure ------------------------------------------ */

    updateHeat(dt) {
      const p = this.player;
      const near = this.nearestCop();
      let gain = -9 * dt;                             // cools off when you are clean
      if (near) {
        const dz = p.z - near.z;
        if (dz > -600 && dz < 1500) {
          const close = 1 - clamp((dz + 600) / 2100, 0, 1);
          gain = (1.5 + 16 * close) * dt;
        }
      }
      if (p.boosting) gain -= 22 * dt;
      this.heat = clamp(this.heat + gain, 0, CFG.heatMax);
      if (this.heat >= CFG.heatMax) this.gameOver('BUSTED');
    }

    nearestCop() {
      let best = null, bestDz = Infinity;
      for (const c of this.cops) {
        const dz = Math.abs(this.player.z - c.z);
        if (dz < bestDz) { bestDz = dz; best = c; }
      }
      return best;
    }

    progress(dt) {
      this.score += (this.player.speed / CFG.unitsPerMetre) * dt * 0.9;
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
      const lvl = 1 + Math.floor(this.metres() / CFG.metresPerLevel);
      if (lvl > this.level) {
        const before = Math.min(CFG.copMax, 1 + Math.floor((this.level - 1) / 2));
        this.level = lvl;
        const after = Math.min(CFG.copMax, 1 + Math.floor((this.level - 1) / 2));
        sfx.levelUp();
        this.popup('LEVEL ' + lvl, '#57d8ff');
        if (after > before) this.popup('THEY CALLED BACKUP', '#ff6b6b');
      }
    }

    /* ---- spawning -------------------------------------------------- */

    spawning(dt) {
      const wanted = Math.min(16, 5 + this.level);
      if (this.traffic.length < wanted) this.spawnTraffic();

      this.pickupTimer -= dt;
      if (this.pickupTimer <= 0) {
        this.pickupTimer = rand(1.2, 2.6);
        this.spawnPickup();
      }

      this.hazardTimer -= dt;
      if (this.hazardTimer <= 0) {
        this.hazardTimer = rand(6, 13);
        if (this.level >= 2) this.spawnHazard();
      }
    }

    /* Is a lane free around this z? Keeps spawns fair and gaps drivable. */
    laneClear(x, z, span, ignore) {
      const all = [this.traffic, this.hazards];
      for (const list of all) {
        for (const e of list) {
          if (e === ignore) continue;
          if (Math.abs(e.x - x) > CFG.laneWidth * 0.8) continue;
          if (Math.abs(e.z - z) < span) return false;
        }
      }
      return true;
    }

    spawnTraffic(atZ) {
      const z = atZ != null ? this.player.z + atZ : this.player.z + CFG.drawDist * 0.94;
      /* Never wall off every lane: leave at least one clean line through. */
      const free = [];
      for (let i = 0; i < LANES; i++) {
        if (this.laneClear(laneX(i), z, 2000)) free.push(i);
      }
      if (free.length <= 1) return;

      const lane = pick(free);
      const t = pick(TYPE_BAG);
      const isBig = t.paint === 'truck' || t.paint === 'bus';
      const e = {
        x: laneX(lane), z: z,
        w: t.w, l: t.l, h: t.h,
        kind: t.kind, paint: t.paint || 'car',
        roofW: t.roofW, roofY: t.roofY, spoiler: t.spoiler,
        color: isBig ? pick(TRUCK_COLORS) : pick(CAR_COLORS),
        speed: this.topSpeed() * rand(t.speedF[0], t.speedF[1]),
        braking: chance(0.25),
        hitT: 0, passed: false, targetX: null,
        switchT: !isBig && chance(0.3) ? rand(2, 6) : null
      };
      this.traffic.push(e);
    }

    spawnCop() {
      const p = this.player;
      this.cops.push({
        x: p.x + rand(-300, 300),
        z: p.z - rand(5200, 7200),
        speed: p.speed * 1.05,
        side: chance(0.5) ? -1 : 1,
        state: 'chase',
        phase: rand(0, 6.28),
        rammedT: 0
      });
      sfx.resume();
      this.popup(this.cops.length > 1 ? 'ANOTHER CRUISER!' : 'POLICE PURSUIT!', '#ff6b6b');
    }

    spawnPickup() {
      const z = this.player.z + CFG.drawDist * 0.9;
      const free = [];
      for (let i = 0; i < LANES; i++) if (this.laneClear(laneX(i), z, 1200)) free.push(i);
      if (!free.length) return;
      const lane = pick(free);
      const type = chance(0.3) ? 'nitro' : 'cash';
      const run = type === 'cash' ? randInt(1, 3) : 1;
      for (let i = 0; i < run; i++) {
        this.pickups.push({
          type: type, x: laneX(lane), z: z + i * 700, phase: rand(0, 6.28)
        });
      }
    }

    spawnHazard() {
      const z = this.player.z + CFG.drawDist * 0.9;
      const free = [];
      for (let i = 0; i < LANES; i++) if (this.laneClear(laneX(i), z, 1600)) free.push(i);
      if (free.length <= 1) return;
      const lane = pick(free);
      if (this.level >= 3 && chance(0.4)) {
        this.hazards.push({ type: 'oil', x: laneX(lane), z: z, w: 420, l: 420, h: 420 });
      } else {
        const n = randInt(2, 4);
        for (let i = 0; i < n; i++) {
          this.hazards.push({ type: 'cone', x: laneX(lane) + rand(-60, 60), z: z + i * 420, w: 170, l: 170, h: 240 });
        }
      }
    }

    /* ---- effects & HUD state --------------------------------------- */

    popup(text, color) {
      this.popups.push({ text: text, color: color || '#fff', t: 0, life: 1.5 });
      if (this.popups.length > 5) this.popups.shift();
    }

    updateEffects(dt) {
      this.shake = Math.max(0, this.shake - dt * 2.2);
      this.flash = Math.max(0, this.flash - dt * 2.4);
      for (let i = this.popups.length - 1; i >= 0; i--) {
        this.popups[i].t += dt;
        if (this.popups[i].t > this.popups[i].life) this.popups.splice(i, 1);
      }
    }

    audio() {
      if (this.state !== 'playing') return;
      const near = this.nearestCop();
      let siren = 0;
      if (near) {
        const dz = Math.abs(this.player.z - near.z);
        siren = clamp(1 - dz / 6000, 0, 1);
      }
      sfx.drive(this.speedRatio(), this.player.boosting, siren, this.player.offRoad);
    }

    syncHud(force) {
      const c = this.hudCache;
      const kmh = Math.round(this.player.speed / CFG.unitsPerMetre * 3.6);
      const set = (key, val, node, fn) => {
        if (!force && c[key] === val) return;
        c[key] = val;
        fn ? fn(val) : (node.textContent = val);
      };
      const ui = this.ui;
      set('score', Math.floor(this.score).toLocaleString(), ui.score);
      set('best', this.best.toLocaleString(), ui.best);
      set('speed', kmh, ui.speed);
      set('dist', Math.floor(this.metres()).toLocaleString(), ui.dist);
      set('level', this.level, ui.level);
      set('heat', Math.round(this.heat), null, (v) => {
        ui.heatFill.style.width = v + '%';
        ui.heatBar.classList.toggle('warn', v > 55);
        ui.heatBar.classList.toggle('danger', v > 80);
      });
      set('nitro', Math.round(this.player.nitro * 100), null, (v) => {
        ui.nitroFill.style.width = v + '%';
        ui.nitroBar.classList.toggle('ready', v > 15);
      });
    }

    /* ---- render ---------------------------------------------------- */

    render() {
      const ctx = this.ctx;
      const cam = this.cam;
      ctx.save();
      if (this.shake > 0) {
        const s = this.shake * 14;
        ctx.translate(rand(-s, s), rand(-s, s));
      }
      R.drawBackdrop(ctx, cam);
      const firstSeg = R.drawRoad(ctx, cam);
      this.drawSprites(ctx, cam, firstSeg);
      ctx.restore();

      this.drawWash(ctx);
      if (this.player.boosting) this.drawSpeedLines(ctx);
      if (this.flash > 0) {
        ctx.fillStyle = 'rgba(255,90,70,' + (this.flash * 0.5) + ')';
        ctx.fillRect(0, 0, W, H);
      }
      this.drawVignette(ctx);
      this.drawRadar(ctx);
      this.drawPopups(ctx);
      if (this.state === 'playing' && this.player.oilT > 0) {
        ctx.fillStyle = 'rgba(150,120,255,0.10)';
        ctx.fillRect(0, 0, W, H);
      }
    }

    /* One depth-sorted pass over scenery, items and vehicles. */
    drawSprites(ctx, cam, firstSeg) {
      const list = [];
      const SEG = CFG.segLen;
      const segCount = Math.ceil(CFG.drawDist / SEG);

      for (let i = 0; i < segCount; i++) {
        const s = firstSeg + i;
        const z = s * SEG;
        /* Scenery this close is beside the lens, not in view — and it would
           be drawn a hundred screens wide. */
        if (z <= cam.z + 1100) continue;
        const side = hash(s * 1.31) > 0.5 ? 1 : -1;
        const off = HALF + 900 + hash(s * 2.17) * 2600;
        const r = hash(s);
        if (s % 9 === 0) {
          list.push({ z: z, x: -(HALF + 300), w: 220, h: 1500, p: S.lamp, d: { flip: false } });
          list.push({ z: z, x: (HALF + 300), w: 220, h: 1500, p: S.lamp, d: { flip: true } });
        } else if (s % 53 === 0) {
          list.push({ z: z, x: side * (HALF + 1900), w: 1700, h: 1200, p: S.billboard,
                      d: { bg: hash(s * 5.1) > 0.5 ? '#2b6ca8' : '#a83b6c' } });
        } else if (s % 31 === 0) {
          list.push({ z: z, x: side * (HALF + 420), w: 700, h: 800, p: S.sign, d: {} });
        } else if (r < 0.30) {
          list.push({ z: z, x: side * off, w: 1300, h: 1700, p: S.tree, d: { tint: hash(s * 7.3) > 0.5 } });
        } else if (r < 0.36) {
          list.push({ z: z, x: side * off, w: 900, h: 700, p: S.rock, d: {} });
        }
      }

      for (const hz of this.hazards) {
        if (hz.z <= cam.z + 60) continue;
        if (hz.type === 'oil') list.push({ z: hz.z, x: hz.x, w: 520, h: 520, p: S.oil, d: { flat: true } });
        else list.push({ z: hz.z, x: hz.x, w: 240, h: 300, p: S.cone, d: {} });
      }
      for (const it of this.pickups) {
        if (it.z <= cam.z + 60) continue;
        list.push({ z: it.z, x: it.x, w: 320, h: 360, p: it.type === 'nitro' ? S.nitro : S.cash,
                    d: { phase: it.phase, lift: 60 } });
      }
      for (const e of this.traffic) {
        if (e.z <= cam.z + 60) continue;
        const paint = e.paint === 'truck' ? S.truckRear : e.paint === 'bus' ? S.busRear : S.carRear;
        list.push({ z: e.z, x: e.x, w: e.w, h: e.h, p: paint, d: e });
      }
      for (const c of this.cops) {
        if (c.z <= cam.z + 60) continue;
        list.push({ z: c.z, x: c.x, w: 400, h: 300, p: S.policeRear, d: c });
      }
      const p = this.player;
      list.push({
        z: p.z, x: p.x, w: PLAYER.w, h: PLAYER.h, p: S.carRear,
        d: { color: '#3fbf6f', roofW: 0.33, roofY: -0.6, spoiler: true, frog: true,
             braking: input.braking() && this.state === 'playing' }
      });

      list.sort((a, b) => b.z - a.z);
      for (const item of list) {
        S.place(ctx, cam, item.x + R.centreAt(item.z), item.z, item.w, item.h, item.p, item.d);
      }
    }

    /* Red/blue strobe spilling over the road when a cruiser is on your bumper. */
    drawWash(ctx) {
      const near = this.nearestCop();
      if (!near) return;
      const dz = this.player.z - near.z;
      if (dz < -400 || dz > 2200) return;
      const k = clamp(1 - dz / 2200, 0, 1) * 0.38;
      const redOn = Math.sin(near.phase) > 0;
      const g = ctx.createLinearGradient(0, H, 0, H * 0.58);
      const col = redOn ? '255,40,40' : '60,110,255';
      g.addColorStop(0, 'rgba(' + col + ',' + (k * 0.7) + ')');
      g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.58, W, H * 0.42);
    }

    drawSpeedLines(ctx) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      const cx = W / 2, cy = R.HORIZON + 40;
      for (let i = 0; i < 26; i++) {
        const a = hash(i * 3.7 + Math.floor(this.time * 20) * 0.013) * Math.PI * 2;
        const r0 = 180 + hash(i * 9.1) * 300;
        const len = 60 + hash(i * 5.3) * 140;
        ctx.globalAlpha = 0.18 + hash(i * 1.7) * 0.3;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.6);
        ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len) * 0.6);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawVignette(ctx) {
      const heat = this.heat / CFG.heatMax;
      if (heat < 0.5) return;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 8);
      const a = (heat - 0.5) * 2 * (0.25 + 0.35 * pulse);
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
      g.addColorStop(0, 'rgba(255,0,0,0)');
      g.addColorStop(1, 'rgba(255,20,20,' + a.toFixed(3) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    /* Rear-view radar: the cops behind you are invisible otherwise. */
    drawRadar(ctx) {
      if (this.state === 'menu') return;
      const bw = 210, bh = 104, bx = W - bw - 22, by = H - bh - 20;
      const RANGE = 7000;
      ctx.save();
      ctx.globalAlpha = 0.88;
      FROG.util.roundRect(ctx, bx, by, bw, bh, 10);
      ctx.fillStyle = 'rgba(8,10,22,0.72)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(140,160,220,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(180,200,255,0.7)';
      ctx.textAlign = 'left';
      ctx.fillText('REAR VIEW', bx + 10, by + 16);

      /* lane guides */
      ctx.strokeStyle = 'rgba(140,160,220,0.14)';
      for (let i = 1; i < LANES; i++) {
        const x = bx + bw * (0.2 + 0.6 * (i / LANES));
        ctx.beginPath();
        ctx.moveTo(x, by + 22);
        ctx.lineTo(x, by + bh - 8);
        ctx.stroke();
      }

      const mapX = (x) => bx + bw * (0.5 + 0.6 * clamp(x / (HALF + 400), -1, 1) * 0.5);
      const py = by + bh - 12;
      ctx.fillStyle = '#3fbf6f';
      ctx.beginPath();
      ctx.moveTo(mapX(this.player.x), py - 9);
      ctx.lineTo(mapX(this.player.x) - 6, py);
      ctx.lineTo(mapX(this.player.x) + 6, py);
      ctx.closePath();
      ctx.fill();

      let nearest = Infinity;
      for (const c of this.cops) {
        const dz = this.player.z - c.z;
        if (dz < -1200 || dz > RANGE) continue;
        nearest = Math.min(nearest, Math.max(0, dz));
        const t = clamp(dz / RANGE, -0.2, 1);
        const cy = py - 12 - t * (bh - 44);
        const on = Math.sin(c.phase) > 0;
        ctx.fillStyle = on ? '#ff3b3b' : '#4d7bff';
        ctx.beginPath();
        ctx.ellipse(mapX(c.x), cy, 5.5, 5.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.ellipse(mapX(c.x), cy, 11, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.88;
      }

      ctx.textAlign = 'right';
      ctx.fillStyle = nearest < 1200 ? '#ff6b6b' : 'rgba(180,200,255,0.7)';
      ctx.fillText(nearest === Infinity ? 'CLEAR' : Math.round(nearest / CFG.unitsPerMetre) + ' m', bx + bw - 10, by + 16);
      ctx.restore();
    }

    drawPopups(ctx) {
      ctx.save();
      ctx.textAlign = 'center';
      for (let i = 0; i < this.popups.length; i++) {
        const p = this.popups[i];
        const k = p.t / p.life;
        ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - Math.pow(k, 3);
        ctx.font = '800 30px system-ui, "Segoe UI", sans-serif';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        const y = H * 0.30 - i * 36 - k * 26;
        ctx.fillText(p.text, W / 2 + 2, y + 2);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, W / 2, y);
      }
      ctx.restore();
    }
  }

  FROG.Game = Game;
})(window.FROG);
