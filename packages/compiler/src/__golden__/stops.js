"use strict";
const F = R.F;
const has_ = R.has;
const raise_ = R.raise;
const err_ = R.err;
const keys_ = R.keys;
const list_ = R.list;
const frozen_ = R.frozen;
const ext_ = R.ext;
const args_ = R.args;
const rec_ = R.rec;
const k1 = K[1];
const k2 = K[2];
const k3 = K[3];
const k4 = K[4];
const k8 = K[8];
const mo0 = R.memo();
const mo1 = R.memo();
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20, l21, l22, l23, l24, l25, l26, l27, l28, l29, l30, l31, l32, l33, l34, l35, l36, l37, l38, l39, l40, l41, l42, l43, l44, l45, l46, l47, l48, l49, l50, l51, l52, l53, l54, l55, l56, l57, l58, l59;
  try {
    if (!(has_(l0, l1))) return raise_(err_(K[0], l1, l1)); // the origin is a key of the space
    L10: {
      l5 = mo0.get(l0, []);
      if ((!(l5 !== undefined && l5 !== null))) {
        l15 = false;
        l7 = [];
        l8 = [];
        l9 = l0.records;
        l10 = keys_(l0);
        L2: for (l11 = 0; l11 < l10.length; l11++) {
          l12 = l10[l11];
          l13 = (l9 !== undefined ? l9[l11] : l0.get(l12));
          if (!((l13 !== undefined && l13 !== null))) return F; // a record
          if (!((typeof l13 === "object" || typeof l13 === "function"))) return F; // an object
          l13 = l13[k1];
          if (!((l13 !== undefined && l13 !== null))) return F; // a field
          l7.push(l12);
          l8.push(l13);
        }
        l14 = list_(l7, l8);
        l6 = l14;
        l15 = true;
        l5 = mo0.put(l0, [], l6, l15);
      }
      if ((!l5.ok)) {
        l16 = [];
        l17 = [];
        l18 = l0.records;
        l19 = keys_(l0);
        L3: for (l20 = 0; l20 < l19.length; l20++) {
          l21 = l19[l20];
          l22 = (l18 !== undefined ? l18[l20] : l0.get(l21));
          if (!((l22 !== undefined && l22 !== null))) return F; // a record
          if (!((typeof l22 === "object" || typeof l22 === "function"))) return F; // an object
          l22 = l22[k1];
          if (!((l22 !== undefined && l22 !== null))) return F; // a field
          l16.push(l21);
          l17.push(l22);
        }
        l23 = list_(l16, l17);
        if (!(l5.ok)) return F; // a value of the memo
      }
      l24 = l5.v;
      l26 = mo1.get(l0, []);
      if ((!(l26 !== undefined && l26 !== null))) {
        l36 = false;
        l29 = 0;
        l30 = l0.records;
        l31 = keys_(l0);
        L5: for (l32 = 0; l32 < l31.length; l32++) {
          l33 = l31[l32];
          l34 = (l30 !== undefined ? l30[l32] : l0.get(l33));
          if (!((l34 !== undefined && l34 !== null))) return F; // a record
          if (!((typeof l34 === "object" || typeof l34 === "function"))) return F; // an object
          l34 = l34[k1];
          if (!((l34 !== undefined && l34 !== null))) return F; // a field
        }
        l35 = frozen_([]);
        l27 = l35;
        l36 = true;
        l26 = mo1.put(l0, [], l27, l36);
      }
      if ((!l26.ok)) {
        l38 = 0;
        l39 = l0.records;
        l40 = keys_(l0);
        L6: for (l41 = 0; l41 < l40.length; l41++) {
          l42 = l40[l41];
          l43 = (l39 !== undefined ? l39[l41] : l0.get(l42));
          if (!((l43 !== undefined && l43 !== null))) return F; // a record
          if (!((typeof l43 === "object" || typeof l43 === "function"))) return F; // an object
          l43 = l43[k1];
          if (!((l43 !== undefined && l43 !== null))) return F; // a field
        }
        l44 = frozen_([]);
        if (!(l26.ok)) return F; // a value of the memo
      }
      l45 = l26.v;
      l47 = ext_(k2, k3, l0, l1, l1, k4);
      L0: {
        if (!((l47 !== F))) { l46 = err_(K[5], l1, l1); break L0; } // an extension
        break L10;
      }
      if ((((l4 !== undefined && l4 !== null) || (l25 !== undefined && l25 !== null)) || (l46 !== undefined && l46 !== null))) {
        l48 = (l4 !== undefined && l4 !== null);
        if (l48) {
          l50 = 0;
          l51 = l0.records;
          l52 = keys_(l0);
          L8: for (l53 = 0; l53 < l52.length; l53++) {
            l54 = l52[l53];
            l55 = (l51 !== undefined ? l51[l53] : l0.get(l54));
            if (!((l55 !== undefined && l55 !== null))) return F; // a record
            if (!((typeof l55 === "object" || typeof l55 === "function"))) return F; // an object
            l55 = l55[k1];
            if (!((l55 !== undefined && l55 !== null))) return F; // a field
          }
          l56 = frozen_([]);
        }
        l48 = (l48 || (l25 !== undefined && l25 !== null));
        if (l48) {
          l57 = ext_(k2, k3, l0, l1, l1, k4);
          L9: {
            if (!((l57 !== F))) { l46 = err_(K[6], l1, l1); break L9; } // an extension
          }
        }
        l58 = args_(K[7], l1, l1, [l4, l25, l46]);
        l4 = undefined;
        l25 = undefined;
        l46 = undefined;
        return raise_(l58);
      }
    }
    l59 = rec_(k8, [l24, l45, l47]);
    return l59;
  } catch {
    return F;
  }
};
