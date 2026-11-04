"use strict";
const F = R.F;
const has_ = R.has;
const raise_ = R.raise;
const err_ = R.err;
const k2 = K[2];
const k4 = K[4];
const a2 = R.axis(k2);
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14;
  try {
    if (!(has_(l0, l1))) return raise_(err_(K[0], l1, l1)); // the origin is a key of the space
    l6 = 0;
    l7 = a2(l0, l1, l1);
    if (!((l7 !== F))) return raise_(err_(K[3], l1, l1, l0, l1)); // the targets of an axis
    l8 = l7.idx;
    l9 = l0.records;
    l10 = l7.keys;
    L1: for (l11 = 0; l11 < l10.length; l11++) {
      l12 = l10[l11];
      l13 = (l9 !== undefined ? l9[l8[l11]] : l0.get(l12));
      if (!((l13 !== undefined && l13 !== null))) continue L1; // a record
      if (!((typeof l13 === "object" || typeof l13 === "function"))) continue L1; // an object
      l13 = l13[k4];
      if (!((l13 !== undefined && l13 !== null))) continue L1; // a field
      if (!((typeof l13 === "boolean"))) continue L1; // a boolean
      if ((!l13)) {
        continue;
      }
      l14 = (l9 !== undefined ? l9[l8[l11]] : l0.get(l12));
      if (!((l14 !== undefined && l14 !== null))) continue L1; // a record
      if (!((typeof l14 === "object" || typeof l14 === "function"))) continue L1; // an object
      l14 = l14[k4];
      if (!((l14 !== undefined && l14 !== null))) continue L1; // a field
      l6 = (l6 + 1);
    }
    return l6;
  } catch {
    return F;
  }
};
