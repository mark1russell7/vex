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
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13;
  try {
    if (!(has_(l0, l1))) return raise_(err_(K[0], l1, l1)); // the origin is a key of the space
    L0: {
      L2: {
        L1: {
          l5 = l0.get(l1);
          if (!((l5 !== undefined && l5 !== null))) { l4 = err_(K[1], l1, l1, l1); break L1; } // a record
          if (!((typeof l5 === "object" || typeof l5 === "function"))) { l4 = err_(K[2], l1, l1, l1); break L1; } // an object
          l5 = l5[k3];
          if (!((l5 !== undefined && l5 !== null))) { l4 = err_(K[4], l1, l1, l1); break L1; } // a field
          if (!((typeof l5 === "number"))) return F; // a field of the schema
          try { l6 = f6_0(l5, k5); } catch (e) { l6 = threw_(e); }
          if (l6 !== F && typeof l6 !== "number") return F; // the kind of the result
          if (l6 !== F && !Number.isFinite(l6)) l6 = bad_(l6);
          if (l6 !== F) { try { if (!d0.valid(l6)) l6 = bad_(l6); } catch (e) { l6 = invalid_(e, 0); } }
          if (!((l6 !== F))) { l4 = err_(K[7], l1, l1); break L1; } // an op
          l8 = l0.get(l1);
          if (!((l8 !== undefined && l8 !== null))) { l7 = err_(K[8], l1, l1, l1); break L2; } // a record
          if (!((typeof l8 === "object" || typeof l8 === "function"))) { l7 = err_(K[9], l1, l1, l1); break L2; } // an object
          l8 = l8[k3];
          if (!((l8 !== undefined && l8 !== null))) { l7 = err_(K[10], l1, l1, l1); break L2; } // a field
          if (!((typeof l8 === "number"))) return F; // a field of the schema
          try { l9 = f11_0(l8, k5); } catch (e) { l9 = threw_(e); }
          if (l9 !== F && typeof l9 !== "boolean") return F; // the kind of the result
          if (l9 !== F) {
            if (l9 === undefined || l9 === null || (typeof l9 === "number" && !Number.isFinite(l9))) l9 = bad_(l9);
            else if (d0.is(l9)) { try { if (!d0.valid(l9)) l9 = bad_(l9); } catch (e) { l9 = invalid_(e, 0); } }
            else if (d1.is(l9)) { try { if (!d1.valid(l9)) l9 = bad_(l9); } catch (e) { l9 = invalid_(e, 1); } }
          }
          if (!((l9 !== F))) { l7 = err_(K[12], l1, l1); break L2; } // an op
          break L0;
        }
        L3: {
          l10 = l0.get(l1);
          if (!((l10 !== undefined && l10 !== null))) { l7 = err_(K[13], l1, l1, l1); break L3; } // a record
          if (!((typeof l10 === "object" || typeof l10 === "function"))) { l7 = err_(K[14], l1, l1, l1); break L3; } // an object
          l10 = l10[k3];
          if (!((l10 !== undefined && l10 !== null))) { l7 = err_(K[15], l1, l1, l1); break L3; } // a field
          if (!((typeof l10 === "number"))) return F; // a field of the schema
          try { l11 = f11_0(l10, k5); } catch (e) { l11 = threw_(e); }
          if (l11 !== F && typeof l11 !== "boolean") return F; // the kind of the result
          if (l11 !== F) {
            if (l11 === undefined || l11 === null || (typeof l11 === "number" && !Number.isFinite(l11))) l11 = bad_(l11);
            else if (d0.is(l11)) { try { if (!d0.valid(l11)) l11 = bad_(l11); } catch (e) { l11 = invalid_(e, 0); } }
            else if (d1.is(l11)) { try { if (!d1.valid(l11)) l11 = bad_(l11); } catch (e) { l11 = invalid_(e, 1); } }
          }
          if (!((l11 !== F))) { l7 = err_(K[16], l1, l1); break L3; } // an op
        }
      }
      l12 = args_(K[17], l1, l1, [l4, l7]);
      l4 = undefined;
      l7 = undefined;
      return raise_(l12);
    }
    l13 = rec_(k18, [l6, l9]);
    return l13;
  } catch {
    return F;
  }
};
