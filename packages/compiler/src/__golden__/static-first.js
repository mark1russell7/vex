"use strict";
const F = R.F;
const has_ = R.has;
const rec_ = R.rec;
const k0 = K[0];
const k1 = K[1];
const k2 = K[2];
const k3 = K[3];
const k4 = K[4];
const d0 = R.domain(0);
const d1 = R.domain(1);
const f2_0 = d0.ops[k2].fn;
const f3_0 = d0.ops[k3].fn;
const threw_ = R.threw;
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8;
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
    if (l7 !== F) {
      if (l7 === undefined || l7 === null || (typeof l7 === "number" && !Number.isFinite(l7))) l7 = F;
      else if (d0.is(l7)) { try { if (!d0.valid(l7)) l7 = F; } catch (e) { l7 = threw_(e); } }
      else if (d1.is(l7)) { try { if (!d1.valid(l7)) l7 = F; } catch (e) { l7 = threw_(e); } }
    }
    if (!((l7 !== F))) return F; // an op
    l8 = rec_(k4, [l5, l7]);
    return l8;
  } catch {
    return F;
  }
};
