/**
 * The Vex compiler (docs/COMPILER.md): generated JavaScript for Vex programs, with the results of the interpreter.
 */
export { generate, load, tiered, type Generated, type GenerateOptions, type Tier2, type TieredProgram, type TierStats } from "./tiers.ts";
export type { Schema } from "./facts.ts";
export { emitModule, emitSheetModule, type Emitted, type ModuleOptions, type SheetModuleOptions } from "./module.ts";
export { FALLBACK, createRuntime, type Fallback, type Runtime, type RuntimeOptions } from "./runtime.ts";
export type { LExpr, LoopProgram, LStmt, PrimOp, RuntimeFn } from "./loop.ts";
