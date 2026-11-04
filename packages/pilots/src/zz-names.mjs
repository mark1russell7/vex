// A prototype of design B: the free names and the reads before a declaration of a module text.
import { createRequire } from "node:module";
const require = createRequire(new URL("../../compiler/package.json", import.meta.url));
export const acorn = require("acorn");

class Scope {
  constructor(parent, fn) { this.parent = parent; this.fn = fn; this.names = new Map(); }
  add(name, kind, end) { this.names.set(name, { kind, end, fn: this.fn }); }
  find(name) { for (let s = this; s; s = s.parent) { const b = s.names.get(name); if (b) return b; } return undefined; }
}

const patNames = (p, out = []) => {
  if (!p) return out;
  switch (p.type) {
    case "Identifier": out.push(p.name); break;
    case "ObjectPattern": for (const x of p.properties) patNames(x.type === "RestElement" ? x.argument : x.value, out); break;
    case "ArrayPattern": for (const x of p.elements) patNames(x, out); break;
    case "AssignmentPattern": patNames(p.left, out); break;
    case "RestElement": patNames(p.argument, out); break;
  }
  return out;
};

// `var` declarations in a function body, not in nested functions.
const hoistVars = (node, scope) => {
  if (!node || typeof node.type !== "string") return;
  if (/Function/.test(node.type)) return;
  if (node.type === "VariableDeclaration" && node.kind === "var") for (const d of node.declarations) for (const n of patNames(d.id)) scope.add(n, "var", 0);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach((x) => x && typeof x === "object" && hoistVars(x, scope));
    else if (v && typeof v === "object" && typeof v.type === "string") hoistVars(v, scope);
  }
};

const declareBlock = (stmts, scope) => {
  for (const raw of stmts) {
    const s = raw.type === "ExportNamedDeclaration" && raw.declaration ? raw.declaration : raw;
    if (s.type === "VariableDeclaration" && s.kind !== "var") for (const d of s.declarations) for (const n of patNames(d.id)) scope.add(n, s.kind, d.end);
    else if (s.type === "FunctionDeclaration") scope.add(s.id.name, "function", 0);
    else if (s.type === "ClassDeclaration") scope.add(s.id.name, "class", s.end);
  }
};

/** This function gives the free names of a text, each with a count and the first line, and the reads before a declaration. */
export function scan(source) {
  const tree = acorn.parse(source, { ecmaVersion: "latest", sourceType: "module", locations: true });
  const free = new Map();
  const early = [];
  let fnId = 0;
  const read = (id, scope) => {
    const b = scope.find(id.name);
    if (b === undefined) {
      const f = free.get(id.name) ?? { count: 0, line: id.loc.start.line };
      f.count++;
      free.set(id.name, f);
      return;
    }
    if ((b.kind === "let" || b.kind === "const" || b.kind === "class") && id.start < b.end) {
      // A `let x;` has its end at the name, so a write in the block after it is not here. A read inside the closure of its own initializer has a later call.
      early.push({ name: id.name, line: id.loc.start.line, direct: b.fn === scope.fn });
    }
  };
  const visit = (n, scope) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { for (const x of n) visit(x, scope); return; }
    switch (n.type) {
      case "Identifier": read(n, scope); return;
      case "Program": { const s = new Scope(null, 0); hoistVars(n, s); declareBlock(n.body, s); visit(n.body, s); return; }
      case "BlockStatement": { const s = new Scope(scope, scope.fn); declareBlock(n.body, s); visit(n.body, s); return; }
      case "ForStatement": case "ForInStatement": case "ForOfStatement": {
        const s = new Scope(scope, scope.fn);
        const head = n.type === "ForStatement" ? n.init : n.left;
        if (head?.type === "VariableDeclaration" && head.kind !== "var") for (const d of head.declarations) for (const x of patNames(d.id)) s.add(x, head.kind, n.type === "ForStatement" ? d.end : n.right.end);
        for (const k of ["init", "left", "right", "test", "update", "body"]) visit(n[k], s);
        return;
      }
      case "CatchClause": { const s = new Scope(scope, scope.fn); for (const x of patNames(n.param)) s.add(x, "param", 0); visit(n.body, s); return; }
      case "FunctionDeclaration": case "FunctionExpression": case "ArrowFunctionExpression": {
        const s = new Scope(scope, ++fnId);
        if (n.type === "FunctionExpression" && n.id) s.add(n.id.name, "function", 0);
        for (const p of n.params) for (const x of patNames(p)) s.add(x, "param", 0);
        hoistVars(n.body, s);
        for (const p of n.params) visitPat(p, s);
        visit(n.body, s);
        return;
      }
      case "ClassDeclaration": case "ClassExpression": { visit(n.superClass, scope); visit(n.body, scope); return; }
      case "MethodDefinition": case "PropertyDefinition": { if (n.computed) visit(n.key, scope); visit(n.value, scope); return; }
      case "VariableDeclaration": for (const d of n.declarations) { visitPat(d.id, scope); visit(d.init, scope); } return;
      case "MemberExpression": visit(n.object, scope); if (n.computed) visit(n.property, scope); return;
      case "Property": if (n.computed) visit(n.key, scope); visit(n.value, scope); return;
      case "LabeledStatement": visit(n.body, scope); return;
      case "BreakStatement": case "ContinueStatement": case "Literal": case "ThisExpression": case "TemplateElement": return;
      default:
        for (const k of Object.keys(n)) {
          if (k === "type" || k === "loc" || k === "start" || k === "end") continue;
          const v = n[k];
          if (v && typeof v === "object") visit(v, scope);
        }
    }
  };
  // A pattern declares names, and only its defaults and computed keys read.
  const visitPat = (p, s) => {
    if (!p) return;
    if (p.type === "AssignmentPattern") { visitPat(p.left, s); visit(p.right, s); }
    else if (p.type === "ArrayPattern") p.elements.forEach((x) => visitPat(x, s));
    else if (p.type === "ObjectPattern") p.properties.forEach((x) => (x.type === "RestElement" ? visitPat(x.argument, s) : (x.computed && visit(x.key, s), visitPat(x.value, s))));
    else if (p.type === "RestElement") visitPat(p.argument, s);
  };
  visit(tree, null);
  return { free, early, tree };
}

/** This function gives the count of catch clauses, and of those with a binding. */
export function catches(tree) {
  let plain = 0, bound = 0;
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === "CatchClause") { if (n.param) bound++; else plain++; }
    for (const k of Object.keys(n)) { if (k === "loc") continue; const v = n[k]; if (v && typeof v === "object") walk(v); }
  };
  walk(tree);
  return { plain, bound };
}
