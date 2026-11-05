/**
 * The packages from npm that the speed gates run, and the check of their versions in `pnpm-lock.yaml`. This file is
 * the one source of the list: `gate-paths.test.ts` and `scripts/gate-inputs.ts` get it from here. The package does
 * not export it, and npm does not get it.
 */

/** The packages from npm that the code of the speed gates imports. `gate-paths.test.ts` proves that the list is full. */
export const GATE_NPM_PACKAGES: readonly string[] = ["@mark1russell7/coeval", "@mark1russell7/optional", "@mark1russell7/rigor-bench", "acorn", "astring"];

/** This function gives the name of a key of the `packages` section of a lock file: `'@a/b@1.0.0':` gives `@a/b`. */
function nameOf(key: string): string {
  const bare = key.replace(/^'|'$/gu, "");
  const at = bare.indexOf("@", 1);
  return at === -1 ? bare : bare.slice(0, at);
}

/**
 * This function gives each entry of `pnpm-lock.yaml` for the packages of `names`: its key (the name and the version)
 * and its resolution (the integrity). An entry of the `snapshots` section has no resolution, so the function skips it.
 */
export function lockInputs(lock: string, names: readonly string[]): readonly string[] {
  const lines = lock.split(/\r?\n/u);
  const out: string[] = [];
  for (const [i, line] of lines.entries()) {
    const key = /^ {2}(\S.*):$/u.exec(line)?.[1];
    const next = lines[i + 1] ?? "";
    if (key !== undefined && names.includes(nameOf(key)) && next.startsWith("    resolution: ")) out.push(`${key.replace(/^'|'$/gu, "")} ${next.trim()}`);
  }
  return out.toSorted((x, y) => x.localeCompare(y));
}

/** This function tells if the packages of `names` have the same versions and resolutions in the two lock files. */
export function sameInputs(base: string, head: string, names: readonly string[] = GATE_NPM_PACKAGES): boolean {
  const a = lockInputs(base, names);
  const b = lockInputs(head, names);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
