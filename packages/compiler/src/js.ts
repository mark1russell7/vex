/**
 * The back end of JavaScript source (docs/COMPILER.md §3.4). It prints a program of the loop IR as the body of a
 * function with the parameters `K` (the constants) and `R` (the runtime).
 *
 * The source has no name and no literal of the program as text: it reads each one from `K`, by its index (§5). The
 * same program always gives the same source.
 */
import { FIXED_LOCALS, type Fail, type LExpr, type LoopProgram, type LStmt, type RuntimeFn } from "./loop.ts";

const name = (n: number): string => `l${n}`;

/** This function prints the source of a program. The body gives the function of the program. */
export function printJs(p: LoopProgram): string {
  const used = new Set<RuntimeFn>();
  const constants = new Set<number>();
  const sites = new Map<string, string>();
  const expr = (x: LExpr): string => {
    switch (x.t) {
      case "const":
        constants.add(x.i);
        return `k${x.i}`;
      case "local":
        return name(x.n);
      case "num":
        return String(x.v);
      case "bool":
        return String(x.v);
      case "fallback":
        return "F";
      case "array":
        return `[${x.items.map(expr).join(", ")}]`;
      case "call": {
        const [first, ...rest] = x.args;
        // An op has one dispatch for each name, and the function gets it when it loads.
        if (x.fn === "op" && first?.t === "const") {
          const site = `s${first.i}_${rest.length}`;
          sites.set(site, `R.site(${expr(first)}, ${rest.length})`);
          const values = rest.map(expr).join(", ");
          return rest.length <= 3 ? `${site}(${values})` : `${site}([${values}])`;
        }
        // An axis has one function of targets for each site, with its cache.
        const axis = x.args[3];
        if (x.fn === "targets" && axis?.t === "const") {
          const site = `a${axis.i}`;
          sites.set(site, `R.axis(${expr(axis)})`);
          return `${site}(${x.args.slice(0, 3).map(expr).join(", ")})`;
        }
        used.add(x.fn);
        return `${x.fn}_(${x.args.map(expr).join(", ")})`;
      }
      case "prim": {
        const [a, b] = x.args.map(expr);
        switch (x.op) {
          case "!":
            return `(!${a})`;
          case "min":
          case "max":
            return `Math.${x.op}(${a}, ${b})`;
          case "isNumber":
            return `(typeof ${a} === "number")`;
          case "isBoolean":
            return `(typeof ${a} === "boolean")`;
          case "isString":
            return `(typeof ${a} === "string")`;
          case "isValue":
            return `(${a} !== undefined && ${a} !== null)`;
          case "isObject":
            return `(typeof ${a} === "object" || typeof ${a} === "function")`;
          case "get":
            return `${a}.get(${b})`;
          case "member":
            return `${a}[${b}]`;
          case "+":
          case "/":
          case "===":
          case "!==":
          case "||":
          case "&&":
            return `(${a} ${x.op} ${b})`;
        }
      }
    }
  };
  // The labels that a failure names. A loop or a block without a failure that names it gets no label.
  const labels = new Set<number>();
  const named = (f: Fail): void => {
    if (f.t !== "return") labels.add(f.label);
    if (f.t === "continue" && f.strict !== undefined) named(f.strict.else);
  };
  const scan = (ss: readonly LStmt[]): void => {
    for (const s of ss) {
      if (s.t === "check" || s.t === "fail") named(s.fail);
      else if (s.t === "if") scan([...s.yes, ...s.no]);
      else if (s.t === "loop" || s.t === "block") scan(s.body);
    }
  };
  scan(p.body);
  const label = (n: number): string => (labels.has(n) ? `L${n}: ` : "");
  // The statement of a failure (docs/COMPILER.md §4.1).
  const action = (f: Fail): string => {
    switch (f.t) {
      case "return":
        return "return F;";
      case "break":
        return `break L${f.label};`;
      case "continue":
        return f.strict === undefined ? `continue L${f.label};` : `{ if (${expr(f.strict.cond)}) ${action(f.strict.else)} continue L${f.label}; }`;
    }
  };
  const lines: string[] = [];
  const stmts = (ss: readonly LStmt[], indent: string): void => {
    for (const s of ss) stmt(s, indent);
  };
  const stmt = (s: LStmt, indent: string): void => {
    switch (s.t) {
      case "let":
      case "set":
        lines.push(`${indent}${name(s.n)} = ${expr(s.value)};`);
        return;
      case "check":
        lines.push(`${indent}if (!(${expr(s.ok)})) ${action(s.fail)} // ${s.reason}`);
        return;
      case "fail":
        lines.push(`${indent}${action(s.fail)}`);
        return;
      case "if":
        lines.push(`${indent}if (${expr(s.cond)}) {`);
        stmts(s.yes, `${indent}  `);
        if (s.no.length > 0) {
          lines.push(`${indent}} else {`);
          stmts(s.no, `${indent}  `);
        }
        lines.push(`${indent}}`);
        return;
      case "loop": {
        const [a, i] = [name(s.array), name(s.index)];
        lines.push(`${indent}${a} = ${expr(s.over)};`);
        lines.push(`${indent}${label(s.label)}for (${i} = 0; ${i} < ${a}.length; ${i}++) {`);
        lines.push(`${indent}  ${name(s.item)} = ${a}[${i}];`);
        stmts(s.body, `${indent}  `);
        lines.push(`${indent}}`);
        return;
      }
      case "block":
        lines.push(`${indent}${label(s.label)}{`);
        stmts(s.body, `${indent}  `);
        lines.push(`${indent}}`);
        return;
      case "next":
        lines.push(`${indent}continue;`);
        return;
      case "push":
        lines.push(`${indent}${name(s.n)}.push(${expr(s.value)});`);
        return;
      case "return":
        lines.push(`${indent}return ${expr(s.value)};`);
        return;
    }
  };
  stmts(p.body, "    ");
  const params = Array.from({ length: FIXED_LOCALS }, (_, n) => name(n));
  const locals = Array.from({ length: p.locals - FIXED_LOCALS }, (_, n) => name(n + FIXED_LOCALS));
  const head = [
    `"use strict";`,
    `const F = R.F;`,
    ...[...used].toSorted().map((fn) => `const ${fn}_ = R.${fn};`),
    ...[...constants].toSorted((x, y) => x - y).map((i) => `const k${i} = K[${i}];`),
    ...[...sites].toSorted(([x], [y]) => Number(x > y) - Number(x < y)).map(([site, init]) => `const ${site} = ${init};`),
    `return function vex(${params.join(", ")}) {`,
    ...(locals.length > 0 ? [`  let ${locals.join(", ")};`] : []),
    `  try {`,
  ];
  const tail = [`  } catch {`, `    return F;`, `  }`, `};`, ``];
  return [...head, ...lines, ...tail].join("\n");
}
