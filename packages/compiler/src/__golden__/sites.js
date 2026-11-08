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
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20, l21, l22, l23, l24, l25, l26, l27, l28, l29, l30, l31, l32, l33, l34, l35, l36, l37, l38, l39, l40, l41, l42, l43, l44, l45, l46, l47, l48, l49, l50, l51, l52, l53;
  try {
    if (!(has_(l0, l1))) return raise_(err_(K[0], l1, l1)); // the origin is a key of the space
    L9: {
      l5 = l0.get(l1);
      L0: {
        if (!((l5 !== undefined && l5 !== null))) { l4 = err_(K[1], l1, l1, l1); break L0; } // a record
        if (!((typeof l5 === "object" || typeof l5 === "function"))) { l4 = err_(K[2], l1, l1, l1); break L0; } // an object
        l5 = l5[k3];
        if (!((l5 !== undefined && l5 !== null))) { l4 = err_(K[4], l1, l1, l1); break L0; } // a field
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
        if (!((l6 !== F))) { l4 = err_(K[7], l1, l1); break L0; } // an op
        l8 = l0.get(l1);
        if (!((l8 !== undefined && l8 !== null))) { l7 = err_(K[8], l1, l1, l1); break L0; } // a record
        if (!((typeof l8 === "object" || typeof l8 === "function"))) { l7 = err_(K[9], l1, l1, l1); break L0; } // an object
        l8 = l8[k3];
        if (!((l8 !== undefined && l8 !== null))) { l7 = err_(K[10], l1, l1, l1); break L0; } // a field
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
        if (!((l9 !== F))) { l7 = err_(K[12], l1, l1); break L0; } // an op
        l11 = l0.get(l1);
        if (!((l11 !== undefined && l11 !== null))) { l10 = err_(K[13], l1, l1, l1); break L0; } // a record
        if (!((typeof l11 === "object" || typeof l11 === "function"))) { l10 = err_(K[14], l1, l1, l1); break L0; } // an object
        l11 = l11[k15];
        if (!((l11 !== undefined && l11 !== null))) { l10 = err_(K[16], l1, l1, l1); break L0; } // a field
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
        if (!((l12 !== F))) { l10 = err_(K[19], l1, l1); break L0; } // an op
        l14 = l0.get(l1);
        if (!((l14 !== undefined && l14 !== null))) { l13 = err_(K[20], l1, l1, l1); break L0; } // a record
        if (!((typeof l14 === "object" || typeof l14 === "function"))) { l13 = err_(K[21], l1, l1, l1); break L0; } // an object
        l14 = l14[k15];
        if (!((l14 !== undefined && l14 !== null))) { l13 = err_(K[22], l1, l1, l1); break L0; } // a field
        try { l15 = s23_1_f(l14); } catch (e) { l15 = threw_(e); }
        if (l15 !== F) {
          if (l15 === undefined || l15 === null || (typeof l15 === "number" && !Number.isFinite(l15))) l15 = bad_(l15);
          else if (d0.is(l15)) { try { if (!d0.valid(l15)) l15 = bad_(l15); } catch (e) { l15 = invalid_(e, 0); } }
          else if (d1.is(l15)) { try { if (!d1.valid(l15)) l15 = bad_(l15); } catch (e) { l15 = invalid_(e, 1); } }
        }
        if (!((l15 !== F))) { l13 = err_(K[24], l1, l1); break L0; } // an op
        l17 = l0.get(l1);
        if (!((l17 !== undefined && l17 !== null))) { l16 = err_(K[25], l1, l1, l1); break L0; } // a record
        if (!((typeof l17 === "object" || typeof l17 === "function"))) { l16 = err_(K[26], l1, l1, l1); break L0; } // an object
        l17 = l17[k15];
        if (!((l17 !== undefined && l17 !== null))) { l16 = err_(K[27], l1, l1, l1); break L0; } // a field
        l18 = s28_2(l17, k5);
        if (!((l18 !== F))) { l16 = err_(K[29], l1, l1); break L0; } // an op
        l20 = l0.get(l1);
        if (!((l20 !== undefined && l20 !== null))) { l19 = err_(K[30], l1, l1, l1); break L0; } // a record
        if (!((typeof l20 === "object" || typeof l20 === "function"))) { l19 = err_(K[31], l1, l1, l1); break L0; } // an object
        l20 = l20[k15];
        if (!((l20 !== undefined && l20 !== null))) { l19 = err_(K[32], l1, l1, l1); break L0; } // a field
        l21 = s33_1(l20);
        if (!((l21 !== F))) { l19 = err_(K[34], l1, l1); break L0; } // an op
        l24 = 0;
        l25 = a35(l0, l1, l1);
        if (!((l25 !== F))) { l22 = err_(K[36], l1, l1, l0, l1); break L0; } // the targets of an axis
        l26 = l25.idx;
        l27 = l0.records;
        l28 = l25.keys;
        L1: for (l29 = 0; l29 < l28.length; l29++) {
          l30 = l28[l29];
          l31 = (l27 !== undefined ? l27[l26[l29]] : l0.get(l30));
          if (!((l31 !== undefined && l31 !== null))) continue L1; // a record
          if (!((typeof l31 === "object" || typeof l31 === "function"))) continue L1; // an object
          l31 = l31[k15];
          if (!((l31 !== undefined && l31 !== null))) continue L1; // a field
          l24 = (l24 + 1);
        }
        break L9;
      }
      if ((((((((l4 !== undefined && l4 !== null) || (l7 !== undefined && l7 !== null)) || (l10 !== undefined && l10 !== null)) || (l13 !== undefined && l13 !== null)) || (l16 !== undefined && l16 !== null)) || (l19 !== undefined && l19 !== null)) || (l22 !== undefined && l22 !== null))) {
        l32 = (l4 !== undefined && l4 !== null);
        if (l32) {
          l33 = l0.get(l1);
          L2: {
            if (!((l33 !== undefined && l33 !== null))) { l7 = err_(K[37], l1, l1, l1); break L2; } // a record
            if (!((typeof l33 === "object" || typeof l33 === "function"))) { l7 = err_(K[38], l1, l1, l1); break L2; } // an object
            l33 = l33[k3];
            if (!((l33 !== undefined && l33 !== null))) { l7 = err_(K[39], l1, l1, l1); break L2; } // a field
            S3: {
              if (typeof l33 === "object" && l33 !== null) {
                const mS3 = s11_1.m;
                if (mS3 !== undefined && l33[k11] === mS3 && d0.is(l33)) {
                  try { l34 = l33[k11](); } catch (e) { l34 = threw_(e); }
                  if (l34 !== F) {
                    if (l34 === undefined || l34 === null || (typeof l34 === "number" && !Number.isFinite(l34))) l34 = bad_(l34);
                    else if (d0.is(l34)) { try { if (!d0.valid(l34)) l34 = bad_(l34); } catch (e) { l34 = invalid_(e, 0); } }
                    else if (d1.is(l34)) { try { if (!d1.valid(l34)) l34 = bad_(l34); } catch (e) { l34 = invalid_(e, 1); } }
                  }
                  break S3;
                }
              }
              l34 = s11_1(l33);
            }
            if (!((l34 !== F))) { l7 = err_(K[40], l1, l1); break L2; } // an op
          }
        }
        l32 = (l32 || (l7 !== undefined && l7 !== null));
        if (l32) {
          l35 = l0.get(l1);
          L3: {
            if (!((l35 !== undefined && l35 !== null))) { l10 = err_(K[41], l1, l1, l1); break L3; } // a record
            if (!((typeof l35 === "object" || typeof l35 === "function"))) { l10 = err_(K[42], l1, l1, l1); break L3; } // an object
            l35 = l35[k15];
            if (!((l35 !== undefined && l35 !== null))) { l10 = err_(K[43], l1, l1, l1); break L3; } // a field
            S4: {
              if (d1.is(l35)) {
                if (!(typeof k17 === "number")) { l36 = s18_2(l35, k17); break S4; }
                try { l36 = s18_2_f(l35, k17); } catch (e) { l36 = threw_(e); }
                if (l36 !== F) {
                  if (l36 === undefined || l36 === null || (typeof l36 === "number" && !Number.isFinite(l36))) l36 = bad_(l36);
                  else if (d0.is(l36)) { try { if (!d0.valid(l36)) l36 = bad_(l36); } catch (e) { l36 = invalid_(e, 0); } }
                  else if (d1.is(l36)) { try { if (!d1.valid(l36)) l36 = bad_(l36); } catch (e) { l36 = invalid_(e, 1); } }
                }
                break S4;
              }
              l36 = s18_2(l35, k17);
            }
            if (!((l36 !== F))) { l10 = err_(K[44], l1, l1); break L3; } // an op
          }
        }
        l32 = (l32 || (l10 !== undefined && l10 !== null));
        if (l32) {
          l37 = l0.get(l1);
          L4: {
            if (!((l37 !== undefined && l37 !== null))) { l13 = err_(K[45], l1, l1, l1); break L4; } // a record
            if (!((typeof l37 === "object" || typeof l37 === "function"))) { l13 = err_(K[46], l1, l1, l1); break L4; } // an object
            l37 = l37[k15];
            if (!((l37 !== undefined && l37 !== null))) { l13 = err_(K[47], l1, l1, l1); break L4; } // a field
            try { l38 = s23_1_f(l37); } catch (e) { l38 = threw_(e); }
            if (l38 !== F) {
              if (l38 === undefined || l38 === null || (typeof l38 === "number" && !Number.isFinite(l38))) l38 = bad_(l38);
              else if (d0.is(l38)) { try { if (!d0.valid(l38)) l38 = bad_(l38); } catch (e) { l38 = invalid_(e, 0); } }
              else if (d1.is(l38)) { try { if (!d1.valid(l38)) l38 = bad_(l38); } catch (e) { l38 = invalid_(e, 1); } }
            }
            if (!((l38 !== F))) { l13 = err_(K[48], l1, l1); break L4; } // an op
          }
        }
        l32 = (l32 || (l13 !== undefined && l13 !== null));
        if (l32) {
          l39 = l0.get(l1);
          L5: {
            if (!((l39 !== undefined && l39 !== null))) { l16 = err_(K[49], l1, l1, l1); break L5; } // a record
            if (!((typeof l39 === "object" || typeof l39 === "function"))) { l16 = err_(K[50], l1, l1, l1); break L5; } // an object
            l39 = l39[k15];
            if (!((l39 !== undefined && l39 !== null))) { l16 = err_(K[51], l1, l1, l1); break L5; } // a field
            l40 = s28_2(l39, k5);
            if (!((l40 !== F))) { l16 = err_(K[52], l1, l1); break L5; } // an op
          }
        }
        l32 = (l32 || (l16 !== undefined && l16 !== null));
        if (l32) {
          l41 = l0.get(l1);
          L6: {
            if (!((l41 !== undefined && l41 !== null))) { l19 = err_(K[53], l1, l1, l1); break L6; } // a record
            if (!((typeof l41 === "object" || typeof l41 === "function"))) { l19 = err_(K[54], l1, l1, l1); break L6; } // an object
            l41 = l41[k15];
            if (!((l41 !== undefined && l41 !== null))) { l19 = err_(K[55], l1, l1, l1); break L6; } // a field
            l42 = s33_1(l41);
            if (!((l42 !== F))) { l19 = err_(K[56], l1, l1); break L6; } // an op
          }
        }
        l32 = (l32 || (l19 !== undefined && l19 !== null));
        if (l32) {
          l44 = 0;
          l45 = a35(l0, l1, l1);
          L7: {
            if (!((l45 !== F))) { l22 = err_(K[57], l1, l1, l0, l1); break L7; } // the targets of an axis
            l46 = l45.idx;
            l47 = l0.records;
            l48 = l45.keys;
            L8: for (l49 = 0; l49 < l48.length; l49++) {
              l50 = l48[l49];
              l51 = (l47 !== undefined ? l47[l46[l49]] : l0.get(l50));
              if (!((l51 !== undefined && l51 !== null))) continue L8; // a record
              if (!((typeof l51 === "object" || typeof l51 === "function"))) continue L8; // an object
              l51 = l51[k15];
              if (!((l51 !== undefined && l51 !== null))) continue L8; // a field
              l44 = (l44 + 1);
            }
          }
        }
        l52 = args_(K[58], l1, l1, [l4, l7, l10, l13, l16, l19, l22]);
        l4 = undefined;
        l7 = undefined;
        l10 = undefined;
        l13 = undefined;
        l16 = undefined;
        l19 = undefined;
        l22 = undefined;
        return raise_(l52);
      }
    }
    l53 = rec_(k59, [l6, l9, l12, l15, l18, l21, l24]);
    return l53;
  } catch {
    return F;
  }
};
