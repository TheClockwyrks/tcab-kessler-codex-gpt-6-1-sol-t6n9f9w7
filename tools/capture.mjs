/* global document, KeyboardEvent */
// Run against `npm run dev`. The game handle stays in this driver's JSHandle.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { log } from "node:console";

await mkdir("showcase", { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// An isolated canvas avoids a second bootstrap loop while the driver steps frames.
await page.route("http://localhost:5173/", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><head><style>html,body{margin:0;background:#060d17;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style></head><body><canvas id="stage"></canvas></body></html>',
  }),
);
await page.goto("http://localhost:5173");
const handle = await page.evaluateHandle(async () => {
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const { game, BACKGROUND } = await import("/src/game.ts");
  const engine = createEngine({
    canvas: document.querySelector("canvas"),
    width: 1000,
    height: 1000,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(1000 / 60),
  });
  await engine.initialize();
  await engine.advance(1);
  return engine;
});
await page.screenshot({ path: "showcase/title.png" });
await handle.evaluate(async (engine) => {
  const key = (code, down) =>
    document.dispatchEvent(
      new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }),
    );
  key("Enter", true);
  await engine.advance(1);
  key("Enter", false);
  const d = engine.debug;
  // Real catches stage the tools; all consequences thereafter are normal play.
  for (const kind of ["multiball", "widen", "shield"])
    engine.apply((s) => d.spawnPod(s, kind, 500, 697));
  await engine.advance(1);
  key("Space", true);
  await engine.advance(1);
  key("Space", false);
  await engine.advance(55);
  engine.startRecording();
});
for (let batch = 0; batch < 10; batch++) {
  await handle.evaluate(async (engine) => {
    for (let i = 0; i < 30; i++) {
      const s = engine.debug.snapshot(engine.state);
      const incoming = s.balls
        .filter((b) => !b.parked && (b.x - 500) * b.vx + (b.y - 500) * b.vy < 0)
        .sort(
          (a, b) =>
            Math.hypot(a.x - 500, a.y - 500) - Math.hypot(b.x - 500, b.y - 500),
        )[0];
      const target = incoming
        ? (Math.atan2(incoming.y - 500, incoming.x - 500) * 180) / Math.PI
        : s.paddle.angleDeg;
      const diff = ((target - s.paddle.angleDeg + 540) % 360) - 180;
      for (const [code, down] of [
        ["KeyD", diff > 5],
        ["KeyA", diff < -5],
      ])
        document.dispatchEvent(
          new KeyboardEvent(down ? "keydown" : "keyup", {
            code,
            bubbles: true,
          }),
        );
      await engine.advance(1);
    }
  });
  if (batch === 3) await page.screenshot({ path: "showcase/field.png" });
}
const recording = await handle.evaluate((engine) => engine.stopRecording());
await writeFile(
  "showcase/orbital-sweep.json.gz",
  gzipSync(JSON.stringify(recording)),
);
const snapshot = await handle.evaluate((engine) =>
  engine.debug.snapshot(engine.state),
);
log({
  errors,
  frames: recording.frames.length,
  score: snapshot.score,
  screen: snapshot.screen,
});
await handle.evaluate((engine) => engine.destroy());
await browser.close();
