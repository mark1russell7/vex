"use strict";
const F = R.F;
const has_ = R.has;
const raise_ = R.raise;
const err_ = R.err;
const rec_ = R.rec;
const addr_ = R.addr;
const var_ = R.var;
const args_ = R.args;
const k3 = K[3];
const k7 = K[7];
const k6 = K[6];
const k10 = K[10];
const k15 = K[15];
const k18 = K[18];
const k21 = K[21];
const k23 = K[23];
const k24 = K[24];
const k29 = K[29];
const k5 = K[5];
const k31 = K[31];
const k44 = K[44];
const s29_2 = R.site(k29, 2);
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20, l21, l22, l23, l24, l25, l26, l27, l28, l29, l30, l31, l32, l33, l34, l35, l36, l37, l38, l39, l40, l41, l42, l43, l44, l45;
  try {
    if (!(has_(l0, l1))) return raise_(err_(K[0], l1, l1)); // the origin is a key of the space
    l6 = false;
    l5 = l0.get(l1);
    L0: {
      if (!((l5 !== undefined && l5 !== null))) { l4 = err_(K[1], l1, l1, l1); break L0; } // a record
      if (!((typeof l5 === "object" || typeof l5 === "function"))) { l4 = err_(K[2], l1, l1, l1); break L0; } // an object
      l5 = l5[k3];
      if (!((l5 !== undefined && l5 !== null))) { l4 = err_(K[4], l1, l1, l1); break L0; } // a field
      l4 = l5;
      l6 = true;
    }
    l10 = false;
    l9 = rec_(k7, [k6]);
    l8 = l9;
    l10 = true;
    L11: {
      l13 = l0.get(l1);
      L3: {
        if (!((l13 !== undefined && l13 !== null))) { l11 = err_(K[8], l1, l1, l1); break L3; } // a record
        if (!((typeof l13 === "object" || typeof l13 === "function"))) { l11 = err_(K[9], l1, l1, l1); break L3; } // an object
        l13 = l13[k10];
        if (!((l13 !== undefined && l13 !== null))) { l11 = err_(K[11], l1, l1, l1); break L3; } // a field
        if (!((typeof l13 === "boolean"))) { l11 = err_(K[12], l1, l1, l13); break L3; } // a boolean
        if (l13) {
          l15 = l0.get(l1);
          if (!((l15 !== undefined && l15 !== null))) { l11 = err_(K[13], l1, l1, l1); break L3; } // a record
          if (!((typeof l15 === "object" || typeof l15 === "function"))) { l11 = err_(K[14], l1, l1, l1); break L3; } // an object
          l15 = l15[k15];
          if (!((l15 !== undefined && l15 !== null))) { l11 = err_(K[16], l1, l1, l1); break L3; } // a field
          if (!((typeof l15 === "boolean"))) { l11 = err_(K[17], l1, l1, l15); break L3; } // a boolean
          if (l15) {
            l14 = true;
          } else {
            l14 = k18;
          }
          l12 = l14;
        } else {
          l12 = false;
        }
        if (l12) {
          l17 = l0.get(l1);
          if (!((l17 !== undefined && l17 !== null))) { l11 = err_(K[19], l1, l1, l1); break L3; } // a record
          if (!((typeof l17 === "object" || typeof l17 === "function"))) { l11 = err_(K[20], l1, l1, l1); break L3; } // an object
          l17 = l17[k21];
          if (!((l17 !== undefined && l17 !== null))) { l11 = err_(K[22], l1, l1, l1); break L3; } // a field
          l16 = l17;
        } else {
          l16 = k23;
        }
        l20 = false;
        L4: {
          if (!(l6)) break L4; // a binding with a value
          l19 = l4;
          l20 = true;
        }
        if ((!l20)) {
          l21 = addr_(l0, l1, l1, k24);
          if (!((l21 !== F))) { l18 = err_(K[25], l1, l1, l0); break L3; } // an address
          l22 = l0.get(l21);
          if (!((l22 !== undefined && l22 !== null))) { l18 = err_(K[26], l1, l1, l21); break L3; } // a record
          if (!((typeof l22 === "object" || typeof l22 === "function"))) { l18 = err_(K[27], l1, l1, l21); break L3; } // an object
          l22 = l22[k21];
          if (!((l22 !== undefined && l22 !== null))) { l18 = err_(K[28], l1, l1, l21); break L3; } // a field
          l23 = s29_2(l22, k5);
          if (!((l23 !== F))) { l18 = err_(K[30], l1, l1); break L3; } // an op
          l19 = l23;
        }
        l27 = var_(l2, k31);
        if (!((l27 !== F))) { l26 = err_(K[32], l1, l1); break L3; } // a variable
        l30 = s29_2(k5, l27);
        if (!((l30 !== F))) { l24 = err_(K[34], l1, l1); break L3; } // an op
        if (!(l10)) { l31 = l8; break L3; } // a binding with a value
        break L11;
      }
      if ((l26 !== undefined && l26 !== null)) {
        l29 = args_(K[33], l1, l1, [l26]);
        l26 = undefined;
        l24 = l29;
      }
      if (((((l11 !== undefined && l11 !== null) || (l18 !== undefined && l18 !== null)) || (l24 !== undefined && l24 !== null)) || (l31 !== undefined && l31 !== null))) {
        l32 = (l11 !== undefined && l11 !== null);
        if (l32) {
          l34 = false;
          L6: {
            if (!(l6)) break L6; // a binding with a value
            l33 = l4;
            l34 = true;
          }
          L5: {
            if ((!l34)) {
              l35 = addr_(l0, l1, l1, k24);
              if (!((l35 !== F))) { l18 = err_(K[35], l1, l1, l0); break L5; } // an address
              l36 = l0.get(l35);
              if (!((l36 !== undefined && l36 !== null))) { l18 = err_(K[36], l1, l1, l35); break L5; } // a record
              if (!((typeof l36 === "object" || typeof l36 === "function"))) { l18 = err_(K[37], l1, l1, l35); break L5; } // an object
              l36 = l36[k21];
              if (!((l36 !== undefined && l36 !== null))) { l18 = err_(K[38], l1, l1, l35); break L5; } // a field
              l37 = s29_2(l36, k5);
              if (!((l37 !== F))) { l18 = err_(K[39], l1, l1); break L5; } // an op
              l33 = l37;
            }
          }
        }
        l32 = (l32 || (l18 !== undefined && l18 !== null));
        if (l32) {
          l41 = false;
          l40 = var_(l2, k31);
          L9: {
            if (!((l40 !== F))) { l39 = err_(K[40], l1, l1); break L9; } // a variable
            l39 = l40;
            l41 = true;
          }
          l42 = args_(K[41], l1, l1, [(l41 ? undefined : l39)]);
          L7: {
            if (!((!(l42 !== undefined && l42 !== null)))) { l24 = l42; break L7; } // the arguments have values
            l43 = s29_2(k5, l39);
            if (!((l43 !== F))) { l24 = err_(K[42], l1, l1); break L7; } // an op
          }
        }
        l32 = (l32 || (l24 !== undefined && l24 !== null));
        if (l32) {
          L10: {
            if (!(l10)) { l31 = l8; break L10; } // a binding with a value
          }
        }
        l44 = args_(K[43], l1, l1, [l11, l18, l24, l31]);
        l11 = undefined;
        l18 = undefined;
        l24 = undefined;
        l31 = undefined;
        return raise_(l44);
      }
    }
    l45 = rec_(k44, [l16, l19, l30, l8]);
    return l45;
  } catch {
    return F;
  }
};
