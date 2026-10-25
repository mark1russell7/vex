/**
 * The load of the modules of the core. The other test files import the modules before their tests. Thus a module that
 * throws when it loads stops those files, but it fails no test there. This file loads the modules inside a test, so the
 * mutation lane sees a module that does not load.
 */
import { expect, it } from "vitest";

it("DOC.CHECK: the modules of the core load inside a test, and the world of Vex has its kinds", async () => {
  const core = await import("./index.ts");
  expect(Object.keys(core.VEX_WORLD.kinds).toSorted()).toEqual(["axes", "call", "each", "ext", "fn", "fold", "iterate", "let", "lit", "moves", "ops", "record", "ref"]);
  expect(Object.keys((core.VEX_WORLD.kinds["axes"] as { readonly kinds: object }).kinds)).toHaveLength(16);
});
