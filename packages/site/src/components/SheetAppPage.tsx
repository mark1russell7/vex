/**
 * The sheet app on the site, with the formula compiler of `@vex/formula`. The compiler of `@mark1russell7/vex-compiler`
 * makes generated JavaScript from the formula of each column (SHEET.COMPILE).
 */
import { tiered } from "@mark1russell7/vex-compiler";
import { compileFormula, FORMULA_DOMAINS, FUNCTIONS, highlightFormula, toVexChain } from "@vex/formula";
import { SheetApp, type Compiler } from "@vex/sheet-app";
import type { ReactElement } from "react";

const compiler: Compiler = { compile: compileFormula, toVexChain, highlight: highlightFormula, functions: FUNCTIONS, domains: FORMULA_DOMAINS, compileProgram: tiered };

/** The sheet app with the compiler of the site. */
export default function SheetAppPage(props: { readonly docsHref: string }): ReactElement {
  return <SheetApp compiler={compiler} docsHref={props.docsHref} />;
}
