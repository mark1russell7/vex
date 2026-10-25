/**
 * The force pilot: a force-directed layout of the nodes of a graph, as the force layouts of Graph do. The positions of
 * all nodes are the state of one loop: a list of `Vec2` values by key (LOOP.LIST). Each step reads the old position of
 * each node by its key (LIST.GET). Each node pushes the other nodes away, a spring pulls the two ends of each edge
 * together, and a mild pull goes to the center.
 *
 * The Vex program uses the typed builder. The name `pos` of `iterate` is a list chain (BUILD.LIST.LOOP), and the result
 * is the list of the last positions. A record has its key in the field `id`, because `get` takes the key as a value.
 */
import { space, vex } from "@mark1russell7/vex";
import { NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";

/** A node: its key, and its position at the start. */
export interface ForceNode {
  readonly id: string;
  readonly pos: Vec2;
}

/** The tuning: the number of steps, and the strength of the push, of the springs and of the pull to the center. */
export interface ForceOptions {
  readonly steps: number;
  readonly repel: number;
  readonly spring: number;
  readonly center: number;
}

/** This function gives the last position of each node, with one Vex program. */
export function layoutVex(nodes: Readonly<Record<string, ForceNode>>, edges: Readonly<Record<string, readonly string[]>>, o: ForceOptions): Record<string, Vec2> {
  // Vec2Domain comes first, so the empty sum of vectors is the zero vector.
  const root = vex(Vec2Domain, NumDomain).over(space.graph(nodes, edges));
  const layout = root.start(0).iterate(
    o.steps,
    { pos: root.start(0).each((c) => c.from("pos")) },
    ({ pos }) => ({
      pos: root.start(0).each((c) => {
        // The old position of this node. In each body of an axis below, the start value is this position.
        const me = pos.get(c.from("id"));
        // The push from another node: (me - other) * repel / (|me - other|^2 + 1).
        const push = me
          .others((other) => {
            const gap = other._.subtract(pos.get(other.from("id")));
            return gap._.scale(root.start(o.repel)._.divide(gap._.lengthSq()._.add(1)));
          })
          .reduce("add", { domain: "Vec2" });
        // The pull of a spring on an edge from this node or to it: (other - me) * spring.
        const out = me.successors((t) => pos.get(t.from("id"))._.subtract(t)._.scale(o.spring)).reduce("add", { domain: "Vec2" });
        const into = me.predecessors((t) => pos.get(t.from("id"))._.subtract(t)._.scale(o.spring)).reduce("add", { domain: "Vec2" });
        return me._.add(push)._.add(out)._.add(into)._.add(me._.scale(-o.center));
      }),
    }),
    ({ pos }) => pos,
  );
  // The list of the last positions does not depend on the origin, so one evaluation gives each position.
  const [first] = Object.keys(nodes);
  if (first === undefined) return {};
  const r = layout.result(first);
  if (!r.ok) throw new Error(`the layout gave ${r.error.code}: ${r.error.message}`);
  const out: Record<string, Vec2> = {};
  for (const item of r.value.items) {
    if (!item.result.ok || !(item.result.value instanceof Vec2)) throw new Error(`the node ${item.key} gave ${item.result.ok ? typeof item.result.value : item.result.error.code}`);
    out[item.key] = item.result.value;
  }
  return out;
}

/** This function adds vectors as `reduce("add")` does: from the left, and the zero vector for no vectors. */
function sum(vs: readonly Vec2[]): Vec2 {
  const [head, ...rest] = vs;
  return head === undefined ? Vec2.zero : rest.reduce((a, b) => a.add(b), head);
}

/** This function gives the last position of each node, in plain TypeScript, with the same arithmetic in the same order. */
export function layoutReference(nodes: Readonly<Record<string, ForceNode>>, edges: Readonly<Record<string, readonly string[]>>, o: ForceOptions): Record<string, Vec2> {
  const keys = Object.keys(nodes);
  let pos = new Map(keys.map((k) => [k, (nodes[k] as ForceNode).pos]));
  for (let step = 0; step < o.steps; step++) {
    const before = pos;
    const at = (k: string): Vec2 => before.get(k) as Vec2;
    pos = new Map(
      keys.map((k) => {
        const me = at(k);
        const push = sum(
          keys
            .filter((j) => j !== k)
            .map((j) => {
              const gap = me.subtract(at(j));
              return gap.scale(o.repel / (gap.lengthSq() + 1));
            }),
        );
        // The successors in the order of the edges, and the predecessors in key order, as the axes give them.
        const out = sum([...new Set(edges[k] ?? [])].map((j) => at(j).subtract(me).scale(o.spring)));
        const into = sum(keys.filter((j) => (edges[j] ?? []).includes(k)).map((j) => at(j).subtract(me).scale(o.spring)));
        return [k, me.add(push).add(out).add(into).add(me.scale(-o.center))];
      }),
    );
  }
  return Object.fromEntries(pos);
}
