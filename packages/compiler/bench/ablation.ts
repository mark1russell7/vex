// The ablation of RADIALGAP (step 3 of the fleet item): variants of the radial module of ireko, made by text edits of the
// emitted source. Each edit fails when its text is not in the source, so a change of the emitter stops the gate and does
// not measure a variant that is the same as the module. The test in `ablation.test.ts` checks each edit on each push.
import { RADIAL_DOMAINS, RADIAL_PROGRAM, RADIAL_SCHEMA, type RadialInput } from "../../pilots/src/ireko-radial.ts";
import { emitModule } from "../src/index.ts";

/** This type is the run of the radial module: the records and the variables of a ring give its result. */
export type RadialRun = (records: unknown, vars: unknown) => unknown;

/** This function loads the radial module, with the source changed by `edit`. */
export const loadRadial = (edit: (source: string) => string): RadialRun => {
  const m = emitModule(RADIAL_PROGRAM, { domains: RADIAL_DOMAINS, schema: RADIAL_SCHEMA, name: "radial" });
  if (!m.ok) throw new Error(m.reason);
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in the build of ireko.
  const load = new Function(`${edit(m.source.replaceAll(/^export /gm, ""))}\nreturn radial;`) as () => RadialRun;
  return load();
};

/** This function gives a full ring of `n` children of mixed sizes, the input of the radial cases of the gate. */
export const ringOf = (n: number, mode: "nested" | "linked"): RadialInput => ({
  mode,
  self: { width: 40, height: 30 },
  gap: 8,
  options: { startAngle: -90, sweep: 360, clockwise: true, distance: 0 },
  children: Array.from({ length: n }, (_, i) => {
    const width = 10 + ((i * 37) % 90);
    const height = 10 + ((i * 53) % 70);
    return { box: { width, height }, extent: { x: 0, y: 0, width, height } };
  }),
});

const HELPERS = {
  k: "const k_number = (x) => (Number.isFinite(x) ? x : F());",
  g: "function G(x) { return x === E ? F() : x; }",
  q: "function Q(f) { const m = []; return (j) => { let v = m[j]; if (v === undefined) { try { v = f(j); } catch { v = E; } m[j] = v; } return v; }; }",
} as const;
const replaceOnce = (source: string, from: string, to: string): string => {
  if (source.split(from).length !== 2) throw new Error(`ablation: the edit needs the text "${from}" once in the radial module.`);
  return source.replace(from, () => to);
};

/** This edit makes the number checks and the error checks of lazy values the identity: an upper bound of what the removal of the checks wins. */
export const noChecks = (source: string): string => replaceOnce(replaceOnce(source, HELPERS.k, "const k_number = (x) => x;"), HELPERS.g, "function G(x) { return x; }");

/** This edit removes the try block of the memo of a column. The memo stays a new array for each column, as in the module. */
export const noColumnTry = (source: string): string => replaceOnce(source, HELPERS.q, "function Q(f) { const m = []; return (j) => { let v = m[j]; if (v === undefined) { v = f(j); m[j] = v; } return v; }; }");

// The emitter writes an item of a loop that skips an error as `let v;`, `try {`, `v = <code>;`, `} catch {`, `continue;`, `}`.
const ITEM_TRY = /^([ \t]*)let (\w+);\n\1try \{\n\1 {2}\2 = ([^\n]*);\n\1\} catch \{\n\1 {2}continue;\n\1\}$/gm;

/** This function gives the count of the loop items with a try block that skips an error. */
export const itemTries = (source: string): number => [...source.matchAll(ITEM_TRY)].length;

/** This edit removes the try block of each loop item that skips an error. On an input without errors, the result stays the same. */
export const noItemTry = (source: string): string => {
  if (itemTries(source) === 0) throw new Error("ablation: the radial module has no loop item with a try block.");
  return source.replaceAll(ITEM_TRY, (_, indent: string, v: string, code: string) => `${indent}let ${v} = ${code};`);
};

/** This edit applies the three edits together. */
export const allEdits = (source: string): string => noItemTry(noColumnTry(noChecks(source)));

// The transplants (the third ablation): a function of the module becomes the code of the hand arm. The names of the
// module are the names of today's emitter: `fn44` gives the need of a child, `fn7` its radius, `c14` the direction,
// `c15` the start angle and `v7` the gap. A change of the emitter stops the edit, or the test of the result.
const ARRAYS_AFTER = "  const fn44 = (k23) => G(col43(k23));\n";
const SUM_HEAD = "  const fn63 = (p51) => {\n";
const PAIRS_HEAD = "  const fn120 = (p79) => {\n";
/** This edit adds packed arrays of the needs and the radii of the children, made once at their first use. */
const withArrays = (source: string): string =>
  replaceOnce(source, ARRAYS_AFTER, `${ARRAYS_AFTER}  let NEED_, RHO_;\n  const needs = () => (NEED_ ??= Array.from({ length: n }, (_, j) => fn44(j)));\n  const rhos = () => (RHO_ ??= Array.from({ length: n }, (_, j) => fn7(j)));\n`);
/** This function replaces the function that starts with `head`, up to its end at the indent of two spaces. */
const replaceFunction = (source: string, head: string, to: string): string => {
  if (source.split(head).length !== 2) throw new Error(`ablation: the edit needs the text "${head.trim()}" once in the radial module.`);
  const from = source.indexOf(head);
  const end = source.indexOf("\n  };\n", from);
  if (end < 0) throw new Error(`ablation: the function "${head.trim()}" has no end.`);
  return source.slice(0, from) + to + source.slice(end + "\n  };\n".length);
};
const HAND_SUM = `${SUM_HEAD}    const need = needs();
    let sum = 0;
    for (let j = 0; j < n; j++) sum += 2 * Math.asin(Math.min(1, need[j] / (2 * p51)));
    return sum;
  };
`;
const HAND_PAIRS = `${PAIRS_HEAD}    const need = needs(), rho = rhos(), r = p79;
    const steps = need.map((d) => 2 * Math.asin(Math.min(1, d / (2 * r))));
    const spare = (2 * Math.PI - steps.reduce((a, b) => a + b, 0)) / n;
    if (spare < -1e-9) return false;
    const angles = [];
    let angle = G(c15);
    for (const step of steps) {
      angles.push(angle);
      angle += c14 * (step + Math.max(0, spare));
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = Math.abs(angles[i] - angles[j]) % (2 * Math.PI);
        if (2 * r * Math.sin(Math.min(d, 2 * Math.PI - d) / 2) < rho[i] + rho[j] + v7 - 1e-7) return false;
      }
    }
    return true;
  };
`;

// The emitter gives `fn63` a pack of the needs and one try for all the items already. Thus `handSum` measures only the
// checks of the numbers and of the errors, and the try. The edit stays, so the gate keeps the same hand arm.
/** This edit makes the sum of the chord angles at a radius the loop of the hand arm, over a packed array of the needs. */
export const handSum = (source: string): string => replaceFunction(withArrays(source), SUM_HEAD, HAND_SUM);

/** This edit makes the test of a radius the code of the hand arm: the angles, then the pairs, with a return at the first pair that is too close. */
export const handPairs = (source: string): string => replaceFunction(withArrays(source), PAIRS_HEAD, HAND_PAIRS);

/** This edit applies the two transplants together. */
export const handBoth = (source: string): string => replaceFunction(replaceFunction(withArrays(source), SUM_HEAD, HAND_SUM), PAIRS_HEAD, HAND_PAIRS);
