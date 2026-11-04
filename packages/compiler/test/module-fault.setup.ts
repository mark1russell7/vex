/**
 * This file makes each test of a module run with the option `faults` at `throw` (COMPILE.MODULE.FAULT). Thus a test of
 * a value fails with the real error when the printed code has a fault. A test of the text of a module sets the option.
 *
 * Each printed module of a test also goes through the gate of `names.ts`. Thus a read of a name with no declaration
 * fails at the print. The gate misses a read before a declaration through a closure, a TypeError, a RangeError and a
 * wrong value with no exception.
 */
import { vi } from "vitest";
import type * as Module from "../src/module.ts";
import { nameFaults } from "./names.ts";

/** This function gives a printed module, and it throws if the module has a fault of a name. */
function checked(m: Module.Emitted): Module.Emitted {
  const faults = m.ok ? nameFaults(m.source) : [];
  if (faults.length > 0) throw new Error(`a printed module has a fault of a name:\n${faults.join("\n")}`);
  return m;
}

vi.mock("../src/module.ts", async () => {
  const actual = await vi.importActual<typeof Module>("../src/module.ts");
  return {
    ...actual,
    emitModule: (source: Parameters<typeof actual.emitModule>[0], options: Module.ModuleOptions): Module.Emitted => checked(actual.emitModule(source, { faults: "throw", ...options })),
    emitSheetModule: (columns: Parameters<typeof actual.emitSheetModule>[0], options: Module.SheetModuleOptions): Module.Emitted => checked(actual.emitSheetModule(columns, { faults: "throw", ...options })),
  };
});
