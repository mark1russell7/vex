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
const k6 = K[6];
const k5 = K[5];
const k11 = K[11];
const k15 = K[15];
const k18 = K[18];
const k17 = K[17];
const k23 = K[23];
const k28 = K[28];
const k33 = K[33];
const k35 = K[35];
const k59 = K[59];
const s6_2 = R.site(k6, 2);
const s11_1 = R.site(k11, 1);
const s18_2 = R.site(k18, 2);
const s18_2_f = s18_2.fn;
const s23_1 = R.site(k23, 1);
const s23_1_f = s23_1.free;
const s28_2 = R.site(k28, 2);
const s33_1 = R.site(k33, 1);
const a35 = R.axis(k35);
const d0 = R.domain(0);
const d1 = R.domain(1);
const threw_ = R.threw;
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20, l21, l22, l23, l24, l25, l26, l27, l28, l29, l30, l31, l32, l33, l34, l35, l36, l37, l38, l39, l40, l41, l42, l43, l44, l45, l46, l47, l48, l49, l50, l51, l52;
  try {
    if (!(has_(l0, l1))) return raise_(err_(K[0], l1, l1)); // the origin is a key of the space
    L0: {
      L7: {
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
                    S0: {
                      if (typeof l5 === "object" && l5 !== null) {
                        const mS0 = s6_2.m;
                        if (mS0 !== undefined && l5[k6] === mS0 && d0.is(l5)) {
                          if (typeof k5 === "number") { l6 = s6_2(l5, k5); break S0; }
                          if (!(d0.is(k5))) { l6 = s6_2(l5, k5); break S0; }
                          try { l6 = l5[k6](k5); } catch (e) { l6 = threw_(e); }
                          if (l6 !== F) {
                            if (l6 === undefined || l6 === null || (typeof l6 === "number" && !Number.isFinite(l6))) l6 = bad_(l6);
                            else if (d0.is(l6)) { try { if (!d0.valid(l6)) l6 = bad_(l6); } catch (e) { l6 = invalid_(e, 0); } }
                            else if (d1.is(l6)) { try { if (!d1.valid(l6)) l6 = bad_(l6); } catch (e) { l6 = invalid_(e, 1); } }
                          }
                          break S0;
                        }
                      }
                      l6 = s6_2(l5, k5);
                    }
                    if (!((l6 !== F))) { l4 = err_(K[7], l1, l1); break L1; } // an op
                    l8 = l0.get(l1);
                    if (!((l8 !== undefined && l8 !== null))) { l7 = err_(K[8], l1, l1, l1); break L2; } // a record
                    if (!((typeof l8 === "object" || typeof l8 === "function"))) { l7 = err_(K[9], l1, l1, l1); break L2; } // an object
                    l8 = l8[k3];
                    if (!((l8 !== undefined && l8 !== null))) { l7 = err_(K[10], l1, l1, l1); break L2; } // a field
                    S1: {
                      if (typeof l8 === "object" && l8 !== null) {
                        const mS1 = s11_1.m;
                        if (mS1 !== undefined && l8[k11] === mS1 && d0.is(l8)) {
                          try { l9 = l8[k11](); } catch (e) { l9 = threw_(e); }
                          if (l9 !== F) {
                            if (l9 === undefined || l9 === null || (typeof l9 === "number" && !Number.isFinite(l9))) l9 = bad_(l9);
                            else if (d0.is(l9)) { try { if (!d0.valid(l9)) l9 = bad_(l9); } catch (e) { l9 = invalid_(e, 0); } }
                            else if (d1.is(l9)) { try { if (!d1.valid(l9)) l9 = bad_(l9); } catch (e) { l9 = invalid_(e, 1); } }
                          }
                          break S1;
                        }
                      }
                      l9 = s11_1(l8);
                    }
                    if (!((l9 !== F))) { l7 = err_(K[12], l1, l1); break L2; } // an op
                    l11 = l0.get(l1);
                    if (!((l11 !== undefined && l11 !== null))) { l10 = err_(K[13], l1, l1, l1); break L3; } // a record
                    if (!((typeof l11 === "object" || typeof l11 === "function"))) { l10 = err_(K[14], l1, l1, l1); break L3; } // an object
                    l11 = l11[k15];
                    if (!((l11 !== undefined && l11 !== null))) { l10 = err_(K[16], l1, l1, l1); break L3; } // a field
                    S2: {
                      if (d1.is(l11)) {
                        if (!(typeof k17 === "number")) { l12 = s18_2(l11, k17); break S2; }
                        try { l12 = s18_2_f(l11, k17); } catch (e) { l12 = threw_(e); }
                        if (l12 !== F) {
                          if (l12 === undefined || l12 === null || (typeof l12 === "number" && !Number.isFinite(l12))) l12 = bad_(l12);
                          else if (d0.is(l12)) { try { if (!d0.valid(l12)) l12 = bad_(l12); } catch (e) { l12 = invalid_(e, 0); } }
                          else if (d1.is(l12)) { try { if (!d1.valid(l12)) l12 = bad_(l12); } catch (e) { l12 = invalid_(e, 1); } }
                        }
                        break S2;
                      }
                      l12 = s18_2(l11, k17);
                    }
                    if (!((l12 !== F))) { l10 = err_(K[19], l1, l1); break L3; } // an op
                    l14 = l0.get(l1);
                    if (!((l14 !== undefined && l14 !== null))) { l13 = err_(K[20], l1, l1, l1); break L4; } // a record
                    if (!((typeof l14 === "object" || typeof l14 === "function"))) { l13 = err_(K[21], l1, l1, l1); break L4; } // an object
                    l14 = l14[k15];
                    if (!((l14 !== undefined && l14 !== null))) { l13 = err_(K[22], l1, l1, l1); break L4; } // a field
                    try { l15 = s23_1_f(l14); } catch (e) { l15 = threw_(e); }
                    if (l15 !== F) {
                      if (l15 === undefined || l15 === null || (typeof l15 === "number" && !Number.isFinite(l15))) l15 = bad_(l15);
                      else if (d0.is(l15)) { try { if (!d0.valid(l15)) l15 = bad_(l15); } catch (e) { l15 = invalid_(e, 0); } }
                      else if (d1.is(l15)) { try { if (!d1.valid(l15)) l15 = bad_(l15); } catch (e) { l15 = invalid_(e, 1); } }
                    }
                    if (!((l15 !== F))) { l13 = err_(K[24], l1, l1); break L4; } // an op
                    l17 = l0.get(l1);
                    if (!((l17 !== undefined && l17 !== null))) { l16 = err_(K[25], l1, l1, l1); break L5; } // a record
                    if (!((typeof l17 === "object" || typeof l17 === "function"))) { l16 = err_(K[26], l1, l1, l1); break L5; } // an object
                    l17 = l17[k15];
                    if (!((l17 !== undefined && l17 !== null))) { l16 = err_(K[27], l1, l1, l1); break L5; } // a field
                    l18 = s28_2(l17, k5);
                    if (!((l18 !== F))) { l16 = err_(K[29], l1, l1); break L5; } // an op
                    l20 = l0.get(l1);
                    if (!((l20 !== undefined && l20 !== null))) { l19 = err_(K[30], l1, l1, l1); break L6; } // a record
                    if (!((typeof l20 === "object" || typeof l20 === "function"))) { l19 = err_(K[31], l1, l1, l1); break L6; } // an object
                    l20 = l20[k15];
                    if (!((l20 !== undefined && l20 !== null))) { l19 = err_(K[32], l1, l1, l1); break L6; } // a field
                    l21 = s33_1(l20);
                    if (!((l21 !== F))) { l19 = err_(K[34], l1, l1); break L6; } // an op
                    l24 = 0;
                    l25 = a35(l0, l1, l1);
                    if (!((l25 !== F))) { l22 = err_(K[36], l1, l1, l0, l1); break L7; } // the targets of an axis
                    l26 = l25.idx;
                    l27 = l0.records;
                    l28 = l25.keys;
                    L8: for (l29 = 0; l29 < l28.length; l29++) {
                      l30 = l28[l29];
                      l31 = (l27 !== undefined ? l27[l26[l29]] : l0.get(l30));
                      if (!((l31 !== undefined && l31 !== null))) continue L8; // a record
                      if (!((typeof l31 === "object" || typeof l31 === "function"))) continue L8; // an object
                      l31 = l31[k15];
                      if (!((l31 !== undefined && l31 !== null))) continue L8; // a field
                      l24 = (l24 + 1);
                    }
                    break L0;
                  }
                  L9: {
                    l32 = l0.get(l1);
                    if (!((l32 !== undefined && l32 !== null))) { l7 = err_(K[37], l1, l1, l1); break L9; } // a record
                    if (!((typeof l32 === "object" || typeof l32 === "function"))) { l7 = err_(K[38], l1, l1, l1); break L9; } // an object
                    l32 = l32[k3];
                    if (!((l32 !== undefined && l32 !== null))) { l7 = err_(K[39], l1, l1, l1); break L9; } // a field
                    S3: {
                      if (typeof l32 === "object" && l32 !== null) {
                        const mS3 = s11_1.m;
                        if (mS3 !== undefined && l32[k11] === mS3 && d0.is(l32)) {
                          try { l33 = l32[k11](); } catch (e) { l33 = threw_(e); }
                          if (l33 !== F) {
                            if (l33 === undefined || l33 === null || (typeof l33 === "number" && !Number.isFinite(l33))) l33 = bad_(l33);
                            else if (d0.is(l33)) { try { if (!d0.valid(l33)) l33 = bad_(l33); } catch (e) { l33 = invalid_(e, 0); } }
                            else if (d1.is(l33)) { try { if (!d1.valid(l33)) l33 = bad_(l33); } catch (e) { l33 = invalid_(e, 1); } }
                          }
                          break S3;
                        }
                      }
                      l33 = s11_1(l32);
                    }
                    if (!((l33 !== F))) { l7 = err_(K[40], l1, l1); break L9; } // an op
                  }
                }
                L10: {
                  l34 = l0.get(l1);
                  if (!((l34 !== undefined && l34 !== null))) { l10 = err_(K[41], l1, l1, l1); break L10; } // a record
                  if (!((typeof l34 === "object" || typeof l34 === "function"))) { l10 = err_(K[42], l1, l1, l1); break L10; } // an object
                  l34 = l34[k15];
                  if (!((l34 !== undefined && l34 !== null))) { l10 = err_(K[43], l1, l1, l1); break L10; } // a field
                  S4: {
                    if (d1.is(l34)) {
                      if (!(typeof k17 === "number")) { l35 = s18_2(l34, k17); break S4; }
                      try { l35 = s18_2_f(l34, k17); } catch (e) { l35 = threw_(e); }
                      if (l35 !== F) {
                        if (l35 === undefined || l35 === null || (typeof l35 === "number" && !Number.isFinite(l35))) l35 = bad_(l35);
                        else if (d0.is(l35)) { try { if (!d0.valid(l35)) l35 = bad_(l35); } catch (e) { l35 = invalid_(e, 0); } }
                        else if (d1.is(l35)) { try { if (!d1.valid(l35)) l35 = bad_(l35); } catch (e) { l35 = invalid_(e, 1); } }
                      }
                      break S4;
                    }
                    l35 = s18_2(l34, k17);
                  }
                  if (!((l35 !== F))) { l10 = err_(K[44], l1, l1); break L10; } // an op
                }
              }
              L11: {
                l36 = l0.get(l1);
                if (!((l36 !== undefined && l36 !== null))) { l13 = err_(K[45], l1, l1, l1); break L11; } // a record
                if (!((typeof l36 === "object" || typeof l36 === "function"))) { l13 = err_(K[46], l1, l1, l1); break L11; } // an object
                l36 = l36[k15];
                if (!((l36 !== undefined && l36 !== null))) { l13 = err_(K[47], l1, l1, l1); break L11; } // a field
                try { l37 = s23_1_f(l36); } catch (e) { l37 = threw_(e); }
                if (l37 !== F) {
                  if (l37 === undefined || l37 === null || (typeof l37 === "number" && !Number.isFinite(l37))) l37 = bad_(l37);
                  else if (d0.is(l37)) { try { if (!d0.valid(l37)) l37 = bad_(l37); } catch (e) { l37 = invalid_(e, 0); } }
                  else if (d1.is(l37)) { try { if (!d1.valid(l37)) l37 = bad_(l37); } catch (e) { l37 = invalid_(e, 1); } }
                }
                if (!((l37 !== F))) { l13 = err_(K[48], l1, l1); break L11; } // an op
              }
            }
            L12: {
              l38 = l0.get(l1);
              if (!((l38 !== undefined && l38 !== null))) { l16 = err_(K[49], l1, l1, l1); break L12; } // a record
              if (!((typeof l38 === "object" || typeof l38 === "function"))) { l16 = err_(K[50], l1, l1, l1); break L12; } // an object
              l38 = l38[k15];
              if (!((l38 !== undefined && l38 !== null))) { l16 = err_(K[51], l1, l1, l1); break L12; } // a field
              l39 = s28_2(l38, k5);
              if (!((l39 !== F))) { l16 = err_(K[52], l1, l1); break L12; } // an op
            }
          }
          L13: {
            l40 = l0.get(l1);
            if (!((l40 !== undefined && l40 !== null))) { l19 = err_(K[53], l1, l1, l1); break L13; } // a record
            if (!((typeof l40 === "object" || typeof l40 === "function"))) { l19 = err_(K[54], l1, l1, l1); break L13; } // an object
            l40 = l40[k15];
            if (!((l40 !== undefined && l40 !== null))) { l19 = err_(K[55], l1, l1, l1); break L13; } // a field
            l41 = s33_1(l40);
            if (!((l41 !== F))) { l19 = err_(K[56], l1, l1); break L13; } // an op
          }
        }
        L14: {
          l43 = 0;
          l44 = a35(l0, l1, l1);
          if (!((l44 !== F))) { l22 = err_(K[57], l1, l1, l0, l1); break L14; } // the targets of an axis
          l45 = l44.idx;
          l46 = l0.records;
          l47 = l44.keys;
          L15: for (l48 = 0; l48 < l47.length; l48++) {
            l49 = l47[l48];
            l50 = (l46 !== undefined ? l46[l45[l48]] : l0.get(l49));
            if (!((l50 !== undefined && l50 !== null))) continue L15; // a record
            if (!((typeof l50 === "object" || typeof l50 === "function"))) continue L15; // an object
            l50 = l50[k15];
            if (!((l50 !== undefined && l50 !== null))) continue L15; // a field
            l43 = (l43 + 1);
          }
        }
      }
      l51 = args_(K[58], l1, l1, [l4, l7, l10, l13, l16, l19, l22]);
      l4 = undefined;
      l7 = undefined;
      l10 = undefined;
      l13 = undefined;
      l16 = undefined;
      l19 = undefined;
      l22 = undefined;
      return raise_(l51);
    }
    l52 = rec_(k59, [l6, l9, l12, l15, l18, l21, l24]);
    return l52;
  } catch {
    return F;
  }
};
