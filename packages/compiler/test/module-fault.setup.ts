/**
 * This file makes each test of a module run with the option `faults` at `throw` (COMPILE.MODULE.FAULT). Thus a test of
 * a value fails with the real error when the printed code has a fault. A test of the text of a module sets the option.
 *
 * Each printed module of a test also goes through the gate of `names.ts`. Thus a read of a name with no declaration
 * fails at the print. The gate misses a read before a declaration through a closure, a TypeError, a RangeError and a
 * wrong value with no exception. The parser of the gate has less stack than the printer. The gate COMPILE.GROWTH has a
 * larger stack, so it reads each module past that stack.
 *
 * Each key of a print also goes through the gate of `key-gate.ts`, so a key that differs from its plain key fails at the print.
 */
import { vi } from "vitest";
import type * as Module from "../src/module.ts";
import { keyWatch } from "./key-gate.ts";
import { nameFaults } from "./names.ts";

/** This function gives the faults of the names of a module, with none for a module past the stack of the parser. */
function faultsOf(source: string): readonly string[] {
  try {
    return nameFaults(source);
  } catch (thrown) {
    if (thrown instanceof SyntaxError && thrown.message.startsWith("Not enough stack space")) return [];
    throw thrown;
  }
}

/** This function gives a printed module, and it throws if the module has a fault of a name. */
function checked(m: Module.Emitted): Module.Emitted {
  const faults = m.ok ? faultsOf(m.source) : [];
  if (faults.length > 0) throw new Error(`a printed module has a fault of a name:\n${faults.join("\n")}`);
  return m;
}

vi.mock("../src/module.ts", async () => {
  const actual = await vi.importActual<typeof Module>("../src/module.ts");
  /** This function gives the result of a print under the gate of the keys. */
  const watched = (emit: () => Module.Emitted): Module.Emitted => {
    const watch = keyWatch();
    const m = actual.withKeyProbe(watch.probe, emit);
    if (watch.faults.length > 0) throw new Error(`a print has a fault of a key:\n${watch.faults.join("\n")}`);
    return m;
  };
  return {
    ...actual,
    emitModule: (source: Parameters<typeof actual.emitModule>[0], options: Module.ModuleOptions): Module.Emitted => checked(watched(() => actual.emitModule(source, { faults: "throw", ...options }))),
    emitSheetModule: (columns: Parameters<typeof actual.emitSheetModule>[0], options: Module.SheetModuleOptions): Module.Emitted => checked(watched(() => actual.emitSheetModule(columns, { faults: "throw", ...options }))),
  };
});
