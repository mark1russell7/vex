# Changesets

A changeset records a change to a published package and the version step that it needs. To add one, start `pnpm changeset` and answer the questions. For a release, `pnpm changeset version` reads the changesets, sets the versions and writes the change logs. `RELEASING.md` gives the steps.

The four packages `@mark1russell7/vex`, `@mark1russell7/vex-domains`, `@mark1russell7/vex-testkit` and `@mark1russell7/vex-compiler` have one version together. `@mark1russell7/vex-mcp` has its own version from 0.14.0, because the release train changes the ranges of its `@procedures` dependencies.
