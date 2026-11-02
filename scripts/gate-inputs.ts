/**
 * This script compares the packages from npm of the speed gates in two lock files: the base and the head of a pull
 * request. It writes `same=true` or `same=false` for `$GITHUB_OUTPUT`. Start `node scripts/gate-inputs.ts base.yaml pnpm-lock.yaml`.
 */
import { readFileSync } from "node:fs";
import { GATE_NPM_PACKAGES, lockInputs, sameInputs } from "../packages/testkit/src/gate-inputs.ts";

const [basePath = "", headPath = ""] = process.argv.slice(2);
const base = readFileSync(basePath, "utf8");
const head = readFileSync(headPath, "utf8");
for (const [side, lock] of [["base", base], ["head", head]] as const) for (const entry of lockInputs(lock, GATE_NPM_PACKAGES)) console.error(`gate-inputs: ${side} ${entry}`);
console.info(`same=${String(sameInputs(base, head))}`);
