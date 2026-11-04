// This script copies module.ts to module-scratch.ts with the counters of the bad state of V-077.
import { readFileSync, writeFileSync } from "node:fs";

const [from, to] = process.argv.slice(2);
let text = readFileSync(from, "utf8");
const swap = (old, next) => {
  if (text.split(old).length !== 2) throw new Error(`not one match: ${old}`);
  text = text.replace(old, () => next);
};
const counted = (lines) => `{ const F = (globalThis as any).__F; if (this.#pack !== undefined) F[this.#pack.calls ? "missFold" : "missSum"]++; if (this.#readsPack(${lines})) { F[this.#pack?.calls ? "badFold" : "badSum"]++; if (F.keepFix) throw new NoPack(); } }`;
swap("if (this.#readsPack([c.v.code, ...c.s])) throw new NoPack();", counted("[c.v.code, ...c.s]"));
swap("if (this.#readsPack(lines)) throw new NoPack();", counted("lines"));
swap("    if ([...names.vars.values()].some((x) => x.list !== undefined)) return undefined;\n    // The first print must read a column that can have a pack: a column of the run, or a column of this function.", "    (globalThis as any).__F.foldAll++;\n    if ([...names.vars.values()].some((x) => x.list !== undefined)) return undefined;\n    // The first print must read a column that can have a pack: a column of the run, or a column of this function.");
swap("    const pack: Pack = { foci: new Set([t.j]), calls: true, cols: new Map(), inlines: 0 };", "    (globalThis as any).__F.second++;\n    const pack: Pack = { foci: new Set([t.j]), calls: true, cols: new Map(), inlines: 0 };");
writeFileSync(to, text);
