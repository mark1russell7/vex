/**
 * The sheet app. It keeps the history of the document, the selection, the view and the draft of a formula. The draft
 * changes the results as you type, and the history gets the formula when the edit ends. The app takes the formula
 * compiler as a property, so it depends only on the contract of the compiler.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { addColumn, addRow, convertColumn, deleteColumn, deleteRow, emptyDoc, indentRow, moveColumn, moveRow, outdentRow, setCell, updateColumn, type SheetDoc, type ValueType } from "../doc.ts";
import { evaluateDoc, type Compiler } from "../engine.ts";
import { EXAMPLES } from "../examples.ts";
import { commit, historyOf, redo, undo, type History } from "../history.ts";
import { decodeShare, encodeShare, exportCsv, exportJson, importCsv, importJson, loadLocal, saveLocal } from "../io.ts";
import { PLAIN_VIEW, visibleRows, type View } from "../view.ts";
import { FormulaEditor } from "./FormulaEditor.tsx";
import { Grid, type CellRef } from "./Grid.tsx";
import { Inspector } from "./Inspector.tsx";

/** The properties of the app. */
export interface SheetAppProps {
  readonly compiler: Compiler;
  /** The address of the documentation, for the link in the bar. */
  readonly docsHref?: string;
}

const firstCell = (doc: SheetDoc): CellRef => ({ row: doc.rows[0]?.id ?? "", col: doc.columns[0]?.id ?? "" });

/** This function gives a file to the user. */
function download(name: string, type: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The sheet app. */
export function SheetApp(props: SheetAppProps): ReactElement {
  const { compiler } = props;
  const [hist, setHist] = useState<History>(() => historyOf(loadLocal() ?? EXAMPLES[0]?.doc ?? emptyDoc()));
  const doc = hist.present;
  const [sel, setSel] = useState<CellRef>(() => firstCell(doc));
  const [editing, setEditing] = useState<(CellRef & { readonly text: string }) | undefined>(undefined);
  const [draft, setDraft] = useState<{ readonly col: string; readonly text: string } | undefined>(undefined);
  const [view, setView] = useState<View>(PLAIN_VIEW);
  const [showVex, setShowVex] = useState(false);
  const [note, setNote] = useState("");
  // On a narrow screen the inspector is closed at the start, so the grid has the space. A wide screen always shows it.
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const apply = useCallback((f: (d: SheetDoc) => SheetDoc): void => setHist((h) => commit(h, f(h.present))), []);
  const load = (d: SheetDoc, message: string): void => {
    setHist((h) => commit(h, d));
    setSel(firstCell(d));
    setView(PLAIN_VIEW);
    setNote(message);
  };

  // A share link or an example link in the address opens its document once, when the app starts.
  useEffect(() => {
    const example = EXAMPLES.find((x) => x.id === /#example=([\w-]+)/.exec(window.location.hash)?.[1]);
    if (example !== undefined) {
      load(example.doc, `Opened the example "${example.title}".`);
      return;
    }
    const m = /#sheet=([\w-]+)/.exec(window.location.hash);
    if (m?.[1] === undefined) return;
    void decodeShare(m[1]).then((d) => {
      if (d === undefined) setNote("The link has no valid sheet.");
      else load(d, `Opened "${d.title}" from the link.`);
    });
    // The link is read once, when the app opens.
  }, []);

  // The browser keeps the document, so a new visit opens it again.
  useEffect(() => saveLocal(doc), [doc]);

  // The draft formula changes the results at once. The history gets the formula when the edit ends.
  const shown = useMemo(() => (draft === undefined ? doc : updateColumn(doc, draft.col, { formula: draft.text })), [doc, draft]);
  const ev = useMemo(() => evaluateDoc(shown, compiler), [shown, compiler]);
  const rows = useMemo(() => visibleRows(shown, ev, view), [shown, ev, view]);

  // The selection stays on a cell that exists.
  const row = rows.some((r) => r.id === sel.row) ? sel.row : (rows[0]?.id ?? "");
  const col = shown.columns.some((c) => c.id === sel.col) ? sel.col : (shown.columns[0]?.id ?? "");
  const here: CellRef = { row, col };
  const column = shown.columns.find((c) => c.id === col);
  const rowIndex = rows.findIndex((r) => r.id === row);
  const compiled = column?.kind === "formula" ? ev.compiled.get(column.id) : undefined;

  const move = (dr: number, dc: number): void => {
    const ri = Math.min(rows.length - 1, Math.max(0, rowIndex + dr));
    const ci = Math.min(shown.columns.length - 1, Math.max(0, shown.columns.findIndex((c) => c.id === col) + dc));
    setSel({ row: rows[ri]?.id ?? row, col: shown.columns[ci]?.id ?? col });
  };
  const startEdit = (cell: CellRef, text?: string): void => {
    const c = shown.columns.find((x) => x.id === cell.col);
    if (c === undefined) return;
    if (c.kind === "formula") {
      setDraft({ col: c.id, text: c.formula });
      requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(".vs-bar .vs-editor-input")?.focus());
      return;
    }
    setSel(cell);
    setEditing({ ...cell, text: text ?? shown.rows.find((r) => r.id === cell.row)?.cells[c.id] ?? "" });
  };
  const endEdit = (step: "down" | "right" | "none"): void => {
    if (editing !== undefined) apply((d) => setCell(d, editing.row, editing.col, editing.text));
    setEditing(undefined);
    if (step === "down") move(1, 0);
    if (step === "right") move(0, 1);
    requestAnimationFrame(() => document.getElementById(`vs-cell-${row}-${col}`)?.focus());
  };
  const endDraft = (): void => {
    if (draft !== undefined) apply((d) => updateColumn(d, draft.col, { formula: draft.text }));
    setDraft(undefined);
  };
  const rowAction = (action: "below" | "child" | "indent" | "outdent" | "up" | "down" | "delete"): void => {
    if (action === "below" || action === "child") {
      const r = addRow(doc, row, action === "child");
      apply(() => r.doc);
      setSel({ row: r.id, col });
      return;
    }
    if (action === "delete") {
      const next = rows[rowIndex + 1]?.id ?? rows[rowIndex - 1]?.id ?? row;
      apply((d) => (d.rows.length > 1 ? deleteRow(d, row) : d));
      setSel({ row: next, col });
      return;
    }
    apply((d) => (action === "indent" ? indentRow(d, row) : action === "outdent" ? outdentRow(d, row) : moveRow(d, row, action === "up" ? -1 : 1)));
  };
  const newColumn = (kind: "value" | "formula"): void => {
    const r = addColumn(doc, kind === "value" ? { name: "Column", kind, type: "number" } : { name: "Formula", kind, formula: "" });
    apply(() => r.doc);
    setSel({ row, col: r.id });
    // A new formula column opens the formula bar, so the user writes the formula at once.
    if (kind === "formula") {
      setDraft({ col: r.id, text: "= " });
      requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(".vs-bar .vs-editor-input")?.focus());
    }
  };

  const onGridKey = (e: KeyboardEvent): void => {
    const mod = e.ctrlKey || e.metaKey;
    const keys: Record<string, () => void> = {
      ArrowUp: () => (e.altKey && e.shiftKey ? rowAction("up") : move(-1, 0)),
      ArrowDown: () => (e.altKey && e.shiftKey ? rowAction("down") : move(1, 0)),
      ArrowLeft: () => (e.altKey && e.shiftKey ? rowAction("outdent") : move(0, -1)),
      ArrowRight: () => (e.altKey && e.shiftKey ? rowAction("indent") : move(0, 1)),
      Home: () => move(0, -shown.columns.length),
      End: () => move(0, shown.columns.length),
      Enter: () => (mod ? rowAction(e.shiftKey ? "child" : "below") : startEdit(here)),
      F2: () => startEdit(here),
      Tab: () => move(0, e.shiftKey ? -1 : 1),
      Delete: () => column?.kind === "value" && apply((d) => setCell(d, row, col, "")),
      Backspace: () => column?.kind === "value" && apply((d) => setCell(d, row, col, "")),
    };
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      setHist(e.shiftKey ? redo : undo);
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      setHist(redo);
      return;
    }
    const action = keys[e.key];
    if (action !== undefined) {
      e.preventDefault();
      action();
      return;
    }
    // A printable key starts an edit of a value cell with that key.
    if (e.key.length === 1 && !mod && !e.altKey && column?.kind === "value") {
      e.preventDefault();
      startEdit(here, e.key);
    }
  };

  const share = async (): Promise<void> => {
    const url = `${window.location.origin}${window.location.pathname}#sheet=${await encodeShare(doc)}`;
    window.history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      setNote("The link is on the clipboard.");
    } catch {
      setNote("The link is in the address bar.");
    }
  };
  const onFile = async (f: File): Promise<void> => {
    const text = await f.text();
    if (f.name.toLowerCase().endsWith(".json")) {
      const d = importJson(text);
      if (d === undefined) setNote(`"${f.name}" is not a valid sheet.`);
      else load(d, `Opened "${f.name}".`);
    } else load(importCsv(text, f.name.replace(/\.[^.]*$/, "")), `Imported "${f.name}".`);
  };

  return (
    <div className="vs-app">
      <header className="vs-top">
        <h1 className="vs-brand">
          <a href={props.docsHref ?? "../"}>
            Vex <span>Sheet</span>
          </a>
        </h1>
        <input className="vs-title" aria-label="The title of the sheet" value={doc.title} onChange={(e) => apply((d) => ({ ...d, title: e.target.value }))} />
        <div className="vs-tools" role="toolbar" aria-label="The sheet">
          <select
            className="vs-btn"
            aria-label="Open an example"
            value=""
            onChange={(e) => {
              const ex = EXAMPLES.find((x) => x.id === e.target.value);
              if (ex !== undefined) load(ex.doc, `Opened the example "${ex.title}".`);
            }}
          >
            <option value="">Examples…</option>
            {EXAMPLES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title}
              </option>
            ))}
          </select>
          <button type="button" className="vs-btn" onClick={() => load(emptyDoc(), "A new sheet.")}>
            New
          </button>
          <button type="button" className="vs-btn" disabled={hist.past.length === 0} onClick={() => setHist(undo)} aria-keyshortcuts="Control+Z">
            Undo
          </button>
          <button type="button" className="vs-btn" disabled={hist.future.length === 0} onClick={() => setHist(redo)} aria-keyshortcuts="Control+Y">
            Redo
          </button>
          <button type="button" className="vs-btn" onClick={() => file.current?.click()}>
            Import
          </button>
          <input ref={file} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={(e) => {
            const f = e.target.files?.[0];
            if (f !== undefined) void onFile(f);
            e.target.value = "";
          }} />
          <button type="button" className="vs-btn" onClick={() => download(`${doc.title || "sheet"}.csv`, "text/csv", exportCsv(doc, ev))}>
            CSV
          </button>
          <button type="button" className="vs-btn" onClick={() => download(`${doc.title || "sheet"}.json`, "application/json", exportJson(doc))}>
            JSON
          </button>
          <button type="button" className="vs-btn vs-btn-primary" onClick={() => void share()}>
            Share
          </button>
        </div>
      </header>

      <div className="vs-bar">
        <span className="vs-address" aria-live="polite">
          {column?.kind === "formula" ? "ƒ " : ""}
          {column?.name ?? ""} · row {rowIndex + 1}
        </span>
        {column?.kind === "formula" ? (
          <div className="vs-bar-main">
            <FormulaEditor
              key={column.id}
              label={`The formula of the column ${column.name}`}
              value={draft?.col === column.id ? draft.text : column.formula}
              onChange={(text) => setDraft({ col: column.id, text })}
              onDone={endDraft}
              onCancel={() => setDraft(undefined)}
              highlight={compiler.highlight}
              error={compiled?.ok === false ? compiled.error : undefined}
              functions={compiler.functions ?? []}
              columns={shown.columns.filter((c) => c.id !== column.id).map((c) => c.name)}
            />
            <button type="button" className="vs-btn vs-vex-toggle" aria-pressed={showVex} onClick={() => setShowVex((v) => !v)}>
              Vex
            </button>
            {showVex && compiled?.ok === true ? (
              <pre className="vs-vex" aria-label="The formula as a Vex chain" tabIndex={0}>
                {compiler.toVexChain(compiled.expr)}
              </pre>
            ) : null}
          </div>
        ) : (
          <input
            className="vs-bar-value"
            aria-label={`The value of ${column?.name ?? "the cell"}`}
            value={editing?.row === row && editing.col === col ? editing.text : (shown.rows.find((r) => r.id === row)?.cells[col] ?? "")}
            onFocus={() => editing === undefined && startEdit(here)}
            onChange={(e) => setEditing({ ...here, text: e.target.value })}
            onBlur={() => endEdit("none")}
            onKeyDown={(e) => {
              if (e.key === "Enter") endEdit("down");
              if (e.key === "Escape") setEditing(undefined);
            }}
          />
        )}
      </div>

      <div className="vs-main">
        <div className="vs-left">
          <div className="vs-viewbar">
            <input className="vs-filter" type="search" placeholder="Filter rows" aria-label="Filter the rows" value={view.filter} onChange={(e) => setView((v) => ({ ...v, filter: e.target.value }))} />
            <button type="button" className="vs-btn vs-inspector-toggle" aria-expanded={inspectorOpen} aria-controls="vs-inspector" onClick={() => setInspectorOpen((o) => !o)}>
              Inspector
            </button>
            {view.sort === undefined ? null : (
              <button type="button" className="vs-btn" onClick={() => setView((v) => ({ ...v, sort: undefined }))}>
                Clear the sort
              </button>
            )}
          </div>
          <Grid
            doc={shown}
            ev={ev}
            rows={rows}
            view={view}
            sel={here}
            editing={editing}
            onSelect={(c) => {
              if (editing !== undefined) endEdit("none");
              setSel(c);
            }}
            onStartEdit={(c) => startEdit(c)}
            onEditText={(text) => editing !== undefined && setEditing({ ...editing, text })}
            onEditDone={endEdit}
            onEditCancel={() => setEditing(undefined)}
            onToggle={(id) =>
              setView((v) => {
                const next = new Set(v.collapsed);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return { ...v, collapsed: next };
              })
            }
            onSort={(c) => setView((v) => ({ ...v, sort: v.sort?.column !== c ? { column: c, dir: 1 } : v.sort.dir === 1 ? { column: c, dir: -1 } : undefined }))}
            onAddColumn={newColumn}
            onKeyDown={onGridKey}
          />
        </div>
        <Inspector
          open={inspectorOpen}
          doc={shown}
          ev={ev}
          sel={here}
          rowNumber={rowIndex + 1}
          onRename={(c, name) => apply((d) => updateColumn(d, c, { name }))}
          onType={(c, type: ValueType) => apply((d) => updateColumn(d, c, { type }))}
          onConvert={(c) => apply((d) => convertColumn(d, c))}
          onMoveColumn={(c, dir) => apply((d) => moveColumn(d, c, dir))}
          onDeleteColumn={(c) => apply((d) => (d.columns.length > 1 ? deleteColumn(d, c) : d))}
          onRow={rowAction}
        />
      </div>

      <footer className="vs-status">
        <span>
          {doc.rows.length} rows · {doc.columns.length} columns · {ev.errors === 0 ? "no errors" : `${ev.errors} error${ev.errors === 1 ? "" : "s"}`}
        </span>
        <span role="status">{note}</span>
        <span className="vs-muted">Saved in this browser</span>
      </footer>
    </div>
  );
}
