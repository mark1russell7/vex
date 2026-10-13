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
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14;
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
    l9 = keys_(l0);
    L1: for (l10 = 0; l10 < l9.length; l10++) {
      l11 = l9[l10];
      if ((l11 === l1)) {
        continue;
      }
      if (!(l6)) continue L1; // a binding with a value
      l12 = l0.get(l11);
      if (!((l12 !== undefined && l12 !== null))) continue L1; // a record
      if (!((typeof l12 === "object" || typeof l12 === "function"))) continue L1; // an object
      l12 = l12[k0];
      if (!((l12 !== undefined && l12 !== null))) continue L1; // a field
      l13 = s1_2(l5, l12);
      if (!((l13 !== F))) continue L1; // an op
      l14 = s2_1(l13);
      if (!((l14 !== F))) continue L1; // an op
      if (!((typeof l14 === "number"))) return F; // a number
      if ((l8 === 0)) {
        l7 = l14;
      } else {
        l7 = Math.min(l7, l14);
      }
      l8 = (l8 + 1);
    }
    if (!((l8 !== 0))) return F; // a list that is not empty
    return l7;
  } catch {
    return F;
  }
};
