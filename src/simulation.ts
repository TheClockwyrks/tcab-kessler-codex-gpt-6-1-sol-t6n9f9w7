import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  parked: boolean;
  born: number;
}
export interface Pod {
  kind: C.PodKind;
  r: number;
  angle: number;
}
export interface Ring {
  angleDeg: number;
  speedDegPerSec: number;
  hp: number[];
}
export interface EffectEvent {
  id: number;
  kind: "burst" | "spark" | "burnup";
  x: number;
  y: number;
  age: number;
}
export interface World {
  screen: C.Screen;
  ticks: number;
  wave: number;
  score: number;
  lives: number;
  interstitialTicks: number;
  waveAdvance: boolean;
  podSpawn: boolean;
  nextPod: C.PodKind | "none" | null;
  angle: number;
  balls: Ball[];
  rings: Ring[];
  pods: Pod[];
  effects: {
    widenTicks: number;
    narrowTicks: number;
    pierceTicks: number;
    shieldActive: boolean;
  };
  menu: { index: number };
  accumulator: number;
  spinTick: number;
  pointerEntry: number | null;
  events: EffectEvent[];
  eventId: number;
}
export type ReadWorld = DeepReadonly<World>;
export const norm = (a: number) => ((a % 360) + 360) % 360;
export const offset = (a: number, b: number) => norm(a - b + 180) - 180;
export const rad = (a: number) => (a * Math.PI) / 180;
export const polar = (r: number, a: number) => ({
  x: C.STAGE_CX + r * Math.cos(rad(a)),
  y: C.STAGE_CY + r * Math.sin(rad(a)),
});
export const angleOf = (x: number, y: number) =>
  norm((Math.atan2(y - C.STAGE_CY, x - C.STAGE_CX) * 180) / Math.PI);
export const radius = (b: { readonly x: number; readonly y: number }) =>
  Math.hypot(b.x - C.STAGE_CX, b.y - C.STAGE_CY);
export const speed = (w: number) =>
  Math.min(
    C.BALL_SPEED_BASE + C.BALL_SPEED_PER_WAVE * (w - 1),
    C.BALL_SPEED_CAP,
  );
export const orbit = (i: number, w: number) => {
  const r = C.RINGS[i];
  return (
    r.orbitSign *
    Math.min(
      r.orbitBaseDegPerSec + r.orbitPerWaveDegPerSec * (w - 1),
      r.orbitCapDegPerSec,
    )
  );
};
export const span = (s: ReadWorld) =>
  s.effects.widenTicks > 0
    ? C.WIDEN_SPAN_DEG
    : s.effects.narrowTicks > 0
      ? C.NARROW_SPAN_DEG
      : C.DEFLECTOR_BASE_SPAN_DEG;
export const emptyEffects = () => ({
  widenTicks: 0,
  narrowTicks: 0,
  pierceTicks: 0,
  shieldActive: false,
});
export function fresh(): World {
  return {
    screen: "title",
    ticks: 0,
    wave: C.START_WAVE,
    score: 0,
    lives: C.START_LIVES,
    interstitialTicks: 0,
    waveAdvance: true,
    podSpawn: true,
    nextPod: null,
    angle: C.DEFLECTOR_START_ANGLE_DEG,
    balls: [],
    rings: C.RINGS.map((r, i) => ({
      angleDeg: 0,
      speedDegPerSec: orbit(i, C.START_WAVE),
      hp: Array<number>(r.slots).fill(r.hitPoints),
    })),
    pods: [],
    effects: emptyEffects(),
    menu: { index: 0 },
    accumulator: 0,
    spinTick: 0,
    pointerEntry: null,
    events: [],
    eventId: 0,
  };
}
/** Copies only authoritative simulation values; loaded resources live in game state. */
export function copy(s: ReadWorld): World {
  return {
    ...s,
    balls: s.balls.map((b) => ({ ...b })),
    rings: s.rings.map((r) => ({ ...r, hp: [...r.hp] })),
    pods: s.pods.map((p) => ({ ...p })),
    effects: { ...s.effects },
    menu: { ...s.menu },
    events: s.events.map((e) => ({ ...e })),
  };
}
export function addBall(s: World, parked: boolean, heading = s.angle) {
  if (s.balls.length >= C.BALL_CAP || (parked && s.balls.some((b) => b.parked)))
    throw new RangeError("Ball capacity exceeded");
  s.balls.push({
    ...polar(C.DEFLECTOR_BALL_CONTACT_RADIUS, s.angle),
    vx: parked ? 0 : speed(s.wave) * Math.cos(rad(heading)),
    vy: parked ? 0 : speed(s.wave) * Math.sin(rad(heading)),
    parked,
    born: s.spinTick,
  });
}
export function launch(s: World) {
  const b = s.balls.find((b) => b.parked);
  if (!b) throw new Error("No parked ball");
  b.parked = false;
  b.vx = speed(s.wave) * Math.cos(rad(s.angle));
  b.vy = speed(s.wave) * Math.sin(rad(s.angle));
}
export function movePaddle(s: World, a: number) {
  s.angle = norm(a);
  for (const b of s.balls)
    if (b.parked)
      Object.assign(b, polar(C.DEFLECTOR_BALL_CONTACT_RADIUS, s.angle));
}
export function setWave(s: World, w: number) {
  s.wave = w;
  s.rings.forEach((r, i) => (r.speedDegPerSec = orbit(i, w)));
}
export function nextWave(s: World) {
  s.balls = [];
  s.pods = [];
  s.effects = emptyEffects();
  setWave(s, s.wave + 1);
  s.rings.forEach((r, i) => {
    r.angleDeg = 0;
    r.hp = Array<number>(C.RINGS[i].slots).fill(C.RINGS[i].hitPoints);
  });
  s.screen = "playing";
  addBall(s, true);
}
export function drawPod(): C.PodKind | null {
  if (Math.random() >= C.POD_DROP_CHANCE) return null;
  let v = Math.random();
  for (const row of C.POD_KIND_TABLE) {
    v -= row.probability;
    if (v < 0) return row.kind;
  }
  return C.POD_KIND_TABLE[C.POD_KIND_TABLE.length - 1].kind;
}
export function effect(
  s: World,
  kind: "widen" | "narrow" | "pierce",
  ticks: number,
) {
  s.effects[`${kind}Ticks`] = ticks;
  if (ticks > 0 && kind !== "pierce")
    s.effects[kind === "widen" ? "narrowTicks" : "widenTicks"] = 0;
}
export function event(
  s: World,
  kind: EffectEvent["kind"],
  p: { x: number; y: number },
) {
  s.events.push({ id: ++s.eventId, kind, age: 0, x: p.x, y: p.y });
}
export type Sound = (cue: C.CueName) => void;
/** Reflection preserves incoming speed, then removes six degrees of orbital drift. */
export function reflect(b: Ball, edge = false, kick = 0) {
  const r = radius(b),
    nx = (b.x - C.STAGE_CX) / r,
    ny = (b.y - C.STAGE_CY) / r,
    tx = -ny,
    ty = nx;
  const v = Math.hypot(b.vx, b.vy),
    ax = edge ? tx : nx,
    ay = edge ? ty : ny,
    dot = b.vx * ax + b.vy * ay;
  b.vx -= 2 * dot * ax;
  b.vy -= 2 * dot * ay;
  b.vx += C.RING_KICK_FACTOR * rad(kick) * r * tx;
  b.vy += C.RING_KICK_FACTOR * rad(kick) * r * ty;
  const direction = angleOf(C.STAGE_CX + b.vx, C.STAGE_CY + b.vy),
    a = angleOf(b.x, b.y);
  const axis = Math.abs(offset(direction, a)) <= 90 ? a : a + 180;
  const phi = offset(direction, axis),
    out =
      direction - Math.sign(phi) * Math.min(C.ORBITAL_DECAY_DEG, Math.abs(phi));
  b.vx = v * Math.cos(rad(out));
  b.vy = v * Math.sin(rad(out));
}
function paddleBounce(s: World, b: Ball) {
  const a = angleOf(b.x, b.y),
    n = { x: Math.cos(rad(a)), y: Math.sin(rad(a)) },
    dot = b.vx * n.x + b.vy * n.y;
  const vx = b.vx - 2 * dot * n.x,
    vy = b.vy - 2 * dot * n.y;
  const dir =
    angleOf(C.STAGE_CX + vx, C.STAGE_CY + vy) +
    C.ENGLISH_DEG_PER_OFFSET_DEG * offset(a, s.angle);
  const clamp = Math.max(
    -C.BOUNCE_CLAMP_DEG,
    Math.min(C.BOUNCE_CLAMP_DEG, offset(dir, a)),
  );
  b.vx = speed(s.wave) * Math.cos(rad(a + clamp));
  b.vy = speed(s.wave) * Math.sin(rad(a + clamp));
}
const within = (a: number, start: number, width: number) =>
  Math.abs(offset(a, start + width / 2)) <= width / 2 + 1e-10;
function catchPod(s: World, p: Pod, play: Sound) {
  s.score += C.POD_CATCH_SCORE;
  play(p.kind === "narrow" ? C.CUES.podCatchNarrow : C.CUES.podCatch);
  switch (p.kind) {
    case "widen":
      effect(s, "widen", C.WIDEN_DURATION_TICKS);
      break;
    case "narrow":
      effect(s, "narrow", C.NARROW_DURATION_TICKS);
      break;
    case "pierce":
      effect(s, "pierce", C.PIERCE_DURATION_TICKS);
      break;
    case "shield":
      s.effects.shieldActive = true;
      break;
    case "multiball":
      for (
        let i = 0;
        i < C.MULTIBALL_LAUNCH_COUNT && s.balls.length < C.BALL_CAP;
        i++
      )
        addBall(
          s,
          false,
          s.angle + (i === 0 ? 1 : -1) * C.MULTIBALL_OFFSET_DEG,
        );
  }
}
/** One tick, in field.md order. The caller owns this fresh value. */
export function tick(s: World, turn: number, play: Sound) {
  s.ticks++;
  if (s.screen === "waveclear") {
    s.interstitialTicks = Math.max(0, s.interstitialTicks - 1);
    if (!s.interstitialTicks) nextWave(s);
    return;
  }
  if (s.screen !== "playing") return;
  s.spinTick++;
  movePaddle(s, s.angle + turn * C.DEFLECTOR_TURN_DEG_PER_SEC * C.TICK_DT);
  const oldAngles = s.rings.map((r) => r.angleDeg);
  s.rings.forEach(
    (r) => (r.angleDeg = norm(r.angleDeg + r.speedDegPerSec * C.TICK_DT)),
  );
  for (const k of ["widenTicks", "narrowTicks", "pierceTicks"] as const)
    s.effects[k] = Math.max(0, s.effects[k] - 1);
  s.pods = s.pods.filter((p) => {
    const prev = p.r;
    p.r -= C.POD_FALL_SPEED * C.TICK_DT;
    if (
      prev > C.DEFLECTOR_POD_CATCH_RADIUS &&
      p.r <= C.DEFLECTOR_POD_CATCH_RADIUS &&
      Math.abs(offset(p.angle, s.angle)) <= span(s) / 2
    ) {
      catchPod(s, p, play);
      return false;
    }
    if (p.r <= C.BURNUP_RADIUS) {
      event(s, "burnup", polar(p.r, p.angle));
      play(C.CUES.podBurn);
      return false;
    }
    return true;
  });
  let burned = false;
  const survivors: Ball[] = [];
  for (const b of s.balls) {
    if (b.parked) {
      survivors.push(b);
      continue;
    }
    const prev = radius(b),
      prevA = angleOf(b.x, b.y);
    b.x += b.vx * C.TICK_DT;
    b.y += b.vy * C.TICK_DT;
    const r = radius(b),
      a = angleOf(b.x, b.y),
      dot = b.vx * (b.x - C.STAGE_CX) + b.vy * (b.y - C.STAGE_CY);
    if (
      prev > C.DEFLECTOR_BALL_CONTACT_RADIUS &&
      r <= C.DEFLECTOR_BALL_CONTACT_RADIUS &&
      dot < 0 &&
      Math.abs(offset(a, s.angle)) <= span(s) / 2
    ) {
      paddleBounce(s, b);
      play(C.CUES.paddleBounce);
      event(s, "spark", b);
    }
    if (
      s.effects.shieldActive &&
      prev > C.SHIELD_CONTACT_RADIUS &&
      r <= C.SHIELD_CONTACT_RADIUS
    ) {
      reflect(b);
      s.effects.shieldActive = false;
      play(C.CUES.shieldReflect);
      event(s, "spark", b);
    }
    if (
      prev < C.FIELD_CONTACT_RADIUS &&
      r >= C.FIELD_CONTACT_RADIUS &&
      dot > 0
    ) {
      reflect(b);
      play(C.CUES.fieldBounce);
      event(s, "spark", b);
    }
    if (r <= C.BURNUP_RADIUS) {
      burned = true;
      event(s, "burnup", b);
      play(C.CUES.ballLost);
      continue;
    }
    for (let i = 0; i < C.RINGS.length; i++) {
      const cfg = C.RINGS[i],
        ring = s.rings[i];
      for (let slot = 0; slot < cfg.slots; slot++) {
        if (!ring.hp[slot]) continue;
        const start =
          ring.angleDeg + slot * cfg.slotWidthDeg + C.STRUCTURAL_GAP_DEG;
        if (!within(a, start, cfg.targetArcDeg)) continue;
        const face =
          (prev > cfg.outerContactRadius && r <= cfg.outerContactRadius) ||
          (prev < cfg.innerContactRadius && r >= cfg.innerContactRadius);
        const edge =
          r >= cfg.innerContactRadius &&
          r <= cfg.outerContactRadius &&
          !within(
            prevA,
            oldAngles[i] + slot * cfg.slotWidthDeg + C.STRUCTURAL_GAP_DEG,
            cfg.targetArcDeg,
          );
        if (!face && !edge) continue;
        const piercing = s.effects.pierceTicks > 0;
        if (!piercing) reflect(b, !face, ring.speedDegPerSec);
        ring.hp[slot] = piercing ? 0 : ring.hp[slot] - 1;
        if (ring.hp[slot] > 0) {
          s.score += C.HIT_SCORE;
          play(C.CUES.targetHit);
        } else {
          s.score += cfg.destroyScore;
          play(C.CUES.targetBreak);
          const point = polar(cfg.midRadius, start + cfg.targetArcDeg / 2);
          event(s, "burst", point);
          if (s.podSpawn) {
            const kind =
              s.nextPod === null
                ? drawPod()
                : s.nextPod === "none"
                  ? null
                  : s.nextPod;
            s.nextPod = null;
            if (kind)
              s.pods.push({
                kind,
                r: cfg.midRadius,
                angle: norm(start + cfg.targetArcDeg / 2),
              });
          }
          if (
            s.waveAdvance &&
            s.rings.every((r) => r.hp.every((h) => h === 0))
          ) {
            s.score += C.WAVE_CLEAR_BONUS_PER_WAVE * s.wave;
            s.balls = [];
            s.pods = [];
            s.effects = emptyEffects();
            s.screen = "waveclear";
            s.interstitialTicks = C.WAVECLEAR_TICKS;
            play(C.CUES.waveClear);
            return;
          }
        }
      }
    }
    survivors.push(b);
  }
  s.balls = survivors;
  if (burned && !s.balls.length) {
    s.lives = Math.max(0, s.lives - 1);
    s.effects = emptyEffects();
    s.pods = [];
    if (s.lives > 0) addBall(s, true);
    else {
      s.screen = "gameover";
      s.menu.index = 0;
      play(C.CUES.gameOver);
    }
  }
}
