import type { DeepReadonly } from "ts-essentials";
import type { KesslerState } from "./game";
import * as C from "./constants";
import {
  addBall,
  angleOf,
  copy,
  drawPod,
  effect,
  fresh,
  launch,
  movePaddle,
  polar,
  radius,
  setWave,
  span,
} from "./simulation";

type State = DeepReadonly<KesslerState>;
export const clone = (s: State): KesslerState => ({ ...s, ...copy(s) });
function number(n: number, min = -Infinity, integer = false) {
  if (!Number.isFinite(n) || n < min || (integer && !Number.isInteger(n)))
    throw new RangeError("Invalid numeric argument");
}
function oneOf<T>(v: T, values: readonly T[]) {
  if (!values.includes(v)) throw new RangeError("Invalid argument");
}
function ringIndex(n: number) {
  number(n, 1, true);
  if (n > C.RINGS.length) throw new RangeError("Invalid ring");
  return n - 1;
}
export function menuItemRect(s: State, index: number) {
  return (s.screen === "title" || s.screen === "paused") &&
    (index === 0 || index === 1)
    ? { x: 340, y: 596 + index * 70, width: 320, height: 54 }
    : null;
}
function pose(s: State, fn: (s: KesslerState) => void) {
  const n = clone(s);
  fn(n);
  return n;
}
export const debug = {
  reset: (s: State): KesslerState => ({ ...s, ...fresh() }),
  reconcile: clone,
  snapshot: (s: State) => ({
    screen: s.screen,
    ticks: s.ticks,
    wave: s.wave,
    score: s.score,
    lives: s.lives,
    interstitialTicks: s.interstitialTicks,
    waveAdvance: s.waveAdvance,
    podSpawn: s.podSpawn,
    nextPod: s.nextPod,
    paddle: { angleDeg: s.angle, spanDeg: span(s) },
    balls: s.balls.map((b) => ({
      x: b.x,
      y: b.y,
      vx: b.vx,
      vy: b.vy,
      parked: b.parked,
      piercing: s.effects.pierceTicks > 0,
    })),
    rings: s.rings.map((r) => ({
      angleDeg: r.angleDeg,
      speedDegPerSec: r.speedDegPerSec,
      targets: r.hp.flatMap((hp, slot) => (hp > 0 ? [{ slot, hp }] : [])),
    })),
    pods: s.pods.map((p) => ({ kind: p.kind, ...polar(p.r, p.angle) })),
    effects: { ...s.effects },
    menu: {
      index: s.screen === "title" || s.screen === "paused" ? s.menu.index : 0,
    },
  }),
  menuItemRect,
  setScreen: (s: State, name: C.Screen) => {
    oneOf(name, C.SCREENS);
    return pose(s, (n) => (n.screen = name));
  },
  setScore: (s: State, v: number) => {
    number(v, 0, true);
    return pose(s, (n) => (n.score = v));
  },
  setLives: (s: State, v: number) => {
    number(v, 0, true);
    return pose(s, (n) => (n.lives = v));
  },
  setMenuIndex: (s: State, v: number) => {
    if (!menuItemRect(s, v)) throw new RangeError("No such menu entry");
    return pose(s, (n) => (n.menu.index = v));
  },
  setInterstitialTicks: (s: State, v: number) => {
    number(v, 0, true);
    return pose(s, (n) => (n.interstitialTicks = v));
  },
  setWave: (s: State, v: number) => {
    number(v, 1, true);
    return pose(s, (n) => setWave(n, v));
  },
  setPaddleAngle: (s: State, v: number) => {
    number(v);
    return pose(s, (n) => movePaddle(n, v));
  },
  launchBall: (s: State) => pose(s, launch),
  clearBalls: (s: State) => pose(s, (n) => (n.balls = [])),
  spawnBall: (s: State, x: number, y: number, vx: number, vy: number) => {
    [x, y, vx, vy].forEach((v) => number(v));
    return pose(s, (n) => {
      if (n.balls.length >= C.BALL_CAP) throw new RangeError("Ball cap");
      n.balls.push({ x, y, vx, vy, parked: false, born: n.spinTick });
    });
  },
  parkBall: (s: State) => pose(s, (n) => addBall(n, true)),
  clearTargets: (s: State) =>
    pose(s, (n) => n.rings.forEach((r) => r.hp.fill(0))),
  spawnTarget: (s: State, ring: number, slot: number, hp: number) => {
    const i = ringIndex(ring);
    number(slot, 0, true);
    number(hp, 1, true);
    if (slot >= C.RINGS[i].slots) throw new RangeError("Invalid slot");
    return pose(s, (n) => (n.rings[i].hp[slot] = hp));
  },
  setRingAngle: (s: State, ring: number, deg: number) => {
    const i = ringIndex(ring);
    number(deg);
    return pose(s, (n) => (n.rings[i].angleDeg = ((deg % 360) + 360) % 360));
  },
  setRingSpeed: (s: State, ring: number, v: number) => {
    const i = ringIndex(ring);
    number(v);
    return pose(s, (n) => (n.rings[i].speedDegPerSec = v));
  },
  clearPods: (s: State) => pose(s, (n) => (n.pods = [])),
  spawnPod: (s: State, kind: C.PodKind, x: number, y: number) => {
    oneOf(kind, C.POD_KINDS);
    number(x);
    number(y);
    return pose(s, (n) =>
      n.pods.push({ kind, r: radius({ x, y }), angle: angleOf(x, y) }),
    );
  },
  setNextPod: (s: State, kind: C.PodKind | "none") => {
    oneOf(kind, [...C.POD_KINDS, "none"]);
    return pose(s, (n) => (n.nextPod = kind));
  },
  drawPod: (_s: State) => drawPod(),
  setEffectTicks: (
    s: State,
    kind: "widen" | "narrow" | "pierce",
    ticks: number,
  ) => {
    oneOf(kind, ["widen", "narrow", "pierce"]);
    number(ticks, 0, true);
    return pose(s, (n) => effect(n, kind, ticks));
  },
  setShield: (s: State, v: boolean) => {
    oneOf(v, [true, false]);
    return pose(s, (n) => (n.effects.shieldActive = v));
  },
  setWaveAdvance: (s: State, v: boolean) => {
    oneOf(v, [true, false]);
    return pose(s, (n) => (n.waveAdvance = v));
  },
  setPodSpawn: (s: State, v: boolean) => {
    oneOf(v, [true, false]);
    return pose(s, (n) => (n.podSpawn = v));
  },
};
