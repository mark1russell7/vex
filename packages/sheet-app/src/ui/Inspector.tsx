/**
 * The inspector: the selected cell, its value or its error value with the reason, and the steps of a formula cell.
 * It also has the settings of the column and the actions of the row.
 */
import type { Trace } from "@mark1russell7/vex";
import { useState, type ReactElement } from "react";
import { cellFormulaOf, VALUE_TYPES, type Column, type SheetDoc, type ValueType } from "../doc.ts";
import type { Evaluation } from "../engine.ts";
import { formatValue } from "../values.ts";
import type { CellRef } from "./Grid.tsx";

/** The properties of the inspector. */
export interface InspectorProps {
  /** On a narrow screen, the inspector shows only when it is open. */
  readonly open?: boolean;
  /** In a grid, the row numbers are addresses, so a row is added or deleted only at the end. */
  readonly grid?: boolean;
  readonly doc: SheetDoc;
  readonly ev: Evaluation;
  readonly sel: CellRef;
  readonly rowNumber: number;
  readonly onRename: (col: string, name: string) => void;
  readonly onType: (col: string, type: ValueType) => void;
  readonly onConvert: (col: string) => void;
  readonly onMoveColumn: (col: string, dir: -1 | 1) => void;
  readonly onDeleteColumn: (col: string) => void;
  readonly onRow: (action: RowAction) => void;
}

/** An action on the selected row. "end" adds a row at the end of the document. */
export type RowAction = "below" | "child" | "indent" | "outdent" | "up" | "down" | "delete" | "end";

/** The settings of a column of a grid: its letter stays, so the only action is to delete it. */
function GridColumn(props: InspectorProps & { readonly col: Column }): ReactElement {
  return (
    <section className="vs-panel" aria-label="The column">
      <h2>Column {props.col.name}</h2>
      <div className="vs-actions">
        <button type="button" className="vs-btn vs-btn-danger" disabled={props.doc.columns.length <= 1} onClick={() => props.onDeleteColumn(props.col.id)}>
          Delete column
        </button>
      </div>
    </section>
  );
}

/** The actions of the rows of a grid. A row in the middle moves the numbers of the rows after it, so a grid adds and deletes only at the end. */
function GridRows(props: InspectorProps): ReactElement {
  const last = props.doc.rows.at(-1)?.id;
  return (
    <section className="vs-panel" aria-label="The row">
      <h2>Rows</h2>
      <div className="vs-actions">
        <button type="button" className="vs-btn" onClick={() => props.onRow("end")}>
          Add a row at the end
        </button>
        <button type="button" className="vs-btn vs-btn-danger" disabled={props.doc.rows.length <= 1 || props.sel.row !== last} onClick={() => props.onRow("delete")}>
          Delete the last row
        </button>
      </div>
    </section>
  );
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
  const own = col?.kind === "formula" && props.grid !== true ? cellFormulaOf(doc, sel.row, sel.col) : undefined;
  return (
    <aside id="vs-inspector" className="vs-inspector" data-open={props.open === true} aria-label="The inspector">
      <section className="vs-panel" aria-label="The cell">
        <h2>
          {props.grid === true ? `${col?.name ?? ""}${props.rowNumber}` : col?.name ?? "Cell"}
          {props.grid === true ? null : <span className="vs-muted"> · row {props.rowNumber}</span>}
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
        {own === undefined ? null : (
          <p className="vs-own-note">
            This cell has its own formula: <code>{own}</code>
          </p>
        )}
        {trace === undefined ? null : (
          <details open={r?.ok === false}>
            <summary>Steps of the evaluation</summary>
            <Steps trace={trace} />
          </details>
        )}
      </section>
      {col === undefined ? null : props.grid === true ? <GridColumn {...props} col={col} /> : <ColumnSettings {...props} col={col} />}
      {props.grid === true ? (
        <GridRows {...props} />
      ) : (
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
      )}
    </aside>
  );
}
