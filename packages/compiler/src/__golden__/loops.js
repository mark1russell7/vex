"use strict";
const F = R.F;
const has_ = R.has;
const raise_ = R.raise;
const err_ = R.err;
const args_ = R.args;
const bad_ = R.bad;
const invalid_ = R.invalid;
const addr_ = R.addr;
const keys_ = R.keys;
const rec_ = R.rec;
const k1 = K[1];
const k2 = K[2];
const k5 = K[5];
const k8 = K[8];
const k15 = K[15];
const k19 = K[19];
const k20 = K[20];
const k22 = K[22];
const k25 = K[25];
const k27 = K[27];
const k41 = K[41];
const k44 = K[44];
const k46 = K[46];
const k49 = K[49];
const k51 = K[51];
const k56 = K[56];
const k57 = K[57];
const k58 = K[58];
const k91 = K[91];
const k105 = K[105];
const s8_2 = R.site(k8, 2);
const s8_2_f = s8_2.fn;
const s15_2 = R.site(k15, 2);
const s15_2_f = s15_2.fn;
const mo0 = R.memo();
const mo1 = R.memo();
const mo2 = R.memo();
const d0 = R.domain(0);
const d1 = R.domain(1);
const f8_0 = d0.ops[k8].fn;
const f20_0 = d0.ops[k20].fn;
const f44_1 = d1.ops[k44].fn;
const f57_0 = d0.ops[k57].fn;
const threw_ = R.threw;
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20, l21, l22, l23, l24, l25, l26, l27, l28, l29, l30, l31, l32, l33, l34, l35, l36, l37, l38, l39, l40, l41, l42, l43, l44, l45, l46, l47, l48, l49, l50, l51, l52, l53, l54, l55, l56, l57, l58, l59, l60, l61, l62, l63, l64, l65, l66, l67, l68, l69, l70, l71, l72, l73, l74, l75, l76, l77, l78, l79, l80, l81, l82, l83, l84, l85, l86, l87, l88, l89, l90, l91, l92, l93, l94, l95, l96, l97, l98, l99, l100, l101, l102, l103, l104, l105, l106, l107, l108, l109, l110, l111, l112, l113, l114, l115, l116, l117, l118, l119, l120, l121, l122, l123, l124, l125, l126, l127, l128, l129, l130, l131, l132, l133, l134, l135, l136, l137, l138, l139, l140, l141;
  try {
    if (!(has_(l0, l1))) return raise_(err_(K[0], l1, l1)); // the origin is a key of the space
    L0: {
      L26: {
        L25: {
          L14: {
            L9: {
              L1: {
                l5 = k1;
                l6 = k2;
                l7 = 0;
                L2: for (;;) {
                  if (!((l7 !== 5))) break L2; // the limit of iterate
                  L3: {
                    L4: {
                      l9 = l0.get(l1);
                      if (!((l9 !== undefined && l9 !== null))) { l8 = err_(K[3], l1, l1, l1); break L4; } // a record
                      if (!((typeof l9 === "object" || typeof l9 === "function"))) { l8 = err_(K[4], l1, l1, l1); break L4; } // an object
                      l9 = l9[k5];
                      if (!((l9 !== undefined && l9 !== null))) { l8 = err_(K[6], l1, l1, l1); break L4; } // a field
                      break L3;
                    }
                    l11 = args_(K[7], l1, l1, [l8]);
                    l8 = undefined;
                    { l4 = l11; break L1; }
                  }
                  S0: {
                    if (d0.is(l9)) {
                      if (!(typeof l6 === "number")) { l12 = s8_2(l9, l6); break S0; }
                      try { l12 = s8_2_f(l9, l6); } catch (e) { l12 = threw_(e); }
                      if (l12 !== F) {
                        if (l12 === undefined || l12 === null || (typeof l12 === "number" && !Number.isFinite(l12))) l12 = bad_(l12);
                        else if (d0.is(l12)) { try { if (!d0.valid(l12)) l12 = bad_(l12); } catch (e) { l12 = invalid_(e, 0); } }
                      }
                      break S0;
                    }
                    l12 = s8_2(l9, l6);
                  }
                  if (!((l12 !== F))) { l4 = err_(K[9], l1, l1); break L1; } // an op
                  l13 = l12;
                  if (!((typeof l13 === "number"))) return F; // a value of the kind of a name of a loop
                  l5 = l13;
                  l7 = (l7 + 1);
                }
                try { l16 = f8_0(l5, l6); } catch (e) { l16 = threw_(e); }
                if (l16 !== F && typeof l16 !== "number") return F; // the kind of the result
                if (l16 !== F && !Number.isFinite(l16)) l16 = bad_(l16);
                if (l16 !== F) { try { if (!d0.valid(l16)) l16 = bad_(l16); } catch (e) { l16 = invalid_(e, 0); } }
                if (!((l16 !== F))) { l4 = err_(K[10], l1, l1); break L1; } // an op
                l18 = k2;
                l19 = 0;
                L10: for (;;) {
                  L11: {
                    L13: {
                      l22 = l0.get(l1);
                      if (!((l22 !== undefined && l22 !== null))) { l21 = err_(K[11], l1, l1, l1); break L13; } // a record
                      if (!((typeof l22 === "object" || typeof l22 === "function"))) { l21 = err_(K[12], l1, l1, l1); break L13; } // an object
                      l22 = l22[k5];
                      if (!((l22 !== undefined && l22 !== null))) { l21 = err_(K[13], l1, l1, l1); break L13; } // a field
                      break L11;
                    }
                    l23 = args_(K[14], l1, l1, [l21]);
                    l21 = undefined;
                    { l17 = l23; break L9; }
                  }
                  S1: {
                    if (d0.is(l18)) {
                      if (!(typeof l22 === "number")) { l24 = s15_2(l18, l22); break S1; }
                      try { l24 = s15_2_f(l18, l22); } catch (e) { l24 = threw_(e); }
                      if (l24 !== F) {
                        if (l24 === undefined || l24 === null || (typeof l24 === "number" && !Number.isFinite(l24))) l24 = bad_(l24);
                        else if (d0.is(l24)) { try { if (!d0.valid(l24)) l24 = bad_(l24); } catch (e) { l24 = invalid_(e, 0); } }
                      }
                      break S1;
                    }
                    l24 = s15_2(l18, l22);
                  }
                  if (!((l24 !== F))) { l17 = err_(K[16], l1, l1); break L9; } // an op
                  if (!((typeof l24 === "boolean"))) { l17 = err_(K[17], l1, l1, l24); break L9; } // a boolean
                  if (!((!l24))) break L10; // the test until
                  if (!((l19 !== 10))) { l17 = err_(K[18], l1, l1, 10); break L9; } // the limit of iterate
                  try { l25 = f20_0(l18, k19); } catch (e) { l25 = threw_(e); }
                  if (l25 !== F && typeof l25 !== "number") return F; // the kind of the result
                  if (l25 !== F && !Number.isFinite(l25)) l25 = bad_(l25);
                  if (l25 !== F) { try { if (!d0.valid(l25)) l25 = bad_(l25); } catch (e) { l25 = invalid_(e, 0); } }
                  if (!((l25 !== F))) { l17 = err_(K[21], l1, l1); break L9; } // an op
                  l26 = l25;
                  if (!((typeof l26 === "number"))) return F; // a value of the kind of a name of a loop
                  l18 = l26;
                  l19 = (l19 + 1);
                }
                l28 = k1;
                l29 = k22;
                l30 = l0.get(l1);
                if (!((l30 !== undefined && l30 !== null))) { l27 = err_(K[23], l1, l1, l1); break L14; } // a record
                if (!((typeof l30 === "object" || typeof l30 === "function"))) { l27 = err_(K[24], l1, l1, l1); break L14; } // an object
                l30 = l30[k25];
                if (!((l30 !== undefined && l30 !== null))) { l27 = err_(K[26], l1, l1, l1); break L14; } // a field
                l31 = addr_(l0, l1, l1, k27, [l30]);
                if (!((l31 !== F))) { l27 = err_(K[28], l1, l1, l0, [l30]); break L14; } // an address
                l32 = l0.records;
                l33 = keys_(l0);
                L15: for (l34 = 0; l34 < l33.length; l34++) {
                  l35 = l33[l34];
                  l36 = (l32 !== undefined ? l32[l34] : l0.get(l35));
                  if (!((l36 !== undefined && l36 !== null))) { l27 = err_(K[29], l1, l35, l35); break L14; } // a record
                  if (!((typeof l36 === "object" || typeof l36 === "function"))) { l27 = err_(K[30], l1, l35, l35); break L14; } // an object
                  l36 = l36[k5];
                  if (!((l36 !== undefined && l36 !== null))) { l27 = err_(K[31], l1, l35, l35); break L14; } // a field
                  S2: {
                    if (d0.is(l36)) {
                      if (!(typeof k1 === "number")) { l37 = s15_2(l36, k1); break S2; }
                      try { l37 = s15_2_f(l36, k1); } catch (e) { l37 = threw_(e); }
                      if (l37 !== F) {
                        if (l37 === undefined || l37 === null || (typeof l37 === "number" && !Number.isFinite(l37))) l37 = bad_(l37);
                        else if (d0.is(l37)) { try { if (!d0.valid(l37)) l37 = bad_(l37); } catch (e) { l37 = invalid_(e, 0); } }
                      }
                      break S2;
                    }
                    l37 = s15_2(l36, k1);
                  }
                  if (!((l37 !== F))) { l27 = err_(K[32], l1, l35); break L14; } // an op
                  if (!((typeof l37 === "boolean"))) { l27 = err_(K[33], l1, l35, l37); break L14; } // a boolean
                  if ((!l37)) {
                    continue;
                  }
                  L16: {
                    L18: {
                      l40 = (l32 !== undefined ? l32[l34] : l0.get(l35));
                      if (!((l40 !== undefined && l40 !== null))) { l39 = err_(K[34], l1, l35, l35); break L18; } // a record
                      if (!((typeof l40 === "object" || typeof l40 === "function"))) { l39 = err_(K[35], l1, l35, l35); break L18; } // an object
                      l40 = l40[k5];
                      if (!((l40 !== undefined && l40 !== null))) { l39 = err_(K[36], l1, l35, l35); break L18; } // a field
                      break L16;
                    }
                    l41 = args_(K[37], l1, l35, [l39]);
                    l39 = undefined;
                    { l27 = l41; break L14; }
                  }
                  S3: {
                    if (d0.is(l28)) {
                      if (!(typeof l40 === "number")) { l42 = s8_2(l28, l40); break S3; }
                      try { l42 = s8_2_f(l28, l40); } catch (e) { l42 = threw_(e); }
                      if (l42 !== F) {
                        if (l42 === undefined || l42 === null || (typeof l42 === "number" && !Number.isFinite(l42))) l42 = bad_(l42);
                        else if (d0.is(l42)) { try { if (!d0.valid(l42)) l42 = bad_(l42); } catch (e) { l42 = invalid_(e, 0); } }
                      }
                      break S3;
                    }
                    l42 = s8_2(l28, l40);
                  }
                  if (!((l42 !== F))) { l27 = err_(K[38], l1, l35); break L14; } // an op
                  l43 = l42;
                  if (!((typeof l43 === "number"))) return F; // a value of the kind of a name of a loop
                  L19: {
                    L21: {
                      l46 = (l32 !== undefined ? l32[l34] : l0.get(l35));
                      if (!((l46 !== undefined && l46 !== null))) { l45 = err_(K[39], l1, l35, l35); break L21; } // a record
                      if (!((typeof l46 === "object" || typeof l46 === "function"))) { l45 = err_(K[40], l1, l35, l35); break L21; } // an object
                      l46 = l46[k41];
                      if (!((l46 !== undefined && l46 !== null))) { l45 = err_(K[42], l1, l35, l35); break L21; } // a field
                      break L19;
                    }
                    l47 = args_(K[43], l1, l35, [l45]);
                    l45 = undefined;
                    { l27 = l47; break L14; }
                  }
                  try { l48 = f44_1(l29, l46); } catch (e) { l48 = threw_(e); }
                  if (l48 !== F && typeof l48 !== "string") return F; // the kind of the result
                  if (!((l48 !== F))) { l27 = err_(K[45], l1, l35); break L14; } // an op
                  l49 = l48;
                  if (!((typeof l49 === "string"))) return F; // a value of the kind of a name of a loop
                  l28 = l43;
                  l29 = l49;
                }
                l52 = rec_(k46, [l28, l29]);
                l54 = l0.get(l1);
                if (!((l54 !== undefined && l54 !== null))) { l53 = err_(K[47], l1, l1, l1); break L25; } // a record
                if (!((typeof l54 === "object" || typeof l54 === "function"))) { l53 = err_(K[48], l1, l1, l1); break L25; } // an object
                l54 = l54[k49];
                if (!((l54 !== undefined && l54 !== null))) { l53 = err_(K[50], l1, l1, l1); break L25; } // a field
                l55 = addr_(l0, l1, l1, k51, [l54]);
                if (!((l55 !== F))) { l53 = err_(K[52], l1, l1, l0, [l54]); break L25; } // an address
                l56 = l0.get(l55);
                if (!((l56 !== undefined && l56 !== null))) { l53 = err_(K[53], l1, l1, l55); break L25; } // a record
                if (!((typeof l56 === "object" || typeof l56 === "function"))) { l53 = err_(K[54], l1, l1, l55); break L25; } // an object
                l56 = l56[k5];
                if (!((l56 !== undefined && l56 !== null))) { l53 = err_(K[55], l1, l1, l55); break L25; } // a field
                l58 = mo0.get(l0, []);
                if ((!(l58 !== undefined && l58 !== null))) {
                  l78 = false;
                  L27: {
                    l60 = mo1.get(l0, []);
                    if ((!(l60 !== undefined && l60 !== null))) {
                      l74 = false;
                      L28: {
                        l62 = mo2.get(l0, []);
                        if ((!(l62 !== undefined && l62 !== null))) {
                          l71 = false;
                          L29: {
                            l65 = 0;
                            l66 = l0.records;
                            l67 = keys_(l0);
                            L30: for (l68 = 0; l68 < l67.length; l68++) {
                              l69 = l67[l68];
                              l70 = (l66 !== undefined ? l66[l68] : l0.get(l69));
                              if (!((l70 !== undefined && l70 !== null))) continue L30; // a record
                              if (!((typeof l70 === "object" || typeof l70 === "function"))) continue L30; // an object
                              l70 = l70[k5];
                              if (!((l70 !== undefined && l70 !== null))) continue L30; // a field
                              l65 = (l65 + 1);
                            }
                            l63 = l65;
                            l71 = true;
                          }
                          l62 = mo2.put(l0, [], l63, l71);
                        }
                        if (!(l62.ok)) break L28; // a value of the memo
                        l72 = l62.v;
                        try { l73 = f57_0(l72, k56); } catch (e) { l73 = threw_(e); }
                        if (l73 !== F && typeof l73 !== "number") return F; // the kind of the result
                        if (l73 !== F && !Number.isFinite(l73)) l73 = bad_(l73);
                        if (l73 !== F) { try { if (!d0.valid(l73)) l73 = bad_(l73); } catch (e) { l73 = invalid_(e, 0); } }
                        if (!((l73 !== F))) break L28; // an op
                        l61 = l73;
                        l74 = true;
                      }
                      l60 = mo1.put(l0, [], l61, l74);
                    }
                    if (!(l60.ok)) break L27; // a value of the memo
                    l75 = l60.v;
                    l76 = addr_(l0, l1, l1, k58, [l75]);
                    if (!((l76 !== F))) break L27; // an address
                    l77 = l0.get(l76);
                    if (!((l77 !== undefined && l77 !== null))) break L27; // a record
                    if (!((typeof l77 === "object" || typeof l77 === "function"))) break L27; // an object
                    l77 = l77[k5];
                    if (!((l77 !== undefined && l77 !== null))) break L27; // a field
                    l59 = l77;
                    l78 = true;
                  }
                  l58 = mo0.put(l0, [], l59, l78);
                }
                if ((!l58.ok)) {
                  l80 = 0;
                  l81 = l0.records;
                  l82 = keys_(l0);
                  L31: for (l83 = 0; l83 < l82.length; l83++) {
                    l84 = l82[l83];
                    l85 = (l81 !== undefined ? l81[l83] : l0.get(l84));
                    if (!((l85 !== undefined && l85 !== null))) continue L31; // a record
                    if (!((typeof l85 === "object" || typeof l85 === "function"))) continue L31; // an object
                    l85 = l85[k5];
                    if (!((l85 !== undefined && l85 !== null))) continue L31; // a field
                    l80 = (l80 + 1);
                  }
                  try { l86 = f57_0(l80, k56); } catch (e) { l86 = threw_(e); }
                  if (l86 !== F && typeof l86 !== "number") return F; // the kind of the result
                  if (l86 !== F && !Number.isFinite(l86)) l86 = bad_(l86);
                  if (l86 !== F) { try { if (!d0.valid(l86)) l86 = bad_(l86); } catch (e) { l86 = invalid_(e, 0); } }
                  if (!((l86 !== F))) { l57 = err_(K[59], l1, l1); break L26; } // an op
                  l87 = addr_(l0, l1, l1, k58, [l86]);
                  if (!((l87 !== F))) { l57 = err_(K[60], l1, l1, l0, [l86]); break L26; } // an address
                  l88 = l0.get(l87);
                  if (!((l88 !== undefined && l88 !== null))) { l57 = err_(K[61], l1, l1, l87); break L26; } // a record
                  if (!((typeof l88 === "object" || typeof l88 === "function"))) { l57 = err_(K[62], l1, l1, l87); break L26; } // an object
                  l88 = l88[k5];
                  if (!((l88 !== undefined && l88 !== null))) { l57 = err_(K[63], l1, l1, l87); break L26; } // a field
                  if (!(l58.ok)) return F; // a value of the memo
                }
                l89 = l58.v;
                break L0;
              }
              L32: {
                l90 = k2;
                l91 = 0;
                L33: for (;;) {
                  l95 = false;
                  L35: {
                    l94 = l0.get(l1);
                    if (!((l94 !== undefined && l94 !== null))) { l93 = err_(K[64], l1, l1, l1); break L35; } // a record
                    if (!((typeof l94 === "object" || typeof l94 === "function"))) { l93 = err_(K[65], l1, l1, l1); break L35; } // an object
                    l94 = l94[k5];
                    if (!((l94 !== undefined && l94 !== null))) { l93 = err_(K[66], l1, l1, l1); break L35; } // a field
                    l93 = l94;
                    l95 = true;
                  }
                  l96 = args_(K[67], l1, l1, [(l95 ? undefined : l93)]);
                  if (!((!(l96 !== undefined && l96 !== null)))) { l17 = l96; break L32; } // the arguments have values
                  S4: {
                    if (d0.is(l90)) {
                      if (!(typeof l93 === "number")) { l97 = s15_2(l90, l93); break S4; }
                      try { l97 = s15_2_f(l90, l93); } catch (e) { l97 = threw_(e); }
                      if (l97 !== F) {
                        if (l97 === undefined || l97 === null || (typeof l97 === "number" && !Number.isFinite(l97))) l97 = bad_(l97);
                        else if (d0.is(l97)) { try { if (!d0.valid(l97)) l97 = bad_(l97); } catch (e) { l97 = invalid_(e, 0); } }
                      }
                      break S4;
                    }
                    l97 = s15_2(l90, l93);
                  }
                  if (!((l97 !== F))) { l17 = err_(K[68], l1, l1); break L32; } // an op
                  if (!((typeof l97 === "boolean"))) { l17 = err_(K[69], l1, l1, l97); break L32; } // a boolean
                  if (!((!l97))) break L33; // the test until
                  if (!((l91 !== 10))) { l17 = err_(K[70], l1, l1, 10); break L32; } // the limit of iterate
                  try { l98 = f20_0(l90, k19); } catch (e) { l98 = threw_(e); }
                  if (l98 !== F && typeof l98 !== "number") return F; // the kind of the result
                  if (l98 !== F && !Number.isFinite(l98)) l98 = bad_(l98);
                  if (l98 !== F) { try { if (!d0.valid(l98)) l98 = bad_(l98); } catch (e) { l98 = invalid_(e, 0); } }
                  if (!((l98 !== F))) { l17 = err_(K[71], l1, l1); break L32; } // an op
                  l99 = l98;
                  if (!((typeof l99 === "number"))) return F; // a value of the kind of a name of a loop
                  l90 = l99;
                  l91 = (l91 + 1);
                }
              }
            }
            L36: {
              l100 = k1;
              l101 = k22;
              l102 = l0.get(l1);
              if (!((l102 !== undefined && l102 !== null))) { l27 = err_(K[72], l1, l1, l1); break L36; } // a record
              if (!((typeof l102 === "object" || typeof l102 === "function"))) { l27 = err_(K[73], l1, l1, l1); break L36; } // an object
              l102 = l102[k25];
              if (!((l102 !== undefined && l102 !== null))) { l27 = err_(K[74], l1, l1, l1); break L36; } // a field
              l103 = addr_(l0, l1, l1, k27, [l102]);
              if (!((l103 !== F))) { l27 = err_(K[75], l1, l1, l0, [l102]); break L36; } // an address
              l104 = l0.records;
              l105 = keys_(l0);
              L37: for (l106 = 0; l106 < l105.length; l106++) {
                l107 = l105[l106];
                l108 = (l104 !== undefined ? l104[l106] : l0.get(l107));
                if (!((l108 !== undefined && l108 !== null))) { l27 = err_(K[76], l1, l107, l107); break L36; } // a record
                if (!((typeof l108 === "object" || typeof l108 === "function"))) { l27 = err_(K[77], l1, l107, l107); break L36; } // an object
                l108 = l108[k5];
                if (!((l108 !== undefined && l108 !== null))) { l27 = err_(K[78], l1, l107, l107); break L36; } // a field
                S5: {
                  if (d0.is(l108)) {
                    if (!(typeof k1 === "number")) { l109 = s15_2(l108, k1); break S5; }
                    try { l109 = s15_2_f(l108, k1); } catch (e) { l109 = threw_(e); }
                    if (l109 !== F) {
                      if (l109 === undefined || l109 === null || (typeof l109 === "number" && !Number.isFinite(l109))) l109 = bad_(l109);
                      else if (d0.is(l109)) { try { if (!d0.valid(l109)) l109 = bad_(l109); } catch (e) { l109 = invalid_(e, 0); } }
                    }
                    break S5;
                  }
                  l109 = s15_2(l108, k1);
                }
                if (!((l109 !== F))) { l27 = err_(K[79], l1, l107); break L36; } // an op
                if (!((typeof l109 === "boolean"))) { l27 = err_(K[80], l1, l107, l109); break L36; } // a boolean
                if ((!l109)) {
                  continue;
                }
                l113 = false;
                L39: {
                  l112 = (l104 !== undefined ? l104[l106] : l0.get(l107));
                  if (!((l112 !== undefined && l112 !== null))) { l111 = err_(K[81], l1, l107, l107); break L39; } // a record
                  if (!((typeof l112 === "object" || typeof l112 === "function"))) { l111 = err_(K[82], l1, l107, l107); break L39; } // an object
                  l112 = l112[k5];
                  if (!((l112 !== undefined && l112 !== null))) { l111 = err_(K[83], l1, l107, l107); break L39; } // a field
                  l111 = l112;
                  l113 = true;
                }
                l114 = args_(K[84], l1, l107, [(l113 ? undefined : l111)]);
                if (!((!(l114 !== undefined && l114 !== null)))) { l27 = l114; break L36; } // the arguments have values
                S6: {
                  if (d0.is(l100)) {
                    if (!(typeof l111 === "number")) { l115 = s8_2(l100, l111); break S6; }
                    try { l115 = s8_2_f(l100, l111); } catch (e) { l115 = threw_(e); }
                    if (l115 !== F) {
                      if (l115 === undefined || l115 === null || (typeof l115 === "number" && !Number.isFinite(l115))) l115 = bad_(l115);
                      else if (d0.is(l115)) { try { if (!d0.valid(l115)) l115 = bad_(l115); } catch (e) { l115 = invalid_(e, 0); } }
                    }
                    break S6;
                  }
                  l115 = s8_2(l100, l111);
                }
                if (!((l115 !== F))) { l27 = err_(K[85], l1, l107); break L36; } // an op
                l116 = l115;
                if (!((typeof l116 === "number"))) return F; // a value of the kind of a name of a loop
                l120 = false;
                L41: {
                  l119 = (l104 !== undefined ? l104[l106] : l0.get(l107));
                  if (!((l119 !== undefined && l119 !== null))) { l118 = err_(K[86], l1, l107, l107); break L41; } // a record
                  if (!((typeof l119 === "object" || typeof l119 === "function"))) { l118 = err_(K[87], l1, l107, l107); break L41; } // an object
                  l119 = l119[k41];
                  if (!((l119 !== undefined && l119 !== null))) { l118 = err_(K[88], l1, l107, l107); break L41; } // a field
                  l118 = l119;
                  l120 = true;
                }
                l121 = args_(K[89], l1, l107, [(l120 ? undefined : l118)]);
                if (!((!(l121 !== undefined && l121 !== null)))) { l27 = l121; break L36; } // the arguments have values
                try { l122 = f44_1(l101, l118); } catch (e) { l122 = threw_(e); }
                if (l122 !== F && typeof l122 !== "string") return F; // the kind of the result
                if (!((l122 !== F))) { l27 = err_(K[90], l1, l107); break L36; } // an op
                l123 = l122;
                if (!((typeof l123 === "string"))) return F; // a value of the kind of a name of a loop
                l100 = l116;
                l101 = l123;
              }
              l126 = rec_(k91, [l100, l101]);
            }
          }
          L44: {
            l127 = l0.get(l1);
            if (!((l127 !== undefined && l127 !== null))) { l53 = err_(K[92], l1, l1, l1); break L44; } // a record
            if (!((typeof l127 === "object" || typeof l127 === "function"))) { l53 = err_(K[93], l1, l1, l1); break L44; } // an object
            l127 = l127[k49];
            if (!((l127 !== undefined && l127 !== null))) { l53 = err_(K[94], l1, l1, l1); break L44; } // a field
            l128 = addr_(l0, l1, l1, k51, [l127]);
            if (!((l128 !== F))) { l53 = err_(K[95], l1, l1, l0, [l127]); break L44; } // an address
            l129 = l0.get(l128);
            if (!((l129 !== undefined && l129 !== null))) { l53 = err_(K[96], l1, l1, l128); break L44; } // a record
            if (!((typeof l129 === "object" || typeof l129 === "function"))) { l53 = err_(K[97], l1, l1, l128); break L44; } // an object
            l129 = l129[k5];
            if (!((l129 !== undefined && l129 !== null))) { l53 = err_(K[98], l1, l1, l128); break L44; } // a field
          }
        }
        L45: {
          l131 = 0;
          l132 = l0.records;
          l133 = keys_(l0);
          L46: for (l134 = 0; l134 < l133.length; l134++) {
            l135 = l133[l134];
            l136 = (l132 !== undefined ? l132[l134] : l0.get(l135));
            if (!((l136 !== undefined && l136 !== null))) continue L46; // a record
            if (!((typeof l136 === "object" || typeof l136 === "function"))) continue L46; // an object
            l136 = l136[k5];
            if (!((l136 !== undefined && l136 !== null))) continue L46; // a field
            l131 = (l131 + 1);
          }
          try { l137 = f57_0(l131, k56); } catch (e) { l137 = threw_(e); }
          if (l137 !== F && typeof l137 !== "number") return F; // the kind of the result
          if (l137 !== F && !Number.isFinite(l137)) l137 = bad_(l137);
          if (l137 !== F) { try { if (!d0.valid(l137)) l137 = bad_(l137); } catch (e) { l137 = invalid_(e, 0); } }
          if (!((l137 !== F))) { l57 = err_(K[99], l1, l1); break L45; } // an op
          l138 = addr_(l0, l1, l1, k58, [l137]);
          if (!((l138 !== F))) { l57 = err_(K[100], l1, l1, l0, [l137]); break L45; } // an address
          l139 = l0.get(l138);
          if (!((l139 !== undefined && l139 !== null))) { l57 = err_(K[101], l1, l1, l138); break L45; } // a record
          if (!((typeof l139 === "object" || typeof l139 === "function"))) { l57 = err_(K[102], l1, l1, l138); break L45; } // an object
          l139 = l139[k5];
          if (!((l139 !== undefined && l139 !== null))) { l57 = err_(K[103], l1, l1, l138); break L45; } // a field
        }
      }
      l140 = args_(K[104], l1, l1, [l4, l17, l27, l53, l57]);
      l4 = undefined;
      l17 = undefined;
      l27 = undefined;
      l53 = undefined;
      l57 = undefined;
      return raise_(l140);
    }
    l141 = rec_(k105, [l16, l18, l52, l56, l89]);
    return l141;
  } catch {
    return F;
  }
};
