/**
 * The layout audit pilot. Jqy (https://github.com/mark1russell7/Jqy) is a layout engine for nested boxes. Its audit
 * (`src/components/tooling/diagnostics/audit.ts`) and its radial strategy check each child box against its parent.
 * This module gives the same checks and the same radial placement as Vex formulas over a tree space. It also gives a
 * reference in plain TypeScript. The tests compare the two on random layouts.
 */
import { space, vex, type Result, type Space, type Trace } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";

/** A box of a layout. `parent` is the id of the parent box. `radial` tells if the box places its children on a ring. */
export interface LayoutBox {
  readonly id: string;
  readonly position: Vec2;
  readonly size: Vec2;
  readonly parent?: string;
  readonly radial?: boolean;
}

/** The tuning of the checks: the inner padding of a parent, the gap between children, and the smallest ring radius. */
export interface AuditOptions {
  readonly pad: number;
  readonly gap: number;
  readonly minRadius: number;
}

/** The codes of the checks, with the names of Jqy. */
export type AuditCode = "NESTED_CHILD_NOT_SQUARE" | "NESTED_CHILD_TOO_BIG" | "NESTED_CHILD_OUTSIDE_PARENT" | "RADIAL_CHILD_OFF_RING";

/** A finding of the audit: a check that a child box does not pass. */
export interface AuditIssue {
  readonly code: AuditCode;
  readonly child: string;
}

/** The record of a box in the tree space. `i` is the position of the box among the children of its parent. */
export interface BoxRecord {
  readonly position: Vec2;
  readonly size: Vec2;
  readonly radial: boolean;
  readonly i: number;
}

/** This function gives the tree space of a layout. The space keeps the type of the records, so the formulas are typed. */
export function layoutSpace(boxes: readonly LayoutBox[]): Space<string, BoxRecord> {
  const records: Record<string, BoxRecord> = {};
  const parents: Record<string, string | null> = {};
  for (const b of boxes) {
    records[b.id] = { position: b.position, size: b.size, radial: b.radial === true, i: boxes.filter((o) => o.parent === b.parent && o.parent !== undefined).indexOf(b) };
    parents[b.id] = b.parent ?? null;
  }
  return space.tree(records, parents);
}

/** The angle of the child `i` of `n` on the ring: the default of Jqy (start 0, clockwise). */
export const angleOf = (i: number, n: number): number => (i / Math.max(1, n)) * Math.PI * 2;

/** The point at `angle` and distance `r` from the zero point. */
export const polar = (angle: number, r: number): Vec2 => new Vec2(Math.cos(angle) * r, Math.sin(angle) * r);

/**
 * This function gives the Vex programs of the audit and of the radial placement. Each program evaluates at one box.
 * At a root, each program that reads the parent gives `#REF!`, because a root has no parent.
 */
function layoutPrograms(boxes: readonly LayoutBox[], o: AuditOptions) {
  const root = vex(Vec2Domain, NumDomain, BoolDomain).withOptions({ fns: { angleOf, polar } }).over(layoutSpace(boxes));
  const parent = root.start(0).parent();
  const inner = parent.from("size")._.subtract(2 * o.pad);
  const innerLo = parent.from("position")._.add(o.pad);
  const innerCentre = innerLo._.add(inner._.halve());
  const farCorner = root.from("position")._.add("size");
  const centre = root.from("size")._.halve()._.add("position");
  // The ring radius uses the largest child of the parent: the children axis at the address of the parent.
  const largest = root.start(0).parent().children((c) => c.from("size")._.maxComponent()).max();
  const ring = inner._.minComponent()._.divide(2)._.subtract(largest._.add(o.gap)._.divide(2))._.max(o.minRadius);
  const siblings = root.start(0).parent().children((c) => c).count();
  return {
    root,
    checks: {
      NESTED_CHILD_NOT_SQUARE: root.from("size")._.swap()._.subtract("size")._.abs()._.maxComponent()._.gt(0.5),
      NESTED_CHILD_TOO_BIG: root.from("size")._.maxComponent()._.gt(inner._.minComponent()._.add(0.5)),
      NESTED_CHILD_OUTSIDE_PARENT: root.from("position")._.subtract(innerLo)._.anyLessThan(-0.5)._.or(innerLo._.add(inner)._.subtract(farCorner)._.anyLessThan(-0.5)),
      RADIAL_CHILD_OFF_RING: parent.from("radial")._.and(centre._.distance(innerCentre)._.subtract(ring)._.abs()._.gt(1)),
    },
    /** The centre of the box on the ring of a radial parent, as Jqy places it. */
    placed: root.from("i").call("angleOf", siblings).call("polar", ring)._.add(innerCentre),
  } as const;
}

/** The result of each check at each box. A root gives an error value for the checks that read the parent. */
export function checkResults(boxes: readonly LayoutBox[], o: AuditOptions): Readonly<Record<string, Readonly<Record<AuditCode, Result<unknown>>>>> {
  const { checks } = layoutPrograms(boxes, o);
  const out: Record<string, Readonly<Record<AuditCode, Result<unknown>>>> = {};
  for (const b of boxes) {
    out[b.id] = {
      NESTED_CHILD_NOT_SQUARE: checks.NESTED_CHILD_NOT_SQUARE.result(b.id),
      NESTED_CHILD_TOO_BIG: checks.NESTED_CHILD_TOO_BIG.result(b.id),
      NESTED_CHILD_OUTSIDE_PARENT: checks.NESTED_CHILD_OUTSIDE_PARENT.result(b.id),
      RADIAL_CHILD_OFF_RING: checks.RADIAL_CHILD_OFF_RING.result(b.id),
    };
  }
  return out;
}

/** The trace of one check at one box: each step of the formula, with its value. */
export function explainCheck(boxes: readonly LayoutBox[], o: AuditOptions, code: AuditCode, id: string): Trace {
  return layoutPrograms(boxes, o).checks[code].explain(id);
}

/** The centre of each box on the ring of its parent, as Jqy places it, computed with Vex. */
export function placedVex(boxes: readonly LayoutBox[], o: AuditOptions): ReadonlyMap<string, Result<unknown>> {
  const { placed } = layoutPrograms(boxes, o);
  return new Map(boxes.map((b) => [b.id, placed.result(b.id)]));
}

const CODES: readonly AuditCode[] = ["NESTED_CHILD_NOT_SQUARE", "NESTED_CHILD_TOO_BIG", "NESTED_CHILD_OUTSIDE_PARENT", "RADIAL_CHILD_OFF_RING"];

/** The order of the findings: by child, then by the order of the checks. */
const order = (issues: readonly AuditIssue[]): AuditIssue[] => issues.toSorted((a, b) => (a.child === b.child ? CODES.indexOf(a.code) - CODES.indexOf(b.code) : a.child < b.child ? -1 : 1));

/** The audit with Vex: each check that gives `true` at a child box is a finding. Like Jqy, the audit checks children only. */
export function auditVex(boxes: readonly LayoutBox[], o: AuditOptions): AuditIssue[] {
  const { checks } = layoutPrograms(boxes, o);
  const out: AuditIssue[] = [];
  for (const b of boxes.filter((x) => x.parent !== undefined)) {
    for (const code of CODES) {
      const r = checks[code].result(b.id);
      if (r.ok && r.value) out.push({ code, child: b.id });
    }
  }
  return order(out);
}

/** The audit in plain TypeScript, after `genericNestedChecks` and `RadialLayout.auditParent` of Jqy. */
export function auditReference(boxes: readonly LayoutBox[], o: AuditOptions): AuditIssue[] {
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const out: AuditIssue[] = [];
  for (const c of boxes) {
    const p = c.parent === undefined ? undefined : byId.get(c.parent);
    if (p === undefined) continue;
    const innerW = p.size.x - 2 * o.pad;
    const innerH = p.size.y - 2 * o.pad;
    const x1 = p.position.x + o.pad;
    const y1 = p.position.y + o.pad;
    if (Math.abs(c.size.x - c.size.y) > 0.5) out.push({ code: "NESTED_CHILD_NOT_SQUARE", child: c.id });
    if (Math.max(c.size.x, c.size.y) > Math.min(innerW, innerH) + 0.5) out.push({ code: "NESTED_CHILD_TOO_BIG", child: c.id });
    const outside = c.position.x < x1 - 0.5 || c.position.y < y1 - 0.5 || c.position.x + c.size.x > x1 + innerW + 0.5 || c.position.y + c.size.y > y1 + innerH + 0.5;
    if (outside) out.push({ code: "NESTED_CHILD_OUTSIDE_PARENT", child: c.id });
    if (p.radial === true) {
      const sMax = Math.max(...boxes.filter((s) => s.parent === p.id).map((s) => Math.max(s.size.x, s.size.y)));
      const rExpected = Math.max(o.minRadius, Math.min(innerW, innerH) / 2 - (sMax + o.gap) / 2);
      const dist = Math.hypot(c.position.x + c.size.x / 2 - (x1 + innerW / 2), c.position.y + c.size.y / 2 - (y1 + innerH / 2));
      if (Math.abs(dist - rExpected) > 1) out.push({ code: "RADIAL_CHILD_OFF_RING", child: c.id });
    }
  }
  return order(out);
}

/** The centre of each child of a radial parent, as Jqy places it (`RadialLayout.placeChildrenEx`), in plain TypeScript. */
export function placedReference(boxes: readonly LayoutBox[], o: AuditOptions): Map<string, Vec2> {
  const out = new Map<string, Vec2>();
  for (const p of boxes.filter((b) => b.radial === true)) {
    const kids = boxes.filter((b) => b.parent === p.id);
    const inner = p.size.subtract(Vec2.scalar(2 * o.pad));
    const sMax = Math.max(...kids.map((k) => Math.max(k.size.x, k.size.y)));
    const r = Math.max(o.minRadius, Math.min(inner.x, inner.y) / 2 - (sMax + o.gap) / 2);
    const centre = p.position.add(Vec2.scalar(o.pad)).add(inner.halve());
    kids.forEach((k, i) => out.set(k.id, polar(angleOf(i, kids.length), r).add(centre)));
  }
  return out;
}

/** The pairs of overlapping boxes, with Vex: the others axis keeps the boxes that overlap the box at the origin. */
export function overlapsVex(boxes: readonly LayoutBox[]): [string, string][] {
  const flat = space.record(Object.fromEntries(boxes.map((b) => [b.id, { position: b.position, size: b.size }])));
  const root = vex(Vec2Domain, NumDomain, BoolDomain).over(flat);
  const overlapping = root.start(0).others((e) => e, {
    where: (e) =>
      e.origin().from("position")._.add(e.origin().from("size"))._.subtract(e.from("position"))._.allPositive()._.and(
        e.from("position")._.add(e.from("size"))._.subtract(e.origin().from("position"))._.allPositive(),
      ),
  });
  const pairs: [string, string][] = [];
  boxes.forEach((b, i) => {
    // The list has the key of each item (BUILD.LIST.READ).
    const r = overlapping.result(b.id);
    if (!r.ok) return;
    for (const item of r.value.items) if (boxes.findIndex((x) => x.id === item.key) > i) pairs.push([b.id, item.key]);
  });
  return pairs;
}

/** The pairs of overlapping boxes, after `overlapsOf` of Jqy: two boxes are separated if one ends before the other starts. */
export function overlapsReference(boxes: readonly LayoutBox[]): [string, string][] {
  const out: [string, string][] = [];
  boxes.forEach((a, i) => {
    for (const b of boxes.slice(i + 1)) {
      const separated = a.position.add(a.size).subtract(b.position).anyNonPositive() || b.position.add(b.size).subtract(a.position).anyNonPositive();
      if (!separated) out.push([a.id, b.id]);
    }
  });
  return out;
}
