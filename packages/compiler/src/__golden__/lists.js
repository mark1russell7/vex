"use strict";
const F = R.F;
const frozen_ = R.frozen;
const has_ = R.has;
const keys_ = R.keys;
const opts_ = R.opts;
const rec_ = R.rec;
const result_ = R.result;
const step_ = R.step;
const table_ = R.table;
const k0 = K[0];
const k1 = K[1];
const k2 = K[2];
const k3 = K[3];
const k4 = K[4];
const k5 = K[5];
const k6 = K[6];
const k7 = K[7];
const k8 = K[8];
const k9 = K[9];
const a5 = R.axis(k5);
const a8 = R.axis(k8);
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20, l21, l22, l23, l24, l25, l26, l27, l28, l29, l30, l31, l32, l33, l34, l35, l36, l37, l38, l39, l40, l41, l42, l43;
  try {
    if (!(has_(l0, l1))) return F; // the origin is a key of the space
    l4 = (opts_(k0) === true);
    l6 = 0;
    l5 = 0;
    l7 = table_(l3, k1);
    if (!((l7 !== F))) return F; // a table
    l8 = keys_(l7);
    L0: for (l9 = 0; l9 < l8.length; l9++) {
      l10 = l8[l9];
      l11 = l7.get(l10);
      if (!((l11 !== undefined && l11 !== null))) { if (l4) return F; continue L0; } // a record
      if (!((typeof l11 === "object" || typeof l11 === "function"))) { if (l4) return F; continue L0; } // an object
      l11 = l11[k2];
      if (!((l11 !== undefined && l11 !== null))) { if (l4) return F; continue L0; } // a field
      if (!((typeof l11 === "boolean"))) { if (l4) return F; continue L0; } // a boolean
      if ((!l11)) {
        continue;
      }
      l12 = l7.get(l10);
      if (!((l12 !== undefined && l12 !== null))) { if (l4) return F; continue L0; } // a record
      if (!((typeof l12 === "object" || typeof l12 === "function"))) { if (l4) return F; continue L0; } // an object
      l12 = l12[k3];
      if (!((l12 !== undefined && l12 !== null))) { if (l4) return F; continue L0; } // a field
      if (!((typeof l12 === "number"))) return F; // a number
      l5 = (l5 + l12);
      l6 = (l6 + 1);
    }
    l13 = result_(l5);
    if (!((l13 !== F))) return F; // a finite sum
    l15 = 0;
    l14 = [];
    l16 = keys_(l0);
    L1: for (l17 = 0; l17 < l16.length; l17++) {
      l18 = l16[l17];
      if ((l18 === l1)) {
        continue;
      }
      l19 = l0.get(l18);
      if (!((l19 !== undefined && l19 !== null))) continue L1; // a record
      if (!((typeof l19 === "object" || typeof l19 === "function"))) continue L1; // an object
      l19 = l19[k3];
      if (!((l19 !== undefined && l19 !== null))) continue L1; // a field
      l14.push(l18);
    }
    l20 = frozen_(l14);
    if (!((typeof k4 === "string"))) return F; // an op name
    l22 = 0;
    l23 = a5(l0, l1, l1);
    if (!((l23 !== F))) return F; // the targets of an axis
    l24 = l23;
    L2: for (l25 = 0; l25 < l24.length; l25++) {
      l26 = l24[l25];
      l27 = l0.get(l26);
      if (!((l27 !== undefined && l27 !== null))) continue L2; // a record
      if (!((typeof l27 === "object" || typeof l27 === "function"))) continue L2; // an object
      l27 = l27[k6];
      if (!((l27 !== undefined && l27 !== null))) continue L2; // a field
      if ((l22 === 0)) {
        l21 = l27;
      } else {
        l28 = step_(k4, l21, l27);
        if (!((l28 !== F))) return F; // a step of reduce
        l21 = l28;
      }
      l22 = (l22 + 1);
    }
    if (!((l22 !== 0))) return F; // a list that is not empty
    l30 = 0;
    l29 = false;
    l31 = keys_(l0);
    L3: for (l32 = 0; l32 < l31.length; l32++) {
      l33 = l31[l32];
      l34 = l0.get(l33);
      if (!((l34 !== undefined && l34 !== null))) continue L3; // a record
      if (!((typeof l34 === "object" || typeof l34 === "function"))) continue L3; // an object
      l34 = l34[k7];
      if (!((l34 !== undefined && l34 !== null))) continue L3; // a field
      if (!((typeof l34 === "boolean"))) return F; // a boolean
      l29 = (l29 || l34);
    }
    l36 = 0;
    l35 = 0;
    l37 = a8(l0, l1, l1);
    if (!((l37 !== F))) return F; // the targets of an axis
    l38 = l37;
    L4: for (l39 = 0; l39 < l38.length; l39++) {
      l40 = l38[l39];
      l41 = l0.get(l40);
      if (!((l41 !== undefined && l41 !== null))) continue L4; // a record
      if (!((typeof l41 === "object" || typeof l41 === "function"))) continue L4; // an object
      l41 = l41[k3];
      if (!((l41 !== undefined && l41 !== null))) continue L4; // a field
      if (!((typeof l41 === "number"))) return F; // a number
      l35 = (l35 + l41);
      l36 = (l36 + 1);
    }
    if (!((l36 !== 0))) return F; // a list that is not empty
    l42 = result_((l35 / l36));
    if (!((l42 !== F))) return F; // a finite mean
    l43 = rec_(k9, [l13, l20, l21, (!l29), l42]);
    return l43;
  } catch {
    return F;
  }
};
