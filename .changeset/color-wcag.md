---
"@mark1russell7/vex": minor
"@mark1russell7/vex-domains": minor
"@mark1russell7/vex-testkit": minor
---

Add the WCAG 2.1 ops `relativeLuminance` and `contrast` to `ColorDomain`. The old op `luminance` applies the Rec. 709 weights to the raw channels without the sRGB transfer function, so it does not give the contrast ratios of WCAG. The palette pilot found the gap.
