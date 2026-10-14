"use strict";
const F = R.F;
const has_ = R.has;
const var_ = R.var;
const addr_ = R.addr;
const keys_ = R.keys;
const k0 = K[0];
const k1 = K[1];
const k2 = K[2];
const k3 = K[3];
const k4 = K[4];
const k5 = K[5];
const s3_2 = R.site(k3, 2);
const s3_2_f = s3_2.fn;
const mo0 = R.memo();
const s4_2 = R.site(k4, 2);
const s4_2_f = s4_2.fn;
const d1 = R.domain(1);
const d0 = R.domain(0);
const threw_ = R.threw;
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20, l21, l22, l23, l24, l25, l26;
  try {
    if (!(has_(l0, l1))) return F; // the origin is a key of the space
    l6 = false;
    L0: {
      l4 = var_(l2, k0);
      if (!((l4 !== F))) break L0; // a variable
      l5 = l4;
      l6 = true;
    }
    l12 = false;
    L1: {
      l7 = addr_(l0, l1, l1, k1);
      if (!((l7 !== F))) break L1; // an address
      l8 = l0.get(l7);
      if (!((l8 !== undefined && l8 !== null))) break L1; // a record
      if (!((typeof l8 === "object" || typeof l8 === "function"))) break L1; // an object
      l8 = l8[k2];
      if (!((l8 !== undefined && l8 !== null))) break L1; // a field
      l9 = var_(l2, k0);
      if (!((l9 !== F))) break L1; // a variable
      S0: {
        if (d1.is(l8)) {
          if (!(typeof l9 === "number")) { l10 = F; break S0; }
          try { l10 = s3_2_f(l8, l9); } catch (e) { l10 = threw_(e); }
          if (l10 !== F) {
            if (l10 === undefined || l10 === null || (typeof l10 === "number" && !Number.isFinite(l10))) l10 = F;
            else if (d0.is(l10)) { try { if (!d0.valid(l10)) l10 = F; } catch (e) { l10 = threw_(e); } }
            else if (d1.is(l10)) { try { if (!d1.valid(l10)) l10 = F; } catch (e) { l10 = threw_(e); } }
          }
          break S0;
        }
        l10 = s3_2(l8, l9);
      }
      if (!((l10 !== F))) break L1; // an op
      l11 = l10;
      l12 = true;
    }
    l13 = mo0.get(l0, [l5, l6, l11, l12]);
    if ((!(l13 !== undefined && l13 !== null))) {
      l25 = false;
      L2: {
        l15 = 0;
        l16 = l0.records;
        l17 = keys_(l0);
        L3: for (l18 = 0; l18 < l17.length; l18++) {
          l19 = l17[l18];
          l20 = (l16 !== undefined ? l16[l18] : l0.get(l19));
          if (!((l20 !== undefined && l20 !== null))) continue L3; // a record
          if (!((typeof l20 === "object" || typeof l20 === "function"))) continue L3; // an object
          l20 = l20[k2];
          if (!((l20 !== undefined && l20 !== null))) continue L3; // a field
          if (!(l6)) continue L3; // a key with a value
          S1: {
            if (d1.is(l20)) {
              if (!(typeof l5 === "number")) { l21 = F; break S1; }
              try { l21 = s3_2_f(l20, l5); } catch (e) { l21 = threw_(e); }
              if (l21 !== F) {
                if (l21 === undefined || l21 === null || (typeof l21 === "number" && !Number.isFinite(l21))) l21 = F;
                else if (d0.is(l21)) { try { if (!d0.valid(l21)) l21 = F; } catch (e) { l21 = threw_(e); } }
                else if (d1.is(l21)) { try { if (!d1.valid(l21)) l21 = F; } catch (e) { l21 = threw_(e); } }
              }
              break S1;
            }
            l21 = s3_2(l20, l5);
          }
          if (!((l21 !== F))) continue L3; // an op
          if (!(l12)) continue L3; // a key with a value
          S2: {
            if (d1.is(l21)) {
              if (!(typeof l11 === "number")) { l22 = F; break S2; }
              try { l22 = s4_2_f(l21, l11); } catch (e) { l22 = threw_(e); }
              if (l22 !== F) {
                if (l22 === undefined || l22 === null || (typeof l22 === "number" && !Number.isFinite(l22))) l22 = F;
                else if (d0.is(l22)) { try { if (!d0.valid(l22)) l22 = F; } catch (e) { l22 = threw_(e); } }
                else if (d1.is(l22)) { try { if (!d1.valid(l22)) l22 = F; } catch (e) { l22 = threw_(e); } }
              }
              break S2;
            }
            l22 = s4_2(l21, l11);
          }
          if (!((l22 !== F))) continue L3; // an op
          if (!((typeof l22 === "boolean"))) continue L3; // a boolean
          if ((!l22)) {
            continue;
          }
          l23 = (l16 !== undefined ? l16[l18] : l0.get(l19));
          if (!((l23 !== undefined && l23 !== null))) continue L3; // a record
          if (!((typeof l23 === "object" || typeof l23 === "function"))) continue L3; // an object
          l23 = l23[k5];
          if (!((l23 !== undefined && l23 !== null))) continue L3; // a field
          if (!((typeof l23 === "number"))) break L2; // a number
          if ((l15 === 0)) {
            l14 = l23;
          } else {
            l14 = Math.max(l14, l23);
          }
          l15 = (l15 + 1);
        }
        if (!((l15 !== 0))) break L2; // a list that is not empty
        l24 = l14;
        l25 = true;
      }
      l13 = mo0.put(l0, [l5, l6, l11, l12], l24, l25);
    }
    if (!(l13.ok)) return F; // a value of the memo
    l26 = l13.v;
    return l26;
  } catch {
    return F;
  }
};
