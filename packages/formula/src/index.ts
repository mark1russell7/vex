/**
 * The formula language of the sheet app. A formula like a spreadsheet formula compiles to an expression of the
 * Vex IR. The app evaluates the expressions with a sheet, and it shows each formula as a Vex chain.
 * Refer to `spec/formula.md`.
 */
export { toVexChain } from "./chain.ts";
export { compileAst, compileFormula, MAX_RANGE, type CompileResult, type FormulaContext, type FormulaError, type GridCellKind, type GridContext } from "./compile.ts";
export { BUILT_IN_NAMES, FORMULA_DOMAINS, FUNCTIONS, OP_NAMES, type FunctionInfo } from "./functions.ts";
export { highlightFormula, type FormulaPiece, type FormulaPieceKind } from "./highlight.ts";
export { ADDRESS, AGGREGATES, AXES, FormulaSyntaxError, MAX_LENGTH, MAX_NESTING, parseFormula, tokenize, type AggregateName, type Ast, type AxisName, type BinaryOp, type Nav, type Span, type Token } from "./syntax.ts";
