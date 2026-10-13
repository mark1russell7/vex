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
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20, l21;
  try {
    if (!(has_(l0, l1))) return F; // the origin is a key of the space
    l4 = [];
    l5 = [];
    l6 = l0.records;
    l7 = keys_(l0);
    L0: for (l8 = 0; l8 < l7.length; l8++) {
      l9 = l7[l8];
      l10 = (l6 !== undefined ? l6[l8] : l0.get(l9));
      if (!((l10 !== undefined && l10 !== null))) return F; // a record
      if (!((typeof l10 === "object" || typeof l10 === "function"))) return F; // an object
      l10 = l10[k0];
      if (!((l10 !== undefined && l10 !== null))) return F; // a field
      l4.push(l9);
      l5.push(l10);
    }
    l11 = list_(l4, l5);
    l13 = 0;
    l14 = l0.records;
    l15 = keys_(l0);
    L1: for (l16 = 0; l16 < l15.length; l16++) {
      l17 = l15[l16];
      l18 = (l14 !== undefined ? l14[l16] : l0.get(l17));
      if (!((l18 !== undefined && l18 !== null))) return F; // a record
      if (!((typeof l18 === "object" || typeof l18 === "function"))) return F; // an object
      l18 = l18[k0];
      if (!((l18 !== undefined && l18 !== null))) return F; // a field
    }
    l19 = frozen_([]);
    l20 = ext_(k1, k2, l0, l1, l1, k3);
    if (!((l20 !== F))) return F; // an extension
    l21 = rec_(k4, [l11, l19, l20]);
    return l21;
  } catch {
    return F;
  }
};
