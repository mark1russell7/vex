"use strict";
const F = R.F;
const has_ = R.has;
const rec_ = R.rec;
const k0 = K[0];
const k2 = K[2];
const k1 = K[1];
const k3 = K[3];
const k4 = K[4];
const k6 = K[6];
const k5 = K[5];
const k7 = K[7];
const k8 = K[8];
const k9 = K[9];
const k10 = K[10];
const k11 = K[11];
const s2_2 = R.site(k2, 2);
const s3_1 = R.site(k3, 1);
const s6_2 = R.site(k6, 2);
const s6_2_f = s6_2.fn;
const s7_1 = R.site(k7, 1);
const s7_1_f = s7_1.free;
const s8_2 = R.site(k8, 2);
const s9_1 = R.site(k9, 1);
const a10 = R.axis(k10);
const d0 = R.domain(0);
const d1 = R.domain(1);
const threw_ = R.threw;
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20, l21, l22, l23, l24, l25;
  try {
    if (!(has_(l0, l1))) return F; // the origin is a key of the space
    l4 = l0.get(l1);
    if (!((l4 !== undefined && l4 !== null))) return F; // a record
    if (!((typeof l4 === "object" || typeof l4 === "function"))) return F; // an object
    l4 = l4[k0];
    if (!((l4 !== undefined && l4 !== null))) return F; // a field
    S0: {
      if (typeof l4 === "object" && l4 !== null) {
        const mS0 = s2_2.m;
        if (mS0 !== undefined && l4[k2] === mS0 && d0.is(l4)) {
          if (typeof k1 === "number") { l5 = s2_2(l4, k1); break S0; }
          if (!(d0.is(k1))) { l5 = F; break S0; }
          try { l5 = l4[k2](k1); } catch (e) { l5 = threw_(e); }
          if (l5 !== F) {
            if (l5 === undefined || l5 === null || (typeof l5 === "number" && !Number.isFinite(l5))) l5 = F;
            else if (d0.is(l5)) { try { if (!d0.valid(l5)) l5 = F; } catch (e) { l5 = threw_(e); } }
            else if (d1.is(l5)) { try { if (!d1.valid(l5)) l5 = F; } catch (e) { l5 = threw_(e); } }
          }
          break S0;
        }
      }
      l5 = s2_2(l4, k1);
    }
    if (!((l5 !== F))) return F; // an op
    l6 = l0.get(l1);
    if (!((l6 !== undefined && l6 !== null))) return F; // a record
    if (!((typeof l6 === "object" || typeof l6 === "function"))) return F; // an object
    l6 = l6[k0];
    if (!((l6 !== undefined && l6 !== null))) return F; // a field
    S1: {
      if (typeof l6 === "object" && l6 !== null) {
        const mS1 = s3_1.m;
        if (mS1 !== undefined && l6[k3] === mS1 && d0.is(l6)) {
          try { l7 = l6[k3](); } catch (e) { l7 = threw_(e); }
          if (l7 !== F) {
            if (l7 === undefined || l7 === null || (typeof l7 === "number" && !Number.isFinite(l7))) l7 = F;
            else if (d0.is(l7)) { try { if (!d0.valid(l7)) l7 = F; } catch (e) { l7 = threw_(e); } }
            else if (d1.is(l7)) { try { if (!d1.valid(l7)) l7 = F; } catch (e) { l7 = threw_(e); } }
          }
          break S1;
        }
      }
      l7 = s3_1(l6);
    }
    if (!((l7 !== F))) return F; // an op
    l8 = l0.get(l1);
    if (!((l8 !== undefined && l8 !== null))) return F; // a record
    if (!((typeof l8 === "object" || typeof l8 === "function"))) return F; // an object
    l8 = l8[k4];
    if (!((l8 !== undefined && l8 !== null))) return F; // a field
    S2: {
      if (d1.is(l8)) {
        if (!(typeof k5 === "number")) { l9 = F; break S2; }
        try { l9 = s6_2_f(l8, k5); } catch (e) { l9 = threw_(e); }
        if (l9 !== F) {
          if (l9 === undefined || l9 === null || (typeof l9 === "number" && !Number.isFinite(l9))) l9 = F;
          else if (d0.is(l9)) { try { if (!d0.valid(l9)) l9 = F; } catch (e) { l9 = threw_(e); } }
          else if (d1.is(l9)) { try { if (!d1.valid(l9)) l9 = F; } catch (e) { l9 = threw_(e); } }
        }
        break S2;
      }
      l9 = s6_2(l8, k5);
    }
    if (!((l9 !== F))) return F; // an op
    l10 = l0.get(l1);
    if (!((l10 !== undefined && l10 !== null))) return F; // a record
    if (!((typeof l10 === "object" || typeof l10 === "function"))) return F; // an object
    l10 = l10[k4];
    if (!((l10 !== undefined && l10 !== null))) return F; // a field
    try { l11 = s7_1_f(l10); } catch (e) { l11 = threw_(e); }
    if (l11 !== F) {
      if (l11 === undefined || l11 === null || (typeof l11 === "number" && !Number.isFinite(l11))) l11 = F;
      else if (d0.is(l11)) { try { if (!d0.valid(l11)) l11 = F; } catch (e) { l11 = threw_(e); } }
      else if (d1.is(l11)) { try { if (!d1.valid(l11)) l11 = F; } catch (e) { l11 = threw_(e); } }
    }
    if (!((l11 !== F))) return F; // an op
    l12 = l0.get(l1);
    if (!((l12 !== undefined && l12 !== null))) return F; // a record
    if (!((typeof l12 === "object" || typeof l12 === "function"))) return F; // an object
    l12 = l12[k4];
    if (!((l12 !== undefined && l12 !== null))) return F; // a field
    l13 = s8_2(l12, k1);
    if (!((l13 !== F))) return F; // an op
    l14 = l0.get(l1);
    if (!((l14 !== undefined && l14 !== null))) return F; // a record
    if (!((typeof l14 === "object" || typeof l14 === "function"))) return F; // an object
    l14 = l14[k4];
    if (!((l14 !== undefined && l14 !== null))) return F; // a field
    l15 = s9_1(l14);
    if (!((l15 !== F))) return F; // an op
    l17 = 0;
    l18 = a10(l0, l1, l1);
    if (!((l18 !== F))) return F; // the targets of an axis
    l19 = l18.idx;
    l20 = l0.records;
    l21 = l18.keys;
    L0: for (l22 = 0; l22 < l21.length; l22++) {
      l23 = l21[l22];
      l24 = (l20 !== undefined ? l20[l19[l22]] : l0.get(l23));
      if (!((l24 !== undefined && l24 !== null))) continue L0; // a record
      if (!((typeof l24 === "object" || typeof l24 === "function"))) continue L0; // an object
      l24 = l24[k4];
      if (!((l24 !== undefined && l24 !== null))) continue L0; // a field
      l17 = (l17 + 1);
    }
    l25 = rec_(k11, [l5, l7, l9, l11, l13, l15, l17]);
    return l25;
  } catch {
    return F;
  }
};
