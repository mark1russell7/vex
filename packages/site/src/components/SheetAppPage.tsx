/**
 * The sheet app on the site, with its formula compiler.
 */
import { space, vex } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, Vec2Domain } from "@mark1russell7/vex-domains";
import { SheetApp, type Compiler } from "@vex/sheet-app";
import type { ReactElement } from "react";
import { ChainError, parseChain, programOf, runChain } from "../lib/chain-parser.ts";
import { highlight } from "../lib/highlight.ts";

// TEMPORARY: the Lab reader stands in for @vex/formula until that package is in the repository.
const root = vex(NumDomain, BoolDomain, Vec2Domain).over(space.record({ x: {} }));
const compiler: Compiler = {
  compile: (text) => {
    try {
      return { ok: true, expr: programOf(runChain(parseChain(text), { root }), text), reads: [] };
    } catch (e) {
      return { ok: false, error: e instanceof ChainError ? { message: e.message, span: e.span } : { message: String(e), span: { start: 0, end: text.length } } };
    }
  },
  toVexChain: (e) => JSON.stringify(e),
  highlight,
};

/** The sheet app with the compiler of the site. */
export default function SheetAppPage(props: { readonly docsHref: string }): ReactElement {
  return <SheetApp compiler={compiler} docsHref={props.docsHref} />;
}
