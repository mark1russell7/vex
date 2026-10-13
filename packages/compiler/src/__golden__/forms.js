"use strict";
const F = R.F;
const addr_ = R.addr;
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
const s8_2 = R.site(k8, 2);
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18;
  try {
    if (!(has_(l0, l1))) return F; // the origin is a key of the space
    l6 = false;
    L0: {
      l4 = l0.get(l1);
      if (!((l4 !== undefined && l4 !== null))) break L0; // a record
      if (!((typeof l4 === "object" || typeof l4 === "function"))) break L0; // an object
      l4 = l4[k0];
      if (!((l4 !== undefined && l4 !== null))) break L0; // a field
      l5 = l4;
      l6 = true;
    }
    l8 = l0.get(l1);
    if (!((l8 !== undefined && l8 !== null))) return F; // a record
    if (!((typeof l8 === "object" || typeof l8 === "function"))) return F; // an object
    l8 = l8[k1];
    if (!((l8 !== undefined && l8 !== null))) return F; // a field
    if (!((typeof l8 === "boolean"))) return F; // a boolean
    if (l8) {
      l10 = l0.get(l1);
      if (!((l10 !== undefined && l10 !== null))) return F; // a record
      if (!((typeof l10 === "object" || typeof l10 === "function"))) return F; // an object
      l10 = l10[k2];
      if (!((l10 !== undefined && l10 !== null))) return F; // a field
      if (!((typeof l10 === "boolean"))) return F; // a boolean
      if (l10) {
        l9 = true;
      } else {
        if (!((typeof k3 === "boolean"))) return F; // a boolean
        l9 = k3;
      }
      if (!((typeof l9 === "boolean"))) return F; // a boolean
      l7 = l9;
    } else {
      l7 = false;
    }
    if (!((typeof l7 === "boolean"))) return F; // a boolean
    if (l7) {
      l12 = l0.get(l1);
      if (!((l12 !== undefined && l12 !== null))) return F; // a record
      if (!((typeof l12 === "object" || typeof l12 === "function"))) return F; // an object
      l12 = l12[k4];
      if (!((l12 !== undefined && l12 !== null))) return F; // a field
      l11 = l12;
    } else {
      l11 = k5;
    }
    l14 = false;
    L1: {
      if (!(l6)) break L1; // a binding with a value
      l13 = l5;
      l14 = true;
    }
    if ((!l14)) {
      l15 = addr_(l0, l1, l1, k6);
      if (!((l15 !== F))) return F; // an address
      l16 = l0.get(l15);
      if (!((l16 !== undefined && l16 !== null))) return F; // a record
      if (!((typeof l16 === "object" || typeof l16 === "function"))) return F; // an object
      l16 = l16[k4];
      if (!((l16 !== undefined && l16 !== null))) return F; // a field
      l17 = s8_2(l16, k7);
      if (!((l17 !== F))) return F; // an op
      l13 = l17;
    }
    l18 = rec_(k9, [l11, l13]);
    return l18;
  } catch {
    return F;
  }
};
