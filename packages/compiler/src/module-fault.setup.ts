/**
 * This file makes each test of a module run with the option `faults` at `throw` (COMPILE.MODULE.FAULT). Thus a test of
 * a value fails with the real error when the printed code has a fault. A test of the text of a module sets the option.
 */
import { vi } from "vitest";
import type * as Module from "./module.ts";

vi.mock("./module.ts", async () => {
  const actual = await vi.importActual<typeof Module>("./module.ts");
  return {
    ...actual,
    emitModule: (source: Parameters<typeof actual.emitModule>[0], options: Module.ModuleOptions): Module.Emitted => actual.emitModule(source, { faults: "throw", ...options }),
    emitSheetModule: (columns: Parameters<typeof actual.emitSheetModule>[0], options: Module.SheetModuleOptions): Module.Emitted => actual.emitSheetModule(columns, { faults: "throw", ...options }),
  };
});
