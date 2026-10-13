"use strict";
const F = R.F;
const has_ = R.has;
const k1 = K[1];
const k2 = K[2];
const a1 = R.axis(k1);
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11;
  try {
    if (!(has_(l0, l1))) return F; // the origin is a key of the space
    l5 = 0;
    l6 = a1(l0, l1, l1);
    if (!((l6 !== F))) return F; // the targets of an axis
    l7 = l6;
    L1: for (l8 = 0; l8 < l7.length; l8++) {
      l9 = l7[l8];
      l10 = l0.get(l9);
      if (!((l10 !== undefined && l10 !== null))) continue L1; // a record
      if (!((typeof l10 === "object" || typeof l10 === "function"))) continue L1; // an object
      l10 = l10[k2];
      if (!((l10 !== undefined && l10 !== null))) continue L1; // a field
      if (!((typeof l10 === "boolean"))) continue L1; // a boolean
      if ((!l10)) {
        continue;
      }
      l11 = l0.get(l9);
      if (!((l11 !== undefined && l11 !== null))) continue L1; // a record
      if (!((typeof l11 === "object" || typeof l11 === "function"))) continue L1; // an object
      l11 = l11[k2];
      if (!((l11 !== undefined && l11 !== null))) continue L1; // a field
      l5 = (l5 + 1);
    }
    return l5;
  } catch {
    return F;
  }
};
