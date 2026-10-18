import type { DeepReadonly } from "ts-essentials";
import type { Game } from "@clockwyrks/simple-2d";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import { addBall, fresh, launch, span, tick, type World } from "./simulation";
import { clone, debug, menuItemRect } from "./debug";
import { render } from "./presentation";

export const BACKGROUND = "#060d17";
export interface KesslerState extends World {
  readonly images: Readonly<Record<string, ImageBitmap>>;
  readonly systems: Readonly<Record<string, DeepReadonly<ParticleSystem>>>;
}
export type KesslerDebugApi = typeof debug;

export const game: Game<KesslerState, KesslerDebugApi> = {
  async initialize(api) {
    for (const name of C.ACTIONS)
      api.input.register(name, { keys: [...C.BINDINGS[name]] });
    const paths = [
      C.SPRITE_PATHS.planet,
      ...Object.values(C.SPRITE_PATHS.pods),
      ...C.SPRITE_PATHS.ball,
    ];
    const [images, systems] = await Promise.all([
      Promise.all(
        paths.map(async (p) => [p, await api.assets.loadImage(p)] as const),
      ),
      Promise.all(
        Object.entries(C.PARTICLE_PATHS).map(
          async ([key, p]) =>
            [
              key,
              JSON.parse(
                await (await api.assets.load(p)).text(),
              ) as ParticleSystem,
            ] as const,
        ),
      ),
      ...Object.entries(C.CUE_PATHS).map(([key, p]) => api.audio.load(key, p)),
      ...Object.entries(C.BED_PATHS).map(([key, p]) =>
        api.audio.load(`music-${key}`, p),
      ),
    ]);
    for (const key of ["screen", "score", "lives", "wave"] as const)
      api.diagnostics.register(key, (s) => s[key]);
    api.diagnostics.register("paddle angle", (s) => s.angle.toFixed(1));
    api.diagnostics.register("paddle span", (s) => span(s));
    api.diagnostics.register("balls", (s) => s.balls.length);
    api.diagnostics.register("targets", (s) =>
      s.rings.reduce((a, r) => a + r.hp.filter((h) => h > 0).length, 0),
    );
    api.diagnostics.register("pods", (s) => s.pods.length);
    for (const key of [
      "widenTicks",
      "narrowTicks",
      "pierceTicks",
      "shieldActive",
    ] as const)
      api.diagnostics.register(key, (s) => s.effects[key]);
    return [
      {
        ...fresh(),
        images: Object.fromEntries(images),
        systems: Object.fromEntries(systems),
      },
      debug,
    ];
  },
  update(state, api, dt) {
    let s = clone(state);
    s.events = s.events
      .map((e) => ({ ...e, age: e.age + dt }))
      .filter((e) => e.age < 1);
    // All edges belong to the screen at frame entry, even if one changes it.
    const edges = Object.fromEntries(
      C.ACTIONS.map((a) => [
        a,
        a === "left" || a === "right" ? false : api.input.pressed(a),
      ]),
    );
    const turn =
      state.screen === "playing"
        ? api.input.value("right") - api.input.value("left")
        : 0;
    const screen = s.screen,
      play = (cue: C.CueName) => api.audio.play(cue);
    let accept = false;
    let acceptedIndex: number | null = null;
    if (screen === "title" || screen === "paused") {
      for (const moved of [edges.up, edges.down]) {
        if (!moved) continue;
        s.menu.index = 1 - s.menu.index;
        play(C.CUES.menuMove);
      }
      for (const sample of api.input.pointerSamples()) {
        if (!sample.primary) continue;
        const hit = [0, 1].find((i) => {
          const r = menuItemRect(s, i);
          return (
            r &&
            sample.x >= r.x &&
            sample.x <= r.x + r.width &&
            sample.y >= r.y &&
            sample.y <= r.y + r.height
          );
        });
        if (hit !== undefined && hit !== s.menu.index) {
          s.menu.index = hit;
          play(C.CUES.menuMove);
        }
        if (sample.type === "down") s.pointerEntry = hit ?? null;
        if (sample.type === "up") {
          if (hit !== undefined && hit === s.pointerEntry) {
            accept = true;
            acceptedIndex = hit;
          }
          s.pointerEntry = null;
        }
      }
      accept ||= Boolean(edges.confirm);
      if (accept) {
        if (acceptedIndex !== null) s.menu.index = acceptedIndex;
        play(C.CUES.menuSelect);
        if (screen === "title") {
          if (s.menu.index === 0) {
            s = {
              ...s,
              ...fresh(),
              ticks: s.ticks,
              accumulator: s.accumulator,
              screen: "playing",
            };
            addBall(s, true);
          } else {
            s.screen = "howto";
            s.menu.index = 0;
          }
        } else if (s.menu.index === 0) {
          s.screen = "playing";
          s.menu.index = 0;
        } else {
          s = { ...s, ...fresh(), ticks: s.ticks, accumulator: s.accumulator };
        }
      }
    }
    if (screen === "howto" && (edges.confirm || edges.back)) {
      s.screen = "title";
      s.menu.index = 1;
    }
    if (screen === "gameover" && edges.confirm) {
      s = { ...s, ...fresh(), ticks: s.ticks, accumulator: s.accumulator };
    }
    if (screen === "playing") {
      if (edges.back || edges.pause) {
        s.screen = "paused";
        s.menu.index = 0;
      } else if (edges.launch && s.balls.some((b) => b.parked)) launch(s);
    }
    if (screen === "paused" && (edges.back || edges.pause)) {
      s.screen = "playing";
      s.menu.index = 0;
    }
    // Edges were already resolved above; ticks now follow the current screen.
    s.accumulator += dt;
    while (s.accumulator + 1e-12 >= C.TICK_DT) {
      s.accumulator = Math.max(0, s.accumulator - C.TICK_DT);
      tick(s, turn, play);
    }
    const bed =
      s.screen === "gameover"
        ? null
        : s.screen === "title" || s.screen === "howto"
          ? "title"
          : "play";
    for (const key of ["title", "play"]) {
      const cue = `music-${key}`;
      if (key === bed) api.audio.loop(cue);
      else api.audio.stop(cue);
    }
    return s;
  },
  render,
};
