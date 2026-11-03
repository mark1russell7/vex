import { isDepthError, vexError, type ErrorDetails, type VexError } from "./errors.ts";

/** This function gives the error that decides for a list of errors: `#DEPTH!`, or else the first (EVAL.DEPTH). */
export const worstError = (errors: readonly VexError[]): VexError | undefined => errors.find(isDepthError) ?? errors[0];

/** This function gives the message of a data limit above the cap (ITERATE.LIMIT.ERROR). */
export const overLimitMessage = (count: number): string => `the data limit of "iterate" is ${String(count)}, above the cap of 100000`;

/**
 * This function gives the error of a data limit that is not valid, with its cause (ITERATE.LIMIT.ERROR). An error of the
 * run stays as it is: the engine failed or a cycle of cells stopped, not the limit.
 */
export const limitError = (cause: VexError, details: Omit<ErrorDetails, "causes"> = {}): VexError =>
  isDepthError(cause) || cause.kind === "cycle" ? cause : vexError("limit", 'the data limit of "iterate" is not valid', { ...details, causes: [cause] });
