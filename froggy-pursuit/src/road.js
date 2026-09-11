/* Pseudo-3D road: projection, the shape of the highway, and the world backdrop. */
(function (FROG) {
  'use strict';

  const CFG = FROG.CFG;
  const { hash } = FROG.util;

  const W = CFG.width, H = CFG.height;
  const HORIZON = H * CFG.horizon;
  const CAM_DEPTH = 1 / Math.tan((CFG.fov / 2) * Math.PI / 180);

  /* The highway is a fixed winding ribbon in world space: its centre and
     height are pure functions of z, so it scrolls for free as we drive. */
  function centreAt(z) {
    return 900 * Math.sin(z * 0.00011) + 500 * Math.sin(z * 0.00019 + 2.1);
  }
  function heightAt(z) {
    return 600 * Math.sin(z * 0.00007) + 260 * Math.sin(z * 0.00017 + 0.8);
  }
  /* d(centre)/dz — how hard the current bend throws you sideways. */
  function curveAt(z) {
    return 900 * 0.00011 * Math.cos(z * 0.00011) + 500 * 0.00019 * Math.cos(z * 0.00019 + 2.1);
  }
  function slopeAt(z) {
    return 600 * 0.00007 * Math.cos(z * 0.00007) + 260 * 0.00017 * Math.cos(z * 0.00017 + 0.8);
  }

  /* World point -> screen. `scale` also converts world sizes to pixels. */
  function project(worldX, worldY, worldZ, cam) {
    const dz = Math.max(worldZ - cam.z, 60);
    const scale = CAM_DEPTH / dz;
    return {
      scale: scale,
      x: W / 2 + scale * (worldX - cam.x) * (W / 2),
      y: HORIZON - scale * (worldY - cam.y) * (H / 2),
      w: scale * CFG.roadHalf * (W / 2)
    };
  }

  const SKY_TOP = '#1b1f4b';
  const SKY_MID = '#5a3a7e';
  const SKY_LOW = '#e8734a';
  const GRASS_A = '#1f5d3a';
  const GRASS_B = '#1a5134';
  const ROAD_A = '#4a4a52';
  const ROAD_B = '#44444c';
  const RUMBLE_A = '#d8d8e0';
  const RUMBLE_B = '#c8393f';

  /* Sky, sun, hills and skyline. Parallax comes from the camera, and a small
     vertical shift from the slope fakes the pitch of cresting a hill. */
  function drawBackdrop(ctx, cam) {
    const sky = ctx.createLinearGradient(0, 0, 0, HORIZON + 40);
    sky.addColorStop(0, SKY_TOP);
    sky.addColorStop(0.55, SKY_MID);
    sky.addColorStop(1, SKY_LOW);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, HORIZON + 2);

    const px = -(cam.x * 0.035) % (W * 2);
    const py = HORIZON + slopeAt(cam.z) * 900;

    /* Sun */
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, HORIZON + 2);
    ctx.clip();
    const sunX = W * 0.72 + px * 0.4;
    const sunY = py - 60;
    const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 240);
    glow.addColorStop(0, 'rgba(255,214,140,0.95)');
    glow.addColorStop(0.35, 'rgba(255,150,90,0.35)');
    glow.addColorStop(1, 'rgba(255,120,80,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 260, sunY - 260, 520, 520);
    ctx.fillStyle = 'rgba(255,232,190,0.95)';
    ctx.beginPath();
    ctx.ellipse(sunX, sunY, 62, 62, 0, 0, Math.PI * 2);
    ctx.fill();

    /* Two ranges of hills */
    for (let layer = 0; layer < 2; layer++) {
      const amp = layer ? 70 : 46;
      const shift = px * (layer ? 0.6 : 0.35);
      ctx.fillStyle = layer ? 'rgba(38,30,72,0.95)' : 'rgba(64,46,96,0.85)';
      ctx.beginPath();
      ctx.moveTo(0, py + 4);
      for (let x = 0; x <= W; x += 16) {
        const t = (x + shift) * 0.004 + layer * 3.1;
        const y = py - 24 - amp * (0.6 + 0.4 * Math.sin(t)) * (1 + 0.35 * Math.sin(t * 0.37));
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, py + 4);
      ctx.closePath();
      ctx.fill();
    }

    /* Skyline: deterministic blocks so it does not shimmer. */
    ctx.fillStyle = 'rgba(24,20,46,0.95)';
    const bShift = px * 0.85;
    for (let i = -2; i < 34; i++) {
      const bw = 26 + hash(i * 3.7) * 54;
      const bh = 24 + hash(i * 1.9) * 96;
      const bx = ((i * 78 + bShift) % (W + 200) + W + 200) % (W + 200) - 100;
      ctx.fillRect(bx, py - bh, bw, bh + 6);
      ctx.fillStyle = 'rgba(255,206,128,0.5)';
      for (let wy = py - bh + 8; wy < py - 6; wy += 12) {
        for (let wx = bx + 5; wx < bx + bw - 5; wx += 10) {
          if (hash(wx * 0.7 + wy * 1.3) > 0.55) ctx.fillRect(wx, wy, 3, 5);
        }
      }
      ctx.fillStyle = 'rgba(24,20,46,0.95)';
    }
    ctx.restore();

    /* Ground under everything we are about to draw. */
    ctx.fillStyle = GRASS_B;
    ctx.fillRect(0, HORIZON, W, H - HORIZON);
  }

  /* The road itself, drawn far to near as a stack of trapezoids. Returns the
     first segment index so callers can seed matching roadside scenery. */
  function drawRoad(ctx, cam) {
    const SEG = CFG.segLen;
    const count = Math.ceil(CFG.drawDist / SEG);
    const z0 = cam.z + 120;              // always ahead of the near plane

    const pts = [];
    for (let i = 0; i <= count; i++) {
      const z = z0 + i * SEG;
      const p = project(centreAt(z), heightAt(z), z, cam);
      p.z = z;
      p.seg = Math.floor(z / SEG);
      pts.push(p);
    }

    const laneCount = CFG.lanes;
    for (let i = count - 1; i >= 0; i--) {
      const far = pts[i + 1], near = pts[i];
      if (near.y < far.y) continue;               // hidden behind a crest
      if (far.y > H) continue;                    // entirely below the screen
      const even = (near.seg & 1) === 0;
      const detail = i < 70;

      /* Grass band */
      ctx.fillStyle = even ? GRASS_A : GRASS_B;
      ctx.fillRect(0, far.y, W, near.y - far.y + 1);

      /* Shoulder + road */
      const sw = CFG.shoulder / CFG.roadHalf;
      quad(ctx, near.x, near.y, near.w * (1 + sw), far.x, far.y, far.w * (1 + sw), '#3b3b45');
      quad(ctx, near.x, near.y, near.w, far.x, far.y, far.w, even ? ROAD_A : ROAD_B);

      /* Rumble strips */
      const rc = even ? RUMBLE_A : RUMBLE_B;
      band(ctx, near, far, -1, 0.11, rc);
      band(ctx, near, far, 1, 0.11, rc);

      if (detail) {
        /* Solid edge lines */
        band(ctx, near, far, -0.93, 0.022, '#e9e9f0');
        band(ctx, near, far, 0.93, 0.022, '#e9e9f0');
        /* Dashed lane dividers, two segments on / two off */
        if (((near.seg >> 1) & 1) === 0) {
          for (let l = 1; l < laneCount; l++) {
            const off = -1 + (2 * l) / laneCount;
            band(ctx, near, far, off, 0.016, '#dcdce6');
          }
        }
      }
    }

    /* Distance haze: melt the far road into the sky. */
    const fog = ctx.createLinearGradient(0, HORIZON - 26, 0, HORIZON + H * 0.16);
    fog.addColorStop(0, 'rgba(126,92,124,0)');
    fog.addColorStop(0.22, 'rgba(126,92,124,0.88)');
    fog.addColorStop(1, 'rgba(126,92,124,0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, HORIZON - 26, W, H * 0.18 + 26);

    return pts[0].seg;
  }

  function quad(ctx, nx, ny, nw, fx, fy, fw, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(nx - nw, ny);
    ctx.lineTo(nx + nw, ny);
    ctx.lineTo(fx + fw, fy);
    ctx.lineTo(fx - fw, fy);
    ctx.closePath();
    ctx.fill();
  }

  /* A stripe running along the road at lateral offset `off` (-1..1 of half width). */
  function band(ctx, near, far, off, widthFrac, color) {
    const nx = near.x + near.w * off, nw = near.w * widthFrac;
    const fx = far.x + far.w * off, fw = far.w * widthFrac;
    quad(ctx, nx, ny(near), Math.max(nw, 0.6), fx, far.y, Math.max(fw, 0.35), color);
  }
  const ny = (p) => p.y;

  FROG.road = {
    HORIZON, CAM_DEPTH,
    centreAt, heightAt, curveAt, slopeAt,
    project, drawBackdrop, drawRoad
  };
})(window.FROG);
