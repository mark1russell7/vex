/**
 * The sheet app on the site, with the formula compiler of `@vex/formula`.
 */
import { compileFormula, FORMULA_DOMAINS, FUNCTIONS, highlightFormula, toVexChain } from "@vex/formula";
import { SheetApp, type Compiler } from "@vex/sheet-app";
import type { ReactElement } from "react";

const compiler: Compiler = { compile: compileFormula, toVexChain, highlight: highlightFormula, functions: FUNCTIONS, domains: FORMULA_DOMAINS };

/** The sheet app with the compiler of the site. */
export default function SheetAppPage(props: { readonly docsHref: string }): ReactElement {
  return <SheetApp compiler={compiler} docsHref={props.docsHref} />;
}
