"use strict";
const F = R.F;
const has_ = R.has;
const addr_ = R.addr;
const keys_ = R.keys;
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
const k14 = K[14];
const k15 = K[15];
const s3_2 = R.site(k3, 2);
const s3_2_f = s3_2.fn;
const s4_2 = R.site(k4, 2);
const s4_2_f = s4_2.fn;
const d0 = R.domain(0);
const d1 = R.domain(1);
const f3_0 = d0.ops[k3].fn;
const f6_0 = d0.ops[k6].fn;
const f11_1 = d1.ops[k11].fn;
const threw_ = R.threw;
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20, l21, l22, l23, l24, l25, l26, l27, l28, l29, l30, l31, l32, l33, l34, l35, l36, l37;
  try {
    if (!(has_(l0, l1))) return F; // the origin is a key of the space
    l4 = k0;
    l5 = k1;
    l6 = 0;
    L0: for (;;) {
      if (!((l6 !== 5))) break L0; // the limit of iterate
      l7 = l0.get(l1);
      if (!((l7 !== undefined && l7 !== null))) return F; // a record
      if (!((typeof l7 === "object" || typeof l7 === "function"))) return F; // an object
      l7 = l7[k2];
      if (!((l7 !== undefined && l7 !== null))) return F; // a field
      S0: {
        if (d0.is(l7)) {
          if (!(typeof l5 === "number")) { l8 = F; break S0; }
          try { l8 = s3_2_f(l7, l5); } catch (e) { l8 = threw_(e); }
          if (l8 !== F) {
            if (l8 === undefined || l8 === null || (typeof l8 === "number" && !Number.isFinite(l8))) l8 = F;
            else if (d0.is(l8)) { try { if (!d0.valid(l8)) l8 = F; } catch (e) { l8 = threw_(e); } }
          }
          break S0;
        }
        l8 = s3_2(l7, l5);
      }
      if (!((l8 !== F))) return F; // an op
      l9 = l8;
      if (!((typeof l9 === "number"))) return F; // a value of the kind of a name of a loop
      l4 = l9;
      l6 = (l6 + 1);
    }
    try { l10 = f3_0(l4, l5); } catch (e) { l10 = threw_(e); }
    if (l10 !== F && typeof l10 !== "number") return F; // the kind of the result
    if (l10 !== F && !Number.isFinite(l10)) l10 = F;
    if (l10 !== F) { try { if (!d0.valid(l10)) l10 = F; } catch (e) { l10 = threw_(e); } }
    if (!((l10 !== F))) return F; // an op
    l11 = k1;
    l12 = 0;
    L1: for (;;) {
      l13 = l0.get(l1);
      if (!((l13 !== undefined && l13 !== null))) return F; // a record
      if (!((typeof l13 === "object" || typeof l13 === "function"))) return F; // an object
      l13 = l13[k2];
      if (!((l13 !== undefined && l13 !== null))) return F; // a field
      S1: {
        if (d0.is(l11)) {
          if (!(typeof l13 === "number")) { l14 = F; break S1; }
          try { l14 = s4_2_f(l11, l13); } catch (e) { l14 = threw_(e); }
          if (l14 !== F) {
            if (l14 === undefined || l14 === null || (typeof l14 === "number" && !Number.isFinite(l14))) l14 = F;
            else if (d0.is(l14)) { try { if (!d0.valid(l14)) l14 = F; } catch (e) { l14 = threw_(e); } }
          }
          break S1;
        }
        l14 = s4_2(l11, l13);
      }
      if (!((l14 !== F))) return F; // an op
      if (!((typeof l14 === "boolean"))) return F; // a boolean
      if (!((!l14))) break L1; // the test until
      if (!((l12 !== 10))) return F; // the limit of iterate
      try { l15 = f6_0(l11, k5); } catch (e) { l15 = threw_(e); }
      if (l15 !== F && typeof l15 !== "number") return F; // the kind of the result
      if (l15 !== F && !Number.isFinite(l15)) l15 = F;
      if (l15 !== F) { try { if (!d0.valid(l15)) l15 = F; } catch (e) { l15 = threw_(e); } }
      if (!((l15 !== F))) return F; // an op
      l16 = l15;
      if (!((typeof l16 === "number"))) return F; // a value of the kind of a name of a loop
      l11 = l16;
      l12 = (l12 + 1);
    }
    l17 = k0;
    l18 = k7;
    l19 = l0.get(l1);
    if (!((l19 !== undefined && l19 !== null))) return F; // a record
    if (!((typeof l19 === "object" || typeof l19 === "function"))) return F; // an object
    l19 = l19[k8];
    if (!((l19 !== undefined && l19 !== null))) return F; // a field
    l20 = addr_(l0, l1, l1, k9, [l19]);
    if (!((l20 !== F))) return F; // an address
    l21 = l0.records;
    l22 = keys_(l0);
    L2: for (l23 = 0; l23 < l22.length; l23++) {
      l24 = l22[l23];
      l25 = (l21 !== undefined ? l21[l23] : l0.get(l24));
      if (!((l25 !== undefined && l25 !== null))) return F; // a record
      if (!((typeof l25 === "object" || typeof l25 === "function"))) return F; // an object
      l25 = l25[k2];
      if (!((l25 !== undefined && l25 !== null))) return F; // a field
      S2: {
        if (d0.is(l25)) {
          if (!(typeof k0 === "number")) { l26 = F; break S2; }
          try { l26 = s4_2_f(l25, k0); } catch (e) { l26 = threw_(e); }
          if (l26 !== F) {
            if (l26 === undefined || l26 === null || (typeof l26 === "number" && !Number.isFinite(l26))) l26 = F;
            else if (d0.is(l26)) { try { if (!d0.valid(l26)) l26 = F; } catch (e) { l26 = threw_(e); } }
          }
          break S2;
        }
        l26 = s4_2(l25, k0);
      }
      if (!((l26 !== F))) return F; // an op
      if (!((typeof l26 === "boolean"))) return F; // a boolean
      if ((!l26)) {
        continue;
      }
      l27 = (l21 !== undefined ? l21[l23] : l0.get(l24));
      if (!((l27 !== undefined && l27 !== null))) return F; // a record
      if (!((typeof l27 === "object" || typeof l27 === "function"))) return F; // an object
      l27 = l27[k2];
      if (!((l27 !== undefined && l27 !== null))) return F; // a field
      S3: {
        if (d0.is(l17)) {
          if (!(typeof l27 === "number")) { l28 = F; break S3; }
          try { l28 = s3_2_f(l17, l27); } catch (e) { l28 = threw_(e); }
          if (l28 !== F) {
            if (l28 === undefined || l28 === null || (typeof l28 === "number" && !Number.isFinite(l28))) l28 = F;
            else if (d0.is(l28)) { try { if (!d0.valid(l28)) l28 = F; } catch (e) { l28 = threw_(e); } }
          }
          break S3;
        }
        l28 = s3_2(l17, l27);
      }
      if (!((l28 !== F))) return F; // an op
      l29 = l28;
      if (!((typeof l29 === "number"))) return F; // a value of the kind of a name of a loop
      l30 = (l21 !== undefined ? l21[l23] : l0.get(l24));
      if (!((l30 !== undefined && l30 !== null))) return F; // a record
      if (!((typeof l30 === "object" || typeof l30 === "function"))) return F; // an object
      l30 = l30[k10];
      if (!((l30 !== undefined && l30 !== null))) return F; // a field
      try { l31 = f11_1(l18, l30); } catch (e) { l31 = threw_(e); }
      if (l31 !== F && typeof l31 !== "string") return F; // the kind of the result
      if (!((l31 !== F))) return F; // an op
      l32 = l31;
      if (!((typeof l32 === "string"))) return F; // a value of the kind of a name of a loop
      l17 = l29;
      l18 = l32;
    }
    l33 = rec_(k12, [l17, l18]);
    l34 = l0.get(l1);
    if (!((l34 !== undefined && l34 !== null))) return F; // a record
    if (!((typeof l34 === "object" || typeof l34 === "function"))) return F; // an object
    l34 = l34[k13];
    if (!((l34 !== undefined && l34 !== null))) return F; // a field
    l35 = addr_(l0, l1, l1, k14, [l34]);
    if (!((l35 !== F))) return F; // an address
    l36 = l0.get(l35);
    if (!((l36 !== undefined && l36 !== null))) return F; // a record
    if (!((typeof l36 === "object" || typeof l36 === "function"))) return F; // an object
    l36 = l36[k2];
    if (!((l36 !== undefined && l36 !== null))) return F; // a field
    l37 = rec_(k15, [l10, l11, l33, l36]);
    return l37;
  } catch {
    return F;
  }
};
