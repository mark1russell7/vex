/**
 * The gate of the keys of a print. At each key, this gate takes the plain key of the scope as it stands. In one table,
 * one key has one plain key, and the reverse is also true. A map of `keys` that changes after a read is a refusal of the
 * table, and the other maps have no copy in the table.
 */
import { createHash } from "node:crypto";
import type { Expr } from "@mark1russell7/vex";
import type { KeyProbe } from "../src/module.ts";
import type { KeyScope, KeyTable } from "../src/scope-key.ts";
import { plainKey } from "./plain-key.ts";

/** The keys of one table, in both directions. A plain key is here as its hash, because its text can be long. */
interface Seen {
  readonly plainOf: Map<string, string>;
  readonly keyOf: Map<string, string>;
}

/** The watch of a print: the probe to give to the printer, and the faults that it finds. */
export interface KeyWatch {
  readonly probe: KeyProbe;
  readonly faults: readonly string[];
}

/** This function gives a new watch. */
export function keyWatch(): KeyWatch {
  const tables = new Map<KeyTable, Seen>();
  const faults: string[] = [];
  const probe = (e: Expr, scope: KeyScope, key: string, table: KeyTable): void => {
    const seen = tables.get(table) ?? { plainOf: new Map(), keyOf: new Map() };
    tables.set(table, seen);
    const plain = createHash("sha1").update(plainKey(e, scope)).digest("base64");
    const hadPlain = seen.plainOf.get(key) ?? plain;
    const hadKey = seen.keyOf.get(plain) ?? key;
    if (hadPlain !== plain) faults.push(`the key ${key} has two plain keys`);
    if (hadKey !== key) faults.push(`one plain key has the keys ${hadKey} and ${key}`);
    seen.plainOf.set(key, plain);
    seen.keyOf.set(plain, key);
  };
  return { probe, faults };
}
