/**
 * The last pass of the printer of a module (`COMPILER.md` §4.4, COMPILE.MODULE.SIZE). This pass reads the lines of a
 * printed run, and it removes code that gives no value. It does not change the value of a run, an error of a run or a
 * refusal of the printer.
 *
 * The printer gives one statement on each line, and each block adds two spaces. A name with digits is a fresh name of
 * the printer. A text of a program can hold each word, so each count of a word here also counts the words in a text. A
 * count that is too high only stops a rule. A rule that writes code reads the tokens of the code (`rewritten`), so it
 * does not change a text.
 */
import { type Token, tokenizer, tokTypes } from "acorn";


/** The parts of a module for the pass. */
export interface TidyParts {
  /** The helpers and the declarations at the top of the module, by name, in their order. */
  readonly decls: ReadonlyMap<string, string>;
  /** The statements of the run that this pass can change: the constants of the run and the body. */
  readonly lines: readonly string[];
  /** The other text of the module. This pass does not change it, and each name that it reads stays. */
  readonly kept: string;
  /** The globals that a function of an op can read at each place of the module. */
  readonly globals: ReadonlySet<string>;
}

/** The result of the pass: the declarations that stay, and the statements of the run. */
export interface Tidied {
  readonly decls: ReadonlyMap<string, string>;
  readonly lines: readonly string[];
}

/** The tokens that hold a text of the code: a string, a part of a template and a regular expression. */
const TEXT_TOKENS: ReadonlySet<unknown> = new Set([tokTypes.string, tokTypes.template, tokTypes.regexp]);

/** A text of the code starts with one of these characters. A comment starts with the slash too. */
// Stryker disable next-line Regex: `rewritten` calls `codeOf` on a line with a match, so a form that finds other characters also finds that line.
const TEXT_START = /["'`/]/;

/** This function gives a line of code with spaces at the place of each text. Each other character keeps its offset. A line with no text needs no tokens. */
function codeOf(line: string): string {
  if (!TEXT_START.test(line)) return line;
  let out = "";
  let at = 0;
  for (const token of tokenizer(line, { ecmaVersion: "latest" })) {
    if (!TEXT_TOKENS.has(token.type)) continue;
    out += line.slice(at, token.start) + " ".repeat(token.end - token.start);
    at = token.end;
  }
  return out + line.slice(at);
}

/**
 * This function writes each match of `find` in the code of a line. A match in a text does not count, and each text
 * keeps its characters. `find` must have the flag `g`. A line with no match needs no tokens.
 */
function rewritten(line: string, find: RegExp, write: (match: RegExpExecArray) => string): string {
  if (line.search(find) < 0) return line;
  let out = "";
  let at = 0;
  for (const match of codeOf(line).matchAll(find)) {
    out += line.slice(at, match.index) + write(match);
    at = match.index + match[0].length;
  }
  return out + line.slice(at);
}

/** This function gives the names in code. A word in a comment or in a text is not a name. */
export function namesOfCode(code: string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const token of tokenizer(code, { ecmaVersion: "latest", sourceType: "module" })) if (token.type === tokTypes.name) names.add((token as Token & { readonly value: string }).value);
  return names;
}

/** The words of a text. */
const WORD = /[A-Za-z_$][\w$]*/g;

/** This function gives the words of a text. */
export const wordsOf = (text: string): readonly string[] => text.match(WORD) ?? [];

/** This function gives the count of a word in some lines. A line without the text of the word needs no walk. */
function countOf(lines: readonly string[], name: string): number {
  let sum = 0;
  for (const x of lines) {
    // Stryker disable next-line ConditionalExpression: a line without the text has no such word, so this test only saves the walk.
    if (x.includes(name)) sum += wordsOf(x).filter((w) => w === name).length;
  }
  return sum;
}

/** This function gives the number of spaces at the start of a line. */
const indentOf = (line: string): number => line.length - line.trimStart().length;

/** This function gives the first line after `at` that is not in the block of the line `at`. */
function blockEnd(lines: readonly string[], at: number): number {
  const indent = indentOf(lines[at] as string);
  let end = at + 1;
  while (end < lines.length && indentOf(lines[end] as string) >= indent) end++;
  return end;
}

/** This function gives the line that opens the block of the line `at`, or -1 at the top of the run. */
function openerOf(lines: readonly string[], at: number): number {
  const indent = indentOf(lines[at] as string);
  let k = at - 1;
  while (k >= 0 && indentOf(lines[k] as string) >= indent) k--;
  return k;
}

/** The line of a function that a block opens. */
const FUNCTION_HEAD = /=> \{$|\bfunction\b.*\{$/;

/** This function gives the line that opens the function of the line `at`, or -1 for the function of the run. */
function functionOf(lines: readonly string[], at: number): number {
  let k = openerOf(lines, at);
  while (k >= 0 && !FUNCTION_HEAD.test(lines[k] as string)) k = openerOf(lines, k);
  return k;
}

/** The key of an item of a list in a loop. The head of the loop must come just before it (`deadKeys`). */
const KEY_READ = /^\s*const (j\d+) = ([A-Za-z]+\d*)\[(q\d+)\](\[0\])?;$/;

/**
 * This function removes each read of a key that no code reads (COMPILE.MODULE.SIZE.KEY). The read must be the first line
 * of the loop of its position. A read of a pair must also have a loop over the length of its array. An item of a list
 * is a pair, so the read cannot throw.
 */
export function deadKeys(lines: readonly string[]): readonly string[] {
  return lines.filter((line, i) => {
    const m = KEY_READ.exec(line);
    if (m === null) return true;
    const [, key, array, position, pair] = m as unknown as readonly [string, string, string, string, string | undefined];
    const head = lines[i - 1] ?? "";
    const loop = head.trimStart().startsWith(`for (let ${position} = `) && (pair === undefined || new RegExp(`(?<![\\w$.])${array}\\.length`).test(head));
    return !loop || countOf(lines.slice(i + 1, blockEnd(lines, i)), key) > 0;
  });
}

/**
 * This function gives a line with each read of the name `from` as a read of the name `to`. A property, a key of an
 * object and a part of a longer word are not reads. A spread reads its name.
 */
function renamed(line: string, from: string, to: string): string {
  const read = new RegExp(`(?<![\\w$])(?<!(?<!\\.\\.)\\.)(?:(?<![{,]\\s*)${from}|${from}(?!\\s*:))(?![\\w$])`, "g");
  return rewritten(line, read, () => to);
}

/** The writes to a name. The first group holds the name after `++` or `--`, and the second group the name before an operator. */
const WRITE = /(?:\+\+|--)\s*([A-Za-z_$][\w$]*)|(?<![\w$.])(?<!\b(?:const|let) )([A-Za-z_$][\w$]*)\s*(?:\+\+|--|(?:[-+*/%&|^]|<<|>>>?|\*\*|&&|\|\||\?\?)?=(?![=>]))/g;

/** This function gives the lines that write to each name, without the line that declares the name. */
function writesOf(lines: readonly string[]): ReadonlyMap<string, readonly number[]> {
  const writes = new Map<string, number[]>();
  for (const [i, line] of lines.entries()) {
    for (const m of line.matchAll(WRITE)) {
      const name = (m[1] ?? m[2]) as string;
      writes.set(name, [...(writes.get(name) ?? []), i]);
    }
  }
  return writes;
}

/** This function tells if a line declares a name, also as a parameter of a function. */
function binds(line: string, name: string): boolean {
  // Stryker disable next-line ConditionalExpression: a line without the name has no declaration of it, so this test only saves the pattern.
  if (!line.includes(name)) return false;
  const word = `(?<![\\w$])${name}(?![\\w$])`;
  return new RegExp(`\\b(?:const|let)\\s+(?:[^;=]*,\\s*|\\[[^\\]]*)?${word}|\\([^()]*${word}[^()]*\\)\\s*=>|${word}\\s*=>|\\bfunction\\b[^(]*\\([^)]*${word}`).test(line);
}

/** A statement that gives a new name to a fresh name, or to `o`, the key of a run. */
const ALIAS = /^\s*const ([A-Za-z]+\d+) = ([A-Za-z]+\d+|o);$/;

/**
 * This function tells if the name `name` keeps its value from the line `at` to the line `end`. A name with no write
 * keeps its value. Else no line in that part can write to it. That part must also have no function, because a function
 * can read the name after a later write. Each other write and the declaration must be in the function of the line
 * `at`, because a call cannot then start them. A write in a line with a function has an unknown place.
 */
function keeps(lines: readonly string[], writes: readonly number[], name: string, at: number, end: number): boolean {
  if (writes.length === 0) return true;
  if (writes.some((x) => x > at && x < end) || lines.slice(at, end).some((x) => x.includes("=>") || /\bfunction\b/.test(x))) return false;
  const home = functionOf(lines, at);
  const declared = lines.flatMap((x, i) => (binds(x, name) ? [i] : []));
  return declared.length > 0 && [...writes, ...declared].every((x) => !(lines[x] as string).includes("=>") && functionOf(lines, x) === home);
}

/**
 * This function removes each alias whose two names hold one value in the whole block of the alias. Each read of the
 * alias reads the first name (COMPILE.MODULE.SIZE.ALIAS).
 */
export function aliases(lines: readonly string[]): readonly string[] {
  const out = [...lines];
  const writes = writesOf(lines);
  const gone = new Set<number>();
  for (let i = 0; i < out.length; i++) {
    const m = ALIAS.exec(out[i] as string);
    if (m === null) continue;
    const [, alias, name] = m as unknown as readonly [string, string, string];
    const end = blockEnd(out, i);
    const block = out.slice(i + 1, end);
    // Each read of the alias must be in its block, and no line of that block can give either name another meaning. The
    // printer prints the steps of a stopped walk two times, so a nested block can declare the alias again (V-073).
    if (countOf(out, alias) !== 1 + countOf(block, alias) || block.some((x) => binds(x, name) || binds(x, alias)) || !keeps(out, writes.get(name) ?? [], name, i, end)) continue;
    for (let k = i + 1; k < end; k++) {
      const x = out[k] as string;
      // Stryker disable next-line ConditionalExpression: a line without the alias stays as it is, so this test only saves the pattern.
      if (x.includes(alias)) out[k] = renamed(x, alias, name);
    }
    gone.add(i);
  }
  return out.filter((_, i) => !gone.has(i));
}

/** The first line of a lazy cell of the run. */
const CELL = /^ {2}const (c\d+) = L\(\(\) => \{$/;

/** The first line of a lazy cell at each place. */
const ANY_CELL = /^\s*const \w+ = L\(\(\) => \{$/;

/** The blocks that run each statement at most once, for one run of the block around them. */
const ONCE_BLOCK = /^\s*(?:try \{|\} catch \{|\} else \{|(?:\} else )?if \(.*\) \{)$/;

/** The statements that can run a part of their line more than once. */
const LOOP_LINE = /^\s*(?:for|while|do)\b|=>/;

/** This function tells if the statement at the line `at` runs at most once in a run. */
function runsOnce(lines: readonly string[], at: number): boolean {
  if (LOOP_LINE.test(lines[at] as string)) return false;
  for (let k = openerOf(lines, at); k >= 0; k = openerOf(lines, k)) {
    const line = lines[k] as string;
    if (ANY_CELL.test(line)) return true;
    if (!ONCE_BLOCK.test(line)) return false;
  }
  return true;
}

/**
 * This function prints a lazy cell with one read at that read (COMPILE.MODULE.SIZE.ONCE). The cell must be one
 * `return`, and the read must be `G(c())`. The read must run at most once, so the value evaluates at most once and at
 * the same time. `G` stays, because the value can be the sentinel. Each catch of a module takes each exception.
 */
export function onceCells(lines: readonly string[]): readonly string[] {
  let out = lines;
  for (let i = 0; i + 2 < out.length; i++) {
    const name = CELL.exec(out[i] as string)?.[1];
    const value = /^ {4}return (.*);$/.exec(out[i + 1] as string)?.[1];
    if (name === undefined || value === undefined || out[i + 2] !== "  });" || countOf(out, name) !== 2) continue;
    const read = new RegExp(`(?<![\\w$.])G\\(${name}\\(\\)\\)`, "g");
    const inlined = (x: string): string => rewritten(x, read, () => `G(${value})`);
    const site = out.findIndex((x) => inlined(x) !== x);
    if (site < 0 || !runsOnce(out, site)) continue;
    out = out.flatMap((x, k) => (k === site ? [inlined(x)] : k >= i && k <= i + 2 ? [] : [x]));
    i = -1;
  }
  return out;
}

/** A constant of the run on one line, with its name. */
const CONSTANT = /^ {2}const (c\d+) = (?:T\(\(\) => .*\)|\[\]);$/;

/** The first line of a constant of the run with a `try`, with its name. */
const HELD = /^ {2}let (c\d+);$/;

/** The first line of a column at each depth, with its indent and its name. A column does not run until a read calls it. */
const COLUMN = /^( *)const (col\d+) = Q\(\(\w+\) => \{$/;

/** The variable of the pack of a column at each depth, with its name. */
const PACK = /^ *let (PK\d+);$/;

/** This function gives the name of the declaration at the line `at` and its last line, or `undefined` for another line. */
function constantAt(lines: readonly string[], at: number): { readonly name: string; readonly last: number } | undefined {
  const line = lines[at] as string;
  const one = CONSTANT.exec(line)?.[1];
  if (one !== undefined) return { name: one, last: at };
  const lazy = CELL.exec(line)?.[1];
  if (lazy !== undefined) return { name: lazy, last: lines.indexOf("  });", at) };
  const column = COLUMN.exec(line);
  if (column !== null) return { name: column[2] as string, last: lines.indexOf(`${column[1] as string}});`, at) };
  const pack = PACK.exec(line)?.[1];
  if (pack !== undefined) return { name: pack, last: at };
  const held = HELD.exec(line)?.[1];
  return held === undefined || lines[at + 1] !== "  try {" ? undefined : { name: held, last: lines.indexOf("  }", at) };
}

/** This function gives the count of each word of some lines. */
function wordCounts(lines: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const w of wordsOf(lines.join("\n"))) counts.set(w, (counts.get(w) ?? 0) + 1);
  return counts;
}

/**
 * This function removes each constant of the run that no code reads (COMPILE.MODULE.SIZE.DEAD). The code of a constant
 * has no effect, and the constant holds each failure of that code. A lazy cell with no read does not run. A print that
 * the printer drops leaves its columns and their packs, in the run and in a function, so the pass removes these too. The
 * parameters of a function come from the code that it keeps, so such a column can read a name with no declaration.
 */
export function deadConstants(lines: readonly string[]): readonly string[] {
  let out = lines;
  const counts = wordCounts(lines);
  for (let i = 0; i < out.length; i++) {
    const c = constantAt(out, i);
    if (c === undefined) continue;
    const own = wordCounts(out.slice(i, c.last + 1));
    if (counts.get(c.name) !== own.get(c.name)) continue;
    out = [...out.slice(0, i), ...out.slice(c.last + 1)];
    for (const [word, count] of own) counts.set(word, (counts.get(word) as number) - count);
    i = -1;
  }
  return out;
}

/** This function gives the declarations that the text `roots` reads, also through other declarations. */
export function liveDecls(decls: ReadonlyMap<string, string>, roots: string): ReadonlyMap<string, string> {
  const live = new Set<string>();
  const stack = [...wordsOf(roots)];
  for (let w = stack.pop(); w !== undefined; w = stack.pop()) {
    const text = decls.get(w);
    if (text === undefined || live.has(w)) continue;
    live.add(w);
    stack.push(...wordsOf(text));
  }
  return new Map([...decls].filter(([name]) => live.has(name)));
}

/** The tokens of the body of a function of an op. A body with another token has no inline form. */
const BODY_TOKEN = /\s+|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\.{3}|\.\d\w*|\d[\w.]*|\.[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*|===|!==|\?\?|&&|\|\||\*\*|<<|>>>|>>|==|!=|<=|>=|\+\+|--|=>|\?\.|[-+*/%<>!?:,&|^~()[\]{}]/y;

/** The tokens that change a value or start a function. */
const NOT_INLINE: ReadonlySet<string> = new Set(["++", "--", "=>"]);

/** The words that an inline body can read at each place of a module. */
const PLAIN_WORDS: ReadonlySet<string> = new Set(["true", "false", "null", "NaN", "Infinity", "typeof", "void"]);

/** The words that end no value, so a slash after them starts a regular expression. */
const NOT_VALUES: ReadonlySet<string> = new Set(["typeof", "void"]);

/** This function gives the tokens of a body, or `undefined` for a body with another token. */
function tokensOf(body: string): readonly string[] | undefined {
  const out: string[] = [];
  BODY_TOKEN.lastIndex = 0;
  while (BODY_TOKEN.lastIndex < body.length) {
    const m = BODY_TOKEN.exec(body);
    if (m === null || NOT_INLINE.has(m[0])) return undefined;
    out.push(m[0]);
  }
  return out;
}

/** This function tells if a token ends a value, so a slash after it is a division. */
const endsValue = (t: string): boolean => t === ")" || t === "]" || t === "}" || (/^[\w$."']/.test(t) && t !== "..." && !NOT_VALUES.has(t));

/** This function tells if a token is a name or a word of the language. */
const isWord = (t: string): boolean => /^[A-Za-z_$]/.test(t);

/** This function tells if a token is a space. */
const isSpace = (t: string): boolean => /^\s/.test(t);

/** The part of an inline body: a text, or the index of a parameter. */
type BodyPart = string | number;

/**
 * This function gives the parts of the body of an arrow function, or `undefined` for a body that a site cannot hold.
 * The body must be an expression with no assignment and no function. Each of its words must be a parameter, a global or
 * a key of an object. Thus a local name of the site cannot take the place of a word of the body.
 */
function bodyParts(params: readonly string[], body: string, globals: ReadonlySet<string>): readonly BodyPart[] | undefined {
  const tokens = tokensOf(body.trim());
  if (tokens === undefined || tokens[0] === "{") return undefined;
  const parts: BodyPart[] = [];
  const open: string[] = [];
  let last = "";
  for (const [i, t] of tokens.entries()) {
    if (isSpace(t)) {
      parts.push(" ");
      continue;
    }
    const next = tokens.slice(i + 1).find((x) => !isSpace(x));
    if (t === "/" && !endsValue(last)) return undefined;
    if (t === "(" || t === "[" || t === "{") open.push(t);
    if (t === ")" || t === "]" || t === "}") open.pop();
    const at = params.indexOf(t);
    const key = open.at(-1) === "{" && (last === "{" || last === ",");
    // A word after an optional chain is the name of a key, as the token `.x` of a plain read (V-098).
    if (!isWord(t) || last === "?." || (key && next === ":")) parts.push(t);
    else if (key && next !== "," && next !== "}") return undefined;
    else if (at >= 0) parts.push(...(key ? [`${t}:`, at] : [at]));
    else if (PLAIN_WORDS.has(t) || globals.has(t)) parts.push(t);
    else return undefined;
    last = t;
  }
  return parts;
}

/** The declaration of a function of an op or of a check of a domain, as an arrow function. */
const OP_DECL = /^const ((?:op|v)_\w+) = (?:\(([\w$,\s]*)\)|([A-Za-z_$][\w$]*))\s*=>([\s\S]*);$/;

/** The name, the parameters and the parts of an inline form. */
interface OpForm {
  readonly name: string;
  readonly params: readonly string[];
  readonly parts: readonly BodyPart[];
}

/** This function gives the form of a declaration, or `undefined` for a declaration without one. */
function opForm(text: string, globals: ReadonlySet<string>): OpForm | undefined {
  const m = OP_DECL.exec(text);
  if (m === null) return undefined;
  const params = (m[2] ?? m[3] ?? "").split(",").map((x) => x.trim()).filter((x) => x !== "");
  const parts = bodyParts(params, m[4] as string, globals);
  return parts === undefined || params.length === 0 ? undefined : { name: m[1] as string, params, parts };
}

/**
 * This function gives a text with the call of `f` as its body. It gives `undefined` when the text has no call with a
 * name for each argument.
 */
function withSite(text: string, f: OpForm): string | undefined {
  const site = new RegExp(`(?<![\\w$.])${f.name}\\(([A-Za-z_$][\\w$]*(?:, [A-Za-z_$][\\w$]*)*)\\)`, "g");
  const out = rewritten(text, site, (match) => {
    const args = (match[1] as string).split(", ");
    return args.length === f.params.length ? `(${f.parts.map((p) => (typeof p === "number" ? (args[p] as string) : p)).join("")})` : match[0];
  });
  return out === text ? undefined : out;
}

/**
 * This function prints each function of an op with one call at that call (COMPILE.MODULE.SIZE.INLINE). Each argument
 * must be a name, so the arguments have no order, and a second read of a parameter reads the same value.
 */
export function inlineOps(parts: TidyParts): Tidied {
  const { kept, globals } = parts;
  const decls = new Map(parts.decls);
  const lines = [...parts.lines];
  const counts = new Map<string, number>();
  for (const w of wordsOf([kept, ...decls.values(), ...lines].join("\n"))) counts.set(w, (counts.get(w) ?? 0) + 1);
  for (const [name, text] of parts.decls) {
    const f = counts.get(name) === 2 ? opForm(text, globals) : undefined;
    if (f === undefined) continue;
    const at = lines.findIndex((x) => withSite(x, f) !== undefined);
    if (at >= 0) {
      lines[at] = withSite(lines[at] as string, f) as string;
      decls.delete(name);
      continue;
    }
    // A check of the result of an op calls the check of its domain.
    const check = [...decls].find(([k, x]) => k.startsWith("k_") && withSite(x, f) !== undefined);
    if (check !== undefined) {
      decls.set(check[0], withSite(check[1], f) as string);
      decls.delete(name);
    }
  }
  return { decls, lines };
}

/** The helper of a catch that keeps only the error of Vex (COMPILE.MODULE.FAULT). */
const FAULT_KEEP = "function FK(x) { if (x !== E) throw x; }";
/** The helper that gives the error of Vex for each exception of a copy of a function of a domain. */
const FAULT_WRAP = "function FW(f) { return (...a) => { try { return f(...a); } catch { throw E; } }; }";

/** This function gives a line where each catch rethrows each value that is not the error of Vex. */
function narrowCatches(line: string): string {
  return rewritten(line, /catch \{/g, () => "catch ($f) { FK($f);");
}

/** This function gives the declaration of a copy of a function of a domain, inside the wrapper. */
function wrapFaults(name: string, text: string): string {
  return `const ${name} = FW(${text.slice(`const ${name} = `.length, -1)});`;
}

/**
 * This function gives the form of a module where a catch keeps only the error of Vex (COMPILE.MODULE.FAULT). The start
 * of a fault tells the two cases. A copy of a function of a domain gives the error of Vex for each exception, as in the
 * interpreter. Another exception comes from the printed code, and it leaves the run.
 */
export function keepFaults(parts: Tidied, copies: ReadonlySet<string>): Tidied {
  const decls = new Map([...parts.decls].map(([name, text]) => [name, copies.has(name) ? wrapFaults(name, text) : narrowCatches(text)]));
  decls.set("FK", FAULT_KEEP);
  decls.set("FW", FAULT_WRAP);
  return { decls, lines: parts.lines.map(narrowCatches) };
}

/**
 * This function gives the smaller form of a module, with the same behavior (COMPILE.MODULE.SIZE). With `faults` at
 * `throw`, each function of a domain stays a declaration, so the wrapper of `keepFaults` holds each of its exceptions.
 */
export function tidy(parts: TidyParts, faults: "value" | "throw" = "value"): Tidied {
  const lines = deadConstants(onceCells(deadConstants(aliases(deadKeys(parts.lines)))));
  const live = liveDecls(parts.decls, [parts.kept, ...lines].join("\n"));
  const small = faults === "throw" ? { decls: live, lines } : inlineOps({ ...parts, decls: live, lines });
  return { decls: liveDecls(small.decls, [parts.kept, ...small.lines].join("\n")), lines: small.lines };
}
