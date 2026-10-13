"use strict";
const F = R.F;
const has_ = R.has;
const keys_ = R.keys;
const k0 = K[0];
const k1 = K[1];
const k2 = K[2];
const s1_2 = R.site(k1, 2);
const s2_1 = R.site(k2, 1);
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15;
  try {
    if (!(has_(l0, l1))) return F; // the origin is a key of the space
    l6 = false;
    L0: {
      l4 = l0.get(l1);
      if (!((l4 !== undefined && l4 !== null))) break L0; // a record
      if (!((typeof l4 === "object" || typeof l4 === "function"))) break L0; // an object
      l4 = l4[k0];
      if (!((l4 !== undefined && l4 !== null))) break L0; // a field
      l5 = l4;
      l6 = true;
    }
    l8 = 0;
    l9 = l0.records;
    l10 = keys_(l0);
    L1: for (l11 = 0; l11 < l10.length; l11++) {
      l12 = l10[l11];
      if ((l12 === l1)) {
        continue;
      }
      if (!(l6)) continue L1; // a binding with a value
      l13 = (l9 !== undefined ? l9[l11] : l0.get(l12));
      if (!((l13 !== undefined && l13 !== null))) continue L1; // a record
      if (!((typeof l13 === "object" || typeof l13 === "function"))) continue L1; // an object
      l13 = l13[k0];
      if (!((l13 !== undefined && l13 !== null))) continue L1; // a field
      l14 = s1_2(l5, l13);
      if (!((l14 !== F))) continue L1; // an op
      l15 = s2_1(l14);
      if (!((l15 !== F))) continue L1; // an op
      if (!((typeof l15 === "number"))) return F; // a number
      if ((l8 === 0)) {
        l7 = l15;
      } else {
        l7 = Math.min(l7, l15);
      }
      l8 = (l8 + 1);
    }
    if (!((l8 !== 0))) return F; // a list that is not empty
    return l7;
  } catch {
    return F;
  }
};
