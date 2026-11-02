/**
 * The time-out of a test with properties. This file is the one source of it: each `vitest.config.ts` and each property
 * block with its own time-out get it from `propertyTimeout`. The package does not export it, and npm does not get it.
 */

/** The time budget of each property in the weekly run, in ms, when `FC_TIME_LIMIT_MS` does not give one. */
export const PROPERTY_BUDGET_MS = 600_000;

/** The time that a test has for its setup and its checks after its properties, in ms. */
export const SETUP_MARGIN_MS = 300_000;

/**
 * This function gives the time-out of a test with properties, in ms. Without `FC_NUM_RUNS`, the time-out is `normal`.
 * With it (the nightly and the weekly runs), the time-out is the budget of a property plus the setup margin.
 */
export function propertyTimeout(normal: number, env: Readonly<Record<string, string | undefined>> = process.env): number {
  if (env["FC_NUM_RUNS"] === undefined) return normal;
  const budget = env["FC_TIME_LIMIT_MS"] === undefined ? PROPERTY_BUDGET_MS : Number(env["FC_TIME_LIMIT_MS"]);
  return Math.max(normal, budget + SETUP_MARGIN_MS);
}
