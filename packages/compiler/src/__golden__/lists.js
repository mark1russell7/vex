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
const mo0 = R.memo();
const a8 = R.axis(k8);
const mo1 = R.memo();
const mo2 = R.memo();
const mo3 = R.memo();
const mo4 = R.memo();
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20, l21, l22, l23, l24, l25, l26, l27, l28, l29, l30, l31, l32, l33, l34, l35, l36, l37, l38, l39, l40, l41, l42, l43, l44, l45, l46, l47, l48, l49, l50, l51, l52, l53, l54, l55, l56, l57, l58, l59, l60, l61, l62, l63, l64, l65, l66, l67, l68, l69, l70, l71, l72, l73, l74, l75, l76, l77, l78, l79, l80, l81, l82, l83, l84, l85, l86, l87, l88, l89, l90, l91, l92, l93, l94, l95, l96, l97, l98, l99;
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
    l33 = mo0.get(l0);
    if ((!(l33 !== undefined && l33 !== null))) {
      l35 = false;
      L3: {
        l37 = 0;
        l36 = false;
        l38 = l0.records;
        l39 = keys_(l0);
        L4: for (l40 = 0; l40 < l39.length; l40++) {
          l41 = l39[l40];
          l42 = (l38 !== undefined ? l38[l40] : l0.get(l41));
          if (!((l42 !== undefined && l42 !== null))) continue L4; // a record
          if (!((typeof l42 === "object" || typeof l42 === "function"))) continue L4; // an object
          l42 = l42[k7];
          if (!((l42 !== undefined && l42 !== null))) continue L4; // a field
          if (!((typeof l42 === "boolean"))) break L3; // a boolean
          l36 = (l36 || l42);
        }
        l34 = (!l36);
        l35 = true;
      }
      l33 = mo0.put(l0, l34, l35);
    }
    if (!(l33.ok)) return F; // a value of the memo
    l43 = l33.v;
    l45 = 0;
    l44 = 0;
    l46 = a8(l0, l1, l1);
    if (!((l46 !== F))) return F; // the targets of an axis
    l47 = l46.idx;
    l48 = l0.records;
    l49 = l46.keys;
    L5: for (l50 = 0; l50 < l49.length; l50++) {
      l51 = l49[l50];
      l52 = (l48 !== undefined ? l48[l47[l50]] : l0.get(l51));
      if (!((l52 !== undefined && l52 !== null))) continue L5; // a record
      if (!((typeof l52 === "object" || typeof l52 === "function"))) continue L5; // an object
      l52 = l52[k3];
      if (!((l52 !== undefined && l52 !== null))) continue L5; // a field
      if (!((typeof l52 === "number"))) return F; // a number
      l44 = (l44 + l52);
      l45 = (l45 + 1);
    }
    if (!((l45 !== 0))) return F; // a list that is not empty
    l53 = result_((l44 / l45));
    if (!((l53 !== F))) return F; // a finite mean
    l54 = mo1.get(l0);
    if ((!(l54 !== undefined && l54 !== null))) {
      l56 = false;
      L6: {
        l58 = 0;
        l59 = l0.records;
        l60 = keys_(l0);
        L7: for (l61 = 0; l61 < l60.length; l61++) {
          l62 = l60[l61];
          l63 = (l59 !== undefined ? l59[l61] : l0.get(l62));
          if (!((l63 !== undefined && l63 !== null))) continue L7; // a record
          if (!((typeof l63 === "object" || typeof l63 === "function"))) continue L7; // an object
          l63 = l63[k3];
          if (!((l63 !== undefined && l63 !== null))) continue L7; // a field
          l58 = (l58 + 1);
        }
        l55 = l58;
        l56 = true;
      }
      l54 = mo1.put(l0, l55, l56);
    }
    if (!(l54.ok)) return F; // a value of the memo
    l64 = l54.v;
    l65 = mo2.get(l0);
    if ((!(l65 !== undefined && l65 !== null))) {
      l67 = false;
      L8: {
        l69 = 0;
        l70 = l0.records;
        l71 = keys_(l0);
        L9: for (l72 = 0; l72 < l71.length; l72++) {
          l73 = l71[l72];
          l74 = mo3.get(l0);
          if ((!(l74 !== undefined && l74 !== null))) {
            l76 = false;
            L10: {
              l77 = (opts_(k9) === true);
              l79 = 0;
              l80 = l0.records;
              l81 = keys_(l0);
              L11: for (l82 = 0; l82 < l81.length; l82++) {
                l83 = l81[l82];
                l84 = (l80 !== undefined ? l80[l82] : l0.get(l83));
                if (!((l84 !== undefined && l84 !== null))) { if (l77) break L10; continue L11; } // a record
                if (!((typeof l84 === "object" || typeof l84 === "function"))) { if (l77) break L10; continue L11; } // an object
                l84 = l84[k10];
                if (!((l84 !== undefined && l84 !== null))) { if (l77) break L10; continue L11; } // a field
                l79 = (l79 + 1);
              }
              l75 = l79;
              l76 = true;
            }
            l74 = mo3.put(l0, l75, l76);
          }
          if (!(l74.ok)) continue L9; // a value of the memo
          l85 = l74.v;
          l69 = (l69 + 1);
        }
        l66 = l69;
        l67 = true;
      }
      l65 = mo2.put(l0, l66, l67);
    }
    if (!(l65.ok)) return F; // a value of the memo
    l86 = l65.v;
    l87 = mo4.get(l0);
    if ((!(l87 !== undefined && l87 !== null))) {
      l89 = false;
      L12: {
        l91 = 0;
        l92 = addr_(l0, l1, l1, k11);
        if (!((l92 !== F))) break L12; // an address
        l93 = l0.records;
        l94 = keys_(l0);
        L13: for (l95 = 0; l95 < l94.length; l95++) {
          l96 = l94[l95];
          if ((l96 === l92)) {
            continue;
          }
          l97 = (l93 !== undefined ? l93[l95] : l0.get(l96));
          if (!((l97 !== undefined && l97 !== null))) continue L13; // a record
          if (!((typeof l97 === "object" || typeof l97 === "function"))) continue L13; // an object
          l97 = l97[k3];
          if (!((l97 !== undefined && l97 !== null))) continue L13; // a field
          l91 = (l91 + 1);
        }
        l88 = l91;
        l89 = true;
      }
      l87 = mo4.put(l0, l88, l89);
    }
    if (!(l87.ok)) return F; // a value of the memo
    l98 = l87.v;
    l99 = rec_(k12, [l14, l22, l23, l43, l53, l64, l86, l98]);
    return l99;
  } catch {
    return F;
  }
};
