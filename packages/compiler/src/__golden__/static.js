"use strict";
const F = R.F;
const has_ = R.has;
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
const s2_2 = R.site(k2, 2);
const s2_2_f = s2_2.fn;
const s9_1 = R.site(k9, 1);
const s9_1_f = s9_1.free;
const d0 = R.domain(0);
const d1 = R.domain(1);
const d2 = R.domain(2);
const d3 = R.domain(3);
const f2_0 = d0.ops[k2].fn;
const f3_0 = d0.ops[k3].fn;
const f5_1 = d1.ops[k5].fn;
const f7_0 = d0.ops[k7].fn;
const threw_ = R.threw;
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16;
  try {
    if (!(has_(l0, l1))) return F; // the origin is a key of the space
    l4 = l0.get(l1);
    if (!((l4 !== undefined && l4 !== null))) return F; // a record
    if (!((typeof l4 === "object" || typeof l4 === "function"))) return F; // an object
    l4 = l4[k0];
    if (!((l4 !== undefined && l4 !== null))) return F; // a field
    if (!((typeof l4 === "number"))) return F; // a field of the schema
    try { l5 = f2_0(l4, k1); } catch (e) { l5 = threw_(e); }
    if (l5 !== F && typeof l5 !== "number") return F; // the kind of the result
    if (l5 !== F && !Number.isFinite(l5)) l5 = F;
    if (l5 !== F) { try { if (!d0.valid(l5)) l5 = F; } catch (e) { l5 = threw_(e); } }
    if (!((l5 !== F))) return F; // an op
    l6 = l0.get(l1);
    if (!((l6 !== undefined && l6 !== null))) return F; // a record
    if (!((typeof l6 === "object" || typeof l6 === "function"))) return F; // an object
    l6 = l6[k0];
    if (!((l6 !== undefined && l6 !== null))) return F; // a field
    if (!((typeof l6 === "number"))) return F; // a field of the schema
    try { l7 = f3_0(l6, k1); } catch (e) { l7 = threw_(e); }
    if (l7 !== F && typeof l7 !== "boolean") return F; // the kind of the result
    if (!((l7 !== F))) return F; // an op
    l8 = l0.get(l1);
    if (!((l8 !== undefined && l8 !== null))) return F; // a record
    if (!((typeof l8 === "object" || typeof l8 === "function"))) return F; // an object
    l8 = l8[k4];
    if (!((l8 !== undefined && l8 !== null))) return F; // a field
    if (!((typeof l8 === "string"))) return F; // a field of the schema
    try { l9 = f5_1(l8); } catch (e) { l9 = threw_(e); }
    if (l9 !== F && typeof l9 !== "string") return F; // the kind of the result
    if (!((l9 !== F))) return F; // an op
    l10 = l0.get(l1);
    if (!((l10 !== undefined && l10 !== null))) return F; // a record
    if (!((typeof l10 === "object" || typeof l10 === "function"))) return F; // an object
    l10 = l10[k0];
    if (!((l10 !== undefined && l10 !== null))) return F; // a field
    if (!((typeof l10 === "number"))) return F; // a field of the schema
    try { l11 = f7_0(l10, k6); } catch (e) { l11 = threw_(e); }
    if (l11 !== F) {
      if (l11 === undefined || l11 === null || (typeof l11 === "number" && !Number.isFinite(l11))) l11 = F;
      else if (d0.is(l11)) { try { if (!d0.valid(l11)) l11 = F; } catch (e) { l11 = threw_(e); } }
      else if (d1.is(l11)) {}
      else if (d2.is(l11)) {}
      else if (d3.is(l11)) { try { if (!d3.valid(l11)) l11 = F; } catch (e) { l11 = threw_(e); } }
    }
    if (!((l11 !== F))) return F; // an op
    l12 = l0.get(l1);
    if (!((l12 !== undefined && l12 !== null))) return F; // a record
    if (!((typeof l12 === "object" || typeof l12 === "function"))) return F; // an object
    l12 = l12[k8];
    if (!((l12 !== undefined && l12 !== null))) return F; // a field
    if (!((typeof l12 === "boolean"))) return F; // a field of the schema
    S0: {
      if (d0.is(l12)) {
        if (!(typeof k1 === "number")) { l13 = F; break S0; }
        try { l13 = s2_2_f(l12, k1); } catch (e) { l13 = threw_(e); }
        if (l13 !== F) {
          if (l13 === undefined || l13 === null || (typeof l13 === "number" && !Number.isFinite(l13))) l13 = F;
          else if (d0.is(l13)) { try { if (!d0.valid(l13)) l13 = F; } catch (e) { l13 = threw_(e); } }
          else if (d1.is(l13)) {}
          else if (d2.is(l13)) {}
          else if (d3.is(l13)) { try { if (!d3.valid(l13)) l13 = F; } catch (e) { l13 = threw_(e); } }
        }
        break S0;
      }
      l13 = s2_2(l12, k1);
    }
    if (!((l13 !== F))) return F; // an op
    l14 = l0.get(l1);
    if (!((l14 !== undefined && l14 !== null))) return F; // a record
    if (!((typeof l14 === "object" || typeof l14 === "function"))) return F; // an object
    l14 = l14[k0];
    if (!((l14 !== undefined && l14 !== null))) return F; // a field
    if (!((typeof l14 === "number"))) return F; // a field of the schema
    try { l15 = s9_1_f(l14); } catch (e) { l15 = threw_(e); }
    if (l15 !== F) {
      if (l15 === undefined || l15 === null || (typeof l15 === "number" && !Number.isFinite(l15))) l15 = F;
      else if (d0.is(l15)) { try { if (!d0.valid(l15)) l15 = F; } catch (e) { l15 = threw_(e); } }
      else if (d1.is(l15)) {}
      else if (d2.is(l15)) {}
      else if (d3.is(l15)) { try { if (!d3.valid(l15)) l15 = F; } catch (e) { l15 = threw_(e); } }
    }
    if (!((l15 !== F))) return F; // an op
    l16 = rec_(k10, [l5, l7, l9, l11, l13, l15]);
    return l16;
  } catch {
    return F;
  }
};
