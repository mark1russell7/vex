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
    l33 = mo0.get(l0, []);
    if ((!(l33 !== undefined && l33 !== null))) {
      l42 = false;
      L3: {
        l35 = 0;
        l34 = false;
        l36 = l0.records;
        l37 = keys_(l0);
        L4: for (l38 = 0; l38 < l37.length; l38++) {
          l39 = l37[l38];
          l40 = (l36 !== undefined ? l36[l38] : l0.get(l39));
          if (!((l40 !== undefined && l40 !== null))) continue L4; // a record
          if (!((typeof l40 === "object" || typeof l40 === "function"))) continue L4; // an object
          l40 = l40[k7];
          if (!((l40 !== undefined && l40 !== null))) continue L4; // a field
          if (!((typeof l40 === "boolean"))) break L3; // a boolean
          l34 = (l34 || l40);
        }
        l41 = (!l34);
        l42 = true;
      }
      l33 = mo0.put(l0, [], l41, l42);
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
    l54 = mo1.get(l0, []);
    if ((!(l54 !== undefined && l54 !== null))) {
      l63 = false;
      L6: {
        l56 = 0;
        l57 = l0.records;
        l58 = keys_(l0);
        L7: for (l59 = 0; l59 < l58.length; l59++) {
          l60 = l58[l59];
          l61 = (l57 !== undefined ? l57[l59] : l0.get(l60));
          if (!((l61 !== undefined && l61 !== null))) continue L7; // a record
          if (!((typeof l61 === "object" || typeof l61 === "function"))) continue L7; // an object
          l61 = l61[k3];
          if (!((l61 !== undefined && l61 !== null))) continue L7; // a field
          l56 = (l56 + 1);
        }
        l62 = l56;
        l63 = true;
      }
      l54 = mo1.put(l0, [], l62, l63);
    }
    if (!(l54.ok)) return F; // a value of the memo
    l64 = l54.v;
    l65 = mo2.get(l0, []);
    if ((!(l65 !== undefined && l65 !== null))) {
      l85 = false;
      L8: {
        l67 = 0;
        l68 = l0.records;
        l69 = keys_(l0);
        L9: for (l70 = 0; l70 < l69.length; l70++) {
          l71 = l69[l70];
          l72 = mo3.get(l0, []);
          if ((!(l72 !== undefined && l72 !== null))) {
            l82 = false;
            L10: {
              l73 = (opts_(k9) === true);
              l75 = 0;
              l76 = l0.records;
              l77 = keys_(l0);
              L11: for (l78 = 0; l78 < l77.length; l78++) {
                l79 = l77[l78];
                l80 = (l76 !== undefined ? l76[l78] : l0.get(l79));
                if (!((l80 !== undefined && l80 !== null))) { if (l73) break L10; continue L11; } // a record
                if (!((typeof l80 === "object" || typeof l80 === "function"))) { if (l73) break L10; continue L11; } // an object
                l80 = l80[k10];
                if (!((l80 !== undefined && l80 !== null))) { if (l73) break L10; continue L11; } // a field
                l75 = (l75 + 1);
              }
              l81 = l75;
              l82 = true;
            }
            l72 = mo3.put(l0, [], l81, l82);
          }
          if (!(l72.ok)) continue L9; // a value of the memo
          l83 = l72.v;
          l67 = (l67 + 1);
        }
        l84 = l67;
        l85 = true;
      }
      l65 = mo2.put(l0, [], l84, l85);
    }
    if (!(l65.ok)) return F; // a value of the memo
    l86 = l65.v;
    l87 = mo4.get(l0, []);
    if ((!(l87 !== undefined && l87 !== null))) {
      l97 = false;
      L12: {
        l89 = 0;
        l90 = addr_(l0, l1, l1, k11);
        if (!((l90 !== F))) break L12; // an address
        l91 = l0.records;
        l92 = keys_(l0);
        L13: for (l93 = 0; l93 < l92.length; l93++) {
          l94 = l92[l93];
          if ((l94 === l90)) {
            continue;
          }
          l95 = (l91 !== undefined ? l91[l93] : l0.get(l94));
          if (!((l95 !== undefined && l95 !== null))) continue L13; // a record
          if (!((typeof l95 === "object" || typeof l95 === "function"))) continue L13; // an object
          l95 = l95[k3];
          if (!((l95 !== undefined && l95 !== null))) continue L13; // a field
          l89 = (l89 + 1);
        }
        l96 = l89;
        l97 = true;
      }
      l87 = mo4.put(l0, [], l96, l97);
    }
    if (!(l87.ok)) return F; // a value of the memo
    l98 = l87.v;
    l99 = rec_(k12, [l14, l22, l23, l43, l53, l64, l86, l98]);
    return l99;
  } catch {
    return F;
  }
};
