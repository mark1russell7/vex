"use strict";
const F = R.F;
const has_ = R.has;
const keys_ = R.keys;
const list_ = R.list;
const frozen_ = R.frozen;
const ext_ = R.ext;
const rec_ = R.rec;
const k0 = K[0];
const k1 = K[1];
const k2 = K[2];
const k3 = K[3];
const k4 = K[4];
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19;
  try {
    if (!(has_(l0, l1))) return F; // the origin is a key of the space
    l4 = [];
    l5 = [];
    l6 = keys_(l0);
    L0: for (l7 = 0; l7 < l6.length; l7++) {
      l8 = l6[l7];
      l9 = l0.get(l8);
      if (!((l9 !== undefined && l9 !== null))) return F; // a record
      if (!((typeof l9 === "object" || typeof l9 === "function"))) return F; // an object
      l9 = l9[k0];
      if (!((l9 !== undefined && l9 !== null))) return F; // a field
      l4.push(l8);
      l5.push(l9);
    }
    l10 = list_(l4, l5);
    l12 = 0;
    l13 = keys_(l0);
    L1: for (l14 = 0; l14 < l13.length; l14++) {
      l15 = l13[l14];
      l16 = l0.get(l15);
      if (!((l16 !== undefined && l16 !== null))) return F; // a record
      if (!((typeof l16 === "object" || typeof l16 === "function"))) return F; // an object
      l16 = l16[k0];
      if (!((l16 !== undefined && l16 !== null))) return F; // a field
    }
    l17 = frozen_([]);
    l18 = ext_(k1, k2, l0, l1, l1, k3);
    if (!((l18 !== F))) return F; // an extension
    l19 = rec_(k4, [l10, l17, l18]);
    return l19;
  } catch {
    return F;
  }
};
