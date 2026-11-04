---
"@mark1russell7/vex": patch
"@mark1russell7/vex-compiler": patch
"@mark1russell7/vex-mcp": patch
---

The language has steps A, B and C (STEP.LADDER). The checker gives the lowest step of a program, with the reason (STEP.LOWEST). Each construct is of step A today, so each program is of step A.

The new host option `maxStep` sets the highest step that the host accepts. The default is B. `compile`, tier 2, `emitModule`, `emitSheetModule` and the tools refuse a program above it, and the reason names the needed step (STEP.MAX). `vex_check` gives the step and the reason. `vex_explain` gives the step on the first line. The new exports are `programStep`, `stepError`, `VEX_STEPS`, `VEX_STEP_NAMES`, `CONSTRUCT_STEPS`, `DEFAULT_MAX_STEP` and the types `VexStep`, `StepOptions` and `ProgramStep`.
