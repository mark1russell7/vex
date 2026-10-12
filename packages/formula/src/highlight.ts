/**
 * The highlighter of the formula language, for the formula editor. It splits a text into pieces, and each piece has
 * a kind for its colour. It does not throw, and the pieces together are the full text, so it also works on a
 * formula that is not finished.
 */
import { AXES, OPERATORS } from "./syntax.ts";

/** The kind of a piece of a formula. */
export type FormulaPieceKind = "plain" | "keyword" | "string" | "number" | "name" | "function" | "operator" | "punct" | "error";

/** A piece of a formula with a kind. */
export interface FormulaPiece {
  readonly kind: FormulaPieceKind;
  readonly text: string;
}

const KEYWORDS: ReadonlySet<string> = new Set(["true", "false", "where", "this", "parent", "row", ...AXES]);
const ID_START = /[\p{L}_]/u;
const ID_PART = /[\p{L}\p{N}_]/u;

/** This function splits a formula into pieces. The text of the pieces, in sequence, is the formula. */
export function highlightFormula(text: string): readonly FormulaPiece[] {
  const out: FormulaPiece[] = [];
  const push = (kind: FormulaPieceKind, piece: string): void => {
    const last = out.at(-1);
    if (last !== undefined && last.kind === kind) out[out.length - 1] = { kind, text: last.text + piece };
    else out.push({ kind, text: piece });
  };
  let i = 0;
  let first = true;
  while (i < text.length) {
    const rest = text.slice(i);
    const c = rest[0] ?? "";
    const space = /^\s+/.exec(rest);
    if (space !== null) {
      push("plain", space[0]);
      i += space[0].length;
      continue;
    }
    const num = /^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
    if (num !== null) {
      push("number", num[0]);
      i += num[0].length;
      first = false;
      continue;
    }
    if (c === '"') {
      // Two quotes in a text are one quote. A text without a closing quote is an error.
      let j = 1;
      for (;;) {
        if (j >= rest.length) {
          j = -1;
          break;
        }
        if (rest[j] === '"') {
          if (rest[j + 1] === '"') {
            j += 2;
            continue;
          }
          j++;
          break;
        }
        j++;
      }
      const piece = j < 0 ? rest : rest.slice(0, j);
      push(j < 0 ? "error" : "string", piece);
      i += piece.length;
      first = false;
      continue;
    }
    if (c === "[") {
      const close = rest.indexOf("]");
      const piece = close < 0 ? rest : rest.slice(0, close + 1);
      push(close < 0 ? "error" : "name", piece);
      i += piece.length;
      first = false;
      continue;
    }
    if (ID_START.test(c)) {
      let j = 1;
      while (j < rest.length && ID_PART.test(rest[j] ?? "")) j++;
      const word = rest.slice(0, j);
      const after = /^\s*\(/.test(rest.slice(j));
      push(KEYWORDS.has(word.toLowerCase()) ? "keyword" : after ? "function" : "name", word);
      i += j;
      first = false;
      continue;
    }
    const op = OPERATORS.find((o) => rest.startsWith(o));
    if (op !== undefined) {
      // The "=" at the start of a formula is a mark of the formula, so it is not an operator.
      push(first && op === "=" ? "punct" : "operator", op);
      i += op.length;
      first = false;
      continue;
    }
    push("(),.".includes(c) ? "punct" : "error", c);
    i += 1;
    first = false;
  }
  return out;
}
