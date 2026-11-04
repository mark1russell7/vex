/**
 * The text of a function of a domain (COMPILE.MODULE.TEXT). JavaScript gives a text that depends on the loader.
 * A runner can keep the spaces of the types, drop parentheses or change a quote. A module copies such a text,
 * so this file parses it and prints the tree. Equal trees give equal bytes under each runner.
 */
import { parseExpressionAt } from "acorn";
import { GENERATOR, generate, type Generator, type State } from "astring";

/** A node of the tree. The printer reads only these fields. */
interface TreeNode {
  readonly type: string;
  readonly value?: unknown;
  readonly name?: string;
  readonly callee?: TreeNode;
  readonly arguments?: readonly TreeNode[];
}

/** The printer of one kind of node. */
type Print = (node: TreeNode, state: State) => void;

/** The printers of the kinds of nodes that the default printer does not change. */
const PRINTERS = GENERATOR as unknown as Readonly<Record<string, Print>>;

/** This function tells if a call only names a function: the runner `tsx` wraps each named function in such a call. */
function isNameCall(node: TreeNode): boolean {
  const [, name] = node.arguments as readonly TreeNode[];
  return node.callee?.name === "__name" && node.arguments?.length === 2 && typeof name?.value === "string";
}

/** The printers that give one form to each literal, and that remove a call that only names a function. */
const TEXT_PRINTERS: Readonly<Record<string, Print>> = {
  ...PRINTERS,
  Literal: (node, state) => {
    if (typeof node.value === "string") state.write(JSON.stringify(node.value));
    else if (typeof node.value === "number" && Number.isFinite(node.value)) state.write(String(node.value));
    else (PRINTERS["Literal"] as Print)(node, state);
  },
  CallExpression(node, state) {
    const [fn] = node.arguments as readonly TreeNode[];
    if (isNameCall(node)) (TEXT_PRINTERS[(fn as TreeNode).type] as Print).call(TEXT_PRINTERS, fn as TreeNode, state);
    else (PRINTERS["CallExpression"] as Print).call(TEXT_PRINTERS, node, state);
  },
};

/**
 * This function gives the text of a function, in one form for each runner. A text that does not parse as one expression
 * stays as it is, for example a method or a native function. A module refuses such a text when it tries the copy.
 */
export function functionText(f: (...a: never[]) => unknown): string {
  const raw = Function.prototype.toString.call(f);
  try {
    const tree = parseExpressionAt(raw, 0, { ecmaVersion: "latest" });
    if (tree.end !== raw.length) return raw;
    return generate(tree, { generator: TEXT_PRINTERS as unknown as Generator, indent: "", lineEnd: " " });
  } catch {
    return raw;
  }
}
