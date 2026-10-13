/**
 * The grid: a tree grid of the rows and the columns. The selected cell has the keyboard focus (a roving tab index).
 * A value cell opens a text field for an edit. A cell with an error value shows the code, and its title gives the
 * reason. A mark in the corner shows a cell with its own formula.
 */
import type { Result } from "@mark1russell7/vex";
import { Color } from "@mark1russell7/vex-domains";
import { useEffect, useMemo, useRef, type KeyboardEvent, type ReactElement } from "react";
import type { Column, SheetDoc } from "../doc.ts";
import type { Evaluation } from "../engine.ts";
import { colorHex, formatValue } from "../values.ts";
import type { View, VisibleRow } from "../view.ts";

/** A cell: a row id and a column id. */
export interface CellRef {
  readonly row: string;
  readonly col: string;
}

/** The properties of the grid. */
export interface GridProps {
  readonly doc: SheetDoc;
  /** In a grid, the columns have letters, the rows keep their numbers, and a cell is a formula only with "=". */
  readonly grid?: boolean;
  readonly ev: Evaluation;
  readonly rows: readonly VisibleRow[];
  readonly view: View;
  readonly sel: CellRef;
  readonly editing: (CellRef & { readonly text: string }) | undefined;
  readonly onSelect: (cell: CellRef) => void;
  readonly onStartEdit: (cell: CellRef) => void;
  readonly onEditText: (text: string) => void;
  readonly onEditDone: (move: "down" | "right" | "none") => void;
  readonly onEditCancel: () => void;
  readonly onToggle: (row: string) => void;
  readonly onSort: (col: string) => void;
  readonly onAddColumn: (kind: "value" | "formula") => void;
  readonly onKeyDown: (e: KeyboardEvent) => void;
}

const cellId = (c: CellRef): string => `vs-cell-${c.row}-${c.col}`;

const TYPE_MARK: Readonly<Record<string, string>> = { number: "#", text: "Aa", boolean: "✓", vec2: "→", color: "◐", date: "▦" };

/** The content of one cell. */
function CellView(props: { readonly r: Result<unknown> | undefined }): ReactElement | null {
  const { r } = props;
  if (r === undefined) return null;
  if (!r.ok) {
    return (
      <span className="vs-err" title={r.error.message}>
        {r.error.code}
      </span>
    );
  }
  if (r.value instanceof Color) {
    const hex = colorHex(r.value);
    return (
      <span className="vs-color">
        <span className="vs-swatch" style={{ background: hex }} aria-hidden="true" />
        {hex}
      </span>
    );
  }
  return <>{formatValue(r.value)}</>;
}

/** The grid. */
export function Grid(props: GridProps): ReactElement {
  const { doc, ev, rows, sel, editing } = props;
  const byId = useMemo(() => new Map(doc.rows.map((r) => [r.id, r])), [doc]);
  // In a grid, the number of a row is its address, so a filter does not change it.
  const numberOf = useMemo(() => new Map(doc.rows.map((r, i) => [r.id, i + 1])), [doc]);
  const grid = props.grid === true;
  const table = useRef<HTMLTableElement>(null);

  // The selected cell takes the focus when the grid has the focus, so the keys move the selection.
  useEffect(() => {
    if (editing !== undefined) return;
    const el = document.getElementById(cellId(sel));
    if (el !== null && table.current?.contains(document.activeElement)) el.focus({ preventScroll: false });
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [sel, editing]);

  const header = (c: Column): ReactElement => {
    const sorted = props.view.sort?.column === c.id ? props.view.sort.dir : 0;
    if (grid) {
      return (
        <th key={c.id} role="columnheader" scope="col" className="vs-grid-letter">
          <button type="button" className="vs-colname" onClick={() => props.onSelect({ row: sel.row, col: c.id })}>
            {c.name}
          </button>
        </th>
      );
    }
    return (
      <th key={c.id} role="columnheader" scope="col" aria-sort={sorted === 1 ? "ascending" : sorted === -1 ? "descending" : "none"} className={c.kind === "formula" ? "vs-formula-col" : undefined}>
        <span className="vs-colhead">
          <span className="vs-colmark" aria-hidden="true">
            {c.kind === "formula" ? "ƒ" : (TYPE_MARK[c.type] ?? "")}
          </span>
          <button type="button" className="vs-colname" onClick={() => props.onSelect({ row: sel.row, col: c.id })}>
            {c.name}
          </button>
          <button type="button" className="vs-sort" aria-label={`Sort by ${c.name}`} onClick={() => props.onSort(c.id)}>
            {sorted === 1 ? "▲" : sorted === -1 ? "▼" : "↕"}
          </button>
        </span>
      </th>
    );
  };

  return (
    <div className="vs-grid-wrap">
      <table ref={table} className="vs-grid" role="treegrid" aria-label={`The table ${doc.title}`} aria-rowcount={rows.length + 1} aria-colcount={doc.columns.length + 1} onKeyDown={props.onKeyDown}>
        <thead>
          <tr role="row">
            <th role="columnheader" scope="col" className="vs-corner">
              Row
            </th>
            {doc.columns.map(header)}
            <th role="columnheader" scope="col" className="vs-addcol-cell">
              {grid ? (
                <button type="button" className="vs-addcol" aria-label="Add a column" title="Add a column" onClick={() => props.onAddColumn("formula")}>
                  +
                </button>
              ) : (
                <span className="vs-addcols">
                  <button type="button" className="vs-addcol" aria-label="Add a value column" title="Add a value column" onClick={() => props.onAddColumn("value")}>
                    +
                  </button>
                  <button type="button" className="vs-addcol vs-addcol-f" aria-label="Add a formula column" title="Add a formula column" onClick={() => props.onAddColumn("formula")}>
                    ƒ
                  </button>
                </span>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((vr, i) => (
            <tr key={vr.id} role="row" aria-level={vr.depth + 1} aria-expanded={vr.hasChildren ? !props.view.collapsed.has(vr.id) : undefined} className={vr.id === sel.row ? "vs-row-sel" : undefined}>
              <th role="rowheader" scope="row" className="vs-rowhead">
                <span className="vs-rowhead-in" style={{ paddingInlineStart: `${vr.depth * 1.1}rem` }}>
                  {vr.hasChildren ? (
                    <button type="button" className="vs-caret" aria-label={props.view.collapsed.has(vr.id) ? "Open the group" : "Close the group"} onClick={() => props.onToggle(vr.id)}>
                      {props.view.collapsed.has(vr.id) ? "▸" : "▾"}
                    </button>
                  ) : (
                    <span className="vs-caret-space" />
                  )}
                  {grid ? (numberOf.get(vr.id) ?? i + 1) : i + 1}
                </span>
              </th>
              {doc.columns.map((c) => {
                const here = { row: vr.id, col: c.id };
                const isSel = vr.id === sel.row && c.id === sel.col;
                const isEdit = editing !== undefined && editing.row === vr.id && editing.col === c.id;
                const r = ev.cell(vr.id, c.id);
                const numeric = r?.ok === true && typeof r.value === "number";
                const text = byId.get(vr.id)?.formulas?.[c.id];
                // In a grid, each filled cell has its own text, so the mark of an own formula is only for a table.
                const own = !grid && c.kind === "formula" && text !== undefined;
                const formula = c.kind === "formula" && (!grid || text?.trimStart().startsWith("=") === true);
                return (
                  <td
                    key={c.id}
                    id={cellId(here)}
                    role="gridcell"
                    aria-selected={isSel}
                    tabIndex={isSel ? 0 : -1}
                    className={[formula ? "vs-formula-col" : "", own ? "vs-own" : "", numeric ? "vs-num" : "", r?.ok === false ? "vs-cell-error" : "", isSel ? "vs-sel" : ""].join(" ").trim() || undefined}
                    onMouseDown={() => props.onSelect(here)}
                    onDoubleClick={() => props.onStartEdit(here)}
                  >
                    {isEdit ? (
                      <input
                        className="vs-cell-input"
                        aria-label={grid ? `${c.name}${numberOf.get(vr.id) ?? i + 1}` : `${c.name}, row ${i + 1}`}
                        // The field opens with the focus, because the user starts an edit with a key or a double click.
                        autoFocus
                        value={editing.text}
                        onChange={(e) => props.onEditText(e.target.value)}
                        onBlur={() => props.onEditDone("none")}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") {
                            e.preventDefault();
                            props.onEditDone("down");
                          } else if (e.key === "Tab") {
                            e.preventDefault();
                            props.onEditDone("right");
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            props.onEditCancel();
                          }
                        }}
                      />
                    ) : (
                      <>
                        <CellView r={r} />
                        {own ? <span className="vs-sr">, own formula</span> : null}
                      </>
                    )}
                  </td>
                );
              })}
              <td role="gridcell" className="vs-addcol-cell" aria-hidden="true" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
