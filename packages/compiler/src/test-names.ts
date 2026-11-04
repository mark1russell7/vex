/**
 * The names of the text of a module, for the tests. The gate of a test parses a printed module and fails on a name with
 * no declaration, so a read of a variable that the printer did not declare fails at the print. It needs no input that
 * reaches the read, and a catch of the module cannot hide the read.
 *
 * The gate finds two faults: a name with no declaration, and a read before the declaration in the same function. It
 * does not find a read before a declaration through a closure, a TypeError, a RangeError or a wrong value with no
 * exception. A value test finds these.
 */
import { runInNewContext } from "node:vm";
import { parse } from "acorn";

/**
 * The names that a module can read from its host: the names of the global object of a new context. The language gives
 * this list, so the list does not grow with each miss of the gate. Node adds its own names to its main context only.
 */
export const LANGUAGE_GLOBALS: ReadonlySet<string> = new Set(runInNewContext("Object.getOwnPropertyNames(globalThis)") as string[]);

/** A node of the tree of a text. */
interface AstNode {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly loc: { readonly start: { readonly line: number } };
  readonly [part: string]: unknown;
}

/** A declaration of a name: its kind, the end of the declaration, and the number of its function. */
interface Binding {
  readonly kind: string;
  readonly end: number;
  readonly fn: number;
}

/** A read of a name before its declaration in the same function. */
export interface EarlyRead {
  readonly name: string;
  readonly line: number;
}

/** The names of a text: each name with no declaration and the line of its first read, and each read before a declaration. */
export interface TextNames {
  readonly free: ReadonlyMap<string, number>;
  readonly early: readonly EarlyRead[];
}

/** The declarations of a block or a function. */
class Scope {
  readonly names = new Map<string, Binding>();
  readonly parent: Scope | undefined;
  readonly fn: number;

  constructor(parent: Scope | undefined, fn: number) {
    this.parent = parent;
    this.fn = fn;
  }

  add(name: string, kind: string, end: number): void {
    this.names.set(name, { kind, end, fn: this.fn });
  }

  find(name: string): Binding | undefined {
    return this.names.get(name) ?? this.parent?.find(name);
  }
}

const isNode = (x: unknown): x is AstNode => typeof x === "object" && x !== null && typeof (x as { type?: unknown }).type === "string";

/** This function gives the nodes of a part of a node: a node, a list of nodes, or nothing. */
function nodes(x: unknown): readonly AstNode[] {
  if (Array.isArray(x)) return x.filter(isNode);
  return isNode(x) ? [x] : [];
}

/** This function gives the names that a pattern declares. */
function patternNames(p: AstNode): readonly string[] {
  switch (p.type) {
    case "Identifier":
      return [p["name"] as string];
    case "ObjectPattern":
      return nodes(p["properties"]).flatMap((x) => nodes(x.type === "RestElement" ? x["argument"] : x["value"]).flatMap(patternNames));
    case "ArrayPattern":
      return nodes(p["elements"]).flatMap(patternNames);
    case "AssignmentPattern":
      return nodes(p["left"]).flatMap(patternNames);
    default:
      return nodes(p["argument"]).flatMap(patternNames);
  }
}

/** This function gives the names of the declarations of a `var`, `let` or `const` statement. */
const declared = (s: AstNode): readonly (readonly [string, number])[] => nodes(s["declarations"]).flatMap((d) => nodes(d["id"]).flatMap(patternNames).map((name) => [name, d.end] as const));

/** This function adds the `var` declarations of a part of a function to its scope. A nested function has its own. */
function hoist(n: AstNode, scope: Scope): void {
  if (n.type.includes("Function")) return;
  if (n.type === "VariableDeclaration" && n["kind"] === "var") for (const [name] of declared(n)) scope.add(name, "var", 0);
  for (const part of Object.values(n)) for (const x of nodes(part)) hoist(x, scope);
}

/** This function adds the declarations of the statements of a block to its scope. */
function declare(statements: readonly AstNode[], scope: Scope): void {
  for (const raw of statements) {
    const s = nodes(raw["declaration"])[0] ?? raw;
    if (s.type === "VariableDeclaration" && s["kind"] !== "var") for (const [name, end] of declared(s)) scope.add(name, s["kind"] as string, end);
    if (s.type === "FunctionDeclaration") for (const id of nodes(s["id"])) scope.add(id["name"] as string, "function", 0);
    if (s.type === "ClassDeclaration") for (const id of nodes(s["id"])) scope.add(id["name"] as string, "class", s.end);
  }
}

/** The walk of a tree: it holds the names with no declaration and the early reads. */
class Walk {
  readonly free = new Map<string, number>();
  readonly early: EarlyRead[] = [];
  #fns = 0;

  #read(id: AstNode, scope: Scope): void {
    const name = id["name"] as string;
    const found = scope.find(name);
    if (found === undefined) {
      if (!this.free.has(name)) this.free.set(name, id.loc.start.line);
    } else if (id.start < found.end && found.fn === scope.fn) {
      this.early.push({ name, line: id.loc.start.line });
    }
  }

  /** This method reads the defaults and the computed keys of a pattern. The names of a pattern are declarations. */
  #pattern(p: AstNode, scope: Scope): void {
    if (p.type === "AssignmentPattern") {
      this.#all(p["left"], scope, true);
      this.#all(p["right"], scope);
    } else if (p.type === "ArrayPattern") this.#all(p["elements"], scope, true);
    else if (p.type === "RestElement") this.#all(p["argument"], scope, true);
    else if (p.type === "ObjectPattern") {
      for (const x of nodes(p["properties"])) {
        if (x["computed"] === true) this.#all(x["key"], scope);
        this.#all(x.type === "RestElement" ? x["argument"] : x["value"], scope, true);
      }
    }
  }

  #all(part: unknown, scope: Scope, pattern = false): void {
    for (const x of nodes(part)) {
      if (pattern) this.#pattern(x, scope);
      else this.visit(x, scope);
    }
  }

  #function(n: AstNode, parent: Scope): void {
    const scope = new Scope(parent, ++this.#fns);
    if (n.type === "FunctionExpression") for (const id of nodes(n["id"])) scope.add(id["name"] as string, "function", 0);
    for (const p of nodes(n["params"])) for (const name of patternNames(p)) scope.add(name, "param", 0);
    for (const x of nodes(n["body"])) hoist(x, scope);
    this.#all(n["params"], scope, true);
    this.#all(n["body"], scope);
  }

  #loop(n: AstNode, parent: Scope): void {
    const scope = new Scope(parent, parent.fn);
    for (const head of nodes(n.type === "ForStatement" ? n["init"] : n["left"])) {
      if (head["kind"] === "let" || head["kind"] === "const") for (const [name] of declared(head)) scope.add(name, "loop", 0);
    }
    for (const part of ["init", "left", "right", "test", "update", "body"]) this.#all(n[part], scope);
  }

  /** This method walks a node with the scope of its place. */
  visit(n: AstNode, scope: Scope): void {
    switch (n.type) {
      case "Identifier":
        this.#read(n, scope);
        return;
      case "BlockStatement": {
        const inner = new Scope(scope, scope.fn);
        declare(nodes(n["body"]), inner);
        this.#all(n["body"], inner);
        return;
      }
      case "SwitchStatement": {
        this.#all(n["discriminant"], scope);
        const inner = new Scope(scope, scope.fn);
        declare(
          nodes(n["cases"]).flatMap((c) => nodes(c["consequent"])),
          inner,
        );
        this.#all(n["cases"], inner);
        return;
      }
      case "ForStatement":
      case "ForInStatement":
      case "ForOfStatement":
        this.#loop(n, scope);
        return;
      case "CatchClause": {
        const inner = new Scope(scope, scope.fn);
        for (const p of nodes(n["param"])) for (const name of patternNames(p)) inner.add(name, "param", 0);
        this.#all(n["body"], inner);
        return;
      }
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        this.#function(n, scope);
        return;
      case "VariableDeclaration":
        for (const d of nodes(n["declarations"])) {
          this.#all(d["id"], scope, true);
          this.#all(d["init"], scope);
        }
        return;
      case "MemberExpression":
        this.#all(n["object"], scope);
        if (n["computed"] === true) this.#all(n["property"], scope);
        return;
      case "Property":
      case "MethodDefinition":
      case "PropertyDefinition":
        if (n["computed"] === true) this.#all(n["key"], scope);
        this.#all(n["value"], scope);
        return;
      case "LabeledStatement":
        this.#all(n["body"], scope);
        return;
      case "BreakStatement":
      case "ContinueStatement":
        return;
      case "ClassDeclaration":
      case "ClassExpression":
        this.#all(n["superClass"], scope);
        this.#all(n["body"], scope);
        return;
      default:
        for (const part of Object.values(n)) this.#all(part, scope);
    }
  }
}

/** This function gives the names of a text of a module. */
export function namesOfText(source: string): TextNames {
  const tree = parse(source, { ecmaVersion: "latest", sourceType: "module", locations: true }) as unknown as AstNode;
  const scope = new Scope(undefined, 0);
  hoist(tree, scope);
  const body = nodes(tree["body"]);
  declare(body, scope);
  const walk = new Walk();
  for (const x of body) walk.visit(x, scope);
  return { free: walk.free, early: walk.early };
}

/** This function gives one line for each fault of the text of a module. `globals` has the names that a module can read from its host. */
export function nameFaults(source: string, globals: ReadonlySet<string> = LANGUAGE_GLOBALS): readonly string[] {
  const { free, early } = namesOfText(source);
  const missing = [...free].filter(([name]) => !globals.has(name)).map(([name, line]) => `line ${String(line)}: the name ${name} has no declaration`);
  return [...missing, ...early.map((x) => `line ${String(x.line)}: a read of ${x.name} before its declaration`)];
}
