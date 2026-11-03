"use strict";
const F = R.F;
const has_ = R.has;
const ext_ = R.ext;
const keys_ = R.keys;
const opts_ = R.opts;
const result_ = R.result;
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
const k13 = K[13];
const s4_2 = R.site(k4, 2);
const s4_4 = R.site(k4, 4);
const mo0 = R.memo();
const mo1 = R.memo();
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20, l21, l22, l23, l24, l25, l26, l27, l28, l29, l30, l31, l32, l33, l34, l35, l36, l37, l38, l39, l40, l41, l42, l43, l44, l45, l46, l47, l48, l49, l50, l51, l52, l53, l54, l55, l56, l57, l58, l59;
  try {
    if (!(has_(l0, l1))) return F; // the origin is a key of the space
    l5 = false;
    L0: {
      l8 = false;
      L1: {
        l6 = l0.get(l1);
        if (!((l6 !== undefined && l6 !== null))) break L1; // a record
        if (!((typeof l6 === "object" || typeof l6 === "function"))) break L1; // an object
        l6 = l6[k0];
        if (!((l6 !== undefined && l6 !== null))) break L1; // a field
        l7 = l6;
        l8 = true;
      }
      l9 = ext_(k1, k2, l0, l1, l1, k3);
      if (!((l9 !== F))) break L0; // an extension
      if (!(l8)) break L0; // an argument with a value
      l10 = s4_2(l7, l9);
      if (!((l10 !== F))) break L0; // an op
      l4 = l10;
      l5 = true;
    }
    if ((!l5)) {
      l4 = k5;
    }
    l12 = false;
    L2: {
      l15 = false;
      L3: {
        l13 = l0.get(l1);
        if (!((l13 !== undefined && l13 !== null))) break L3; // a record
        if (!((typeof l13 === "object" || typeof l13 === "function"))) break L3; // an object
        l13 = l13[k0];
        if (!((l13 !== undefined && l13 !== null))) break L3; // a field
        l14 = l13;
        l15 = true;
      }
      l18 = false;
      L4: {
        l16 = l0.get(l1);
        if (!((l16 !== undefined && l16 !== null))) break L4; // a record
        if (!((typeof l16 === "object" || typeof l16 === "function"))) break L4; // an object
        l16 = l16[k6];
        if (!((l16 !== undefined && l16 !== null))) break L4; // a field
        l17 = l16;
        l18 = true;
      }
      l19 = ext_(k1, k2, l0, l1, l1, k7);
      if (!((l19 !== F))) break L2; // an extension
      l20 = l0.get(l1);
      if (!((l20 !== undefined && l20 !== null))) break L2; // a record
      if (!((typeof l20 === "object" || typeof l20 === "function"))) break L2; // an object
      l20 = l20[k8];
      if (!((l20 !== undefined && l20 !== null))) break L2; // a field
      if (!(l15)) break L2; // an argument with a value
      if (!(l18)) break L2; // an argument with a value
      l21 = s4_4([l14, l17, l19, l20]);
      if (!((l21 !== F))) break L2; // an op
      l11 = l21;
      l12 = true;
    }
    if ((!l12)) {
      l11 = k5;
    }
    l23 = 0;
    l24 = l0.records;
    l25 = keys_(l0);
    L5: for (l26 = 0; l26 < l25.length; l26++) {
      l27 = l25[l26];
      l28 = ext_(k1, k2, l0, l1, l27, k9);
      if (!((l28 !== F))) continue L5; // an extension
      l23 = (l23 + 1);
    }
    l30 = false;
    L6: {
      l31 = (opts_(k10) === true);
      l33 = 0;
      l32 = 0;
      l34 = l0.records;
      l35 = keys_(l0);
      L7: for (l36 = 0; l36 < l35.length; l36++) {
        l37 = l35[l36];
        l38 = ext_(k1, k2, l0, l1, l37, k11);
        if (!((l38 !== F))) { if (l31) return F; continue L7; } // an extension
        if (!((typeof l38 === "number"))) return F; // a number
        l32 = (l32 + l38);
        l33 = (l33 + 1);
      }
      l39 = result_(l32);
      if (!((l39 !== F))) break L6; // a finite sum
      l29 = l39;
      l30 = true;
    }
    if ((!l30)) {
      l29 = k5;
    }
    l40 = mo0.get(l0, []);
    if ((!(l40 !== undefined && l40 !== null))) {
      l57 = false;
      L8: {
        l42 = false;
        L9: {
          l43 = mo1.get(l0, []);
          if ((!(l43 !== undefined && l43 !== null))) {
            l54 = false;
            L10: {
              l44 = (opts_(k12) === true);
              l46 = 0;
              l45 = 0;
              l47 = l0.records;
              l48 = keys_(l0);
              L11: for (l49 = 0; l49 < l48.length; l49++) {
                l50 = l48[l49];
                l51 = (l47 !== undefined ? l47[l49] : l0.get(l50));
                if (!((l51 !== undefined && l51 !== null))) { if (l44) break L10; continue L11; } // a record
                if (!((typeof l51 === "object" || typeof l51 === "function"))) { if (l44) break L10; continue L11; } // an object
                l51 = l51[k0];
                if (!((l51 !== undefined && l51 !== null))) { if (l44) break L10; continue L11; } // a field
                if (!((typeof l51 === "number"))) break L10; // a number
                l45 = (l45 + l51);
                l46 = (l46 + 1);
              }
              l52 = result_(l45);
              if (!((l52 !== F))) break L10; // a finite sum
              l53 = l52;
              l54 = true;
            }
            l43 = mo1.put(l0, [], l53, l54);
          }
          if (!(l43.ok)) break L9; // a value of the memo
          l55 = l43.v;
          l41 = l55;
          l42 = true;
        }
        if ((!l42)) {
          l41 = k5;
        }
        l56 = l41;
        l57 = true;
      }
      l40 = mo0.put(l0, [], l56, l57);
    }
    if (!(l40.ok)) return F; // a value of the memo
    l58 = l40.v;
    l59 = rec_(k13, [l4, l11, l23, l29, l58]);
    return l59;
  } catch {
    return F;
  }
};
