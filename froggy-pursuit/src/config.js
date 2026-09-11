/* Global namespace + tunables for Froggy Pursuit. */
window.FROG = window.FROG || {};

FROG.CFG = {
  /* Logical render resolution. Everything in the game reasons in these
     pixels; main.js scales the backing store for the real display. */
  width: 1280,
  height: 720,
  horizon: 0.40,        // fraction of height where the vanishing point sits

  /* World units. ~140 units = 1 metre, which puts a 4-lane road at 14m. */
  unitsPerMetre: 140,
  roadHalf: 1000,       // half the drivable width
  lanes: 4,
  laneWidth: 500,
  shoulder: 260,        // driveable-but-slow strip outside the road
  segLen: 200,          // length of one road segment (stripe granularity)
  drawDist: 20000,      // how far ahead we render

  camHeight: 900,       // camera height above the road surface
  camBehind: 800,       // how far behind the player the camera sits
  fov: 100,

  /* Player */
  speedBase: 7600,      // top speed at level 1
  speedPerLevel: 420,
  speedMin: 1100,
  accel: 3300,
  decel: 7000,
  brake: 9000,
  steer: 1650,          // lateral units per second
  boostMult: 1.34,
  nitroBurn: 0.34,      // tank fraction per second while boosting
  nitroRegen: 0.015,

  /* Pursuit */
  copTopFactor: 0.955,  // cops are a hair slower than a clean, fast player
  copMax: 4,
  heatMax: 100,
  metresPerLevel: 900
};
