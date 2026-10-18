/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
} from "@clockwyrks/simple-2d";
import { readFile } from "node:fs/promises";
import { game, BACKGROUND } from "./game";
import * as C from "./constants";
import { polar, rad } from "./simulation";

// Browser codecs are host adapters; the engine still loads every committed file.
class AudioDecoder {
  async decodeAudioData(bytes: ArrayBuffer) {
    return { duration: (bytes.byteLength - 44) / 44100 };
  }
}
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    async (path: string) => new Response(await readFile(path)),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal("AudioContext", AudioDecoder);
});
afterEach(() => vi.unstubAllGlobals());
async function setup(clock = new ConstantClock(1000 / C.TICK_HZ)) {
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  const events = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: BACKGROUND,
    clock,
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  const cues: string[] = [];
  engine.events.on("cue:played", (e) => cues.push(e.cue));
  await engine.initialize();
  const d = engine.debug;
  const key = (code: string, down = true) => {
    const e = new Event(down ? "keydown" : "keyup");
    Object.defineProperty(e, "code", { value: code });
    events.dispatchEvent(e);
  };
  const press = async (code: string) => {
    key(code);
    await engine.advance(1);
    key(code, false);
  };
  const pose = (fn: Parameters<typeof engine.apply>[0]) => engine.apply(fn);
  const snap = () => d.snapshot(engine.state);
  const play = () => pose((s) => d.setScreen(s, "playing"));
  const ball = (r: number, a: number, vr: number, vt = 0) => {
    const p = polar(r, a);
    pose((s) =>
      d.spawnBall(
        s,
        p.x,
        p.y,
        vr * Math.cos(rad(a)) - vt * Math.sin(rad(a)),
        vr * Math.sin(rad(a)) + vt * Math.cos(rad(a)),
      ),
    );
  };
  return {
    engine,
    d,
    cues,
    key,
    press,
    pose,
    snap,
    play,
    ball,
    events,
    canvas,
  };
}

describe("engine-driven screens and time", () => {
  it("boots with all resources, bindings, diagnostics, and a pure snapshot", async () => {
    const { engine, d, snap } = await setup();
    const s = snap();
    expect(s.screen).toBe("title");
    expect(s.rings.map((r) => r.targets.length)).toEqual([12, 16, 20]);
    expect(s.balls).toEqual([]);
    expect(Object.keys(engine.state.images)).toHaveLength(12);
    expect(engine.diagnostics().every((d) => !d.error)).toBe(true);
    expect(d.reconcile(engine.state)).toEqual(engine.state);
    expect(d.reset(engine.state).ticks).toBe(0);
    engine.destroy();
  });
  it("starts parked, launches only on a subsequent Space, rotates with either key, freezes and resumes", async () => {
    const { engine, press, key, snap } = await setup();
    await press("Space");
    expect(snap().balls[0].parked).toBe(true);
    await press("Space");
    expect(snap().balls[0].parked).toBe(false);
    key("KeyD");
    await engine.advance(20);
    key("KeyD", false);
    expect(snap().paddle.angleDeg).toBeCloseTo(180);
    await press("KeyP");
    const frozen = snap();
    await engine.advance(60);
    expect(snap().rings).toEqual(frozen.rings);
    expect(snap().balls).toEqual(frozen.balls);
    expect(snap().ticks).toBe(frozen.ticks + 60);
    await press("Escape");
    expect(snap().screen).toBe("playing");
    engine.destroy();
  });
  it("supports how-to, arrival highlights, wrapped menus and quit", async () => {
    const { engine, press, snap } = await setup();
    await press("ArrowUp");
    expect(snap().menu.index).toBe(1);
    await press("Enter");
    expect(snap().screen).toBe("howto");
    await press("Escape");
    expect(snap().menu.index).toBe(1);
    await press("KeyS");
    await press("Enter");
    await press("Escape");
    await press("KeyW");
    await press("Enter");
    expect(snap().screen).toBe("title");
    expect(snap().menu.index).toBe(0);
    engine.destroy();
  });
  it("accepts a same-region touch release and rejects a dragged-out click", async () => {
    const { engine, events, snap, d } = await setup();
    const r = d.menuItemRect(engine.state, 1)!;
    const pointer = (type: string, x: number, y: number) => {
      const e = new Event(type);
      Object.assign(e, {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
      });
      events.dispatchEvent(e);
    };
    pointer("pointerdown", r.x + 10, r.y + 10);
    await engine.advance(1);
    pointer("pointerup", 10, 10);
    await engine.advance(1);
    expect(snap().screen).toBe("title");
    pointer("pointerdown", r.x + 10, r.y + 10);
    pointer("pointerup", r.x + 10, r.y + 10);
    await engine.advance(1);
    expect(snap().screen).toBe("howto");
    engine.destroy();
  });
  it("starts a posed next wave with one serve and consumes all frame time across its transition", async () => {
    const { engine, d, pose, snap, play } = await setup();
    play();
    pose((s) => d.parkBall(s));
    pose((s) => d.setEffectTicks(s, "pierce", 20));
    pose((s) => d.spawnPod(s, "shield", 500, 800));
    pose((s) => d.setScreen(s, "waveclear"));
    pose((s) => d.setInterstitialTicks(s, 1));
    engine.setClock(new ConstantClock(1000));
    await engine.advance(1);
    expect(snap().wave).toBe(2);
    expect(snap().balls).toHaveLength(1);
    expect(snap().balls[0].parked).toBe(true);
    expect(snap().pods).toEqual([]);
    expect(snap().effects.pierceTicks).toBe(0);
    expect(snap().rings[1].angleDeg).toBeCloseTo((15 * 59) / 60);
    engine.destroy();
  });
  it("consumes fractional and uneven frame deltas without losing ticks", async () => {
    const { engine, play, snap } = await setup();
    play();
    engine.setClock(new SequenceClock([5, 25, 10, 10]));
    await engine.advance(40);
    expect(snap().ticks).toBe(30);
    expect(snap().rings[1].angleDeg).toBeCloseTo(6);
    engine.destroy();
  });
});

describe("polar contacts and their audible consequences", () => {
  it("damages an armored target then destroys it, scoring exactly once per fresh face crossing", async () => {
    const { engine, d, pose, play, ball, snap, cues } = await setup();
    play();
    pose((s) => d.clearTargets(s));
    pose((s) => d.setWaveAdvance(s, false));
    pose((s) => d.setPodSpawn(s, false));
    pose((s) => d.setRingSpeed(s, 2, 0));
    pose((s) => d.spawnTarget(s, 2, 0, 2));
    ball(C.RINGS[1].innerContactRadius - 1, 10, 240);
    await engine.advance(1);
    expect(snap().score).toBe(C.HIT_SCORE);
    expect(cues).toContain(C.CUES.targetHit);
    expect(snap().balls[0].vx).toBeLessThan(0);
    pose((s) => d.clearBalls(s));
    ball(C.RINGS[1].innerContactRadius - 1, 10, 240);
    await engine.advance(1);
    expect(snap().score).toBe(C.HIT_SCORE + C.RINGS[1].destroyScore);
    expect(cues).toContain(C.CUES.targetBreak);
    expect(snap().rings[1].targets).toEqual([]);
    engine.destroy();
  });
  it("leaves structural gaps open and resolves relative orbital edge crossings", async () => {
    const { engine, d, pose, play, ball, snap } = await setup();
    play();
    pose((s) => d.setWaveAdvance(s, false));
    pose((s) => d.setPodSpawn(s, false));
    ball(281, 0, 240);
    await engine.advance(1);
    expect(snap().score).toBe(0);
    pose((s) => d.clearBalls(s));
    pose((s) => d.clearTargets(s));
    pose((s) => d.spawnTarget(s, 2, 0, 2));
    pose((s) => d.setRingAngle(s, 2, 0));
    pose((s) => d.setRingSpeed(s, 2, -60));
    ball(C.RINGS[1].midRadius, 1.5, 0, 30);
    await engine.advance(1);
    expect(snap().score).toBe(C.HIT_SCORE);
    engine.destroy();
  });
  it("reflects containment with speed preserved and paddle with wave speed", async () => {
    const { engine, d, pose, play, ball, snap, cues } = await setup();
    play();
    pose((s) => d.clearTargets(s));
    ball(C.FIELD_CONTACT_RADIUS - 1, 0, 300, 50);
    await engine.advance(1);
    let b = snap().balls[0];
    expect(b.vx).toBeLessThan(0);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(Math.hypot(300, 50));
    expect(cues).toContain(C.CUES.fieldBounce);
    pose((s) => d.clearBalls(s));
    pose((s) => d.setPaddleAngle(s, 0));
    pose((s) => d.setWave(s, 4));
    ball(C.DEFLECTOR_BALL_CONTACT_RADIUS + 1, 10, -350);
    await engine.advance(1);
    b = snap().balls[0];
    expect(b.vx).toBeGreaterThan(0);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(330);
    expect(cues).toContain(C.CUES.paddleBounce);
    engine.destroy();
  });
  it("consumes one shield in spawn order, burns balls, loses a life only on the last burn", async () => {
    const { engine, d, pose, play, ball, snap, cues } = await setup();
    play();
    pose((s) => d.setShield(s, true));
    ball(101, 0, -240);
    ball(101, 180, -240);
    await engine.advance(1);
    expect(snap().effects.shieldActive).toBe(false);
    expect(snap().balls[0].vx).toBeGreaterThan(0);
    expect(cues.filter((c) => c === C.CUES.shieldReflect)).toHaveLength(1);
    pose((s) => d.clearBalls(s));
    ball(79, 0, -240);
    ball(210, 90, 0);
    await engine.advance(1);
    expect(snap().lives).toBe(3);
    pose((s) => d.clearBalls(s));
    ball(79, 0, -240);
    await engine.advance(1);
    expect(snap().lives).toBe(2);
    expect(snap().balls[0].parked).toBe(true);
    pose((s) => d.setLives(s, 1));
    pose((s) => d.clearBalls(s));
    ball(79, 0, -240);
    await engine.advance(1);
    expect(snap().screen).toBe("gameover");
    expect(cues).toContain(C.CUES.gameOver);
    engine.destroy();
  });
  it("pierces armor unchanged, consumes a posed draw, clears and refills the next wave after exactly 180 ticks", async () => {
    const { engine, d, pose, play, ball, snap, cues } = await setup();
    play();
    pose((s) => d.clearTargets(s));
    pose((s) => d.spawnTarget(s, 1, 0, 99));
    pose((s) => d.setEffectTicks(s, "pierce", 20));
    pose((s) => d.setNextPod(s, "widen"));
    ball(281, 15, 240);
    await engine.advance(1);
    expect(snap().score).toBe(600);
    expect(snap().screen).toBe("waveclear");
    expect(snap().interstitialTicks).toBe(C.WAVECLEAR_TICKS);
    expect(snap().balls).toEqual([]);
    expect(snap().effects.pierceTicks).toBe(0);
    expect(snap().nextPod).toBeNull();
    expect(cues).toContain(C.CUES.waveClear);
    await engine.advance(C.WAVECLEAR_TICKS - 1);
    expect(snap().screen).toBe("waveclear");
    await engine.advance(1);
    expect(snap().wave).toBe(2);
    expect(snap().rings.map((r) => r.targets.length)).toEqual([12, 16, 20]);
    expect(snap().balls[0].parked).toBe(true);
    engine.destroy();
  });
});

describe("salvage, effects, and pure poses", () => {
  it.each(C.POD_KINDS)(
    "catches %s with its actual effect and score",
    async (kind) => {
      const { engine, d, pose, play, snap, cues } = await setup();
      play();
      pose((s) => d.parkBall(s));
      const p = polar(
        C.DEFLECTOR_POD_CATCH_RADIUS + 1,
        C.DEFLECTOR_START_ANGLE_DEG,
      );
      pose((s) => d.spawnPod(s, kind, p.x, p.y));
      await engine.advance(1);
      const s = snap();
      expect(s.score).toBe(C.POD_CATCH_SCORE);
      expect(s.pods).toEqual([]);
      expect(cues).toContain(
        kind === "narrow" ? C.CUES.podCatchNarrow : C.CUES.podCatch,
      );
      if (kind === "multiball") {
        expect(s.balls).toHaveLength(3);
        expect(s.balls[0].parked).toBe(true);
      } else if (kind === "shield") expect(s.effects.shieldActive).toBe(true);
      else
        expect(s.effects[`${kind}Ticks`]).toBe(
          kind === "pierce" ? C.PIERCE_DURATION_TICKS : C.WIDEN_DURATION_TICKS,
        );
      engine.destroy();
    },
  );
  it("expires/replaces span effects, caps multiball, and burns uncaught salvage", async () => {
    const { engine, d, pose, play, snap, cues } = await setup();
    play();
    pose((s) => d.setEffectTicks(s, "widen", 8));
    pose((s) => d.setEffectTicks(s, "narrow", 2));
    expect(snap().paddle.spanDeg).toBe(C.NARROW_SPAN_DEG);
    expect(snap().effects.widenTicks).toBe(0);
    await engine.advance(2);
    expect(snap().paddle.spanDeg).toBe(C.DEFLECTOR_BASE_SPAN_DEG);
    for (let i = 0; i < C.BALL_CAP; i++)
      pose((s) => d.spawnBall(s, 500, 700, 0, 0));
    const p = polar(197, 90);
    pose((s) => d.spawnPod(s, "multiball", p.x, p.y));
    await engine.advance(1);
    expect(snap().balls).toHaveLength(C.BALL_CAP);
    pose((s) => d.spawnPod(s, "pierce", 500, 579));
    await engine.advance(1);
    expect(cues).toContain(C.CUES.podBurn);
    expect(snap().effects.pierceTicks).toBe(0);
    engine.destroy();
  });
  it("poses preserve previous values, validates domains, and resets all drivers", async () => {
    const { engine, d, pose, snap } = await setup();
    const initial = engine.state;
    pose((s) => d.setScore(s, 777));
    expect(initial.score).toBe(0);
    pose((s) => d.setWave(s, 99));
    expect(snap().rings.map((r) => r.speedDegPerSec)).toEqual([0, 45, -30]);
    pose((s) => d.setPaddleAngle(s, -90));
    expect(snap().paddle.angleDeg).toBe(270);
    pose((s) => d.setPodSpawn(s, false));
    pose((s) => d.setWaveAdvance(s, false));
    pose((s) => d.setNextPod(s, "none"));
    expect(() => d.setScore(engine.state, -1)).toThrow();
    expect(() => d.spawnTarget(engine.state, 4, 0, 1)).toThrow();
    expect(() => d.spawnTarget(engine.state, 1, 12, 1)).toThrow();
    expect(() => d.launchBall(engine.state)).toThrow();
    pose((s) => d.setScreen(s, "playing"));
    expect(() => d.setMenuIndex(engine.state, 0)).toThrow();
    expect(d.menuItemRect(engine.state, 0)).toBeNull();
    pose(d.reset);
    expect(snap().score).toBe(0);
    expect(snap().podSpawn).toBe(true);
    expect(snap().waveAdvance).toBe(true);
    expect(snap().nextPod).toBeNull();
    engine.destroy();
  });
  it("samples the drop distribution without consuming a posed outcome", async () => {
    const { engine, d, pose, snap } = await setup();
    pose((s) => d.setNextPod(s, "shield"));
    let total = 0;
    const kinds = new Set();
    for (let i = 0; i < 10000; i++) {
      const k = d.drawPod(engine.state);
      if (k) {
        total++;
        kinds.add(k);
      }
    }
    expect(total).toBeGreaterThan(2100);
    expect(total).toBeLessThan(2900);
    expect(kinds.size).toBe(5);
    expect(snap().nextPod).toBe("shield");
    engine.destroy();
  });
});
