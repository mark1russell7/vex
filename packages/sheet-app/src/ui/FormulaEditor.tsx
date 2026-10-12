/**
 * The formula editor: a text area over a highlighted copy of the formula, like the editor of the Lab. A wavy line marks
 * the position of an error. Below the editor, chips offer the functions and the columns that start with the word at
 * the caret. A select of a chip puts it in the formula.
 */
import { useMemo, useRef, useState, type ReactElement } from "react";
import type { FormulaError, FormulaPiece, FunctionInfo } from "../engine.ts";

/** The properties of the editor. */
export interface FormulaEditorProps {
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly onDone: () => void;
  readonly onCancel: () => void;
  readonly highlight?: ((text: string) => readonly FormulaPiece[]) | undefined;
  readonly error?: FormulaError | undefined;
  readonly functions: readonly FunctionInfo[];
  readonly columns: readonly string[];
  readonly label: string;
}

/** This function splits the pieces at the range of the error, so the editor can mark that range. */
function marked(pieces: readonly FormulaPiece[], error: FormulaError | undefined, length: number): readonly { readonly piece: FormulaPiece; readonly bad: boolean }[] {
  if (error === undefined) return pieces.map((piece) => ({ piece, bad: false }));
  const start = Math.min(error.span.start, length);
  const end = Math.max(error.span.end, Math.min(start + 1, length));
  const out: { piece: FormulaPiece; bad: boolean }[] = [];
  let at = 0;
  for (const p of pieces) {
    const from = at;
    at += p.text.length;
    const cuts = [0, Math.max(0, start - from), Math.max(0, end - from), p.text.length].map((n) => Math.min(p.text.length, n));
    for (let i = 0; i < 3; i++) {
      const text = p.text.slice(cuts[i], cuts[i + 1]);
      if (text !== "") out.push({ piece: { kind: p.kind, text }, bad: i === 1 });
    }
  }
  // An error at the end of the text, for example a missing operand, marks one space after the text.
  if (start === length) out.push({ piece: { kind: "plain", text: " " }, bad: true });
  return out;
}

const WORD = /[A-Za-z_][\w.]*$/;

/** The formula editor. */
export function FormulaEditor(props: FormulaEditorProps): ReactElement {
  const area = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(props.value.length);
  const pieces = useMemo(() => (props.highlight ?? ((t: string) => [{ kind: "plain", text: t }]))(props.value), [props.highlight, props.value]);
  const shown = marked(pieces, props.error, props.value.length);
  const word = WORD.exec(props.value.slice(0, caret))?.[0] ?? "";
  const lower = word.toLowerCase();
  const suggestions = word.length === 0 ? [] : [...props.columns.map((c) => ({ insert: /^[A-Za-z_]\w*$/.test(c) ? c : `[${c}]`, label: c, hint: "column" })), ...props.functions.map((f) => ({ insert: `${f.name}(`, label: f.name, hint: f.summary }))].filter((s) => s.label.toLowerCase().startsWith(lower) && s.label.toLowerCase() !== lower).slice(0, 8);

  const accept = (insert: string): void => {
    const before = props.value.slice(0, caret - word.length);
    const after = props.value.slice(caret);
    props.onChange(before + insert + after);
    const at = before.length + insert.length;
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(at, at);
      setCaret(at);
    });
  };

  return (
    <div className="vs-formula">
      <div className="vs-editor-box">
        <pre className="vs-editor vs-editor-shadow" aria-hidden="true">
          {shown.map((s, i) => (
            <span key={i} className={`vs-syn-${s.piece.kind}${s.bad ? " vs-syn-bad" : ""}`}>
              {s.piece.text}
            </span>
          ))}
          {"\n"}
        </pre>
        <textarea
          ref={area}
          className="vs-editor vs-editor-input"
          aria-label={props.label}
          aria-invalid={props.error !== undefined}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          rows={1}
          value={props.value}
          onChange={(e) => {
            props.onChange(e.target.value);
            setCaret(e.target.selectionStart);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onBlur={props.onDone}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              props.onDone();
            } else if (e.key === "Escape") {
              e.preventDefault();
              props.onCancel();
            } else if (e.key === "Tab" && suggestions[0] !== undefined) {
              e.preventDefault();
              accept(suggestions[0].insert);
            }
          }}
        />
      </div>
      {props.error === undefined ? null : (
        <p className="vs-formula-error" role="alert">
          {props.error.message}
        </p>
      )}
      {suggestions.length === 0 ? null : (
        <div className="vs-suggestions" aria-label="Suggestions">
          {suggestions.map((s) => (
            <button
              key={`${s.hint}-${s.label}`}
              type="button"
              className="vs-chip"
              title={s.hint}
              // The editor keeps the focus, so the chip does not end the edit.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => accept(s.insert)}
            >
              {s.label}
              <span className="vs-chip-hint">{s.hint === "column" ? "column" : "fn"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
