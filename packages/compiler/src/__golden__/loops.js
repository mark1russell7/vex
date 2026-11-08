"use strict";
const F = R.F;
const has_ = R.has;
const raise_ = R.raise;
const err_ = R.err;
const bad_ = R.bad;
const invalid_ = R.invalid;
const addr_ = R.addr;
const keys_ = R.keys;
const rec_ = R.rec;
const args_ = R.args;
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
const d0 = R.domain(0);
const d1 = R.domain(1);
const f8_0 = d0.ops[k8].fn;
const f20_0 = d0.ops[k20].fn;
const f44_1 = d1.ops[k44].fn;
const f57_0 = d0.ops[k57].fn;
const threw_ = R.threw;
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20, l21, l22, l23, l24, l25, l26, l27, l28, l29, l30, l31, l32, l33, l34, l35, l36, l37, l38, l39, l40, l41, l42, l43, l44, l45, l46, l47, l48, l49, l50, l51, l52, l53, l54, l55, l56, l57, l58, l59, l60, l61, l62, l63, l64, l65, l66, l67, l68, l69, l70, l71, l72, l73, l74, l75, l76, l77, l78, l79, l80, l81, l82, l83, l84, l85, l86, l87, l88, l89, l90, l91, l92, l93, l94, l95, l96, l97, l98, l99, l100, l101, l102, l103, l104, l105, l106, l107, l108, l109, l110, l111, l112, l113, l114, l115, l116, l117, l118, l119, l120, l121, l122, l123, l124, l125, l126, l127, l128, l129, l130, l131, l132, l133, l134, l135, l136, l137, l138;
  try {
    if (!(has_(l0, l1))) return raise_(err_(K[0], l1, l1)); // the origin is a key of the space
    L22: {
      l5 = k1;
      l6 = k2;
      l7 = 0;
      L0: {
        L1: for (;;) {
          if (!((l7 !== 5))) break L1; // the limit of iterate
          l9 = l0.get(l1);
          if (!((l9 !== undefined && l9 !== null))) { l8 = err_(K[3], l1, l1, l1); break L0; } // a record
          if (!((typeof l9 === "object" || typeof l9 === "function"))) { l8 = err_(K[4], l1, l1, l1); break L0; } // an object
          l9 = l9[k5];
          if (!((l9 !== undefined && l9 !== null))) { l8 = err_(K[6], l1, l1, l1); break L0; } // a field
          S0: {
            if (d0.is(l9)) {
              if (!(typeof l6 === "number")) { l13 = s8_2(l9, l6); break S0; }
              try { l13 = s8_2_f(l9, l6); } catch (e) { l13 = threw_(e); }
              if (l13 !== F) {
                if (l13 === undefined || l13 === null || (typeof l13 === "number" && !Number.isFinite(l13))) l13 = bad_(l13);
                else if (d0.is(l13)) { try { if (!d0.valid(l13)) l13 = bad_(l13); } catch (e) { l13 = invalid_(e, 0); } }
              }
              break S0;
            }
            l13 = s8_2(l9, l6);
          }
          if (!((l13 !== F))) { l4 = err_(K[9], l1, l1); break L0; } // an op
          l14 = l13;
          if (!((typeof l14 === "number"))) return F; // a value of the kind of a name of a loop
          l5 = l14;
          l7 = (l7 + 1);
        }
        try { l17 = f8_0(l5, l6); } catch (e) { l17 = threw_(e); }
        if (l17 !== F && typeof l17 !== "number") return F; // the kind of the result
        if (l17 !== F && !Number.isFinite(l17)) l17 = bad_(l17);
        if (l17 !== F) { try { if (!d0.valid(l17)) l17 = bad_(l17); } catch (e) { l17 = invalid_(e, 0); } }
        if (!((l17 !== F))) { l4 = err_(K[10], l1, l1); break L0; } // an op
        l19 = k2;
        l20 = 0;
        L2: for (;;) {
          l23 = l0.get(l1);
          if (!((l23 !== undefined && l23 !== null))) { l22 = err_(K[11], l1, l1, l1); break L0; } // a record
          if (!((typeof l23 === "object" || typeof l23 === "function"))) { l22 = err_(K[12], l1, l1, l1); break L0; } // an object
          l23 = l23[k5];
          if (!((l23 !== undefined && l23 !== null))) { l22 = err_(K[13], l1, l1, l1); break L0; } // a field
          S1: {
            if (d0.is(l19)) {
              if (!(typeof l23 === "number")) { l26 = s15_2(l19, l23); break S1; }
              try { l26 = s15_2_f(l19, l23); } catch (e) { l26 = threw_(e); }
              if (l26 !== F) {
                if (l26 === undefined || l26 === null || (typeof l26 === "number" && !Number.isFinite(l26))) l26 = bad_(l26);
                else if (d0.is(l26)) { try { if (!d0.valid(l26)) l26 = bad_(l26); } catch (e) { l26 = invalid_(e, 0); } }
              }
              break S1;
            }
            l26 = s15_2(l19, l23);
          }
          if (!((l26 !== F))) { l18 = err_(K[16], l1, l1); break L0; } // an op
          if (!((typeof l26 === "boolean"))) { l18 = err_(K[17], l1, l1, l26); break L0; } // a boolean
          if (!((!l26))) break L2; // the test until
          if (!((l20 !== 10))) { l18 = err_(K[18], l1, l1, 10); break L0; } // the limit of iterate
          try { l27 = f20_0(l19, k19); } catch (e) { l27 = threw_(e); }
          if (l27 !== F && typeof l27 !== "number") return F; // the kind of the result
          if (l27 !== F && !Number.isFinite(l27)) l27 = bad_(l27);
          if (l27 !== F) { try { if (!d0.valid(l27)) l27 = bad_(l27); } catch (e) { l27 = invalid_(e, 0); } }
          if (!((l27 !== F))) { l18 = err_(K[21], l1, l1); break L0; } // an op
          l28 = l27;
          if (!((typeof l28 === "number"))) return F; // a value of the kind of a name of a loop
          l19 = l28;
          l20 = (l20 + 1);
        }
        l30 = k1;
        l31 = k22;
        l32 = l0.get(l1);
        if (!((l32 !== undefined && l32 !== null))) { l29 = err_(K[23], l1, l1, l1); break L0; } // a record
        if (!((typeof l32 === "object" || typeof l32 === "function"))) { l29 = err_(K[24], l1, l1, l1); break L0; } // an object
        l32 = l32[k25];
        if (!((l32 !== undefined && l32 !== null))) { l29 = err_(K[26], l1, l1, l1); break L0; } // a field
        l33 = addr_(l0, l1, l1, k27, [l32]);
        if (!((l33 !== F))) { l29 = err_(K[28], l1, l1, l0, [l32]); break L0; } // an address
        l34 = l0.records;
        l35 = keys_(l0);
        L3: for (l36 = 0; l36 < l35.length; l36++) {
          l37 = l35[l36];
          l38 = (l34 !== undefined ? l34[l36] : l0.get(l37));
          if (!((l38 !== undefined && l38 !== null))) { l29 = err_(K[29], l1, l37, l37); break L0; } // a record
          if (!((typeof l38 === "object" || typeof l38 === "function"))) { l29 = err_(K[30], l1, l37, l37); break L0; } // an object
          l38 = l38[k5];
          if (!((l38 !== undefined && l38 !== null))) { l29 = err_(K[31], l1, l37, l37); break L0; } // a field
          S2: {
            if (d0.is(l38)) {
              if (!(typeof k1 === "number")) { l39 = s15_2(l38, k1); break S2; }
              try { l39 = s15_2_f(l38, k1); } catch (e) { l39 = threw_(e); }
              if (l39 !== F) {
                if (l39 === undefined || l39 === null || (typeof l39 === "number" && !Number.isFinite(l39))) l39 = bad_(l39);
                else if (d0.is(l39)) { try { if (!d0.valid(l39)) l39 = bad_(l39); } catch (e) { l39 = invalid_(e, 0); } }
              }
              break S2;
            }
            l39 = s15_2(l38, k1);
          }
          if (!((l39 !== F))) { l29 = err_(K[32], l1, l37); break L0; } // an op
          if (!((typeof l39 === "boolean"))) { l29 = err_(K[33], l1, l37, l39); break L0; } // a boolean
          if ((!l39)) {
            continue;
          }
          l42 = (l34 !== undefined ? l34[l36] : l0.get(l37));
          if (!((l42 !== undefined && l42 !== null))) { l41 = err_(K[34], l1, l37, l37); break L0; } // a record
          if (!((typeof l42 === "object" || typeof l42 === "function"))) { l41 = err_(K[35], l1, l37, l37); break L0; } // an object
          l42 = l42[k5];
          if (!((l42 !== undefined && l42 !== null))) { l41 = err_(K[36], l1, l37, l37); break L0; } // a field
          S3: {
            if (d0.is(l30)) {
              if (!(typeof l42 === "number")) { l45 = s8_2(l30, l42); break S3; }
              try { l45 = s8_2_f(l30, l42); } catch (e) { l45 = threw_(e); }
              if (l45 !== F) {
                if (l45 === undefined || l45 === null || (typeof l45 === "number" && !Number.isFinite(l45))) l45 = bad_(l45);
                else if (d0.is(l45)) { try { if (!d0.valid(l45)) l45 = bad_(l45); } catch (e) { l45 = invalid_(e, 0); } }
              }
              break S3;
            }
            l45 = s8_2(l30, l42);
          }
          if (!((l45 !== F))) { l29 = err_(K[38], l1, l37); break L0; } // an op
          l46 = l45;
          if (!((typeof l46 === "number"))) return F; // a value of the kind of a name of a loop
          l49 = (l34 !== undefined ? l34[l36] : l0.get(l37));
          if (!((l49 !== undefined && l49 !== null))) { l48 = err_(K[39], l1, l37, l37); break L0; } // a record
          if (!((typeof l49 === "object" || typeof l49 === "function"))) { l48 = err_(K[40], l1, l37, l37); break L0; } // an object
          l49 = l49[k41];
          if (!((l49 !== undefined && l49 !== null))) { l48 = err_(K[42], l1, l37, l37); break L0; } // a field
          try { l52 = f44_1(l31, l49); } catch (e) { l52 = threw_(e); }
          if (l52 !== F && typeof l52 !== "string") return F; // the kind of the result
          if (!((l52 !== F))) { l29 = err_(K[45], l1, l37); break L0; } // an op
          l53 = l52;
          if (!((typeof l53 === "string"))) return F; // a value of the kind of a name of a loop
          l30 = l46;
          l31 = l53;
        }
        l56 = rec_(k46, [l30, l31]);
        l58 = l0.get(l1);
        if (!((l58 !== undefined && l58 !== null))) { l57 = err_(K[47], l1, l1, l1); break L0; } // a record
        if (!((typeof l58 === "object" || typeof l58 === "function"))) { l57 = err_(K[48], l1, l1, l1); break L0; } // an object
        l58 = l58[k49];
        if (!((l58 !== undefined && l58 !== null))) { l57 = err_(K[50], l1, l1, l1); break L0; } // a field
        l59 = addr_(l0, l1, l1, k51, [l58]);
        if (!((l59 !== F))) { l57 = err_(K[52], l1, l1, l0, [l58]); break L0; } // an address
        l60 = l0.get(l59);
        if (!((l60 !== undefined && l60 !== null))) { l57 = err_(K[53], l1, l1, l59); break L0; } // a record
        if (!((typeof l60 === "object" || typeof l60 === "function"))) { l57 = err_(K[54], l1, l1, l59); break L0; } // an object
        l60 = l60[k5];
        if (!((l60 !== undefined && l60 !== null))) { l57 = err_(K[55], l1, l1, l59); break L0; } // a field
        l62 = mo0.get(l0, []);
        if ((!(l62 !== undefined && l62 !== null))) {
          l74 = false;
          l65 = 0;
          l66 = l0.records;
          l67 = keys_(l0);
          L5: for (l68 = 0; l68 < l67.length; l68++) {
            l69 = l67[l68];
            l70 = (l66 !== undefined ? l66[l68] : l0.get(l69));
            if (!((l70 !== undefined && l70 !== null))) continue L5; // a record
            if (!((typeof l70 === "object" || typeof l70 === "function"))) continue L5; // an object
            l70 = l70[k5];
            if (!((l70 !== undefined && l70 !== null))) continue L5; // a field
            l65 = (l65 + 1);
          }
          try { l71 = f57_0(l65, k56); } catch (e) { l71 = threw_(e); }
          if (l71 !== F && typeof l71 !== "number") return F; // the kind of the result
          if (l71 !== F && !Number.isFinite(l71)) l71 = bad_(l71);
          if (l71 !== F) { try { if (!d0.valid(l71)) l71 = bad_(l71); } catch (e) { l71 = invalid_(e, 0); } }
          L4: {
            if (!((l71 !== F))) break L4; // an op
            l72 = addr_(l0, l1, l1, k58, [l71]);
            if (!((l72 !== F))) break L4; // an address
            l73 = l0.get(l72);
            if (!((l73 !== undefined && l73 !== null))) break L4; // a record
            if (!((typeof l73 === "object" || typeof l73 === "function"))) break L4; // an object
            l73 = l73[k5];
            if (!((l73 !== undefined && l73 !== null))) break L4; // a field
            l63 = l73;
            l74 = true;
          }
          l62 = mo0.put(l0, [], l63, l74);
        }
        if ((!l62.ok)) {
          l76 = 0;
          l77 = l0.records;
          l78 = keys_(l0);
          L6: for (l79 = 0; l79 < l78.length; l79++) {
            l80 = l78[l79];
            l81 = (l77 !== undefined ? l77[l79] : l0.get(l80));
            if (!((l81 !== undefined && l81 !== null))) continue L6; // a record
            if (!((typeof l81 === "object" || typeof l81 === "function"))) continue L6; // an object
            l81 = l81[k5];
            if (!((l81 !== undefined && l81 !== null))) continue L6; // a field
            l76 = (l76 + 1);
          }
          try { l82 = f57_0(l76, k56); } catch (e) { l82 = threw_(e); }
          if (l82 !== F && typeof l82 !== "number") return F; // the kind of the result
          if (l82 !== F && !Number.isFinite(l82)) l82 = bad_(l82);
          if (l82 !== F) { try { if (!d0.valid(l82)) l82 = bad_(l82); } catch (e) { l82 = invalid_(e, 0); } }
          if (!((l82 !== F))) { l61 = err_(K[59], l1, l1); break L0; } // an op
          l83 = addr_(l0, l1, l1, k58, [l82]);
          if (!((l83 !== F))) { l61 = err_(K[60], l1, l1, l0, [l82]); break L0; } // an address
          l84 = l0.get(l83);
          if (!((l84 !== undefined && l84 !== null))) { l61 = err_(K[61], l1, l1, l83); break L0; } // a record
          if (!((typeof l84 === "object" || typeof l84 === "function"))) { l61 = err_(K[62], l1, l1, l83); break L0; } // an object
          l84 = l84[k5];
          if (!((l84 !== undefined && l84 !== null))) { l61 = err_(K[63], l1, l1, l83); break L0; } // a field
          if (!(l62.ok)) return F; // a value of the memo
        }
        l85 = l62.v;
        break L22;
      }
      if ((l8 !== undefined && l8 !== null)) {
        l12 = args_(K[7], l1, l1, [l8]);
        l8 = undefined;
        l4 = l12;
      }
      if ((l22 !== undefined && l22 !== null)) {
        l25 = args_(K[14], l1, l1, [l22]);
        l22 = undefined;
        l18 = l25;
      }
      if ((l41 !== undefined && l41 !== null)) {
        l44 = args_(K[37], l1, l37, [l41]);
        l41 = undefined;
        l29 = l44;
      }
      if ((l48 !== undefined && l48 !== null)) {
        l51 = args_(K[43], l1, l37, [l48]);
        l48 = undefined;
        l29 = l51;
      }
      if ((((((l4 !== undefined && l4 !== null) || (l18 !== undefined && l18 !== null)) || (l29 !== undefined && l29 !== null)) || (l57 !== undefined && l57 !== null)) || (l61 !== undefined && l61 !== null))) {
        l86 = (l4 !== undefined && l4 !== null);
        if (l86) {
          l87 = k2;
          l88 = 0;
          L7: {
            L8: for (;;) {
              l92 = false;
              l91 = l0.get(l1);
              L10: {
                if (!((l91 !== undefined && l91 !== null))) { l90 = err_(K[64], l1, l1, l1); break L10; } // a record
                if (!((typeof l91 === "object" || typeof l91 === "function"))) { l90 = err_(K[65], l1, l1, l1); break L10; } // an object
                l91 = l91[k5];
                if (!((l91 !== undefined && l91 !== null))) { l90 = err_(K[66], l1, l1, l1); break L10; } // a field
                l90 = l91;
                l92 = true;
              }
              l93 = args_(K[67], l1, l1, [(l92 ? undefined : l90)]);
              if (!((!(l93 !== undefined && l93 !== null)))) { l18 = l93; break L7; } // the arguments have values
              S4: {
                if (d0.is(l87)) {
                  if (!(typeof l90 === "number")) { l94 = s15_2(l87, l90); break S4; }
                  try { l94 = s15_2_f(l87, l90); } catch (e) { l94 = threw_(e); }
                  if (l94 !== F) {
                    if (l94 === undefined || l94 === null || (typeof l94 === "number" && !Number.isFinite(l94))) l94 = bad_(l94);
                    else if (d0.is(l94)) { try { if (!d0.valid(l94)) l94 = bad_(l94); } catch (e) { l94 = invalid_(e, 0); } }
                  }
                  break S4;
                }
                l94 = s15_2(l87, l90);
              }
              if (!((l94 !== F))) { l18 = err_(K[68], l1, l1); break L7; } // an op
              if (!((typeof l94 === "boolean"))) { l18 = err_(K[69], l1, l1, l94); break L7; } // a boolean
              if (!((!l94))) break L8; // the test until
              if (!((l88 !== 10))) { l18 = err_(K[70], l1, l1, 10); break L7; } // the limit of iterate
              try { l95 = f20_0(l87, k19); } catch (e) { l95 = threw_(e); }
              if (l95 !== F && typeof l95 !== "number") return F; // the kind of the result
              if (l95 !== F && !Number.isFinite(l95)) l95 = bad_(l95);
              if (l95 !== F) { try { if (!d0.valid(l95)) l95 = bad_(l95); } catch (e) { l95 = invalid_(e, 0); } }
              if (!((l95 !== F))) { l18 = err_(K[71], l1, l1); break L7; } // an op
              l96 = l95;
              if (!((typeof l96 === "number"))) return F; // a value of the kind of a name of a loop
              l87 = l96;
              l88 = (l88 + 1);
            }
          }
        }
        l86 = (l86 || (l18 !== undefined && l18 !== null));
        if (l86) {
          l97 = k1;
          l98 = k22;
          l99 = l0.get(l1);
          L11: {
            if (!((l99 !== undefined && l99 !== null))) { l29 = err_(K[72], l1, l1, l1); break L11; } // a record
            if (!((typeof l99 === "object" || typeof l99 === "function"))) { l29 = err_(K[73], l1, l1, l1); break L11; } // an object
            l99 = l99[k25];
            if (!((l99 !== undefined && l99 !== null))) { l29 = err_(K[74], l1, l1, l1); break L11; } // a field
            l100 = addr_(l0, l1, l1, k27, [l99]);
            if (!((l100 !== F))) { l29 = err_(K[75], l1, l1, l0, [l99]); break L11; } // an address
            l101 = l0.records;
            l102 = keys_(l0);
            L12: for (l103 = 0; l103 < l102.length; l103++) {
              l104 = l102[l103];
              l105 = (l101 !== undefined ? l101[l103] : l0.get(l104));
              if (!((l105 !== undefined && l105 !== null))) { l29 = err_(K[76], l1, l104, l104); break L11; } // a record
              if (!((typeof l105 === "object" || typeof l105 === "function"))) { l29 = err_(K[77], l1, l104, l104); break L11; } // an object
              l105 = l105[k5];
              if (!((l105 !== undefined && l105 !== null))) { l29 = err_(K[78], l1, l104, l104); break L11; } // a field
              S5: {
                if (d0.is(l105)) {
                  if (!(typeof k1 === "number")) { l106 = s15_2(l105, k1); break S5; }
                  try { l106 = s15_2_f(l105, k1); } catch (e) { l106 = threw_(e); }
                  if (l106 !== F) {
                    if (l106 === undefined || l106 === null || (typeof l106 === "number" && !Number.isFinite(l106))) l106 = bad_(l106);
                    else if (d0.is(l106)) { try { if (!d0.valid(l106)) l106 = bad_(l106); } catch (e) { l106 = invalid_(e, 0); } }
                  }
                  break S5;
                }
                l106 = s15_2(l105, k1);
              }
              if (!((l106 !== F))) { l29 = err_(K[79], l1, l104); break L11; } // an op
              if (!((typeof l106 === "boolean"))) { l29 = err_(K[80], l1, l104, l106); break L11; } // a boolean
              if ((!l106)) {
                continue;
              }
              l110 = false;
              l109 = (l101 !== undefined ? l101[l103] : l0.get(l104));
              L14: {
                if (!((l109 !== undefined && l109 !== null))) { l108 = err_(K[81], l1, l104, l104); break L14; } // a record
                if (!((typeof l109 === "object" || typeof l109 === "function"))) { l108 = err_(K[82], l1, l104, l104); break L14; } // an object
                l109 = l109[k5];
                if (!((l109 !== undefined && l109 !== null))) { l108 = err_(K[83], l1, l104, l104); break L14; } // a field
                l108 = l109;
                l110 = true;
              }
              l111 = args_(K[84], l1, l104, [(l110 ? undefined : l108)]);
              if (!((!(l111 !== undefined && l111 !== null)))) { l29 = l111; break L11; } // the arguments have values
              S6: {
                if (d0.is(l97)) {
                  if (!(typeof l108 === "number")) { l112 = s8_2(l97, l108); break S6; }
                  try { l112 = s8_2_f(l97, l108); } catch (e) { l112 = threw_(e); }
                  if (l112 !== F) {
                    if (l112 === undefined || l112 === null || (typeof l112 === "number" && !Number.isFinite(l112))) l112 = bad_(l112);
                    else if (d0.is(l112)) { try { if (!d0.valid(l112)) l112 = bad_(l112); } catch (e) { l112 = invalid_(e, 0); } }
                  }
                  break S6;
                }
                l112 = s8_2(l97, l108);
              }
              if (!((l112 !== F))) { l29 = err_(K[85], l1, l104); break L11; } // an op
              l113 = l112;
              if (!((typeof l113 === "number"))) return F; // a value of the kind of a name of a loop
              l117 = false;
              l116 = (l101 !== undefined ? l101[l103] : l0.get(l104));
              L16: {
                if (!((l116 !== undefined && l116 !== null))) { l115 = err_(K[86], l1, l104, l104); break L16; } // a record
                if (!((typeof l116 === "object" || typeof l116 === "function"))) { l115 = err_(K[87], l1, l104, l104); break L16; } // an object
                l116 = l116[k41];
                if (!((l116 !== undefined && l116 !== null))) { l115 = err_(K[88], l1, l104, l104); break L16; } // a field
                l115 = l116;
                l117 = true;
              }
              l118 = args_(K[89], l1, l104, [(l117 ? undefined : l115)]);
              if (!((!(l118 !== undefined && l118 !== null)))) { l29 = l118; break L11; } // the arguments have values
              try { l119 = f44_1(l98, l115); } catch (e) { l119 = threw_(e); }
              if (l119 !== F && typeof l119 !== "string") return F; // the kind of the result
              if (!((l119 !== F))) { l29 = err_(K[90], l1, l104); break L11; } // an op
              l120 = l119;
              if (!((typeof l120 === "string"))) return F; // a value of the kind of a name of a loop
              l97 = l113;
              l98 = l120;
            }
            l123 = rec_(k91, [l97, l98]);
          }
        }
        l86 = (l86 || (l29 !== undefined && l29 !== null));
        if (l86) {
          l124 = l0.get(l1);
          L19: {
            if (!((l124 !== undefined && l124 !== null))) { l57 = err_(K[92], l1, l1, l1); break L19; } // a record
            if (!((typeof l124 === "object" || typeof l124 === "function"))) { l57 = err_(K[93], l1, l1, l1); break L19; } // an object
            l124 = l124[k49];
            if (!((l124 !== undefined && l124 !== null))) { l57 = err_(K[94], l1, l1, l1); break L19; } // a field
            l125 = addr_(l0, l1, l1, k51, [l124]);
            if (!((l125 !== F))) { l57 = err_(K[95], l1, l1, l0, [l124]); break L19; } // an address
            l126 = l0.get(l125);
            if (!((l126 !== undefined && l126 !== null))) { l57 = err_(K[96], l1, l1, l125); break L19; } // a record
            if (!((typeof l126 === "object" || typeof l126 === "function"))) { l57 = err_(K[97], l1, l1, l125); break L19; } // an object
            l126 = l126[k5];
            if (!((l126 !== undefined && l126 !== null))) { l57 = err_(K[98], l1, l1, l125); break L19; } // a field
          }
        }
        l86 = (l86 || (l57 !== undefined && l57 !== null));
        if (l86) {
          l128 = 0;
          l129 = l0.records;
          l130 = keys_(l0);
          L21: for (l131 = 0; l131 < l130.length; l131++) {
            l132 = l130[l131];
            l133 = (l129 !== undefined ? l129[l131] : l0.get(l132));
            if (!((l133 !== undefined && l133 !== null))) continue L21; // a record
            if (!((typeof l133 === "object" || typeof l133 === "function"))) continue L21; // an object
            l133 = l133[k5];
            if (!((l133 !== undefined && l133 !== null))) continue L21; // a field
            l128 = (l128 + 1);
          }
          try { l134 = f57_0(l128, k56); } catch (e) { l134 = threw_(e); }
          if (l134 !== F && typeof l134 !== "number") return F; // the kind of the result
          if (l134 !== F && !Number.isFinite(l134)) l134 = bad_(l134);
          if (l134 !== F) { try { if (!d0.valid(l134)) l134 = bad_(l134); } catch (e) { l134 = invalid_(e, 0); } }
          L20: {
            if (!((l134 !== F))) { l61 = err_(K[99], l1, l1); break L20; } // an op
            l135 = addr_(l0, l1, l1, k58, [l134]);
            if (!((l135 !== F))) { l61 = err_(K[100], l1, l1, l0, [l134]); break L20; } // an address
            l136 = l0.get(l135);
            if (!((l136 !== undefined && l136 !== null))) { l61 = err_(K[101], l1, l1, l135); break L20; } // a record
            if (!((typeof l136 === "object" || typeof l136 === "function"))) { l61 = err_(K[102], l1, l1, l135); break L20; } // an object
            l136 = l136[k5];
            if (!((l136 !== undefined && l136 !== null))) { l61 = err_(K[103], l1, l1, l135); break L20; } // a field
          }
        }
        l137 = args_(K[104], l1, l1, [l4, l18, l29, l57, l61]);
        l4 = undefined;
        l18 = undefined;
        l29 = undefined;
        l57 = undefined;
        l61 = undefined;
        return raise_(l137);
      }
    }
    l138 = rec_(k105, [l17, l19, l56, l60, l85]);
    return l138;
  } catch {
    return F;
  }
};
