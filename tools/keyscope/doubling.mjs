// The table of the doubling programs: a child process for each depth, with a kill timeout and a heap cap.
import { spawnSync } from "node:child_process";

const [label, child] = process.argv.slice(2);
const LIMIT_MS = 60_000;
const HEAP_MB = 2048;
for (const mode of ["module", "tier2"]) {
  for (const shape of ["plain", "constant", "loop"]) {
    for (const depth of [10, 20, 30, 40]) {
      const t0 = Date.now();
      const r = spawnSync(process.execPath, [`--max-old-space-size=${HEAP_MB}`, child, mode, shape, String(depth)], { timeout: LIMIT_MS, killSignal: "SIGKILL", encoding: "utf8", maxBuffer: 1 << 20 });
      const line = r.stdout.trim().split("\n").at(-1) ?? "";
      const state = r.error?.code === "ETIMEDOUT" ? `killed at ${LIMIT_MS} ms` : r.status === 0 ? line : `exit ${r.status} signal ${r.signal}: ${r.stderr.split("\n").filter((x) => /Error|heap|FATAL/.test(x)).slice(0, 2).join(" ").slice(0, 160)}`;
      process.stdout.write(`TABLE ${label} ${mode} ${shape} depth=${depth} wall=${Date.now() - t0}ms ${state}\n`);
    }
  }
}
