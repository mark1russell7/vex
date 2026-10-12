/**
 * The inspector: the selected cell, its value or its error value with the reason, and the steps of a formula cell.
 * It also has the settings of the column and the actions of the row.
 */
import type { Trace } from "@mark1russell7/vex";
import { useState, type ReactElement } from "react";
import { VALUE_TYPES, type Column, type SheetDoc, type ValueType } from "../doc.ts";
import type { Evaluation } from "../engine.ts";
import { formatValue } from "../values.ts";
import type { CellRef } from "./Grid.tsx";

/** The properties of the inspector. */
export interface InspectorProps {
  /** On a narrow screen, the inspector shows only when it is open. */
  readonly open?: boolean;
  readonly doc: SheetDoc;
  readonly ev: Evaluation;
  readonly sel: CellRef;
  readonly rowNumber: number;
  readonly onRename: (col: string, name: string) => void;
  readonly onType: (col: string, type: ValueType) => void;
  readonly onConvert: (col: string) => void;
  readonly onMoveColumn: (col: string, dir: -1 | 1) => void;
  readonly onDeleteColumn: (col: string) => void;
  readonly onRow: (action: "below" | "child" | "indent" | "outdent" | "up" | "down" | "delete") => void;
}

/** The steps of a trace, as a list with one line for each node. */
function Steps(props: { readonly trace: Trace }): ReactElement {
  return (
    <ol className="vs-steps">
      {props.trace.events.map((e, i) => (
        <li key={i} style={{ paddingInlineStart: `${Math.min(e.path.length, 10)}ch` }} className={e.result.ok ? undefined : "vs-step-error"}>
          <span className="vs-step-label">{e.label}</span> <span className="vs-muted">@{e.focus}</span> → {e.result.ok ? formatValue(e.result.value) : e.result.error.code}
        </li>
      ))}
    </ol>
  );
}

/** The settings of one column. A rename happens when the field loses the focus. */
function ColumnSettings(props: InspectorProps & { readonly col: Column }): ReactElement {
  const { col } = props;
  const [name, setName] = useState(col.name);
  const [prev, setPrev] = useState(col.name);
  if (prev !== col.name) {
    setPrev(col.name);
    setName(col.name);
  }
  const index = props.doc.columns.findIndex((c) => c.id === col.id);
  return (
    <section className="vs-panel" aria-label="The column">
      <h2>Column</h2>
      <label className="vs-field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => props.onRename(col.id, name)} onKeyDown={(e) => e.key === "Enter" && props.onRename(col.id, name)} />
      </label>
      {col.kind === "value" ? (
        <label className="vs-field">
          <span>Type</span>
          <select value={col.type} onChange={(e) => props.onType(col.id, e.target.value as ValueType)}>
            {VALUE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="vs-actions">
        <button type="button" className="vs-btn" onClick={() => props.onConvert(col.id)}>
          {col.kind === "value" ? "Make a formula column" : "Make a value column"}
        </button>
        <button type="button" className="vs-btn" disabled={index <= 0} onClick={() => props.onMoveColumn(col.id, -1)}>
          Move left
        </button>
        <button type="button" className="vs-btn" disabled={index >= props.doc.columns.length - 1} onClick={() => props.onMoveColumn(col.id, 1)}>
          Move right
        </button>
        <button type="button" className="vs-btn vs-btn-danger" disabled={props.doc.columns.length <= 1} onClick={() => props.onDeleteColumn(col.id)}>
          Delete column
        </button>
      </div>
    </section>
  );
}

/** The inspector. */
export function Inspector(props: InspectorProps): ReactElement {
  const { doc, ev, sel } = props;
  const col = doc.columns.find((c) => c.id === sel.col);
  const r = ev.cell(sel.row, sel.col);
  const trace = r?.ok === false || col?.kind === "formula" ? ev.explain(sel.row, sel.col) : undefined;
  return (
    <aside id="vs-inspector" className="vs-inspector" data-open={props.open === true} aria-label="The inspector">
      <section className="vs-panel" aria-label="The cell">
        <h2>
          {col?.name ?? "Cell"} <span className="vs-muted">· row {props.rowNumber}</span>
        </h2>
        {r === undefined ? (
          <p className="vs-muted">Empty</p>
        ) : r.ok ? (
          <p className="vs-value">{formatValue(r.value)}</p>
        ) : (
          <div className="vs-why" role="status">
            <p className="vs-value vs-err">{r.error.code}</p>
            <p>{r.error.message}</p>
          </div>
        )}
        {trace === undefined ? null : (
          <details open={r?.ok === false}>
            <summary>Steps of the evaluation</summary>
            <Steps trace={trace} />
          </details>
        )}
      </section>
      {col === undefined ? null : <ColumnSettings {...props} col={col} />}
      <section className="vs-panel" aria-label="The row">
        <h2>Row</h2>
        <div className="vs-actions">
          <button type="button" className="vs-btn" onClick={() => props.onRow("below")}>
            Add row below
          </button>
          <button type="button" className="vs-btn" onClick={() => props.onRow("child")}>
            Add child row
          </button>
          <button type="button" className="vs-btn" onClick={() => props.onRow("indent")}>
            Indent
          </button>
          <button type="button" className="vs-btn" onClick={() => props.onRow("outdent")}>
            Outdent
          </button>
          <button type="button" className="vs-btn" onClick={() => props.onRow("up")}>
            Move up
          </button>
          <button type="button" className="vs-btn" onClick={() => props.onRow("down")}>
            Move down
          </button>
          <button type="button" className="vs-btn vs-btn-danger" disabled={doc.rows.length <= 1} onClick={() => props.onRow("delete")}>
            Delete row
          </button>
        </div>
      </section>
    </aside>
  );
}
