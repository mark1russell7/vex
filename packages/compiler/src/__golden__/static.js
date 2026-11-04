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
const k15 = K[15];
const k17 = K[17];
const k22 = K[22];
const k23 = K[23];
const k27 = K[27];
const k33 = K[33];
const k56 = K[56];
const s6_2 = R.site(k6, 2);
const s6_2_f = s6_2.fn;
const s33_1 = R.site(k33, 1);
const s33_1_f = s33_1.free;
const d0 = R.domain(0);
const d1 = R.domain(1);
const d2 = R.domain(2);
const d3 = R.domain(3);
const f6_0 = d0.ops[k6].fn;
const f11_0 = d0.ops[k11].fn;
const f17_1 = d1.ops[k17].fn;
const f23_0 = d0.ops[k23].fn;
const threw_ = R.threw;
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20, l21, l22, l23, l24, l25, l26, l27, l28, l29, l30, l31, l32, l33;
  try {
    if (!(has_(l0, l1))) return raise_(err_(K[0], l1, l1)); // the origin is a key of the space
    L0: {
      L6: {
        L5: {
          L4: {
            L3: {
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
                  if (!((l9 !== F))) { l7 = err_(K[12], l1, l1); break L2; } // an op
                  l11 = l0.get(l1);
                  if (!((l11 !== undefined && l11 !== null))) { l10 = err_(K[13], l1, l1, l1); break L3; } // a record
                  if (!((typeof l11 === "object" || typeof l11 === "function"))) { l10 = err_(K[14], l1, l1, l1); break L3; } // an object
                  l11 = l11[k15];
                  if (!((l11 !== undefined && l11 !== null))) { l10 = err_(K[16], l1, l1, l1); break L3; } // a field
                  if (!((typeof l11 === "string"))) return F; // a field of the schema
                  try { l12 = f17_1(l11); } catch (e) { l12 = threw_(e); }
                  if (l12 !== F && typeof l12 !== "string") return F; // the kind of the result
                  if (!((l12 !== F))) { l10 = err_(K[18], l1, l1); break L3; } // an op
                  l14 = l0.get(l1);
                  if (!((l14 !== undefined && l14 !== null))) { l13 = err_(K[19], l1, l1, l1); break L4; } // a record
                  if (!((typeof l14 === "object" || typeof l14 === "function"))) { l13 = err_(K[20], l1, l1, l1); break L4; } // an object
                  l14 = l14[k3];
                  if (!((l14 !== undefined && l14 !== null))) { l13 = err_(K[21], l1, l1, l1); break L4; } // a field
                  if (!((typeof l14 === "number"))) return F; // a field of the schema
                  try { l15 = f23_0(l14, k22); } catch (e) { l15 = threw_(e); }
                  if (l15 !== F) {
                    if (l15 === undefined || l15 === null || (typeof l15 === "number" && !Number.isFinite(l15))) l15 = bad_(l15);
                    else if (d0.is(l15)) { try { if (!d0.valid(l15)) l15 = bad_(l15); } catch (e) { l15 = invalid_(e, 0); } }
                    else if (d1.is(l15)) {}
                    else if (d2.is(l15)) {}
                    else if (d3.is(l15)) { try { if (!d3.valid(l15)) l15 = bad_(l15); } catch (e) { l15 = invalid_(e, 3); } }
                  }
                  if (!((l15 !== F))) { l13 = err_(K[24], l1, l1); break L4; } // an op
                  l17 = l0.get(l1);
                  if (!((l17 !== undefined && l17 !== null))) { l16 = err_(K[25], l1, l1, l1); break L5; } // a record
                  if (!((typeof l17 === "object" || typeof l17 === "function"))) { l16 = err_(K[26], l1, l1, l1); break L5; } // an object
                  l17 = l17[k27];
                  if (!((l17 !== undefined && l17 !== null))) { l16 = err_(K[28], l1, l1, l1); break L5; } // a field
                  if (!((typeof l17 === "boolean"))) return F; // a field of the schema
                  S0: {
                    if (d0.is(l17)) {
                      if (!(typeof k5 === "number")) { l18 = s6_2(l17, k5); break S0; }
                      try { l18 = s6_2_f(l17, k5); } catch (e) { l18 = threw_(e); }
                      if (l18 !== F) {
                        if (l18 === undefined || l18 === null || (typeof l18 === "number" && !Number.isFinite(l18))) l18 = bad_(l18);
                        else if (d0.is(l18)) { try { if (!d0.valid(l18)) l18 = bad_(l18); } catch (e) { l18 = invalid_(e, 0); } }
                        else if (d1.is(l18)) {}
                        else if (d2.is(l18)) {}
                        else if (d3.is(l18)) { try { if (!d3.valid(l18)) l18 = bad_(l18); } catch (e) { l18 = invalid_(e, 3); } }
                      }
                      break S0;
                    }
                    l18 = s6_2(l17, k5);
                  }
                  if (!((l18 !== F))) { l16 = err_(K[29], l1, l1); break L5; } // an op
                  l20 = l0.get(l1);
                  if (!((l20 !== undefined && l20 !== null))) { l19 = err_(K[30], l1, l1, l1); break L6; } // a record
                  if (!((typeof l20 === "object" || typeof l20 === "function"))) { l19 = err_(K[31], l1, l1, l1); break L6; } // an object
                  l20 = l20[k3];
                  if (!((l20 !== undefined && l20 !== null))) { l19 = err_(K[32], l1, l1, l1); break L6; } // a field
                  if (!((typeof l20 === "number"))) return F; // a field of the schema
                  try { l21 = s33_1_f(l20); } catch (e) { l21 = threw_(e); }
                  if (l21 !== F) {
                    if (l21 === undefined || l21 === null || (typeof l21 === "number" && !Number.isFinite(l21))) l21 = bad_(l21);
                    else if (d0.is(l21)) { try { if (!d0.valid(l21)) l21 = bad_(l21); } catch (e) { l21 = invalid_(e, 0); } }
                    else if (d1.is(l21)) {}
                    else if (d2.is(l21)) {}
                    else if (d3.is(l21)) { try { if (!d3.valid(l21)) l21 = bad_(l21); } catch (e) { l21 = invalid_(e, 3); } }
                  }
                  if (!((l21 !== F))) { l19 = err_(K[34], l1, l1); break L6; } // an op
                  break L0;
                }
                L7: {
                  l22 = l0.get(l1);
                  if (!((l22 !== undefined && l22 !== null))) { l7 = err_(K[35], l1, l1, l1); break L7; } // a record
                  if (!((typeof l22 === "object" || typeof l22 === "function"))) { l7 = err_(K[36], l1, l1, l1); break L7; } // an object
                  l22 = l22[k3];
                  if (!((l22 !== undefined && l22 !== null))) { l7 = err_(K[37], l1, l1, l1); break L7; } // a field
                  if (!((typeof l22 === "number"))) return F; // a field of the schema
                  try { l23 = f11_0(l22, k5); } catch (e) { l23 = threw_(e); }
                  if (l23 !== F && typeof l23 !== "boolean") return F; // the kind of the result
                  if (!((l23 !== F))) { l7 = err_(K[38], l1, l1); break L7; } // an op
                }
              }
              L8: {
                l24 = l0.get(l1);
                if (!((l24 !== undefined && l24 !== null))) { l10 = err_(K[39], l1, l1, l1); break L8; } // a record
                if (!((typeof l24 === "object" || typeof l24 === "function"))) { l10 = err_(K[40], l1, l1, l1); break L8; } // an object
                l24 = l24[k15];
                if (!((l24 !== undefined && l24 !== null))) { l10 = err_(K[41], l1, l1, l1); break L8; } // a field
                if (!((typeof l24 === "string"))) return F; // a field of the schema
                try { l25 = f17_1(l24); } catch (e) { l25 = threw_(e); }
                if (l25 !== F && typeof l25 !== "string") return F; // the kind of the result
                if (!((l25 !== F))) { l10 = err_(K[42], l1, l1); break L8; } // an op
              }
            }
            L9: {
              l26 = l0.get(l1);
              if (!((l26 !== undefined && l26 !== null))) { l13 = err_(K[43], l1, l1, l1); break L9; } // a record
              if (!((typeof l26 === "object" || typeof l26 === "function"))) { l13 = err_(K[44], l1, l1, l1); break L9; } // an object
              l26 = l26[k3];
              if (!((l26 !== undefined && l26 !== null))) { l13 = err_(K[45], l1, l1, l1); break L9; } // a field
              if (!((typeof l26 === "number"))) return F; // a field of the schema
              try { l27 = f23_0(l26, k22); } catch (e) { l27 = threw_(e); }
              if (l27 !== F) {
                if (l27 === undefined || l27 === null || (typeof l27 === "number" && !Number.isFinite(l27))) l27 = bad_(l27);
                else if (d0.is(l27)) { try { if (!d0.valid(l27)) l27 = bad_(l27); } catch (e) { l27 = invalid_(e, 0); } }
                else if (d1.is(l27)) {}
                else if (d2.is(l27)) {}
                else if (d3.is(l27)) { try { if (!d3.valid(l27)) l27 = bad_(l27); } catch (e) { l27 = invalid_(e, 3); } }
              }
              if (!((l27 !== F))) { l13 = err_(K[46], l1, l1); break L9; } // an op
            }
          }
          L10: {
            l28 = l0.get(l1);
            if (!((l28 !== undefined && l28 !== null))) { l16 = err_(K[47], l1, l1, l1); break L10; } // a record
            if (!((typeof l28 === "object" || typeof l28 === "function"))) { l16 = err_(K[48], l1, l1, l1); break L10; } // an object
            l28 = l28[k27];
            if (!((l28 !== undefined && l28 !== null))) { l16 = err_(K[49], l1, l1, l1); break L10; } // a field
            if (!((typeof l28 === "boolean"))) return F; // a field of the schema
            S1: {
              if (d0.is(l28)) {
                if (!(typeof k5 === "number")) { l29 = s6_2(l28, k5); break S1; }
                try { l29 = s6_2_f(l28, k5); } catch (e) { l29 = threw_(e); }
                if (l29 !== F) {
                  if (l29 === undefined || l29 === null || (typeof l29 === "number" && !Number.isFinite(l29))) l29 = bad_(l29);
                  else if (d0.is(l29)) { try { if (!d0.valid(l29)) l29 = bad_(l29); } catch (e) { l29 = invalid_(e, 0); } }
                  else if (d1.is(l29)) {}
                  else if (d2.is(l29)) {}
                  else if (d3.is(l29)) { try { if (!d3.valid(l29)) l29 = bad_(l29); } catch (e) { l29 = invalid_(e, 3); } }
                }
                break S1;
              }
              l29 = s6_2(l28, k5);
            }
            if (!((l29 !== F))) { l16 = err_(K[50], l1, l1); break L10; } // an op
          }
        }
        L11: {
          l30 = l0.get(l1);
          if (!((l30 !== undefined && l30 !== null))) { l19 = err_(K[51], l1, l1, l1); break L11; } // a record
          if (!((typeof l30 === "object" || typeof l30 === "function"))) { l19 = err_(K[52], l1, l1, l1); break L11; } // an object
          l30 = l30[k3];
          if (!((l30 !== undefined && l30 !== null))) { l19 = err_(K[53], l1, l1, l1); break L11; } // a field
          if (!((typeof l30 === "number"))) return F; // a field of the schema
          try { l31 = s33_1_f(l30); } catch (e) { l31 = threw_(e); }
          if (l31 !== F) {
            if (l31 === undefined || l31 === null || (typeof l31 === "number" && !Number.isFinite(l31))) l31 = bad_(l31);
            else if (d0.is(l31)) { try { if (!d0.valid(l31)) l31 = bad_(l31); } catch (e) { l31 = invalid_(e, 0); } }
            else if (d1.is(l31)) {}
            else if (d2.is(l31)) {}
            else if (d3.is(l31)) { try { if (!d3.valid(l31)) l31 = bad_(l31); } catch (e) { l31 = invalid_(e, 3); } }
          }
          if (!((l31 !== F))) { l19 = err_(K[54], l1, l1); break L11; } // an op
        }
      }
      l32 = args_(K[55], l1, l1, [l4, l7, l10, l13, l16, l19]);
      l4 = undefined;
      l7 = undefined;
      l10 = undefined;
      l13 = undefined;
      l16 = undefined;
      l19 = undefined;
      return raise_(l32);
    }
    l33 = rec_(k56, [l6, l9, l12, l15, l18, l21]);
    return l33;
  } catch {
    return F;
  }
};
