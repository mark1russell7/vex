"use strict";
const F = R.F;
const has_ = R.has;
const rec_ = R.rec;
const addr_ = R.addr;
const var_ = R.var;
const k0 = K[0];
const k3 = K[3];
const k2 = K[2];
const k4 = K[4];
const k5 = K[5];
const k6 = K[6];
const k7 = K[7];
const k8 = K[8];
const k9 = K[9];
const k10 = K[10];
const k1 = K[1];
const k11 = K[11];
const k12 = K[12];
const s10_2 = R.site(k10, 2);
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20, l21, l22, l23;
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
    l9 = false;
    L2: {
      l7 = rec_(k3, [k2]);
      l8 = l7;
      l9 = true;
    }
    l11 = l0.get(l1);
    if (!((l11 !== undefined && l11 !== null))) return F; // a record
    if (!((typeof l11 === "object" || typeof l11 === "function"))) return F; // an object
    l11 = l11[k4];
    if (!((l11 !== undefined && l11 !== null))) return F; // a field
    if (!((typeof l11 === "boolean"))) return F; // a boolean
    if (l11) {
      l13 = l0.get(l1);
      if (!((l13 !== undefined && l13 !== null))) return F; // a record
      if (!((typeof l13 === "object" || typeof l13 === "function"))) return F; // an object
      l13 = l13[k5];
      if (!((l13 !== undefined && l13 !== null))) return F; // a field
      if (!((typeof l13 === "boolean"))) return F; // a boolean
      if (l13) {
        l12 = true;
      } else {
        l12 = k6;
      }
      l10 = l12;
    } else {
      l10 = false;
    }
    if (l10) {
      l15 = l0.get(l1);
      if (!((l15 !== undefined && l15 !== null))) return F; // a record
      if (!((typeof l15 === "object" || typeof l15 === "function"))) return F; // an object
      l15 = l15[k7];
      if (!((l15 !== undefined && l15 !== null))) return F; // a field
      l14 = l15;
    } else {
      l14 = k8;
    }
    l17 = false;
    L3: {
      if (!(l6)) break L3; // a binding with a value
      l16 = l5;
      l17 = true;
    }
    if ((!l17)) {
      l18 = addr_(l0, l1, l1, k9);
      if (!((l18 !== F))) return F; // an address
      l19 = l0.get(l18);
      if (!((l19 !== undefined && l19 !== null))) return F; // a record
      if (!((typeof l19 === "object" || typeof l19 === "function"))) return F; // an object
      l19 = l19[k7];
      if (!((l19 !== undefined && l19 !== null))) return F; // a field
      l20 = s10_2(l19, k1);
      if (!((l20 !== F))) return F; // an op
      l16 = l20;
    }
    l21 = var_(l2, k11);
    if (!((l21 !== F))) return F; // a variable
    l22 = s10_2(k1, l21);
    if (!((l22 !== F))) return F; // an op
    if (!(l9)) return F; // a binding with a value
    l23 = rec_(k12, [l14, l16, l22, l8]);
    return l23;
  } catch {
    return F;
  }
};
