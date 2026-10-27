/**
 * The check of the names `as` of a loop over the axis `list` (AXIS.LIST.SCOPE). The package index does not export this
 * module: `isExpr`, `shapeError` and `fromDocument` use it, so an expression and a document follow the same rule.
 */

const isObject = (u: unknown): u is Readonly<Record<string, unknown>> => typeof u === "object" && u !== null;

/** This function tells if the base axis of an axis is `list`, through `where` and `reverse`. It uses a loop, not recursion. */
function isListAxis(u: unknown): boolean {
  let x = u;
  while (isObject(x) && x["t"] === "where") x = x["axis"];
  if (isObject(x) && x["t"] === "reverse") x = x["axis"];
  return isObject(x) && x["t"] === "list";
}

/**
 * This function gives the reason that the names `as` of a loop are not valid, or `undefined` for valid names or no
 * names (AXIS.LIST.SCOPE). The names are one or two distinct texts, the axis is `list`, and no name is a name of `init`.
 */
export function itemNamesError(u: Readonly<Record<string, unknown>>): string | undefined {
  const as = u["as"];
  if (as === undefined) return undefined;
  if (!Array.isArray(as) || as.length === 0 || as.length > 2 || !as.every((n) => typeof n === "string")) return '"as" is a list of one or two names: the item, and then its index';
  if (as[0] === as[1]) return `the two names of "as" are the same name "${String(as[0])}"`;
  if (!isListAxis(u["axis"])) return '"as" needs the axis "list", also inside "reverse" and "where"';
  const init = u["init"];
  const clash = isObject(init) ? (as as readonly string[]).find((n) => Object.hasOwn(init, n)) : undefined;
  return clash === undefined ? undefined : `the name "${clash}" of "as" is a name of "init" too`;
}
