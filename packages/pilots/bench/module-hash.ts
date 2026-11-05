/** This file prints a hash and a size of each module of ireko in each mode. A side run compares two commits with it. */
import { createHash } from "node:crypto";
import { irekoSource, isIrekoModule } from "../src/ireko-modules.ts";

const NAMES = ["grid", "radial", "layers", "tree", "shape", "place", "measure", "straight", "orthogonal", "avoid", "direction", "label", "obstacles", "overlap", "bounds", "between"];

for (const name of NAMES) {
  if (!isIrekoModule(name)) throw new Error(`module-hash: the table of this commit does not have "${name}"`);
  for (const mode of ["value", "throw"] as const) {
    const source = irekoSource(name, mode);
    console.info(`${name} ${mode} ${String(source.length)} ${createHash("sha256").update(source).digest("hex")}`);
  }
}
