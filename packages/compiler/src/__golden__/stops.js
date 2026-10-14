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
    l4 = mo0.get(l0, []);
    if ((!(l4 !== undefined && l4 !== null))) {
      l14 = false;
      L0: {
        l5 = [];
        l6 = [];
        l7 = l0.records;
        l8 = keys_(l0);
        L1: for (l9 = 0; l9 < l8.length; l9++) {
          l10 = l8[l9];
          l11 = (l7 !== undefined ? l7[l9] : l0.get(l10));
          if (!((l11 !== undefined && l11 !== null))) return F; // a record
          if (!((typeof l11 === "object" || typeof l11 === "function"))) return F; // an object
          l11 = l11[k0];
          if (!((l11 !== undefined && l11 !== null))) return F; // a field
          l5.push(l10);
          l6.push(l11);
        }
        l12 = list_(l5, l6);
        l13 = l12;
        l14 = true;
      }
      l4 = mo0.put(l0, [], l13, l14);
    }
    if (!(l4.ok)) return F; // a value of the memo
    l15 = l4.v;
    l16 = mo1.get(l0, []);
    if ((!(l16 !== undefined && l16 !== null))) {
      l26 = false;
      L2: {
        l18 = 0;
        l19 = l0.records;
        l20 = keys_(l0);
        L3: for (l21 = 0; l21 < l20.length; l21++) {
          l22 = l20[l21];
          l23 = (l19 !== undefined ? l19[l21] : l0.get(l22));
          if (!((l23 !== undefined && l23 !== null))) return F; // a record
          if (!((typeof l23 === "object" || typeof l23 === "function"))) return F; // an object
          l23 = l23[k0];
          if (!((l23 !== undefined && l23 !== null))) return F; // a field
        }
        l24 = frozen_([]);
        l25 = l24;
        l26 = true;
      }
      l16 = mo1.put(l0, [], l25, l26);
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
