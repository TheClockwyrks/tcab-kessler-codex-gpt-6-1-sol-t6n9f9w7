# Kessler

Clear the sky. Ride a deflector around a living planet and send a demolition ball into three rings of derelict spacecraft. Steer your returns, catch salvage, and survive increasingly fast orbits across endless waves.

## Run

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Sound unlocks on your first key press or click.

## Controls

| Action | Keys |
| --- | --- |
| Rotate counterclockwise / clockwise | Left / Right arrows or A / D |
| Launch the parked ball | Space |
| Move through a menu | Up / Down arrows or W / S |
| Confirm | Enter or Space |
| Pause / resume | Escape or P |
| Return from the field guide | Escape, Enter or Space |
| Debug overlay | Backtick |

Menus also accept mouse, pen and touch. Playing uses the keyboard. Hit the paddle off-center to steer a return. Losing the last live ball costs one of three lives. Clear every target to reach the next wave.

Salvage: cyan expansion braces widen the paddle; red bars narrow it; purple clusters launch extra balls; blue shields stop one incoming ball; amber bolts let balls pierce armor. Timed effects appear at the lower left of the field.

## Production

```sh
npm run build
npm run preview
```

`dist/` is the complete static site. Serve it at a domain root or any directory path. It needs no server logic, credentials or external services. `public/assets` links to the committed `assets/` directory, so Vite copies the genuine produced art, effects and audio into the bundle at their original paths.

The build never runs asset-generation tools. `tools/produce.py` documents the optional, one-time authoring process, using `draw`, `draw-sheet`, `particle-2d`, `sfx-synth`, and `music`. The finished files are already committed. Both music loops are 15.9 seconds, circularly crossfaded and mixed below the cues.

## Verification

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The tests run the actual engine over a native canvas and deterministic clocks. They cover menus and touch, tick accumulation, polar contacts, reflection speed, damage and scoring, salvage effects, shields, lives, wave transitions, and immutable debug poses. Browser assets are decoded in Chromium for the showcase captures. The Node tests adapt the image codec and audio decoder to their headless host.

`src/simulation.ts` is the fixed-tick simulation; `src/debug.ts` provides pure poses and readings through `engine.debug`; `src/presentation.ts` draws the field and screens and plays the produced particle systems. No debug object is published on the page.

The store presentation lives in `showcase/`. To recapture its screenshots and five-second engine replay, run the development server and then `node tools/capture.mjs`.
