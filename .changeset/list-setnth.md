---
"@mark1russell7/vex": patch
"@mark1russell7/vex-domains": patch
"@mark1russell7/vex-testkit": patch
"@mark1russell7/vex-compiler": patch
"@mark1russell7/vex-mcp": patch
---

The new list op `setNth(list, i, value)` gives a list with a new value at one position (LIST.SETNTH). The item keeps its key. The op works in the interpreter, in tier 2 and in a standalone module, and a list chain has `setNth(i, value)`. Its size rule counts the list and the value one time each (LOOP.SIZE.SETNTH).
