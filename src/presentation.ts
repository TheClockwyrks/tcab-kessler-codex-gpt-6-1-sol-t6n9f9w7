import type { DeepReadonly } from "ts-essentials";
import type { RenderApi } from "@clockwyrks/simple-2d";
import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import type { KesslerState } from "./game";
import * as C from "./constants";
import { angleOf, polar, rad, span } from "./simulation";
import { menuItemRect } from "./debug";

type State = DeepReadonly<KesslerState>;
const INK = "#dcecf0",
  CYAN = "#88eee8",
  AMBER = "#eabf80",
  MUTED = "#69818d";
const ringColors = ["#638b9b", "#acb9bb", "#c6a77d"];
function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size = 16,
  color = INK,
  align: CanvasTextAlign = "left",
  weight = 400,
) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${size > 45 ? "sans-serif" : "monospace"}`;
  ctx.textAlign = align;
  ctx.fillText(s, x, y);
}
function line(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color: string,
  width = 1,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function arc(
  ctx: CanvasRenderingContext2D,
  r: number,
  start: number,
  end: number,
  color: string,
  width = 1,
) {
  ctx.beginPath();
  ctx.arc(C.STAGE_CX, C.STAGE_CY, r, rad(start), rad(end));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
function annulus(
  ctx: CanvasRenderingContext2D,
  inner: number,
  outer: number,
  start: number,
  end: number,
  fill: string,
  stroke?: string,
) {
  ctx.beginPath();
  ctx.arc(C.STAGE_CX, C.STAGE_CY, outer, rad(start), rad(end));
  ctx.arc(C.STAGE_CX, C.STAGE_CY, inner, rad(end), rad(start), true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
function sprite(
  ctx: CanvasRenderingContext2D,
  s: State,
  path: string,
  x: number,
  y: number,
  size: number,
) {
  const image = s.images[path];
  if (image) ctx.drawImage(image, x - size / 2, y - size / 2);
}
function backdrop(ctx: CanvasRenderingContext2D) {
  const glow = ctx.createRadialGradient(500, 480, 60, 500, 500, 650);
  glow.addColorStop(0, "#112836");
  glow.addColorStop(0.55, "#0b1925");
  glow.addColorStop(1, "#060d17");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  let seed = 431;
  for (let i = 0; i < 235; i++) {
    seed = (seed * 16807) % 2147483647;
    const x = seed % 1000;
    seed = (seed * 16807) % 2147483647;
    const y = seed % 1000;
    const alpha = 0.12 + (seed % 30) / 100;
    ctx.fillStyle = `rgba(178,210,222,${alpha})`;
    ctx.fillRect(x, y, i % 13 === 0 ? 2 : 1, i % 13 === 0 ? 2 : 1);
  }
}
function field(ctx: CanvasRenderingContext2D, s: State) {
  // An instrument rim, with all gameplay readouts outside the containment circle.
  arc(ctx, C.FIELD_RADIUS, 0, 360, "#416272", 1.3);
  arc(ctx, C.FIELD_RADIUS - 4, 0, 360, "#142d3c");
  for (let a = 0; a < 360; a += 5) {
    const p = polar(C.FIELD_RADIUS, a),
      q = polar(C.FIELD_RADIUS - (a % 30 === 0 ? 9 : 4), a);
    line(ctx, p.x, p.y, q.x, q.y, a % 30 === 0 ? "#64828c" : "#263e4c");
  }
  for (const cfg of C.RINGS) arc(ctx, cfg.midRadius, 0, 360, "#142c39");
  s.rings.forEach((ring, i) => {
    const cfg = C.RINGS[i];
    ring.hp.forEach((hp, slot) => {
      if (hp <= 0) return;
      const a = ring.angleDeg + slot * cfg.slotWidthDeg + C.STRUCTURAL_GAP_DEG,
        b = a + cfg.targetArcDeg;
      const damaged = i === 1 && hp < cfg.hitPoints;
      annulus(
        ctx,
        cfg.innerRadius,
        cfg.outerRadius,
        a,
        b,
        damaged ? "#452f2b" : ["#243d4b", "#354650", "#493e31"][i],
        damaged ? "#d8936d" : ringColors[i],
      );
      arc(
        ctx,
        cfg.innerRadius + 3,
        a + 0.7,
        b - 0.7,
        damaged ? "#e7956c" : ringColors[i],
        2,
      );
      arc(ctx, cfg.outerRadius - 4, a + 1.2, b - 1.2, "#101c28", 3);
      // Solar vanes and rivets make each arc read as a piece of dead machinery.
      for (let t = a + 3; t < b - 2; t += 3.5) {
        const p = polar(cfg.innerRadius + 7, t),
          q = polar(cfg.outerRadius - 7, t);
        line(ctx, p.x, p.y, q.x, q.y, damaged ? "#875b49" : "#73868b", 0.8);
      }
      for (const t of [a + 1.2, b - 1.2]) {
        const p = polar(cfg.midRadius, t);
        ctx.fillStyle = AMBER;
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
      if (damaged) {
        const p = polar(cfg.innerRadius, a + cfg.targetArcDeg * 0.42),
          q = polar(cfg.outerRadius, a + cfg.targetArcDeg * 0.57);
        line(ctx, p.x, p.y, q.x, q.y, "#ffbb89", 2);
      }
    });
  });
  arc(
    ctx,
    (C.DEFLECTOR_TRACK_INNER + C.DEFLECTOR_TRACK_OUTER) / 2,
    0,
    360,
    "#1c3b48",
    1,
  );
  for (let a = 0; a < 360; a += 30) {
    const p = polar(C.DEFLECTOR_TRACK_INNER - 8, a),
      q = polar(C.DEFLECTOR_TRACK_INNER - 4, a);
    line(ctx, p.x, p.y, q.x, q.y, "#41606d");
  }
  const half = span(s) / 2;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 12;
  annulus(
    ctx,
    C.DEFLECTOR_TRACK_INNER,
    C.DEFLECTOR_TRACK_OUTER,
    s.angle - half,
    s.angle + half,
    "#305e69",
    CYAN,
  );
  arc(
    ctx,
    C.DEFLECTOR_TRACK_OUTER - 2,
    s.angle - half + 1,
    s.angle + half - 1,
    "#b9fff3",
    3,
  );
  ctx.shadowBlur = 0;
  for (const a of [s.angle - half + 2, s.angle + half - 2]) {
    const p = polar(C.DEFLECTOR_TRACK_INNER + 2, a),
      q = polar(C.DEFLECTOR_TRACK_OUTER - 2, a);
    line(ctx, p.x, p.y, q.x, q.y, "#e6ffef", 3);
  }
  sprite(
    ctx,
    s,
    C.SPRITE_PATHS.planet,
    C.STAGE_CX,
    C.STAGE_CY,
    C.PLANET_SPRITE_SIZE,
  );
  if (s.effects.shieldActive) {
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 10;
    arc(ctx, C.SHIELD_RADIUS, 0, 360, CYAN, 2);
    ctx.shadowBlur = 0;
    arc(ctx, C.SHIELD_RADIUS - 4, 0, 360, "#285d6d");
  }
  for (const p of s.pods) {
    const pos = polar(p.r, p.angle);
    sprite(
      ctx,
      s,
      C.SPRITE_PATHS.pods[p.kind],
      pos.x,
      pos.y,
      C.POD_SPRITE_SIZE,
    );
  }
  for (const b of s.balls) {
    if (s.effects.pierceTicks) {
      ctx.shadowColor = AMBER;
      ctx.shadowBlur = 20;
    }
    const frame =
      Math.floor((s.spinTick - b.born) / C.BALL_FRAME_TICKS) %
      C.BALL_SPIN_FRAMES;
    sprite(ctx, s, C.SPRITE_PATHS.ball[frame], b.x, b.y, C.BALL_SPRITE_SIZE);
    ctx.shadowBlur = 0;
    if (b.parked && s.screen === "playing") {
      const a = angleOf(b.x, b.y),
        p = polar(C.DEFLECTOR_BALL_CONTACT_RADIUS + 29, a),
        q = polar(C.DEFLECTOR_BALL_CONTACT_RADIUS + 41, a);
      line(ctx, p.x, p.y, q.x, q.y, "#68989f");
    }
  }
}
function hud(ctx: CanvasRenderingContext2D, s: State) {
  text(ctx, "K / ORBITAL DEMOLITION", 24, 18, 11, MUTED);
  text(ctx, `SCORE ${String(s.score).padStart(6, "0")}`, 24, 42, 18, INK);
  text(
    ctx,
    `WAVE ${String(s.wave).padStart(2, "0")}`,
    976,
    18,
    12,
    AMBER,
    "right",
  );
  text(ctx, `LIVES ${"◆ ".repeat(s.lives)}`, 976, 42, 17, CYAN, "right");
  text(ctx, "A D / ← →  ROTATE", 24, 980, 12, MUTED);
  text(
    ctx,
    s.balls.some((b) => b.parked) ? "SPACE / LAUNCH" : "P / PAUSE",
    976,
    980,
    12,
    CYAN,
    "right",
  );
  let x = 28;
  for (const kind of C.POD_KINDS) {
    const active =
      kind === "shield"
        ? s.effects.shieldActive
        : kind === "multiball"
          ? false
          : s.effects[`${kind}Ticks`] > 0;
    if (!active) continue;
    sprite(ctx, s, C.SPRITE_PATHS.pods[kind], x, 946, C.POD_SPRITE_SIZE);
    const v =
      kind === "shield"
        ? "READY"
        : kind === "multiball"
          ? ""
          : `${Math.ceil(s.effects[`${kind}Ticks`] / C.TICK_HZ)}s`;
    text(ctx, v, x + 18, 950, 11, CYAN);
    x += 76;
  }
}
function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = "#09131fee";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#304955";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  for (const [cx, cy, dx, dy] of [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ]) {
    line(ctx, cx, cy, cx + dx * 18, cy, CYAN, 2);
    line(ctx, cx, cy, cx, cy + dy * 18, CYAN, 2);
  }
}
function menu(ctx: CanvasRenderingContext2D, s: State) {
  const items = s.screen === "title" ? C.TITLE_ITEMS : C.PAUSE_ITEMS;
  items.forEach((label, i) => {
    const r = menuItemRect(s, i);
    if (!r) return;
    const active = s.menu.index === i;
    ctx.fillStyle = active ? "#17313c" : "#0c1b28";
    ctx.fillRect(r.x, r.y, r.width, r.height);
    line(
      ctx,
      r.x,
      r.y + r.height,
      r.x + r.width,
      r.y + r.height,
      active ? CYAN : "#263a46",
    );
    if (active) {
      ctx.fillStyle = CYAN;
      ctx.fillRect(r.x, r.y, 3, r.height);
      text(ctx, "›", r.x + 22, r.y + 35, 25, CYAN);
    }
    text(
      ctx,
      label,
      r.x + r.width / 2,
      r.y + 33,
      18,
      active ? INK : MUTED,
      "center",
    );
    text(
      ctx,
      `0${i + 1}`,
      r.x + r.width - 21,
      r.y + 32,
      11,
      active ? CYAN : MUTED,
      "right",
    );
  });
  text(
    ctx,
    "↑ ↓  SELECT     ENTER / SPACE  CONFIRM",
    500,
    772,
    11,
    MUTED,
    "center",
  );
}
const players = new WeakMap<
  CanvasRenderingContext2D,
  Map<
    number,
    { player: ParticleCanvasPlayer; x: number; y: number; age: number }
  >
>();
function particles(
  ctx: CanvasRenderingContext2D,
  s: State,
  dt: number,
  width: number,
  height: number,
) {
  let live = players.get(ctx);
  if (!live) {
    live = new Map();
    players.set(ctx, live);
  }
  if (s.eventId === 0) live.clear();
  for (const e of s.events) {
    if (!live.has(e.id)) {
      ctx.save();
      ctx.translate(e.x, e.y - 160);
      ctx.scale(160 / width, 160 / height);
      const player = new ParticleCanvasPlayer(
        s.systems[e.kind] as ParticleSystem,
        ctx,
        {
          clear: false,
          seed: e.id * 971 + 11,
          pixelRadius: 1,
          composite: "lighter",
        },
      );
      ctx.restore();
      live.set(e.id, { player, x: e.x, y: e.y, age: 0 });
    }
  }
  for (const [id, p] of live) {
    p.age += dt;
    if (p.age > 1.5) {
      live.delete(id);
      continue;
    }
    ctx.save();
    ctx.translate(p.x, p.y - 160);
    ctx.scale(160 / width, 160 / height);
    p.player.update(dt);
    ctx.restore();
  }
}
export function render(s: State, api: RenderApi) {
  const ctx = api.ctx;
  ctx.save();
  backdrop(ctx);
  field(ctx, s);
  if (["playing", "paused", "waveclear", "gameover"].includes(s.screen))
    hud(ctx, s);
  if (s.screen !== "playing") {
    ctx.fillStyle = s.screen === "title" ? "#060d1760" : "#060d17b8";
    ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
    if (s.screen === "title") {
      panel(ctx, 266, 268, 468, 550);
      text(
        ctx,
        "O R B I T A L   S A L V A G E   D I V I S I O N",
        500,
        316,
        11,
        CYAN,
        "center",
      );
      text(ctx, C.TITLE_TEXT, 500, 414, 79, INK, "center", 700);
      text(ctx, "CLEAR THE SKY.", 500, 452, 16, AMBER, "center");
      line(ctx, 340, 482, 660, 482, "#35505b");
      text(
        ctx,
        "One planet. Three rings. No clean escape.",
        500,
        516,
        12,
        MUTED,
        "center",
      );
      text(ctx, "AN ORBITAL DEMOLITION ARCADE", 500, 543, 11, MUTED, "center");
      menu(ctx, s);
      text(
        ctx,
        "EST. 2086  /  LOW EARTH OPERATIONS",
        500,
        937,
        11,
        MUTED,
        "center",
      );
    } else if (s.screen === "paused") {
      panel(ctx, 280, 365, 440, 453);
      text(ctx, "FLIGHT SUSPENDED", 500, 414, 12, CYAN, "center");
      text(ctx, "PAUSED", 500, 487, 58, INK, "center", 700);
      text(ctx, "Your orbit is holding.", 500, 532, 14, MUTED, "center");
      menu(ctx, s);
    } else if (s.screen === "howto") {
      panel(ctx, 180, 165, 640, 670);
      text(ctx, "OPERATOR FIELD GUIDE", 226, 211, 12, CYAN);
      text(ctx, "HOW TO PLAY", 226, 269, 44, INK, "left", 700);
      const rows = [
        [
          "01 / KEEP IT IN ORBIT",
          "Circle the planet. Catch the ball with your deflector.",
          "Aim with the edge of the paddle to steer your return.",
        ],
        [
          "02 / CLEAR THE SKY",
          "Break the derelicts. Sweep all three rings to advance.",
          "The next wave flies faster. Every clean hit counts.",
        ],
        [
          "03 / SALVAGE THE WRECKAGE",
          "Catch falling pods for a wider paddle, extra balls,",
          "a shield or piercing fire. Red pods narrow your reach.",
        ],
        [
          "04 / PROTECT YOUR PLANET",
          "A ball that reaches the planet burns up.",
          "Lose your last ball and you lose a life.",
        ],
      ];
      rows.forEach((r, i) => {
        const y = 317 + i * 94;
        text(ctx, r[0], 226, y, 13, AMBER);
        text(ctx, r[1], 226, y + 26, 13, INK);
        text(ctx, r[2], 226, y + 47, 13, MUTED);
      });
      line(ctx, 226, 687, 774, 687, "#304955");
      text(ctx, "← → / A D  ROTATE     SPACE  LAUNCH", 226, 720, 13, CYAN);
      text(
        ctx,
        "↑ ↓ / W S  MENU       ENTER / SPACE  SELECT",
        226,
        746,
        12,
        INK,
      );
      text(
        ctx,
        "ESC / P  PAUSE        ENTER / ESC  RETURN",
        226,
        775,
        12,
        MUTED,
      );
    } else if (s.screen === "waveclear") {
      panel(ctx, 250, 398, 500, 204);
      text(ctx, "ORBIT SECURED", 500, 438, 12, CYAN, "center");
      text(ctx, `WAVE ${s.wave} CLEAR`, 500, 501, 48, INK, "center", 700);
      text(
        ctx,
        `+${C.WAVE_CLEAR_BONUS_PER_WAVE * s.wave}   /   NEXT ORBIT IN ${Math.ceil(s.interstitialTicks / C.TICK_HZ)}`,
        500,
        551,
        15,
        AMBER,
        "center",
      );
    } else if (s.screen === "gameover") {
      panel(ctx, 250, 338, 500, 338);
      text(ctx, "SIGNAL LOST / MISSION ENDED", 500, 386, 12, AMBER, "center");
      text(ctx, C.GAMEOVER_TEXT, 500, 452, 54, INK, "center", 700);
      text(
        ctx,
        `FINAL SCORE  ${String(s.score).padStart(6, "0")}`,
        500,
        513,
        22,
        CYAN,
        "center",
      );
      text(ctx, `WAVE REACHED  ${s.wave}`, 500, 553, 14, MUTED, "center");
      text(ctx, "ENTER / SPACE  RETURN TO BASE", 500, 621, 12, INK, "center");
    }
  }
  const view = api.viewport();
  particles(
    ctx,
    s,
    api.frame().lastDeltaMs / 1000,
    view.width * view.scale + 2 * view.offsetX,
    view.height * view.scale + 2 * view.offsetY,
  );
  ctx.restore();
}
