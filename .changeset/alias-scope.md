---
"@mark1russell7/vex-compiler": patch
---

The printer keeps an alias that a nested block declares again. Before this fix, a fold that stops and has a step at the origin gave `VEX_ERROR` in a standalone module (V-073).
