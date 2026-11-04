// The compile cost of the branch against its base. Throwaway measure of a draft pull request.
// Each sample is a fresh process. Each round turns the order of the arms. The arm `again` is the branch once more, so it is the A/A arm.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const [branchChild, baseChild, recordFile] = process.argv.slice(2);
const ROUNDS = 7;
const LIMIT_MS = 120_000;
const HEAP_MB = 2048;
const ARMS = [
  ["branch", branchChild],
  ["base", baseChild],
  ["again", branchChild],
];
const SHAPES = ["plain", "constant", "loop"];
const DEPTHS = [10, 12, 14];
const MODES = ["module", "tier2"];
const FORMS = ["shared", "json"];

function sample(child, mode, shape, depth, form) {
  const r = spawnSync(process.execPath, [`--max-old-space-size=${HEAP_MB}`, child, mode, shape, String(depth), form], { timeout: LIMIT_MS, killSignal: "SIGKILL", encoding: "utf8", maxBuffer: 1 << 20 });
  if (r.status !== 0) return { ok: false, why: `exit ${r.status} signal ${r.signal} ${r.stderr.slice(0, 200)}` };
  return JSON.parse(r.stdout.trim().split("\n").at(-1));
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const f2 = (x) => x.toFixed(2);

const cells = MODES.flatMap((mode) => FORMS.flatMap((form) => SHAPES.flatMap((shape) => DEPTHS.map((depth) => ({ mode, form, shape, depth })))));
for (const [index, cell] of cells.entries()) {
  const times = { branch: [], base: [], again: [] };
  const ratios = [];
  for (let round = 0; round < ROUNDS; round++) {
    const turn = (round + index) % ARMS.length;
    const order = [...ARMS.slice(turn), ...ARMS.slice(0, turn)];
    const got = {};
    for (const [arm, child] of order) {
      const r = sample(child, cell.mode, cell.shape, cell.depth, cell.form);
      appendFileSync(recordFile, `${JSON.stringify({ ...cell, round, arm, ...r })}\n`);
      if (!r.ok) console.info(`FAIL ${JSON.stringify(cell)} ${arm} ${r.why ?? r.reason ?? ""}`);
      else {
        times[arm].push(r.ms);
        got[arm] = r.ms;
      }
    }
    if (got.branch !== undefined && got.base !== undefined) ratios.push(got.branch / got.base);
  }
  const m = { branch: median(times.branch), base: median(times.base), again: median(times.again) };
  console.info(`COST ${cell.mode} ${cell.form} ${cell.shape} d${cell.depth} n=${times.branch.length} base=${f2(m.base)} branch=${f2(m.branch)} ratio=${f2(m.branch / m.base)} aa=${f2(m.again / m.branch)} worstPair=${f2(Math.max(...ratios))}`);
}

// The walk alone on a program with no shared object, against the whole compile of that program on the branch.
for (const shape of SHAPES) {
  for (const depth of DEPTHS) {
    const walk = [];
    for (let round = 0; round < ROUNDS; round++) {
      const r = sample(branchChild, "walk", shape, depth, "json");
      appendFileSync(recordFile, `${JSON.stringify({ mode: "walk", shape, depth, form: "json", round, ...r })}\n`);
      if (r.ok) walk.push(r.ms);
    }
    console.info(`WALK ${shape} d${depth} n=${walk.length} median=${f2(median(walk))} worst=${f2(Math.max(...walk))}`);
  }
}
