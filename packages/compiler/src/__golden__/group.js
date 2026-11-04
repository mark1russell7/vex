"use strict";
const F = R.F;
const has_ = R.has;
const raise_ = R.raise;
const err_ = R.err;
const var_ = R.var;
const addr_ = R.addr;
const bad_ = R.bad;
const invalid_ = R.invalid;
const keys_ = R.keys;
const k1 = K[1];
const k2 = K[2];
const k3 = K[3];
const k4 = K[4];
const k5 = K[5];
const k6 = K[6];
const s4_2 = R.site(k4, 2);
const s4_2_f = s4_2.fn;
const mo0 = R.memo();
const s5_2 = R.site(k5, 2);
const s5_2_f = s5_2.fn;
const d1 = R.domain(1);
const d0 = R.domain(0);
const threw_ = R.threw;
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20, l21, l22, l23, l24, l25, l26, l27, l28, l29, l30, l31, l32, l33, l34, l35, l36, l37, l38, l39, l40, l41;
  try {
    if (!(has_(l0, l1))) return raise_(err_(K[0], l1, l1)); // the origin is a key of the space
    l6 = false;
    L0: {
      l5 = var_(l2, k1);
      if (!((l5 !== F))) break L0; // a variable
      l4 = l5;
      l6 = true;
    }
    l12 = false;
    L1: {
      l8 = addr_(l0, l1, l1, k2);
      if (!((l8 !== F))) break L1; // an address
      l9 = l0.get(l8);
      if (!((l9 !== undefined && l9 !== null))) break L1; // a record
      if (!((typeof l9 === "object" || typeof l9 === "function"))) break L1; // an object
      l9 = l9[k3];
      if (!((l9 !== undefined && l9 !== null))) break L1; // a field
      l10 = var_(l2, k1);
      if (!((l10 !== F))) break L1; // a variable
      S0: {
        if (d1.is(l9)) {
          if (!(typeof l10 === "number")) { l11 = s4_2(l9, l10); break S0; }
          try { l11 = s4_2_f(l9, l10); } catch (e) { l11 = threw_(e); }
          if (l11 !== F) {
            if (l11 === undefined || l11 === null || (typeof l11 === "number" && !Number.isFinite(l11))) l11 = bad_(l11);
            else if (d0.is(l11)) { try { if (!d0.valid(l11)) l11 = bad_(l11); } catch (e) { l11 = invalid_(e, 0); } }
            else if (d1.is(l11)) { try { if (!d1.valid(l11)) l11 = bad_(l11); } catch (e) { l11 = invalid_(e, 1); } }
          }
          break S0;
        }
        l11 = s4_2(l9, l10);
      }
      if (!((l11 !== F))) break L1; // an op
      l7 = l11;
      l12 = true;
    }
    l13 = mo0.get(l0, [l4, l6, l7, l12]);
    if ((!(l13 !== undefined && l13 !== null))) {
      l25 = false;
      L2: {
        l16 = 0;
        l17 = l0.records;
        l18 = keys_(l0);
        L3: for (l19 = 0; l19 < l18.length; l19++) {
          l20 = l18[l19];
          l21 = (l17 !== undefined ? l17[l19] : l0.get(l20));
          if (!((l21 !== undefined && l21 !== null))) continue L3; // a record
          if (!((typeof l21 === "object" || typeof l21 === "function"))) continue L3; // an object
          l21 = l21[k3];
          if (!((l21 !== undefined && l21 !== null))) continue L3; // a field
          if (!(l6)) continue L3; // a key with a value
          S1: {
            if (d1.is(l21)) {
              if (!(typeof l4 === "number")) { l22 = s4_2(l21, l4); break S1; }
              try { l22 = s4_2_f(l21, l4); } catch (e) { l22 = threw_(e); }
              if (l22 !== F) {
                if (l22 === undefined || l22 === null || (typeof l22 === "number" && !Number.isFinite(l22))) l22 = bad_(l22);
                else if (d0.is(l22)) { try { if (!d0.valid(l22)) l22 = bad_(l22); } catch (e) { l22 = invalid_(e, 0); } }
                else if (d1.is(l22)) { try { if (!d1.valid(l22)) l22 = bad_(l22); } catch (e) { l22 = invalid_(e, 1); } }
              }
              break S1;
            }
            l22 = s4_2(l21, l4);
          }
          if (!((l22 !== F))) continue L3; // an op
          if (!(l12)) continue L3; // a key with a value
          S2: {
            if (d1.is(l22)) {
              if (!(typeof l7 === "number")) { l23 = s5_2(l22, l7); break S2; }
              try { l23 = s5_2_f(l22, l7); } catch (e) { l23 = threw_(e); }
              if (l23 !== F) {
                if (l23 === undefined || l23 === null || (typeof l23 === "number" && !Number.isFinite(l23))) l23 = bad_(l23);
                else if (d0.is(l23)) { try { if (!d0.valid(l23)) l23 = bad_(l23); } catch (e) { l23 = invalid_(e, 0); } }
                else if (d1.is(l23)) { try { if (!d1.valid(l23)) l23 = bad_(l23); } catch (e) { l23 = invalid_(e, 1); } }
              }
              break S2;
            }
            l23 = s5_2(l22, l7);
          }
          if (!((l23 !== F))) continue L3; // an op
          if (!((typeof l23 === "boolean"))) continue L3; // a boolean
          if ((!l23)) {
            continue;
          }
          l24 = (l17 !== undefined ? l17[l19] : l0.get(l20));
          if (!((l24 !== undefined && l24 !== null))) continue L3; // a record
          if (!((typeof l24 === "object" || typeof l24 === "function"))) continue L3; // an object
          l24 = l24[k6];
          if (!((l24 !== undefined && l24 !== null))) continue L3; // a field
          if (!((typeof l24 === "number"))) break L2; // a number
          if ((l16 === 0)) {
            l15 = l24;
          } else {
            l15 = Math.max(l15, l24);
          }
          l16 = (l16 + 1);
        }
        if (!((l16 !== 0))) break L2; // a list that is not empty
        l14 = l15;
        l25 = true;
      }
      l13 = mo0.put(l0, [l4, l6, l7, l12], l14, l25);
    }
    if ((!l13.ok)) {
      l27 = 0;
      l28 = l0.records;
      l29 = keys_(l0);
      L4: for (l30 = 0; l30 < l29.length; l30++) {
        l31 = l29[l30];
        l32 = (l28 !== undefined ? l28[l30] : l0.get(l31));
        if (!((l32 !== undefined && l32 !== null))) continue L4; // a record
        if (!((typeof l32 === "object" || typeof l32 === "function"))) continue L4; // an object
        l32 = l32[k3];
        if (!((l32 !== undefined && l32 !== null))) continue L4; // a field
        l33 = var_(l2, k1);
        if (!((l33 !== F))) continue L4; // a variable
        S3: {
          if (d1.is(l32)) {
            if (!(typeof l33 === "number")) { l34 = s4_2(l32, l33); break S3; }
            try { l34 = s4_2_f(l32, l33); } catch (e) { l34 = threw_(e); }
            if (l34 !== F) {
              if (l34 === undefined || l34 === null || (typeof l34 === "number" && !Number.isFinite(l34))) l34 = bad_(l34);
              else if (d0.is(l34)) { try { if (!d0.valid(l34)) l34 = bad_(l34); } catch (e) { l34 = invalid_(e, 0); } }
              else if (d1.is(l34)) { try { if (!d1.valid(l34)) l34 = bad_(l34); } catch (e) { l34 = invalid_(e, 1); } }
            }
            break S3;
          }
          l34 = s4_2(l32, l33);
        }
        if (!((l34 !== F))) continue L4; // an op
        l35 = addr_(l0, l1, l31, k2);
        if (!((l35 !== F))) continue L4; // an address
        l36 = l0.get(l35);
        if (!((l36 !== undefined && l36 !== null))) continue L4; // a record
        if (!((typeof l36 === "object" || typeof l36 === "function"))) continue L4; // an object
        l36 = l36[k3];
        if (!((l36 !== undefined && l36 !== null))) continue L4; // a field
        l37 = var_(l2, k1);
        if (!((l37 !== F))) continue L4; // a variable
        S4: {
          if (d1.is(l36)) {
            if (!(typeof l37 === "number")) { l38 = s4_2(l36, l37); break S4; }
            try { l38 = s4_2_f(l36, l37); } catch (e) { l38 = threw_(e); }
            if (l38 !== F) {
              if (l38 === undefined || l38 === null || (typeof l38 === "number" && !Number.isFinite(l38))) l38 = bad_(l38);
              else if (d0.is(l38)) { try { if (!d0.valid(l38)) l38 = bad_(l38); } catch (e) { l38 = invalid_(e, 0); } }
              else if (d1.is(l38)) { try { if (!d1.valid(l38)) l38 = bad_(l38); } catch (e) { l38 = invalid_(e, 1); } }
            }
            break S4;
          }
          l38 = s4_2(l36, l37);
        }
        if (!((l38 !== F))) continue L4; // an op
        S5: {
          if (d1.is(l34)) {
            if (!(typeof l38 === "number")) { l39 = s5_2(l34, l38); break S5; }
            try { l39 = s5_2_f(l34, l38); } catch (e) { l39 = threw_(e); }
            if (l39 !== F) {
              if (l39 === undefined || l39 === null || (typeof l39 === "number" && !Number.isFinite(l39))) l39 = bad_(l39);
              else if (d0.is(l39)) { try { if (!d0.valid(l39)) l39 = bad_(l39); } catch (e) { l39 = invalid_(e, 0); } }
              else if (d1.is(l39)) { try { if (!d1.valid(l39)) l39 = bad_(l39); } catch (e) { l39 = invalid_(e, 1); } }
            }
            break S5;
          }
          l39 = s5_2(l34, l38);
        }
        if (!((l39 !== F))) continue L4; // an op
        if (!((typeof l39 === "boolean"))) continue L4; // a boolean
        if ((!l39)) {
          continue;
        }
        l40 = (l28 !== undefined ? l28[l30] : l0.get(l31));
        if (!((l40 !== undefined && l40 !== null))) continue L4; // a record
        if (!((typeof l40 === "object" || typeof l40 === "function"))) continue L4; // an object
        l40 = l40[k6];
        if (!((l40 !== undefined && l40 !== null))) continue L4; // a field
        if (!((typeof l40 === "number"))) return raise_(err_(K[7], l1, l1, l40)); // a number
        if ((l27 === 0)) {
          l26 = l40;
        } else {
          l26 = Math.max(l26, l40);
        }
        l27 = (l27 + 1);
      }
      if (!((l27 !== 0))) return raise_(err_(K[8], l1, l1)); // a list that is not empty
      if (!(l13.ok)) return F; // a value of the memo
    }
    l41 = l13.v;
    return l41;
  } catch {
    return F;
  }
};
