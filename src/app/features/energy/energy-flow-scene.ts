/**
 * The drawing of the energy flow (HAS-438, owner 2026-11-13, after the energy flow of SolaxCloud - its idea, not
 * its pictures): an isometric scene in a `viewBox` of 600 x 380, the house in the middle, the panels up on the
 * left, the battery up on the right, the grid down on the left, each on a tile, the lines along the axes of the
 * grid. Pure geometry: the paths are computed once, the colours are the page's (the template gives them).
 */

/** Half the width and half the height of one step of the grid: the 2:1 of an isometric drawing. */
const W = 40;
const H = 20;
const CX = 300;
const CY = 200;
/** The half diagonal of a tile, in steps, and the thickness of its edge. */
const TILE = 1.3;
const EDGE = 7;
/** How far the panels, the battery and the grid stand from the house, in steps. */
const REACH = 5;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The point of the grid `i` steps down to the right and `j` steps down to the left of the middle. */
export function at(i: number, j: number): Point {
  return { x: CX + W * (i - j), y: CY + H * (i + j) };
}

const up = (p: Point, h: number): Point => ({ x: p.x, y: p.y - h });
const path = (...points: Point[]): string =>
  `M${points.map((p) => `${round(p.x)},${round(p.y)}`).join(' L')} Z`;
const round = (n: number): number => Math.round(n * 10) / 10;

/** A tile under a thing: its top, and the two faces of its edge that face the viewer. */
export interface Tile {
  readonly top: string;
  readonly left: string;
  readonly right: string;
}

function tile(c: Point): Tile {
  const rx = W * TILE;
  const ry = H * TILE;
  const top = { x: c.x, y: c.y - ry };
  const right = { x: c.x + rx, y: c.y };
  const bottom = { x: c.x, y: c.y + ry };
  const left = { x: c.x - rx, y: c.y };
  return {
    top: path(top, right, bottom, left),
    left: path(left, bottom, up(bottom, -EDGE), up(left, -EDGE)),
    right: path(bottom, right, up(right, -EDGE), up(bottom, -EDGE)),
  };
}

/** A corner of a box of half extents `a` (along i) and `b` (along j) steps around `c`. */
function corner(c: Point, a: number, b: number, si: number, sj: number): Point {
  return { x: c.x + W * (si * a - sj * b), y: c.y + H * (si * a + sj * b) };
}

/** A box standing on `c`: its top and the two walls that face the viewer. */
export interface Box {
  readonly top: string;
  readonly left: string;
  readonly right: string;
}

function box(c: Point, a: number, b: number, h: number): Box {
  const back = corner(c, a, b, -1, -1);
  const right = corner(c, a, b, 1, -1);
  const front = corner(c, a, b, 1, 1);
  const left = corner(c, a, b, -1, 1);
  return {
    top: path(up(back, h), up(right, h), up(front, h), up(left, h)),
    left: path(left, front, up(front, h), up(left, h)),
    right: path(front, right, up(right, h), up(front, h)),
  };
}

const HOUSE = at(0, 0);
const PANELS = at(-REACH, 0);
const BATTERY = at(0, -REACH);
const GRID = at(0, REACH);

/** The house: walls, a gable roof with its ridge along i, two lit windows and a door. */
function house() {
  const a = 0.62;
  const b = 0.5;
  const wall = 30;
  const roof = 22;
  const walls = box(HOUSE, a, b, wall);
  const back = up(corner(HOUSE, a, b, -1, -1), wall);
  const right = up(corner(HOUSE, a, b, 1, -1), wall);
  const front = up(corner(HOUSE, a, b, 1, 1), wall);
  const left = up(corner(HOUSE, a, b, -1, 1), wall);
  const ridgeBack = up({ x: (back.x + left.x) / 2, y: (back.y + left.y) / 2 }, roof);
  const ridgeFront = up({ x: (right.x + front.x) / 2, y: (right.y + front.y) / 2 }, roof);
  // a window on the left wall: a parallelogram along i, raised from the floor
  const pane = (from: number, to: number) =>
    path(
      up(corner(HOUSE, a, b, from, 1), 10),
      up(corner(HOUSE, a, b, to, 1), 10),
      up(corner(HOUSE, a, b, to, 1), 21),
      up(corner(HOUSE, a, b, from, 1), 21),
    );
  // the door on the right wall: along j
  const doorAt = (sj: number, h: number) => up(corner(HOUSE, a, b, 1, sj), h);
  return {
    left: walls.left,
    right: walls.right,
    roofBack: path(back, right, ridgeFront, ridgeBack),
    gable: path(right, front, ridgeFront),
    roofFront: path(left, front, ridgeFront, ridgeBack),
    windows: [pane(-0.75, -0.2), pane(0.15, 0.7)],
    door: path(doorAt(0.25, 0), doorAt(-0.25, 0), doorAt(-0.25, 18), doorAt(0.25, 18)),
  };
}

/** The panels: a board tilted to the sun on four legs, with the lines of its cells. */
function panels() {
  const a = 0.95;
  const b = 0.55;
  const low = 10;
  const high = 30;
  const p = (si: number, sj: number) =>
    up(corner(PANELS, a, b, si, sj), low + ((1 - sj) / 2) * (high - low));
  const lines: string[] = [];
  for (const si of [-1 / 3, 1 / 3]) {
    lines.push(`M${round(p(si, -1).x)},${round(p(si, -1).y)} L${round(p(si, 1).x)},${round(p(si, 1).y)}`);
  }
  lines.push(`M${round(p(-1, 0).x)},${round(p(-1, 0).y)} L${round(p(1, 0).x)},${round(p(1, 0).y)}`);
  const leg = (si: number, sj: number) => {
    const foot = corner(PANELS, a * 0.85, b * 0.7, si, sj);
    const top = p(si * 0.85, sj * 0.7);
    return `M${round(foot.x)},${round(foot.y)} L${round(top.x)},${round(top.y)}`;
  };
  return {
    board: path(p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)),
    // the edge of the board facing the viewer: its thickness
    edge: path(p(-1, 1), p(1, 1), up(p(1, 1), -3), up(p(-1, 1), -3)),
    cells: lines.join(' '),
    legs: [leg(-1, 1), leg(1, 1), leg(1, -1), leg(-1, -1)].join(' '),
  };
}

const BATTERY_A = 0.32;
const BATTERY_B = 0.28;
const BATTERY_H = 50;

/** The battery: a tall cabinet; its charge fills its left wall from the floor (`batteryCharge`). */
function battery() {
  return box(BATTERY, BATTERY_A, BATTERY_B, BATTERY_H);
}

/** The part of the left wall of the battery its charge fills, in per cent; nothing while not known. */
export function batteryCharge(soc: number | undefined): string | undefined {
  if (soc === undefined || !Number.isFinite(soc)) {
    return undefined;
  }
  const share = Math.min(100, Math.max(0, soc)) / 100;
  const inset = 5;
  const h = inset + (BATTERY_H - 2 * inset) * share;
  const left = corner(BATTERY, BATTERY_A * 0.75, BATTERY_B, -1, 1);
  const front = corner(BATTERY, BATTERY_A * 0.75, BATTERY_B, 1, 1);
  return path(up(left, inset), up(front, inset), up(front, h), up(left, h));
}

/** A lattice pylon on `c`: legs narrowing upwards, its bracing and two crossarms. */
function pylon(c: Point): string {
  const foot = 13;
  const top = 3;
  const height = 64;
  const level = (h: number) => foot - ((foot - top) * h) / height;
  const parts: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    parts.push(`M${round(c.x + x1)},${round(c.y + y1)} L${round(c.x + x2)},${round(c.y + y2)}`);
  line(-foot, 0, -top, -height);
  line(foot, 0, top, -height);
  for (let h = 0; h < height - 8; h += 14) {
    const w1 = level(h);
    const w2 = level(h + 14);
    line(-w1, -h, w2, -(h + 14));
    line(w1, -h, -w2, -(h + 14));
  }
  for (const [h, reach] of [
    [height - 18, 20],
    [height - 6, 14],
  ] as const) {
    line(-reach, -h, reach, -h);
  }
  line(-top, -height, 0, -height - 6);
  line(top, -height, 0, -height - 6);
  return parts.join(' ');
}

/** The insulators at the ends of the crossarms: where the wires hang. */
function insulators(c: Point): Point[] {
  return [
    { x: c.x - 20, y: c.y - 46 },
    { x: c.x + 20, y: c.y - 46 },
    { x: c.x - 14, y: c.y - 58 },
    { x: c.x + 14, y: c.y - 58 },
  ];
}

const PYLONS = [at(-0.55, REACH), at(0.55, REACH)];

/** A line from the edge of the tile of a thing to the edge of the tile of the house, along an axis. */
function line(from: Point, to: Point): string {
  return `M${round(from.x)},${round(from.y)} L${round(to.x)},${round(to.y)}`;
}

const EDGE_STEP = TILE / 2;

/** Everything that does not change: computed once for every card. */
export const SCENE = {
  viewBox: '0 0 600 380',
  tiles: {
    house: tile(HOUSE),
    panels: tile(PANELS),
    battery: tile(BATTERY),
    grid: tile(GRID),
  },
  house: house(),
  panels: panels(),
  battery: battery(),
  pylons: PYLONS.map((c) => ({ frame: pylon(c), insulators: insulators(c) })),
  /** Each line runs from its thing to the house - "in" is along the path, "out" against it. */
  links: {
    panels: line(at(-REACH + EDGE_STEP, 0), at(-EDGE_STEP, 0)),
    battery: line(at(0, -REACH + EDGE_STEP), at(0, -EDGE_STEP)),
    grid: line(at(0, REACH - EDGE_STEP), at(0, EDGE_STEP)),
  },
} as const;

/** Where the words of each thing stand, in per cent of the scene - beside its tile, clear of the lines. */
export const LABELS = {
  panels: { left: 2, top: 38 },
  battery: { right: 2, top: 38 },
  grid: { left: 3, top: 89 },
  house: { left: 61, top: 58 },
} as const;
