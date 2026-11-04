"use strict";
const F = R.F;
const has_ = R.has;
const raise_ = R.raise;
const err_ = R.err;
const opts_ = R.opts;
const table_ = R.table;
const keys_ = R.keys;
const result_ = R.result;
const frozen_ = R.frozen;
const step_ = R.step;
const addr_ = R.addr;
const args_ = R.args;
const rec_ = R.rec;
const k1 = K[1];
const k2 = K[2];
const k6 = K[6];
const k11 = K[11];
const k14 = K[14];
const k15 = K[15];
const k17 = K[17];
const k19 = K[19];
const k21 = K[21];
const k26 = K[26];
const k27 = K[27];
const k28 = K[28];
const k39 = K[39];
const a15 = R.axis(k15);
const mo0 = R.memo();
const a21 = R.axis(k21);
const mo1 = R.memo();
const mo2 = R.memo();
const mo3 = R.memo();
const mo4 = R.memo();
return function vex(l0, l1, l2, l3) {
  let l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20, l21, l22, l23, l24, l25, l26, l27, l28, l29, l30, l31, l32, l33, l34, l35, l36, l37, l38, l39, l40, l41, l42, l43, l44, l45, l46, l47, l48, l49, l50, l51, l52, l53, l54, l55, l56, l57, l58, l59, l60, l61, l62, l63, l64, l65, l66, l67, l68, l69, l70, l71, l72, l73, l74, l75, l76, l77, l78, l79, l80, l81, l82, l83, l84, l85, l86, l87, l88, l89, l90, l91, l92, l93, l94, l95, l96, l97, l98, l99, l100, l101, l102, l103, l104, l105, l106, l107, l108, l109, l110, l111, l112, l113, l114, l115, l116, l117, l118, l119, l120, l121, l122, l123, l124, l125, l126, l127, l128, l129, l130, l131, l132, l133, l134, l135, l136, l137, l138, l139, l140, l141, l142, l143, l144, l145, l146, l147, l148, l149, l150, l151, l152, l153, l154, l155, l156, l157, l158, l159, l160, l161, l162, l163, l164, l165, l166, l167, l168, l169, l170, l171, l172, l173, l174, l175, l176, l177, l178, l179, l180, l181, l182, l183, l184, l185, l186, l187, l188, l189, l190, l191, l192, l193, l194, l195, l196, l197, l198, l199, l200, l201, l202, l203, l204, l205, l206, l207, l208;
  try {
    if (!(has_(l0, l1))) return raise_(err_(K[0], l1, l1)); // the origin is a key of the space
    L0: {
      L24: {
        L17: {
          L13: {
            L11: {
              L7: {
                L5: {
                  L3: {
                    L1: {
                      l5 = (opts_(k1) === true);
                      l7 = 0;
                      l6 = 0;
                      l8 = table_(l3, k2);
                      if (!((l8 !== F))) { l4 = err_(K[3], l1, l1); break L1; } // a table
                      l9 = l8.records;
                      l10 = keys_(l8);
                      L2: for (l11 = 0; l11 < l10.length; l11++) {
                        l12 = l10[l11];
                        l13 = (l9 !== undefined ? l9[l11] : l8.get(l12));
                        if (!((l13 !== undefined && l13 !== null))) { if (l5) { l4 = err_(K[4], l12, l12, l12); break L1; } continue L2; } // a record
                        if (!((typeof l13 === "object" || typeof l13 === "function"))) { if (l5) { l4 = err_(K[5], l12, l12, l12); break L1; } continue L2; } // an object
                        l13 = l13[k6];
                        if (!((l13 !== undefined && l13 !== null))) { if (l5) { l4 = err_(K[7], l12, l12, l12); break L1; } continue L2; } // a field
                        if (!((typeof l13 === "boolean"))) { if (l5) { l4 = err_(K[8], l12, l12, l13); break L1; } continue L2; } // a boolean
                        if ((!l13)) {
                          continue;
                        }
                        l14 = (l9 !== undefined ? l9[l11] : l8.get(l12));
                        if (!((l14 !== undefined && l14 !== null))) { if (l5) { l4 = err_(K[9], l12, l12, l12); break L1; } continue L2; } // a record
                        if (!((typeof l14 === "object" || typeof l14 === "function"))) { if (l5) { l4 = err_(K[10], l12, l12, l12); break L1; } continue L2; } // an object
                        l14 = l14[k11];
                        if (!((l14 !== undefined && l14 !== null))) { if (l5) { l4 = err_(K[12], l12, l12, l12); break L1; } continue L2; } // a field
                        if (!((typeof l14 === "number"))) return F; // a number
                        l6 = (l6 + l14);
                        l7 = (l7 + 1);
                      }
                      l15 = result_(l6);
                      if (!((l15 !== F))) { l4 = err_(K[13], l1, l1); break L1; } // a finite sum
                      l18 = 0;
                      l17 = [];
                      l19 = l0.records;
                      l20 = keys_(l0);
                      L4: for (l21 = 0; l21 < l20.length; l21++) {
                        l22 = l20[l21];
                        if ((l22 === l1)) {
                          continue;
                        }
                        l23 = (l19 !== undefined ? l19[l21] : l0.get(l22));
                        if (!((l23 !== undefined && l23 !== null))) continue L4; // a record
                        if (!((typeof l23 === "object" || typeof l23 === "function"))) continue L4; // an object
                        l23 = l23[k11];
                        if (!((l23 !== undefined && l23 !== null))) continue L4; // a field
                        l17.push(l22);
                      }
                      l24 = frozen_(l17);
                      if (!((typeof k14 === "string"))) return F; // an op name
                      l27 = 0;
                      l28 = a15(l0, l1, l1);
                      if (!((l28 !== F))) { l25 = err_(K[16], l1, l1, l0, l1); break L5; } // the targets of an axis
                      l29 = l28.idx;
                      l30 = l0.records;
                      l31 = l28.keys;
                      L6: for (l32 = 0; l32 < l31.length; l32++) {
                        l33 = l31[l32];
                        l34 = (l30 !== undefined ? l30[l29[l32]] : l0.get(l33));
                        if (!((l34 !== undefined && l34 !== null))) continue L6; // a record
                        if (!((typeof l34 === "object" || typeof l34 === "function"))) continue L6; // an object
                        l34 = l34[k17];
                        if (!((l34 !== undefined && l34 !== null))) continue L6; // a field
                        if ((l27 === 0)) {
                          l26 = l34;
                        } else {
                          l35 = step_(k14, l26, l34);
                          if (!((l35 !== F))) { l25 = err_(K[18], l1, l1, k14); break L5; } // a step of reduce
                          l26 = l35;
                        }
                        l27 = (l27 + 1);
                      }
                      if (!((l27 !== 0))) return F; // a list that is not empty
                      l37 = mo0.get(l0, []);
                      if ((!(l37 !== undefined && l37 !== null))) {
                        l46 = false;
                        L8: {
                          l40 = 0;
                          l39 = false;
                          l41 = l0.records;
                          l42 = keys_(l0);
                          L9: for (l43 = 0; l43 < l42.length; l43++) {
                            l44 = l42[l43];
                            l45 = (l41 !== undefined ? l41[l43] : l0.get(l44));
                            if (!((l45 !== undefined && l45 !== null))) continue L9; // a record
                            if (!((typeof l45 === "object" || typeof l45 === "function"))) continue L9; // an object
                            l45 = l45[k19];
                            if (!((l45 !== undefined && l45 !== null))) continue L9; // a field
                            if (!((typeof l45 === "boolean"))) break L8; // a boolean
                            l39 = (l39 || l45);
                          }
                          l38 = (!l39);
                          l46 = true;
                        }
                        l37 = mo0.put(l0, [], l38, l46);
                      }
                      if ((!l37.ok)) {
                        l48 = 0;
                        l47 = false;
                        l49 = l0.records;
                        l50 = keys_(l0);
                        L10: for (l51 = 0; l51 < l50.length; l51++) {
                          l52 = l50[l51];
                          l53 = (l49 !== undefined ? l49[l51] : l0.get(l52));
                          if (!((l53 !== undefined && l53 !== null))) continue L10; // a record
                          if (!((typeof l53 === "object" || typeof l53 === "function"))) continue L10; // an object
                          l53 = l53[k19];
                          if (!((l53 !== undefined && l53 !== null))) continue L10; // a field
                          if (!((typeof l53 === "boolean"))) { l36 = err_(K[20], l1, l1, l53); break L7; } // a boolean
                          l47 = (l47 || l53);
                        }
                        if (!(l37.ok)) return F; // a value of the memo
                      }
                      l54 = l37.v;
                      l57 = 0;
                      l56 = 0;
                      l58 = a21(l0, l1, l1);
                      if (!((l58 !== F))) { l55 = err_(K[22], l1, l1, l0, l1); break L11; } // the targets of an axis
                      l59 = l58.idx;
                      l60 = l0.records;
                      l61 = l58.keys;
                      L12: for (l62 = 0; l62 < l61.length; l62++) {
                        l63 = l61[l62];
                        l64 = (l60 !== undefined ? l60[l59[l62]] : l0.get(l63));
                        if (!((l64 !== undefined && l64 !== null))) continue L12; // a record
                        if (!((typeof l64 === "object" || typeof l64 === "function"))) continue L12; // an object
                        l64 = l64[k11];
                        if (!((l64 !== undefined && l64 !== null))) continue L12; // a field
                        if (!((typeof l64 === "number"))) { l55 = err_(K[23], l1, l1, l64); break L11; } // a number
                        l56 = (l56 + l64);
                        l57 = (l57 + 1);
                      }
                      if (!((l57 !== 0))) { l55 = err_(K[24], l1, l1); break L11; } // a list that is not empty
                      l65 = result_((l56 / l57));
                      if (!((l65 !== F))) { l55 = err_(K[25], l1, l1); break L11; } // a finite mean
                      l67 = mo1.get(l0, []);
                      if ((!(l67 !== undefined && l67 !== null))) {
                        l76 = false;
                        L14: {
                          l70 = 0;
                          l71 = l0.records;
                          l72 = keys_(l0);
                          L15: for (l73 = 0; l73 < l72.length; l73++) {
                            l74 = l72[l73];
                            l75 = (l71 !== undefined ? l71[l73] : l0.get(l74));
                            if (!((l75 !== undefined && l75 !== null))) continue L15; // a record
                            if (!((typeof l75 === "object" || typeof l75 === "function"))) continue L15; // an object
                            l75 = l75[k11];
                            if (!((l75 !== undefined && l75 !== null))) continue L15; // a field
                            l70 = (l70 + 1);
                          }
                          l68 = l70;
                          l76 = true;
                        }
                        l67 = mo1.put(l0, [], l68, l76);
                      }
                      if ((!l67.ok)) {
                        l78 = 0;
                        l79 = l0.records;
                        l80 = keys_(l0);
                        L16: for (l81 = 0; l81 < l80.length; l81++) {
                          l82 = l80[l81];
                          l83 = (l79 !== undefined ? l79[l81] : l0.get(l82));
                          if (!((l83 !== undefined && l83 !== null))) continue L16; // a record
                          if (!((typeof l83 === "object" || typeof l83 === "function"))) continue L16; // an object
                          l83 = l83[k11];
                          if (!((l83 !== undefined && l83 !== null))) continue L16; // a field
                          l78 = (l78 + 1);
                        }
                        if (!(l67.ok)) return F; // a value of the memo
                      }
                      l84 = l67.v;
                      l86 = mo2.get(l0, []);
                      if ((!(l86 !== undefined && l86 !== null))) {
                        l106 = false;
                        L18: {
                          l89 = 0;
                          l90 = l0.records;
                          l91 = keys_(l0);
                          L19: for (l92 = 0; l92 < l91.length; l92++) {
                            l93 = l91[l92];
                            l94 = mo3.get(l0, []);
                            if ((!(l94 !== undefined && l94 !== null))) {
                              l104 = false;
                              L20: {
                                l96 = (opts_(k26) === true);
                                l98 = 0;
                                l99 = l0.records;
                                l100 = keys_(l0);
                                L21: for (l101 = 0; l101 < l100.length; l101++) {
                                  l102 = l100[l101];
                                  l103 = (l99 !== undefined ? l99[l101] : l0.get(l102));
                                  if (!((l103 !== undefined && l103 !== null))) { if (l96) break L20; continue L21; } // a record
                                  if (!((typeof l103 === "object" || typeof l103 === "function"))) { if (l96) break L20; continue L21; } // an object
                                  l103 = l103[k27];
                                  if (!((l103 !== undefined && l103 !== null))) { if (l96) break L20; continue L21; } // a field
                                  l98 = (l98 + 1);
                                }
                                l95 = l98;
                                l104 = true;
                              }
                              l94 = mo3.put(l0, [], l95, l104);
                            }
                            if (!(l94.ok)) continue L19; // a value of the memo
                            l105 = l94.v;
                            l89 = (l89 + 1);
                          }
                          l87 = l89;
                          l106 = true;
                        }
                        l86 = mo2.put(l0, [], l87, l106);
                      }
                      if ((!l86.ok)) {
                        l108 = 0;
                        l109 = l0.records;
                        l110 = keys_(l0);
                        L22: for (l111 = 0; l111 < l110.length; l111++) {
                          l112 = l110[l111];
                          l113 = (opts_(k26) === true);
                          l115 = 0;
                          l116 = l0.records;
                          l117 = keys_(l0);
                          L23: for (l118 = 0; l118 < l117.length; l118++) {
                            l119 = l117[l118];
                            l120 = (l116 !== undefined ? l116[l118] : l0.get(l119));
                            if (!((l120 !== undefined && l120 !== null))) { if (l113) continue L22; continue L23; } // a record
                            if (!((typeof l120 === "object" || typeof l120 === "function"))) { if (l113) continue L22; continue L23; } // an object
                            l120 = l120[k27];
                            if (!((l120 !== undefined && l120 !== null))) { if (l113) continue L22; continue L23; } // a field
                            l115 = (l115 + 1);
                          }
                          l108 = (l108 + 1);
                        }
                        if (!(l86.ok)) return F; // a value of the memo
                      }
                      l121 = l86.v;
                      l123 = mo4.get(l0, []);
                      if ((!(l123 !== undefined && l123 !== null))) {
                        l133 = false;
                        L25: {
                          l126 = 0;
                          l127 = addr_(l0, l1, l1, k28);
                          if (!((l127 !== F))) break L25; // an address
                          l128 = l0.records;
                          l129 = keys_(l0);
                          L26: for (l130 = 0; l130 < l129.length; l130++) {
                            l131 = l129[l130];
                            if ((l131 === l127)) {
                              continue;
                            }
                            l132 = (l128 !== undefined ? l128[l130] : l0.get(l131));
                            if (!((l132 !== undefined && l132 !== null))) continue L26; // a record
                            if (!((typeof l132 === "object" || typeof l132 === "function"))) continue L26; // an object
                            l132 = l132[k11];
                            if (!((l132 !== undefined && l132 !== null))) continue L26; // a field
                            l126 = (l126 + 1);
                          }
                          l124 = l126;
                          l133 = true;
                        }
                        l123 = mo4.put(l0, [], l124, l133);
                      }
                      if ((!l123.ok)) {
                        l135 = 0;
                        l136 = addr_(l0, l1, l1, k28);
                        if (!((l136 !== F))) { l122 = err_(K[29], l1, l1, l0); break L24; } // an address
                        l137 = l0.records;
                        l138 = keys_(l0);
                        L27: for (l139 = 0; l139 < l138.length; l139++) {
                          l140 = l138[l139];
                          if ((l140 === l136)) {
                            continue;
                          }
                          l141 = (l137 !== undefined ? l137[l139] : l0.get(l140));
                          if (!((l141 !== undefined && l141 !== null))) continue L27; // a record
                          if (!((typeof l141 === "object" || typeof l141 === "function"))) continue L27; // an object
                          l141 = l141[k11];
                          if (!((l141 !== undefined && l141 !== null))) continue L27; // a field
                          l135 = (l135 + 1);
                        }
                        if (!(l123.ok)) return F; // a value of the memo
                      }
                      l142 = l123.v;
                      break L0;
                    }
                    L28: {
                      l144 = 0;
                      l143 = [];
                      l145 = l0.records;
                      l146 = keys_(l0);
                      L29: for (l147 = 0; l147 < l146.length; l147++) {
                        l148 = l146[l147];
                        if ((l148 === l1)) {
                          continue;
                        }
                        l149 = (l145 !== undefined ? l145[l147] : l0.get(l148));
                        if (!((l149 !== undefined && l149 !== null))) continue L29; // a record
                        if (!((typeof l149 === "object" || typeof l149 === "function"))) continue L29; // an object
                        l149 = l149[k11];
                        if (!((l149 !== undefined && l149 !== null))) continue L29; // a field
                        l143.push(l148);
                      }
                      l150 = frozen_(l143);
                    }
                  }
                  L30: {
                    if (!((typeof k14 === "string"))) return F; // an op name
                    l152 = 0;
                    l153 = a15(l0, l1, l1);
                    if (!((l153 !== F))) { l25 = err_(K[30], l1, l1, l0, l1); break L30; } // the targets of an axis
                    l154 = l153.idx;
                    l155 = l0.records;
                    l156 = l153.keys;
                    L31: for (l157 = 0; l157 < l156.length; l157++) {
                      l158 = l156[l157];
                      l159 = (l155 !== undefined ? l155[l154[l157]] : l0.get(l158));
                      if (!((l159 !== undefined && l159 !== null))) continue L31; // a record
                      if (!((typeof l159 === "object" || typeof l159 === "function"))) continue L31; // an object
                      l159 = l159[k17];
                      if (!((l159 !== undefined && l159 !== null))) continue L31; // a field
                      if ((l152 === 0)) {
                        l151 = l159;
                      } else {
                        l160 = step_(k14, l151, l159);
                        if (!((l160 !== F))) { l25 = err_(K[31], l1, l1, k14); break L30; } // a step of reduce
                        l151 = l160;
                      }
                      l152 = (l152 + 1);
                    }
                    if (!((l152 !== 0))) return F; // a list that is not empty
                  }
                }
                L32: {
                  l162 = 0;
                  l161 = false;
                  l163 = l0.records;
                  l164 = keys_(l0);
                  L33: for (l165 = 0; l165 < l164.length; l165++) {
                    l166 = l164[l165];
                    l167 = (l163 !== undefined ? l163[l165] : l0.get(l166));
                    if (!((l167 !== undefined && l167 !== null))) continue L33; // a record
                    if (!((typeof l167 === "object" || typeof l167 === "function"))) continue L33; // an object
                    l167 = l167[k19];
                    if (!((l167 !== undefined && l167 !== null))) continue L33; // a field
                    if (!((typeof l167 === "boolean"))) { l36 = err_(K[32], l1, l1, l167); break L32; } // a boolean
                    l161 = (l161 || l167);
                  }
                }
              }
              L34: {
                l169 = 0;
                l168 = 0;
                l170 = a21(l0, l1, l1);
                if (!((l170 !== F))) { l55 = err_(K[33], l1, l1, l0, l1); break L34; } // the targets of an axis
                l171 = l170.idx;
                l172 = l0.records;
                l173 = l170.keys;
                L35: for (l174 = 0; l174 < l173.length; l174++) {
                  l175 = l173[l174];
                  l176 = (l172 !== undefined ? l172[l171[l174]] : l0.get(l175));
                  if (!((l176 !== undefined && l176 !== null))) continue L35; // a record
                  if (!((typeof l176 === "object" || typeof l176 === "function"))) continue L35; // an object
                  l176 = l176[k11];
                  if (!((l176 !== undefined && l176 !== null))) continue L35; // a field
                  if (!((typeof l176 === "number"))) { l55 = err_(K[34], l1, l1, l176); break L34; } // a number
                  l168 = (l168 + l176);
                  l169 = (l169 + 1);
                }
                if (!((l169 !== 0))) { l55 = err_(K[35], l1, l1); break L34; } // a list that is not empty
                l177 = result_((l168 / l169));
                if (!((l177 !== F))) { l55 = err_(K[36], l1, l1); break L34; } // a finite mean
              }
            }
            L36: {
              l179 = 0;
              l180 = l0.records;
              l181 = keys_(l0);
              L37: for (l182 = 0; l182 < l181.length; l182++) {
                l183 = l181[l182];
                l184 = (l180 !== undefined ? l180[l182] : l0.get(l183));
                if (!((l184 !== undefined && l184 !== null))) continue L37; // a record
                if (!((typeof l184 === "object" || typeof l184 === "function"))) continue L37; // an object
                l184 = l184[k11];
                if (!((l184 !== undefined && l184 !== null))) continue L37; // a field
                l179 = (l179 + 1);
              }
            }
          }
          L38: {
            l186 = 0;
            l187 = l0.records;
            l188 = keys_(l0);
            L39: for (l189 = 0; l189 < l188.length; l189++) {
              l190 = l188[l189];
              l191 = (opts_(k26) === true);
              l193 = 0;
              l194 = l0.records;
              l195 = keys_(l0);
              L40: for (l196 = 0; l196 < l195.length; l196++) {
                l197 = l195[l196];
                l198 = (l194 !== undefined ? l194[l196] : l0.get(l197));
                if (!((l198 !== undefined && l198 !== null))) { if (l191) continue L39; continue L40; } // a record
                if (!((typeof l198 === "object" || typeof l198 === "function"))) { if (l191) continue L39; continue L40; } // an object
                l198 = l198[k27];
                if (!((l198 !== undefined && l198 !== null))) { if (l191) continue L39; continue L40; } // a field
                l193 = (l193 + 1);
              }
              l186 = (l186 + 1);
            }
          }
        }
        L41: {
          l200 = 0;
          l201 = addr_(l0, l1, l1, k28);
          if (!((l201 !== F))) { l122 = err_(K[37], l1, l1, l0); break L41; } // an address
          l202 = l0.records;
          l203 = keys_(l0);
          L42: for (l204 = 0; l204 < l203.length; l204++) {
            l205 = l203[l204];
            if ((l205 === l201)) {
              continue;
            }
            l206 = (l202 !== undefined ? l202[l204] : l0.get(l205));
            if (!((l206 !== undefined && l206 !== null))) continue L42; // a record
            if (!((typeof l206 === "object" || typeof l206 === "function"))) continue L42; // an object
            l206 = l206[k11];
            if (!((l206 !== undefined && l206 !== null))) continue L42; // a field
            l200 = (l200 + 1);
          }
        }
      }
      l207 = args_(K[38], l1, l1, [l4, l16, l25, l36, l55, l66, l85, l122]);
      l4 = undefined;
      l16 = undefined;
      l25 = undefined;
      l36 = undefined;
      l55 = undefined;
      l66 = undefined;
      l85 = undefined;
      l122 = undefined;
      return raise_(l207);
    }
    l208 = rec_(k39, [l15, l24, l26, l54, l65, l84, l121, l142]);
    return l208;
  } catch {
    return F;
  }
};
