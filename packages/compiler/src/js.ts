/**
 * The back end of JavaScript source (docs/COMPILER.md §3.4). It prints a program of the loop IR as the body of a
 * function with the parameters `K` (the constants) and `R` (the runtime).
 *
 * The source has no name and no literal of the program as text: it reads each one from `K`, by its index (§5). The
 * same program and the same facts always give the same source.
 *
 * With the facts of the options, each op site gets its fast path in the source (§13.2). Each site then has its own
 * inline caches in the engine, and a guard sends each other case to the dispatch of the runtime.
 */
import { liftsAt, type ParamKind } from "@mark1russell7/vex";
import type { Facts, SiteFacts } from "./facts.ts";
import { constant, FIXED_LOCALS, type Fail, type LExpr, type LoopProgram, type LStmt, type RuntimeFn } from "./loop.ts";

type OpExpr = Extract<LExpr, { readonly t: "op" }>;

/** This function gives the call of the dispatch of a site. With more than 3 values, the dispatch takes an array. */
function generic(x: OpExpr, site: string, values: readonly string[]): string {
  return x.args.length <= 3 ? `${site}(${values.join(", ")})` : `${site}([${values.join(", ")}])`;
}

/** This function gives the check of an argument of the kind `kind`, for an op of the domain `d`. */
function kindCheck(kind: ParamKind | undefined, a: string, d: string): readonly string[] {
  if (kind === "domain") return [`${d}.is(${a})`];
  if (kind === "number" || kind === "boolean" || kind === "string") return [`typeof ${a} === "${kind}"`];
  return [];
}

const name = (n: number): string => `l${n}`;

/** This function prints the source of a program. The body gives the function of the program. */
export function printJs(p: LoopProgram, facts: Facts): string {
  const used = new Set<RuntimeFn>();
  const constants = new Set<number>();
  const sites = new Map<string, string>();
  const domains = new Set<number>();
  let threw = false;
  let siteLabels = 0;
  const expr = (x: LExpr): string => {
    switch (x.t) {
      case "const":
        constants.add(x.i);
        return `k${x.i}`;
      case "local":
        return name(x.n);
      case "num":
      case "bool":
        return String(x.v);
      case "fallback":
        return "F";
      case "array":
        return `[${x.items.map(expr).join(", ")}]`;
      case "call":
        used.add(x.fn);
        return `${x.fn}_(${x.args.map(expr).join(", ")})`;
      case "op":
        return generic(x, siteOf(x), x.args.map(expr));
      case "targets": {
        // An axis has one function of targets for each site, with its cache.
        const site = `a${x.axis}`;
        sites.set(site, `R.axis(${expr(constant(x.axis))})`);
        return `${site}(${x.args.map(expr).join(", ")})`;
      }
      case "prim": {
        const [a, b, c, d] = x.args.map(expr);
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
          case "records":
            return `${a}.records`;
          case "recordAt":
            return `(${a} !== undefined ? ${a}[${b}] : ${c}.get(${d}))`;
          case "keysOf":
            return `${a}.keys`;
          case "idxOf":
            return `${a}.idx`;
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
  // An op has one dispatch for each name and number of arguments, and the function gets it when it loads.
  function siteOf(x: OpExpr): string {
    const site = `s${x.name}_${x.args.length}`;
    sites.set(site, `R.site(${expr(constant(x.name))}, ${x.args.length})`);
    return site;
  }
  const domain = (i: number): string => {
    domains.add(i);
    return `d${i}`;
  };
  // The checks of the result of an op, as `#checkResult` of the interpreter. A domain without `valid` stops the search.
  const resultChecks = (out: string, checks: readonly boolean[], indent: string): void => {
    lines.push(`${indent}if (${out} !== F) {`);
    lines.push(`${indent}  if (${out} === undefined || ${out} === null || (typeof ${out} === "number" && !Number.isFinite(${out}))) ${out} = F;`);
    checks.forEach((valid, i) => {
      const d = domain(i);
      lines.push(valid ? `${indent}  else if (${d}.is(${out})) { try { if (!${d}.valid(${out})) ${out} = F; } catch (e) { ${out} = threw_(e); } }` : `${indent}  else if (${d}.is(${out})) {}`);
    });
    lines.push(`${indent}}`);
  };
  /**
   * The fast path of an op site that assigns the local `n`. A method site guards the method of the last receiver and
   * the domain of the receiver, and a site of a function guards the domain. Then the site checks the arguments, calls
   * the op in a `try`, and checks the result. A number that the op lifts, and each failed guard, go to the dispatch.
   */
  const siteBlock = (n: number, x: OpExpr, indent: string): boolean => {
    const f = facts.site(p.constants[x.name] as string, x.args.length);
    const attempt = (call: string, ind: string): void => {
      threw = true;
      lines.push(`${ind}try { ${name(n)} = ${call}; } catch (e) { ${name(n)} = threw_(e); }`);
    };
    switch (f.t) {
      case "generic":
        return false;
      case "free": {
        const site = siteOf(x);
        sites.set(`${site}_f`, `${site}.free`);
        attempt(`${site}_f(${x.args.map(expr).join(", ")})`, indent);
        resultChecks(name(n), facts.checks, indent);
        return true;
      }
      case "op":
        opBlock(n, x, f, indent, attempt);
        return true;
    }
  };
  const opBlock = (n: number, x: OpExpr, f: Extract<SiteFacts, { readonly t: "op" }>, indent: string, attempt: (call: string, ind: string) => void): void => {
    const site = siteOf(x);
    const values = x.args.map(expr);
    const out = name(n);
    const label = `S${siteLabels++}`;
    const [self, ...args] = values as [string, ...string[]];
    const d = domain(f.domain);
    lines.push(`${indent}${label}: {`);
    let inner: string;
    let call: string;
    if (f.method) {
      const m = `m${label}`;
      lines.push(`${indent}  if (typeof ${self} === "object" && ${self} !== null) {`, `${indent}    const ${m} = ${site}.m;`);
      lines.push(`${indent}    if (${m} !== undefined && ${self}[${expr(constant(x.name))}] === ${m} && ${d}.is(${self})) {`);
      inner = `${indent}      `;
      call = `${self}[${expr(constant(x.name))}](${args.join(", ")})`;
    } else {
      sites.set(`${site}_f`, `${site}.fn`);
      lines.push(`${indent}  if (${d}.is(${self})) {`);
      inner = `${indent}    `;
      call = `${site}_f(${values.join(", ")})`;
    }
    const lifted = args.filter((_a, i) => liftsAt(f.lift, i)).map((a) => `typeof ${a} === "number"`);
    if (lifted.length > 0) lines.push(`${inner}if (${lifted.join(" || ")}) { ${out} = ${generic(x, site, values)}; break ${label}; }`);
    const kinds = args.flatMap((a, i) => kindCheck(f.params?.[i], a, d));
    if (kinds.length > 0) lines.push(`${inner}if (!(${kinds.join(" && ")})) { ${out} = F; break ${label}; }`);
    attempt(call, inner);
    resultChecks(out, facts.checks, inner);
    lines.push(`${inner}break ${label};`);
    if (f.method) lines.push(`${indent}    }`);
    lines.push(`${indent}  }`, `${indent}  ${out} = ${generic(x, site, values)};`, `${indent}}`);
  };
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
        if (s.value.t === "op" && siteBlock(s.n, s.value, indent)) return;
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
        lines.push(`${indent}L${s.label}: for (${i} = 0; ${i} < ${a}.length; ${i}++) {`);
        lines.push(`${indent}  ${name(s.item)} = ${a}[${i}];`);
        stmts(s.body, `${indent}  `);
        lines.push(`${indent}}`);
        return;
      }
      case "block":
        lines.push(`${indent}L${s.label}: {`);
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
    // The order is the order of the first use, so the same program gives the same source.
    ...[...used].map((fn) => `const ${fn}_ = R.${fn};`),
    ...[...constants].map((i) => `const k${i} = K[${i}];`),
    ...[...sites].map(([site, init]) => `const ${site} = ${init};`),
    ...[...domains].map((i) => `const d${i} = R.domain(${i});`),
    ...(threw ? [`const threw_ = R.threw;`] : []),
    `return function vex(${params.join(", ")}) {`,
    ...(locals.length > 0 ? [`  let ${locals.join(", ")};`] : []),
    `  try {`,
  ];
  const tail = [`  } catch {`, `    return F;`, `  }`, `};`, ``];
  return [...head, ...lines, ...tail].join("\n");
}
