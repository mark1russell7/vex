/**
 * The programs of the speed lane. Each program has a Vex form and the same computation in hand-written TypeScript.
 * The report (`evaluate.bench.ts`) and the gate (`gate.ts`) use these programs.
 */
import { vex } from "../src/builder.ts";
import { compile } from "../src/evaluate.ts";
import { space } from "../src/space.ts";
import { Pt, PtDomain } from "../src/test-support.ts";

const N = 60;
const boxes = Object.fromEntries(
  Array.from({ length: N }, (_, i) => [`k${i}`, { position: new Pt((i * 37) % 101, (i * 53) % 97), size: new Pt(1 + (i % 5), 1 + (i % 3)) }]),
);
const keys = Object.keys(boxes);
const root = vex(PtDomain).over(space.record(boxes));
const nearest = root.from("position").others((e) => e._.subtract("position")._.length()).min();
const compiled = compile(nearest.program, { domains: [PtDomain] });

/** The nearest other box, at each of the boxes. */
export const NEAREST = {
  title: `the nearest other box, at each of ${N} keys`,
  root,
  chain: nearest,
  vex: (): void => {
    for (const k of keys) compiled.run({ space: root.space, origin: k });
  },
  hand: (): void => {
    for (const k of keys) {
      const p = boxes[k]?.position ?? new Pt(0, 0);
      let best = Number.POSITIVE_INFINITY;
      for (const o of keys) {
        if (o === k) continue;
        const q = boxes[o]?.position ?? new Pt(0, 0);
        best = Math.min(best, p.subtract(q).length());
      }
    }
  },
  keys,
} as const;

const SIZE = 16;
const cells = Array.from({ length: SIZE }, (_row, i) => Array.from({ length: SIZE }, (_cell, j) => ({ alive: (i * 7 + j * 3) % 5 === 0 })));
const grid = vex(PtDomain).over(space.grid(cells));
const liveNeighbors = grid.start(0).neighbors(8, (n) => n.from("alive"), { where: (n) => n.from("alive") }).count();

/** One step of the Game of Life: the number of live neighbors of each cell. */
export const LIFE = {
  title: `one step of the Game of Life on a ${SIZE} by ${SIZE} grid`,
  root: grid,
  chain: liveNeighbors,
  vex: (): void => {
    liveNeighbors.all();
  },
  hand: (): void => {
    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE; j++) {
        let n = 0;
        for (let di = -1; di <= 1; di++) {
          for (let dj = -1; dj <= 1; dj++) if ((di !== 0 || dj !== 0) && (cells[i + di]?.[j + dj]?.alive ?? false)) n++;
        }
      }
    }
  },
} as const;
