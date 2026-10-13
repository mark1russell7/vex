---
"@mark1russell7/vex": minor
"@mark1russell7/vex-testkit": minor
---

`space.graph(records, edges)` makes a graph space: records by key, and the edges from each key (spec SPACE.GRAPH). A graph can have cycles. The axes `successors`, `predecessors` and `reachable` follow the edges (spec AXIS.GRAPH), and the builder has `.successors()`, `.predecessors()` and `.reachable()`. In a tree space, the edges go from a parent to its children, so the axes work there too. The arbitraries of the testkit make graph spaces, and the property P16 checks the axes against the edges.
