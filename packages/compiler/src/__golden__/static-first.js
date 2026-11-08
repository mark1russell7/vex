"use strict";
const F = R.F;
const has_ = R.has;
const raise_ = R.raise;
const err_ = R.err;
const bad_ = R.bad;
const invalid_ = R.invalid;
const args_ = R.args;
const rec_ = R.rec;
const k3 = K[3];
const k5 = K[5];
const k6 = K[6];
const k11 = K[11];
const k18 = K[18];
const d0 = R.domain(0);
const d1 = R.domain(1);
const f6_0 = d0.ops[k6].fn;
const f11_0 = d0.ops[k11].fn;
const threw_ = R.threw;
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14;
  try {
    if (!(has_(l0, l1))) return raise_(err_(K[0], l1, l1)); // the origin is a key of the space
    L2: {
      l5 = l0.get(l1);
      L0: {
        if (!((l5 !== undefined && l5 !== null))) { l4 = err_(K[1], l1, l1, l1); break L0; } // a record
        if (!((typeof l5 === "object" || typeof l5 === "function"))) { l4 = err_(K[2], l1, l1, l1); break L0; } // an object
        l5 = l5[k3];
        if (!((l5 !== undefined && l5 !== null))) { l4 = err_(K[4], l1, l1, l1); break L0; } // a field
        if (!((typeof l5 === "number"))) return F; // a field of the schema
        try { l6 = f6_0(l5, k5); } catch (e) { l6 = threw_(e); }
        if (l6 !== F && typeof l6 !== "number") return F; // the kind of the result
        if (l6 !== F && !Number.isFinite(l6)) l6 = bad_(l6);
        if (l6 !== F) { try { if (!d0.valid(l6)) l6 = bad_(l6); } catch (e) { l6 = invalid_(e, 0); } }
        if (!((l6 !== F))) { l4 = err_(K[7], l1, l1); break L0; } // an op
        l8 = l0.get(l1);
        if (!((l8 !== undefined && l8 !== null))) { l7 = err_(K[8], l1, l1, l1); break L0; } // a record
        if (!((typeof l8 === "object" || typeof l8 === "function"))) { l7 = err_(K[9], l1, l1, l1); break L0; } // an object
        l8 = l8[k3];
        if (!((l8 !== undefined && l8 !== null))) { l7 = err_(K[10], l1, l1, l1); break L0; } // a field
        if (!((typeof l8 === "number"))) return F; // a field of the schema
        try { l9 = f11_0(l8, k5); } catch (e) { l9 = threw_(e); }
        if (l9 !== F && typeof l9 !== "boolean") return F; // the kind of the result
        if (l9 !== F) {
          if (l9 === undefined || l9 === null || (typeof l9 === "number" && !Number.isFinite(l9))) l9 = bad_(l9);
          else if (d0.is(l9)) { try { if (!d0.valid(l9)) l9 = bad_(l9); } catch (e) { l9 = invalid_(e, 0); } }
          else if (d1.is(l9)) { try { if (!d1.valid(l9)) l9 = bad_(l9); } catch (e) { l9 = invalid_(e, 1); } }
        }
        if (!((l9 !== F))) { l7 = err_(K[12], l1, l1); break L0; } // an op
        break L2;
      }
      if (((l4 !== undefined && l4 !== null) || (l7 !== undefined && l7 !== null))) {
        l10 = (l4 !== undefined && l4 !== null);
        if (l10) {
          l11 = l0.get(l1);
          L1: {
            if (!((l11 !== undefined && l11 !== null))) { l7 = err_(K[13], l1, l1, l1); break L1; } // a record
            if (!((typeof l11 === "object" || typeof l11 === "function"))) { l7 = err_(K[14], l1, l1, l1); break L1; } // an object
            l11 = l11[k3];
            if (!((l11 !== undefined && l11 !== null))) { l7 = err_(K[15], l1, l1, l1); break L1; } // a field
            if (!((typeof l11 === "number"))) return F; // a field of the schema
            try { l12 = f11_0(l11, k5); } catch (e) { l12 = threw_(e); }
            if (l12 !== F && typeof l12 !== "boolean") return F; // the kind of the result
            if (l12 !== F) {
              if (l12 === undefined || l12 === null || (typeof l12 === "number" && !Number.isFinite(l12))) l12 = bad_(l12);
              else if (d0.is(l12)) { try { if (!d0.valid(l12)) l12 = bad_(l12); } catch (e) { l12 = invalid_(e, 0); } }
              else if (d1.is(l12)) { try { if (!d1.valid(l12)) l12 = bad_(l12); } catch (e) { l12 = invalid_(e, 1); } }
            }
            if (!((l12 !== F))) { l7 = err_(K[16], l1, l1); break L1; } // an op
          }
        }
        l13 = args_(K[17], l1, l1, [l4, l7]);
        l4 = undefined;
        l7 = undefined;
        return raise_(l13);
      }
    }
    l14 = rec_(k18, [l6, l9]);
    return l14;
  } catch {
    return F;
  }
};
