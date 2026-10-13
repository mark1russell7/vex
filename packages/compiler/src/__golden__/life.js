"use strict";
const F = R.F;
const has_ = R.has;
const k1 = K[1];
const k2 = K[2];
const a1 = R.axis(k1);
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13;
  try {
    if (!(has_(l0, l1))) return F; // the origin is a key of the space
    l5 = 0;
    l6 = a1(l0, l1, l1);
    if (!((l6 !== F))) return F; // the targets of an axis
    l7 = l6.idx;
    l8 = l0.records;
    l9 = l6.keys;
    L1: for (l10 = 0; l10 < l9.length; l10++) {
      l11 = l9[l10];
      l12 = (l8 !== undefined ? l8[l7[l10]] : l0.get(l11));
      if (!((l12 !== undefined && l12 !== null))) continue L1; // a record
      if (!((typeof l12 === "object" || typeof l12 === "function"))) continue L1; // an object
      l12 = l12[k2];
      if (!((l12 !== undefined && l12 !== null))) continue L1; // a field
      if (!((typeof l12 === "boolean"))) continue L1; // a boolean
      if ((!l12)) {
        continue;
      }
      l13 = (l8 !== undefined ? l8[l7[l10]] : l0.get(l11));
      if (!((l13 !== undefined && l13 !== null))) continue L1; // a record
      if (!((typeof l13 === "object" || typeof l13 === "function"))) continue L1; // an object
      l13 = l13[k2];
      if (!((l13 !== undefined && l13 !== null))) continue L1; // a field
      l5 = (l5 + 1);
    }
    return l5;
  } catch {
    return F;
  }
};
