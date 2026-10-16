/**
 * The catalog of the skill of Vex (`plugins/vex/skills/vex/reference/catalog.md`). This test writes the text of
 * `catalogText`, so the file and the code cannot differ. After a change of a domain, start `vitest run -u`.
 */
import { expect, it } from "vitest";
import { catalogText } from "./catalog.ts";

it("the catalog of the skill: the domains, their ops, and the result of each op", async () => {
  await expect(catalogText()).toMatchFileSnapshot("../../../plugins/vex/skills/vex/reference/catalog.md");
});
