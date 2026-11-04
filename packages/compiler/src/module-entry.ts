/**
 * The entry `@mark1russell7/vex-compiler/module`: the printer of standalone modules (docs/COMPILER.md §4.4). This entry
 * loads the parser of the copied functions (COMPILE.MODULE.TEXT). The root entry does not, so a program that only runs
 * tiers does not load it.
 */
export { functionText } from "./fn-text.ts";
export { emitModule, emitSheetModule, type Emitted, type ListKind, type ModuleOptions, type SheetModuleOptions } from "./module.ts";
