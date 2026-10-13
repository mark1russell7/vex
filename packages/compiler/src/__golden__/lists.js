"use strict";
const F = R.F;
const has_ = R.has;
const opts_ = R.opts;
const table_ = R.table;
const keys_ = R.keys;
const result_ = R.result;
const frozen_ = R.frozen;
const step_ = R.step;
const addr_ = R.addr;
const rec_ = R.rec;
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
const k10 = K[10];
const k11 = K[11];
const k12 = K[12];
const a5 = R.axis(k5);
const a8 = R.axis(k8);
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20, l21, l22, l23, l24, l25, l26, l27, l28, l29, l30, l31, l32, l33, l34, l35, l36, l37, l38, l39, l40, l41, l42, l43, l44, l45, l46, l47, l48, l49, l50, l51, l52, l53, l54, l55, l56, l57, l58, l59, l60, l61, l62, l63, l64, l65, l66, l67, l68, l69, l70, l71, l72, l73, l74, l75, l76, l77, l78, l79;
  try {
    if (!(has_(l0, l1))) return F; // the origin is a key of the space
    l4 = (opts_(k0) === true);
    l6 = 0;
    l5 = 0;
    l7 = table_(l3, k1);
    if (!((l7 !== F))) return F; // a table
    l8 = l7.records;
    l9 = keys_(l7);
    L0: for (l10 = 0; l10 < l9.length; l10++) {
      l11 = l9[l10];
      l12 = (l8 !== undefined ? l8[l10] : l7.get(l11));
      if (!((l12 !== undefined && l12 !== null))) { if (l4) return F; continue L0; } // a record
      if (!((typeof l12 === "object" || typeof l12 === "function"))) { if (l4) return F; continue L0; } // an object
      l12 = l12[k2];
      if (!((l12 !== undefined && l12 !== null))) { if (l4) return F; continue L0; } // a field
      if (!((typeof l12 === "boolean"))) { if (l4) return F; continue L0; } // a boolean
      if ((!l12)) {
        continue;
      }
      l13 = (l8 !== undefined ? l8[l10] : l7.get(l11));
      if (!((l13 !== undefined && l13 !== null))) { if (l4) return F; continue L0; } // a record
      if (!((typeof l13 === "object" || typeof l13 === "function"))) { if (l4) return F; continue L0; } // an object
      l13 = l13[k3];
      if (!((l13 !== undefined && l13 !== null))) { if (l4) return F; continue L0; } // a field
      if (!((typeof l13 === "number"))) return F; // a number
      l5 = (l5 + l13);
      l6 = (l6 + 1);
    }
    l14 = result_(l5);
    if (!((l14 !== F))) return F; // a finite sum
    l16 = 0;
    l15 = [];
    l17 = l0.records;
    l18 = keys_(l0);
    L1: for (l19 = 0; l19 < l18.length; l19++) {
      l20 = l18[l19];
      if ((l20 === l1)) {
        continue;
      }
      l21 = (l17 !== undefined ? l17[l19] : l0.get(l20));
      if (!((l21 !== undefined && l21 !== null))) continue L1; // a record
      if (!((typeof l21 === "object" || typeof l21 === "function"))) continue L1; // an object
      l21 = l21[k3];
      if (!((l21 !== undefined && l21 !== null))) continue L1; // a field
      l15.push(l20);
    }
    l22 = frozen_(l15);
    if (!((typeof k4 === "string"))) return F; // an op name
    l24 = 0;
    l25 = a5(l0, l1, l1);
    if (!((l25 !== F))) return F; // the targets of an axis
    l26 = l25.idx;
    l27 = l0.records;
    l28 = l25.keys;
    L2: for (l29 = 0; l29 < l28.length; l29++) {
      l30 = l28[l29];
      l31 = (l27 !== undefined ? l27[l26[l29]] : l0.get(l30));
      if (!((l31 !== undefined && l31 !== null))) continue L2; // a record
      if (!((typeof l31 === "object" || typeof l31 === "function"))) continue L2; // an object
      l31 = l31[k6];
      if (!((l31 !== undefined && l31 !== null))) continue L2; // a field
      if ((l24 === 0)) {
        l23 = l31;
      } else {
        l32 = step_(k4, l23, l31);
        if (!((l32 !== F))) return F; // a step of reduce
        l23 = l32;
      }
      l24 = (l24 + 1);
    }
    if (!((l24 !== 0))) return F; // a list that is not empty
    l34 = 0;
    l33 = false;
    l35 = l0.records;
    l36 = keys_(l0);
    L3: for (l37 = 0; l37 < l36.length; l37++) {
      l38 = l36[l37];
      l39 = (l35 !== undefined ? l35[l37] : l0.get(l38));
      if (!((l39 !== undefined && l39 !== null))) continue L3; // a record
      if (!((typeof l39 === "object" || typeof l39 === "function"))) continue L3; // an object
      l39 = l39[k7];
      if (!((l39 !== undefined && l39 !== null))) continue L3; // a field
      if (!((typeof l39 === "boolean"))) return F; // a boolean
      l33 = (l33 || l39);
    }
    l41 = 0;
    l40 = 0;
    l42 = a8(l0, l1, l1);
    if (!((l42 !== F))) return F; // the targets of an axis
    l43 = l42.idx;
    l44 = l0.records;
    l45 = l42.keys;
    L4: for (l46 = 0; l46 < l45.length; l46++) {
      l47 = l45[l46];
      l48 = (l44 !== undefined ? l44[l43[l46]] : l0.get(l47));
      if (!((l48 !== undefined && l48 !== null))) continue L4; // a record
      if (!((typeof l48 === "object" || typeof l48 === "function"))) continue L4; // an object
      l48 = l48[k3];
      if (!((l48 !== undefined && l48 !== null))) continue L4; // a field
      if (!((typeof l48 === "number"))) return F; // a number
      l40 = (l40 + l48);
      l41 = (l41 + 1);
    }
    if (!((l41 !== 0))) return F; // a list that is not empty
    l49 = result_((l40 / l41));
    if (!((l49 !== F))) return F; // a finite mean
    l51 = 0;
    l52 = l0.records;
    l53 = keys_(l0);
    L5: for (l54 = 0; l54 < l53.length; l54++) {
      l55 = l53[l54];
      l56 = (l52 !== undefined ? l52[l54] : l0.get(l55));
      if (!((l56 !== undefined && l56 !== null))) continue L5; // a record
      if (!((typeof l56 === "object" || typeof l56 === "function"))) continue L5; // an object
      l56 = l56[k3];
      if (!((l56 !== undefined && l56 !== null))) continue L5; // a field
      l51 = (l51 + 1);
    }
    l58 = 0;
    l59 = l0.records;
    l60 = keys_(l0);
    L6: for (l61 = 0; l61 < l60.length; l61++) {
      l62 = l60[l61];
      l63 = (opts_(k9) === true);
      l65 = 0;
      l66 = l0.records;
      l67 = keys_(l0);
      L7: for (l68 = 0; l68 < l67.length; l68++) {
        l69 = l67[l68];
        l70 = (l66 !== undefined ? l66[l68] : l0.get(l69));
        if (!((l70 !== undefined && l70 !== null))) { if (l63) continue L6; continue L7; } // a record
        if (!((typeof l70 === "object" || typeof l70 === "function"))) { if (l63) continue L6; continue L7; } // an object
        l70 = l70[k10];
        if (!((l70 !== undefined && l70 !== null))) { if (l63) continue L6; continue L7; } // a field
        l65 = (l65 + 1);
      }
      l58 = (l58 + 1);
    }
    l72 = 0;
    l73 = addr_(l0, l1, l1, k11);
    if (!((l73 !== F))) return F; // an address
    l74 = l0.records;
    l75 = keys_(l0);
    L8: for (l76 = 0; l76 < l75.length; l76++) {
      l77 = l75[l76];
      if ((l77 === l73)) {
        continue;
      }
      l78 = (l74 !== undefined ? l74[l76] : l0.get(l77));
      if (!((l78 !== undefined && l78 !== null))) continue L8; // a record
      if (!((typeof l78 === "object" || typeof l78 === "function"))) continue L8; // an object
      l78 = l78[k3];
      if (!((l78 !== undefined && l78 !== null))) continue L8; // a field
      l72 = (l72 + 1);
    }
    l79 = rec_(k12, [l14, l22, l23, (!l33), l49, l51, l58, l72]);
    return l79;
  } catch {
    return F;
  }
};
