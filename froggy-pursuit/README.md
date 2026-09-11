# Froggy Pursuit

An endless highway escape in the spirit of Temple Run and Subway Surfers, but
behind a steering wheel: traffic comes at you, police cruisers come after you,
and the only way out is to keep swerving.

Pure HTML5 canvas and vanilla JavaScript — no build step, no dependencies, no
asset files. Every car, tree and siren is drawn or synthesised at runtime.

## Play

Open `index.html` in any modern browser. That's it.

To serve it over HTTP instead (handy for phones on the same network):

```sh
npx http-server . -p 8080     # then open http://localhost:8080
```

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Swerve | `←` `→` or `A` `D` | drag anywhere |
| Nitro boost | `Space` or `Shift` | hold the **NITRO** pedal |
| Brake | `↓` or `S` | — |
| Pause | `P` or `Esc` | ⏸ button |
| Sound | `M` | 🔊 button |

## How it plays

- **Traffic is the real threat.** A crash dumps most of your speed, and speed is
  the only thing keeping the cruisers off you.
- **The heat bar is the clock.** It fills whenever a cruiser is on your bumper
  and drains when you are clear, faster while boosting. Fill it and you are
  busted — that is the only way to lose.
- **Near misses pay.** Squeeze past a car and the combo multiplier climbs; it
  resets when you crash.
- **Bait the police into traffic.** Cruisers pick the clearest lane and lift off
  when their line closes up, so a wreck only happens if you box one in: cut
  across at the last moment and let the truck you just dodged do the work.
  A wrecked cruiser is 750 points and a big chunk of heat gone.
- **Cash and nitro cans** sit in the lanes. Cash scores at your current combo,
  nitro fills the tank.
- Every 900 m is a level: faster traffic, denser lanes, cones, oil slicks, and
  eventually up to four cruisers at once.

## Code map

| File | What lives there |
| --- | --- |
| `src/config.js` | Every tunable: speeds, road geometry, pursuit pressure |
| `src/util.js` | Maths helpers, deterministic noise, safe `localStorage` |
| `src/road.js` | The pseudo-3D projection and the road/backdrop rendering |
| `src/sprites.js` | Vehicle, pickup and scenery painters (unit-box canvas art) |
| `src/game.js` | Entities, driving physics, police AI, scoring, HUD, effects |
| `src/audio.js` | Procedural engine, siren and impact sound |
| `src/input.js` | Keyboard and pointer handling |
| `src/main.js` | Canvas sizing, frame loop, menu wiring |

### The projection

The road is a fixed winding ribbon in world space: its centre line and height
are pure functions of `z` (`centreAt` / `heightAt` in `road.js`), so it scrolls
for free as you drive and the curve derivative doubles as the force that pushes
you toward the outside of a bend. Everything else is standard pseudo-3D —
`scale = cameraDepth / dz`, then world sizes multiply straight through it.

Entities store their lateral position relative to the road centre, so a car's
world position is `x + centreAt(z)`. Everything is depth-sorted and drawn back
to front in one pass.

### Tuning

Most of the feel is in `src/config.js`. A few starting points:

- `speedBase` / `speedPerLevel` — how fast the game gets
- `copTopFactor` — how hard it is to outrun the police (below 1 means a clean,
  fast line gains ground)
- `heatMax` and the rates in `updateHeat` (`game.js`) — how long you survive
  with a cruiser on your bumper
- `drawDist` — how much road you can see, and therefore your reaction time

The game renders at a fixed logical 1280×720 and scales to the display, so
tuning numbers mean the same thing on every screen.
