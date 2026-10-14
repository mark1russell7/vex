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
const mo0 = R.memo();
const mo1 = R.memo();
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20, l21, l22, l23, l24, l25, l26, l27, l28, l29;
  try {
    if (!(has_(l0, l1))) return F; // the origin is a key of the space
    l4 = mo0.get(l0);
    if ((!(l4 !== undefined && l4 !== null))) {
      l6 = false;
      L0: {
        l7 = [];
        l8 = [];
        l9 = l0.records;
        l10 = keys_(l0);
        L1: for (l11 = 0; l11 < l10.length; l11++) {
          l12 = l10[l11];
          l13 = (l9 !== undefined ? l9[l11] : l0.get(l12));
          if (!((l13 !== undefined && l13 !== null))) return F; // a record
          if (!((typeof l13 === "object" || typeof l13 === "function"))) return F; // an object
          l13 = l13[k0];
          if (!((l13 !== undefined && l13 !== null))) return F; // a field
          l7.push(l12);
          l8.push(l13);
        }
        l14 = list_(l7, l8);
        l5 = l14;
        l6 = true;
      }
      l4 = mo0.put(l0, l5, l6);
    }
    if (!(l4.ok)) return F; // a value of the memo
    l15 = l4.v;
    l16 = mo1.get(l0);
    if ((!(l16 !== undefined && l16 !== null))) {
      l18 = false;
      L2: {
        l20 = 0;
        l21 = l0.records;
        l22 = keys_(l0);
        L3: for (l23 = 0; l23 < l22.length; l23++) {
          l24 = l22[l23];
          l25 = (l21 !== undefined ? l21[l23] : l0.get(l24));
          if (!((l25 !== undefined && l25 !== null))) return F; // a record
          if (!((typeof l25 === "object" || typeof l25 === "function"))) return F; // an object
          l25 = l25[k0];
          if (!((l25 !== undefined && l25 !== null))) return F; // a field
        }
        l26 = frozen_([]);
        l17 = l26;
        l18 = true;
      }
      l16 = mo1.put(l0, l17, l18);
    }
    if (!(l16.ok)) return F; // a value of the memo
    l27 = l16.v;
    l28 = ext_(k1, k2, l0, l1, l1, k3);
    if (!((l28 !== F))) return F; // an extension
    l29 = rec_(k4, [l15, l27, l28]);
    return l29;
  } catch {
    return F;
  }
};
