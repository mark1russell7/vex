/**
 * The cache of the lists that passed the check of LIST.SHAPE. `isVexList` adds each frozen list that passes its check.
 * The interpreter adds each list that it makes from the items of such lists, because these items passed the check.
 * The package index does not export this module.
 */
export const CHECKED: WeakSet<object> = new WeakSet<object>();
