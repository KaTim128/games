/* Everything that stands on the road, painted in a unit box.
   Painters draw inside x -0.5..0.5, y -1..0 (wheels on the ground at y = 0).
   Every car is seen from behind, because the camera always looks forward. */
(function (FROG) {
  'use strict';

  const road = FROG.road;
  const CFG = FROG.CFG;
  const { clamp } = FROG.util;
  const W = CFG.width, H = CFG.height;

  /* Mix a #rrggbb toward black (amt<0) or white (amt>0). */
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = amt < 0 ? 0 : 255;
    const k = Math.abs(amt);
    r = Math.round(r + (t - r) * k);
    g = Math.round(g + (t - g) * k);
    b = Math.round(b + (t - b) * k);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }
  function poly(ctx, points, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.closePath();
    ctx.fill();
  }
  function ellipse(ctx, x, y, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* Project a world position and run a painter scaled to it. */
  function place(ctx, cam, worldX, worldZ, worldW, worldH, painter, data) {
    const p = road.project(worldX, road.heightAt(worldZ) + (data && data.lift || 0), worldZ, cam);
    const sw = p.scale * worldW * (W / 2);
    const sh = p.scale * worldH * (H / 2);
    if (sw < 0.6 || p.y < road.HORIZON - 40 || p.y > H + 400) return;
    if (p.x + sw < -80 || p.x - sw > W + 80) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(sw, sh);
    painter(ctx, data || {}, sw);
    ctx.restore();
  }

  /* Soft light halo. Radii are in the sprite's own unit space. */
  function glow(ctx, x, y, r, rgb, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + alpha + ')');
    g.addColorStop(0.45, 'rgba(' + rgb + ',' + (alpha * 0.45).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function shadow(ctx, spread) {
    ellipse(ctx, 0, 0, (spread || 0.55), 0.085, 'rgba(0,0,0,0.42)');
  }

  /* ---- vehicles ---------------------------------------------------- */

  /* Generic rear view. Shape is driven by `d.profile` so one painter covers
     sedans, sports cars, vans and the player. */
  function carRear(ctx, d) {
    const body = d.color || '#c8442f';
    const dark = shade(body, -0.42);
    const lit = shade(body, 0.16);
    const roofW = d.roofW == null ? 0.34 : d.roofW;
    const roofY = d.roofY == null ? -0.58 : d.roofY;

    shadow(ctx, 0.56);
    /* wheels poking out below the body */
    rect(ctx, -0.5, -0.2, 0.14, 0.2, '#15151a');
    rect(ctx, 0.36, -0.2, 0.14, 0.2, '#15151a');

    /* cabin */
    poly(ctx, [-roofW, roofY, roofW, roofY, roofW - 0.05, -1, -roofW + 0.05, -1], lit);
    /* rear window */
    poly(ctx, [-roofW + 0.04, roofY - 0.03, roofW - 0.04, roofY - 0.03,
               roofW - 0.08, -0.96, -roofW + 0.08, -0.96], 'rgba(30,38,58,0.92)');
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(-roofW + 0.06, roofY - 0.16, (roofW - 0.06) * 2, 0.05);

    /* main body */
    poly(ctx, [-0.5, -0.12, 0.5, -0.12, 0.46, roofY, -0.46, roofY], body);
    /* shoulder highlight + shaded flanks */
    rect(ctx, -0.46, roofY, 0.92, 0.035, lit);
    poly(ctx, [-0.5, -0.12, -0.46, roofY, -0.34, roofY, -0.38, -0.12], 'rgba(0,0,0,0.16)');
    poly(ctx, [0.5, -0.12, 0.46, roofY, 0.34, roofY, 0.38, -0.12], 'rgba(0,0,0,0.16)');

    /* tail lights */
    const glow = d.braking ? '#ff3b30' : '#e0392e';
    ctx.globalAlpha = d.braking ? 0.55 : 0.3;
    ellipse(ctx, -0.34, -0.34, 0.18, 0.12, glow);
    ellipse(ctx, 0.34, -0.34, 0.18, 0.12, glow);
    ctx.globalAlpha = 1;
    rect(ctx, -0.44, -0.4, 0.19, 0.13, glow);
    rect(ctx, 0.25, -0.4, 0.19, 0.13, glow);
    rect(ctx, -0.44, -0.4, 0.19, 0.04, shade('#ffffff', -0.15));
    rect(ctx, 0.25, -0.4, 0.19, 0.04, shade('#ffffff', -0.15));

    /* bumper + plate */
    rect(ctx, -0.5, -0.16, 1, 0.07, dark);
    rect(ctx, -0.1, -0.28, 0.2, 0.09, '#e8e8ee');

    if (d.spoiler) {
      rect(ctx, -0.42, roofY - 0.16, 0.84, 0.06, dark);
      rect(ctx, -0.36, roofY - 0.16, 0.05, 0.16, dark);
      rect(ctx, 0.31, roofY - 0.16, 0.05, 0.16, dark);
    }
    /* the froggy mascot: eye bumps on the roof */
    if (d.frog) {
      ellipse(ctx, -0.17, -1.0, 0.1, 0.09, lit);
      ellipse(ctx, 0.17, -1.0, 0.1, 0.09, lit);
      ellipse(ctx, -0.17, -1.03, 0.045, 0.04, '#ffffff');
      ellipse(ctx, 0.17, -1.03, 0.045, 0.04, '#ffffff');
      ellipse(ctx, -0.17, -1.04, 0.022, 0.022, '#111');
      ellipse(ctx, 0.17, -1.04, 0.022, 0.022, '#111');
    }
  }

  function truckRear(ctx, d) {
    const body = d.color || '#dcdce4';
    shadow(ctx, 0.6);
    rect(ctx, -0.5, -0.22, 0.16, 0.22, '#15151a');
    rect(ctx, 0.34, -0.22, 0.16, 0.22, '#15151a');
    rect(ctx, -0.5, -1, 1, 0.86, body);
    rect(ctx, -0.5, -1, 1, 0.05, shade(body, -0.3));
    /* doors */
    rect(ctx, -0.02, -0.96, 0.04, 0.78, shade(body, -0.35));
    rect(ctx, -0.47, -0.96, 0.02, 0.78, shade(body, -0.2));
    rect(ctx, 0.45, -0.96, 0.02, 0.78, shade(body, -0.2));
    /* marker lights */
    for (let i = -2; i <= 2; i++) ellipse(ctx, i * 0.16, -1.01, 0.028, 0.02, '#ffb340');
    rect(ctx, -0.5, -0.2, 1, 0.06, '#2a2a32');
    rect(ctx, -0.42, -0.3, 0.14, 0.1, '#e0392e');
    rect(ctx, 0.28, -0.3, 0.14, 0.1, '#e0392e');
    /* mudflaps */
    rect(ctx, -0.3, -0.1, 0.18, 0.1, '#1d1d22');
    rect(ctx, 0.12, -0.1, 0.18, 0.1, '#1d1d22');
  }

  function busRear(ctx, d) {
    const body = d.color || '#e8a13c';
    shadow(ctx, 0.58);
    rect(ctx, -0.48, -0.22, 0.16, 0.22, '#15151a');
    rect(ctx, 0.32, -0.22, 0.16, 0.22, '#15151a');
    rect(ctx, -0.5, -1, 1, 0.84, body);
    rect(ctx, -0.4, -0.95, 0.8, 0.3, 'rgba(30,38,58,0.9)');
    rect(ctx, -0.5, -0.62, 1, 0.04, shade(body, -0.3));
    rect(ctx, -0.44, -0.42, 0.16, 0.12, '#e0392e');
    rect(ctx, 0.28, -0.42, 0.16, 0.12, '#e0392e');
    rect(ctx, -0.5, -0.18, 1, 0.06, '#2a2a32');
  }

  /* Police cruiser: black-and-white livery plus a strobing light bar. */
  function policeRear(ctx, d) {
    const phase = d.phase || 0;
    const redOn = Math.sin(phase) > 0;
    carRear(ctx, { color: '#f2f2f6', roofW: 0.33, roofY: -0.56, braking: d.braking });
    /* livery */
    poly(ctx, [-0.5, -0.12, -0.46, -0.56, -0.2, -0.56, -0.26, -0.12], '#15151a');
    poly(ctx, [0.5, -0.12, 0.46, -0.56, 0.2, -0.56, 0.26, -0.12], '#15151a');
    rect(ctx, -0.12, -0.3, 0.24, 0.1, '#1d3f8f');

    /* light bar */
    rect(ctx, -0.3, -1.09, 0.6, 0.09, '#1b1b20');
    rect(ctx, -0.28, -1.08, 0.26, 0.07, redOn ? '#ff2b2b' : '#5a1414');
    rect(ctx, 0.02, -1.08, 0.26, 0.07, redOn ? '#16227a' : '#3a6bff');
    glow(ctx, -0.15, -1.04, 0.55, '255,40,40', redOn ? 0.75 : 0.12);
    glow(ctx, 0.15, -1.04, 0.55, '60,110,255', redOn ? 0.12 : 0.75);
  }

  /* ---- hazards & pickups ------------------------------------------- */

  function cone(ctx) {
    shadow(ctx, 0.4);
    poly(ctx, [-0.36, 0, 0.36, 0, 0.1, -1, -0.1, -1], '#ef6320');
    rect(ctx, -0.26, -0.62, 0.52, 0.18, '#f4f4f8');
    rect(ctx, -0.4, -0.06, 0.8, 0.06, '#d9541a');
  }

  function oil(ctx) {
    ctx.globalAlpha = 0.85;
    ellipse(ctx, 0, 0, 0.5, 0.5, '#121218');
    ellipse(ctx, -0.12, -0.06, 0.22, 0.2, 'rgba(90,70,120,0.6)');
    ctx.globalAlpha = 1;
  }

  function cash(ctx, d) {
    const bob = Math.sin(d.phase || 0) * 0.08;
    shadow(ctx, 0.3);
    ctx.translate(0, bob);
    glow(ctx, 0, -0.5, 0.6, '126,224,138', 0.45);
    rect(ctx, -0.42, -0.72, 0.84, 0.44, '#3f8f4f');
    rect(ctx, -0.38, -0.68, 0.76, 0.36, '#7ee08a');
    ellipse(ctx, 0, -0.5, 0.13, 0.13, '#2c6b38');
  }

  function nitro(ctx, d) {
    const bob = Math.sin(d.phase || 0) * 0.08;
    shadow(ctx, 0.28);
    ctx.translate(0, bob);
    glow(ctx, 0, -0.5, 0.6, '87,216,255', 0.45);
    rect(ctx, -0.24, -0.9, 0.48, 0.8, '#1f6f9c');
    rect(ctx, -0.18, -0.84, 0.36, 0.68, '#57d8ff');
    rect(ctx, -0.1, -1, 0.2, 0.12, '#cfcfd8');
    rect(ctx, -0.14, -0.6, 0.28, 0.1, '#0d3247');
  }

  /* ---- roadside scenery -------------------------------------------- */

  function tree(ctx, d) {
    const tint = d.tint || 0;
    shadow(ctx, 0.3);
    rect(ctx, -0.05, -0.42, 0.1, 0.42, '#3a2a1e');
    const green = tint ? '#1e6b44' : '#17553a';
    ellipse(ctx, 0, -0.55, 0.36, 0.22, green);
    ellipse(ctx, -0.14, -0.72, 0.26, 0.2, shade(green, 0.08));
    ellipse(ctx, 0.16, -0.74, 0.24, 0.18, shade(green, -0.08));
    ellipse(ctx, 0, -0.9, 0.22, 0.18, shade(green, 0.14));
  }

  function lamp(ctx, d) {
    const flip = d.flip ? -1 : 1;
    shadow(ctx, 0.14);
    rect(ctx, -0.03, -1, 0.06, 1, '#3d3d4a');
    ctx.fillStyle = '#3d3d4a';
    ctx.beginPath();
    ctx.moveTo(0, -0.98);
    ctx.quadraticCurveTo(flip * 0.3, -1.04, flip * 0.42, -0.94);
    ctx.lineTo(flip * 0.42, -0.88);
    ctx.quadraticCurveTo(flip * 0.26, -0.96, 0, -0.9);
    ctx.closePath();
    ctx.fill();
    glow(ctx, flip * 0.42, -0.88, 0.34, '255,210,122', 0.4);
    ellipse(ctx, flip * 0.42, -0.9, 0.09, 0.05, '#ffe6a8');
  }

  function billboard(ctx, d) {
    shadow(ctx, 0.35);
    rect(ctx, -0.28, -0.5, 0.06, 0.5, '#2f2f3a');
    rect(ctx, 0.22, -0.5, 0.06, 0.5, '#2f2f3a');
    rect(ctx, -0.5, -1, 1, 0.54, '#20202a');
    rect(ctx, -0.46, -0.96, 0.92, 0.46, d.bg || '#2b6ca8');
    ellipse(ctx, -0.24, -0.73, 0.13, 0.14, '#7ee08a');
    ellipse(ctx, -0.28, -0.79, 0.035, 0.035, '#fff');
    ellipse(ctx, -0.19, -0.79, 0.035, 0.035, '#fff');
    rect(ctx, -0.02, -0.86, 0.44, 0.07, 'rgba(255,255,255,0.9)');
    rect(ctx, -0.02, -0.74, 0.34, 0.06, 'rgba(255,255,255,0.65)');
    rect(ctx, -0.02, -0.63, 0.26, 0.05, 'rgba(255,255,255,0.45)');
  }

  function rock(ctx) {
    shadow(ctx, 0.34);
    poly(ctx, [-0.4, 0, -0.22, -0.6, 0.06, -0.8, 0.32, -0.5, 0.42, 0], '#4a4456');
    poly(ctx, [-0.22, -0.6, 0.06, -0.8, 0.1, -0.4, -0.1, -0.3], 'rgba(255,255,255,0.09)');
  }

  function sign(ctx, d) {
    shadow(ctx, 0.16);
    rect(ctx, -0.04, -0.7, 0.08, 0.7, '#5a5a66');
    rect(ctx, -0.34, -1, 0.68, 0.34, d.bg || '#1f7a46');
    rect(ctx, -0.3, -0.96, 0.6, 0.26, 'rgba(255,255,255,0.86)');
    rect(ctx, -0.24, -0.9, 0.2, 0.14, d.bg || '#1f7a46');
    rect(ctx, 0.0, -0.9, 0.2, 0.14, d.bg || '#1f7a46');
  }

  FROG.sprites = {
    place, shade, glow,
    carRear, truckRear, busRear, policeRear,
    cone, oil, cash, nitro,
    tree, lamp, billboard, rock, sign
  };
})(window.FROG);
