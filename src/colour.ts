// The colour spaces color balance rgb works through, transcribed from
// darktable 5.6.1 (src/common/colorspaces_inline_conversions.h,
// chromatic_adaptation.h, darktable_ucs_22_helpers.h; © Aurélien Pierre and
// the darktable developers, GPL-3.0-or-later): Kirk's Yrg and its polar Ych,
// JzAzBz, and darktable UCS 22 with its HSB/HCB forms. Every constant is
// exported so the GLSL in stage.ts is formatted from the same numbers.
//
// The working profile is darktable's default, linear Rec.2020, with the
// matrices lcms writes into the profile (D50-adapted with Bradford), the ones
// Channel Mixer matched against Ansel to 3e-6.

export type Vec3 = readonly [number, number, number];
/** Row-major 3×3. */
export type Mat3 = readonly number[];

export function apply3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function mul3(a: Mat3, b: Mat3): Mat3 {
  const out: number[] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) out.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]);
  }
  return out;
}

export function inv3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [
    (e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det,
    (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det,
    (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det,
  ];
}

// ── The working profile ──────────────────────────────────────────────────────

const BRADFORD_CAT: Mat3 = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296];
/** lcms's cmsD50_XYZ. */
const LCMS_D50: Vec3 = [0.9642, 1.0, 0.8249];
/** The D65 xy darktable's linear profiles are built with. */
const PROFILE_D65_XY: readonly [number, number] = [0.312700492, 0.329000939];

/** The RGB → XYZ D50 matrix lcms writes into a profile built from xy
 *  primaries and a white: the primaries scaled to the white, then
 *  Bradford-adapted to D50. */
function lcmsRgbToXyzD50(primaries: readonly (readonly [number, number])[]): Mat3 {
  const [[xr, yr], [xg, yg], [xb, yb]] = primaries;
  const prim: Mat3 = [xr / yr, xg / yg, xb / yb, 1, 1, 1, (1 - xr - yr) / yr, (1 - xg - yg) / yg, (1 - xb - yb) / yb];
  const W: Vec3 = [PROFILE_D65_XY[0] / PROFILE_D65_XY[1], 1, (1 - PROFILE_D65_XY[0] - PROFILE_D65_XY[1]) / PROFILE_D65_XY[1]];
  const S = apply3(inv3(prim), W);
  const rgbToXyz: Mat3 = prim.map((v, i) => v * S[i % 3]);
  const src = apply3(BRADFORD_CAT, W);
  const dst = apply3(BRADFORD_CAT, LCMS_D50);
  const scaled: Mat3 = BRADFORD_CAT.map((v, i) => (dst[Math.floor(i / 3)] / src[Math.floor(i / 3)]) * v);
  return mul3(mul3(inv3(BRADFORD_CAT), scaled), rgbToXyz);
}

export const REC709_TO_XYZ_D50 = lcmsRgbToXyzD50([[0.64, 0.33], [0.3, 0.6], [0.15, 0.06]]);
export const REC2020_TO_XYZ_D50 = lcmsRgbToXyzD50([[0.708, 0.292], [0.17, 0.797], [0.131, 0.046]]);
export const XYZ_D50_TO_REC2020 = inv3(REC2020_TO_XYZ_D50);
/** Safelight's linear Rec.709 to darktable's working Rec.2020, through XYZ
 *  D50 as darktable's input profile hands it over. */
export const REC709_TO_REC2020 = mul3(XYZ_D50_TO_REC2020, REC709_TO_XYZ_D50);
export const REC2020_TO_REC709 = inv3(REC709_TO_REC2020);

/** chromatic_adaptation.h's pre-solved CAT16 pair. */
export const XYZ_D50_TO_D65_CAT16: Mat3 = [
  9.89466254e-1, -4.00304626e-2, 4.40530317e-2,
  -5.40518733e-3, 1.00666069, -1.75551955e-3,
  -4.03920992e-4, 1.5076803e-2, 1.30210211,
];
export const XYZ_D65_TO_D50_CAT16: Mat3 = [
  1.01085433, 4.07086103e-2, -3.41445825e-2,
  5.42814201e-3, 9.93581926e-1, 1.15592039e-3,
  2.50722468e-4, -1.14918759e-2, 7.67964947e-1,
];

/** Kirk's CIE 2006 LMS, from XYZ D65 and back (darktable writes both). */
export const XYZ_D65_TO_LMS: Mat3 = [
  0.257085, 0.859943, -0.031061,
  -0.394427, 1.1758, 0.106423,
  0.064856, -0.07625, 0.559067,
];
export const LMS_TO_XYZ_D65: Mat3 = [
  1.80794659, -1.2997166, 0.34785879,
  0.6178396, 0.39595453, -0.04104687,
  -0.1254696, 0.20478038, 1.74274183,
];
/** Filmlight's grading RGB and LMS (the transposes darktable stores, undone). */
export const GRADING_TO_LMS: Mat3 = [0.95, 0.38, 0.0, 0.05, 0.62, 0.03, 0.0, 0.0, 0.97];
export const LMS_TO_GRADING: Mat3 = [
  1.0877193, -0.66666667, 0.02061856,
  -0.0877193, 1.66666667, -0.05154639,
  0.0, 0.0, 1.03092784,
];

/** process()'s input matrix: working RGB → XYZ D50 → XYZ D65 → LMS 2006. */
export const WORKING_TO_LMS = mul3(XYZ_D65_TO_LMS, mul3(XYZ_D50_TO_D65_CAT16, REC2020_TO_XYZ_D50));
/** process()'s output matrix: XYZ D65 → XYZ D50 → working RGB. */
export const XYZ_D65_TO_WORKING = mul3(XYZ_D50_TO_REC2020, XYZ_D65_TO_D50_CAT16);

// ── Yrg and Ych ──────────────────────────────────────────────────────────────

/** Y from LMS 2006. */
export const YRG_Y_WEIGHTS: readonly [number, number] = [0.68990272, 0.34832189];
/** The rg of D65 white in Yrg, subtracted to centre the hue plane. */
export const YRG_WHITE: readonly [number, number] = [0.21902143, 0.54371398];

export function lmsToYrg(lms: Vec3): Vec3 {
  const Y = YRG_Y_WEIGHTS[0] * lms[0] + YRG_Y_WEIGHTS[1] * lms[1];
  const a = lms[0] + lms[1] + lms[2];
  const n: Vec3 = a === 0 ? [0, 0, 0] : [lms[0] / a, lms[1] / a, lms[2] / a];
  const rgb = apply3(LMS_TO_GRADING, n);
  return [Y, rgb[0], rgb[1]];
}

export function yrgToLms(yrg: Vec3): Vec3 {
  const [Y, r, g] = yrg;
  const lms = apply3(GRADING_TO_LMS, [r, g, 1 - r - g]);
  const denom = YRG_Y_WEIGHTS[0] * lms[0] + YRG_Y_WEIGHTS[1] * lms[1];
  const a = denom === 0 ? 0 : Y / denom;
  return [lms[0] * a, lms[1] * a, lms[2] * a];
}

/** Y, chroma, and the hue as its cosine and sine. */
export type Ych = [number, number, number, number];

export function yrgToYch(yrg: Vec3): Ych {
  const r = yrg[1] - YRG_WHITE[0];
  const g = yrg[2] - YRG_WHITE[1];
  const c = Math.sqrt(g * g + r * r);
  return [yrg[0], c, c !== 0 ? r / c : 1, c !== 0 ? g / c : 0];
}

export function ychToYrg(ych: Readonly<Ych>): Vec3 {
  return [ych[0], ych[1] * ych[2] + YRG_WHITE[0], ych[1] * ych[3] + YRG_WHITE[1]];
}

/** gamut_check_Yrg: the chroma clipped at constant hue and Y so rg stays
 *  inside the triangle Yrg spans. */
export function gamutCheckYrg(ych: Ych): void {
  const yrg = ychToYrg(ych);
  const [, , cosH, sinH] = ych;
  let maxC = ych[1];
  if (yrg[1] < 0) maxC = Math.min(-YRG_WHITE[0] / cosH, maxC);
  if (yrg[2] < 0) maxC = Math.min(-YRG_WHITE[1] / sinH, maxC);
  if (yrg[1] + yrg[2] > 1) maxC = Math.min((1 - YRG_WHITE[0] - YRG_WHITE[1]) / (cosH + sinH), maxC);
  ych[1] = maxC;
}

/** The working RGB's Yrg hue (radians) and chroma, as process() reads them
 *  ahead of every change. */
export function workingHueChroma(rgb: Vec3): { hue: number; chroma: number } {
  const ych = yrgToYch(lmsToYrg(apply3(WORKING_TO_LMS, rgb.map((v) => Math.max(v, 0)) as unknown as Vec3)));
  return { hue: Math.atan2(ych[3], ych[2]), chroma: ych[1] };
}

// ── JzAzBz ───────────────────────────────────────────────────────────────────

export const JZ_B = 1.15;
export const JZ_G = 0.66;
export const JZ_C1 = 0.8359375;
export const JZ_C2 = 18.8515625;
export const JZ_C3 = 18.6875;
export const JZ_N = 0.159301758;
export const JZ_P = 134.034375;
export const JZ_D = -0.56;
export const JZ_D0 = 1.6295499532821566e-11;
/** X'Y'Z → L'M'S' (row-major). */
export const JZ_M: Mat3 = [
  0.41478972, 0.579999, 0.014648,
  -0.20151, 1.120649, 0.0531008,
  -0.0166008, 0.2648, 0.6684799,
];
/** L'M'S' (PQ) → Iz az bz. */
export const JZ_A: Mat3 = [
  0.5, 0.5, 0.0,
  3.524, -4.066708, 0.542708,
  0.199076, 1.096799, -1.295875,
];
/** Iz az bz → L'M'S' (PQ). */
export const JZ_AI: Mat3 = [
  1.0, 0.1386050432715393, 0.0580473161561189,
  1.0, -0.1386050432715393, -0.0580473161561189,
  1.0, -0.096019242026319, -0.811891896056039,
];
/** L'M'S' → X'Y'Z. */
export const JZ_MI: Mat3 = [
  1.9242264357876067, -1.0047923125953657, 0.037651404030618,
  0.3503167620949991, 0.7264811939316552, -0.065384422948085,
  -0.0909828109828475, -0.3127282905230739, 1.5227665613052603,
];

/** The PQ curve's forward step at full precision. */
export function jzPq(lms: number): number {
  const x = Math.pow(Math.max(lms / 10000, 0), JZ_N);
  return Math.pow((JZ_C1 + JZ_C2 * x) / (1 + JZ_C3 * x), JZ_P);
}

export function xyzToJzazbz(xyz: Vec3): Vec3 {
  const xp: Vec3 = [JZ_B * xyz[0] - (JZ_B - 1) * xyz[2], JZ_G * xyz[1] - (JZ_G - 1) * xyz[0], xyz[2]];
  const lms = apply3(JZ_M, xp).map(jzPq) as unknown as Vec3;
  const iab = apply3(JZ_A, lms);
  return [Math.max(((1 + JZ_D) * iab[0]) / (1 + JZ_D * iab[0]) - JZ_D0, 0), iab[1], iab[2]];
}

export function jzazbzToXyz(jab: Vec3): Vec3 {
  let iz = jab[0] + JZ_D0;
  iz = Math.max(iz / (1 + JZ_D - JZ_D * iz), 0);
  const lms = apply3(JZ_AI, [iz, jab[1], jab[2]]).map((v) => {
    const pq = Math.pow(Math.max(v, 0), 1 / JZ_P);
    const x = Math.max((JZ_C1 - pq) / (JZ_C3 * pq - JZ_C2), 0);
    return 10000 * Math.pow(x, 1 / JZ_N);
  }) as unknown as Vec3;
  const xp = apply3(JZ_MI, lms);
  const X = (xp[0] + (JZ_B - 1) * xp[2]) / JZ_B;
  return [X, (xp[1] + (JZ_G - 1) * X) / JZ_G, xp[2]];
}

// ── darktable UCS 22 ─────────────────────────────────────────────────────────

/** D65 white as darktable's colorspaces.h writes it. */
export const D65_XY: readonly [number, number] = [0.31271, 0.32902];
/** float32 FLT_MIN, darktable's divisor floor. */
export const FLT_MIN = 1.1754943508222875e-38;

// The upper limit sits 3.4e-5 below the range, so L* near it turns into Y
// through a near-zero difference: both are taken as the floats darktable
// subtracts, or the difference is 0.4 % off.
export const UCS_L_STAR_RANGE = Math.fround(2.098883786377);
export const UCS_L_STAR_UPPER_LIMIT = Math.fround(2.09885);
export const UCS_L_STAR_EXPONENT = 0.631651345306265;
export const UCS_L_STAR_OFFSET = 1.12426773749357;
export const UCS_L_STAR_INVERSE_EXPONENT = 1.5831518565279648;
export const UCS_CHROMA_SCALE = 15.932993652962535;
export const UCS_CHROMA_L_EXPONENT = 0.6523997524738018;
export const UCS_CHROMA_M_EXPONENT = 0.6007557017508491;
export const UCS_CHROMA_INVERSE_EXPONENT = 0.8322850678616855;
export const UCS_HCB_EXPONENT = 1.33654221029386;

export const UCS_UV_X_FACTORS: Vec3 = [-0.783941002840055, 0.745273540913283, 0.318707282433486];
export const UCS_UV_Y_FACTORS: Vec3 = [0.277512987809202, -0.205375866083878, 2.16743692732158];
export const UCS_UV_OFFSETS: Vec3 = [0.153836578598858, -0.165478376301988, 0.291320554395942];
export const UCS_UV_FACTORS: readonly [number, number] = [1.39656225667, 1.4513954287];
export const UCS_UV_HALF: readonly [number, number] = [1.49217352929, 1.52488637914];
/** UV* → UV*' (row-major 2×2). */
export const UCS_UV_PRIME: readonly number[] = [-1.124983854323892, -0.980483721769325, 1.86323315098672, 1.971853092390862];
/** UV*' → UV* (row-major 2×2, as darktable writes it). */
export const UCS_UV_UNPRIME: readonly number[] = [-5.037522385190711, -2.504856328185843, 4.760029407436461, 2.874012963239247];
export const UCS_XY_U_FACTORS: Vec3 = [0.167171472114775, -0.150959086409163, 0.940254742367256];
export const UCS_XY_V_FACTORS: Vec3 = [0.141299802443708, -0.155185060382272, 1.0];
export const UCS_XY_OFFSETS: Vec3 = [-0.00801531300850582, -0.00843312433578007, -0.0256325967652889];

export function yToLStar(Y: number): number {
  const yHat = Math.pow(Y, UCS_L_STAR_EXPONENT);
  return (UCS_L_STAR_RANGE * yHat) / (yHat + UCS_L_STAR_OFFSET);
}

export function lStarToY(lStar: number): number {
  return Math.pow((UCS_L_STAR_OFFSET * lStar) / (UCS_L_STAR_RANGE - lStar), UCS_L_STAR_INVERSE_EXPONENT);
}

/** dt_D65_XYZ_to_xyY, negatives clipped first. */
export function xyzToXyY(xyz: Vec3): Vec3 {
  const X = Math.max(xyz[0], 0);
  const Y = Math.max(xyz[1], 0);
  const Z = Math.max(xyz[2], 0);
  const sum = X + Y + Z;
  return sum > 0 ? [X / sum, Y / sum, Y] : [D65_XY[0], D65_XY[1], Y];
}

export function xyYToXyz(xyY: Vec3): Vec3 {
  if (xyY[1] === 0) return [0, 0, 0];
  return [(xyY[2] * xyY[0]) / xyY[1], xyY[2], (xyY[2] * (1 - xyY[0] - xyY[1])) / xyY[1]];
}

const signedFloor = (d: number): number => (d >= 0 ? Math.max(FLT_MIN, d) : Math.min(-FLT_MIN, d));

export function xyYToUcsUv(xyY: Vec3): [number, number] {
  const uvd = [0, 1, 2].map((c) => UCS_UV_X_FACTORS[c] * xyY[0] + UCS_UV_Y_FACTORS[c] * xyY[1] + UCS_UV_OFFSETS[c]);
  const div = signedFloor(uvd[2]);
  const u = uvd[0] / div;
  const v = uvd[1] / div;
  const us = (UCS_UV_FACTORS[0] * u) / (Math.abs(u) + UCS_UV_HALF[0]);
  const vs = (UCS_UV_FACTORS[1] * v) / (Math.abs(v) + UCS_UV_HALF[1]);
  return [UCS_UV_PRIME[0] * us + UCS_UV_PRIME[1] * vs, UCS_UV_PRIME[2] * us + UCS_UV_PRIME[3] * vs];
}

/** xyY_to_dt_UCS_JCH: lightness J, chroma C, hue H (radians). */
export function xyYToUcsJch(xyY: Vec3, lWhite: number): Vec3 {
  const [U, V] = xyYToUcsUv(xyY);
  const lStar = yToLStar(xyY[2]);
  const m2 = U * U + V * V;
  return [
    lStar / lWhite,
    (UCS_CHROMA_SCALE * Math.pow(lStar, UCS_CHROMA_L_EXPONENT) * Math.pow(m2, UCS_CHROMA_M_EXPONENT)) / lWhite,
    Math.atan2(V, U),
  ];
}

export function ucsJchToXyY(jch: Vec3, lWhite: number): Vec3 {
  const lStar = Math.min(Math.max(jch[0] * lWhite, 0), UCS_L_STAR_UPPER_LIMIT);
  const M =
    lStar !== 0
      ? Math.pow((jch[1] * lWhite) / (UCS_CHROMA_SCALE * Math.pow(lStar, UCS_CHROMA_L_EXPONENT)), UCS_CHROMA_INVERSE_EXPONENT)
      : 0;
  const Up = M * Math.cos(jch[2]);
  const Vp = M * Math.sin(jch[2]);
  const us = UCS_UV_UNPRIME[0] * Up + UCS_UV_UNPRIME[1] * Vp;
  const vs = UCS_UV_UNPRIME[2] * Up + UCS_UV_UNPRIME[3] * Vp;
  const U = (-UCS_UV_HALF[0] * us) / (Math.abs(us) - UCS_UV_FACTORS[0]);
  const V = (-UCS_UV_HALF[1] * vs) / (Math.abs(vs) - UCS_UV_FACTORS[1]);
  const xyd = [0, 1, 2].map((c) => UCS_XY_U_FACTORS[c] * U + UCS_XY_V_FACTORS[c] * V + UCS_XY_OFFSETS[c]);
  const div = signedFloor(xyd[2]);
  return [xyd[0] / div, xyd[1] / div, lStarToY(lStar)];
}

/** J · (C^1.3365 + 1): the brightness of the HSB and HCB forms. */
export const ucsBrightness = (J: number, C: number): number => J * (Math.pow(C, UCS_HCB_EXPONENT) + 1);
export const ucsLightness = (B: number, C: number): number => B / (Math.pow(C, UCS_HCB_EXPONENT) + 1);

/** darktable_ucs_22_helpers.h soft_clip: an exponential knee above `soft`
 *  that never reaches `hard`. */
export function softClip(x: number, soft: number, hard: number): number {
  const norm = hard - soft;
  return x > soft ? soft + (1 - Math.exp(-(x - soft) / norm)) * norm : x;
}

/** LUT_ELEM. */
export const LUT_SIZE = 512;

/** lookup_gamut: the LUT linearly interpolated at a hue angle in [-pi, pi]. */
export function lookupGamut(lut: readonly number[], hue: number): number {
  const x = (LUT_SIZE * (hue + Math.PI)) / (2 * Math.PI);
  const prev = Math.floor(x);
  const next = Math.ceil(x);
  const xi = prev & (LUT_SIZE - 1);
  const xii = next & (LUT_SIZE - 1);
  const y = lut[xi];
  return y + (xi !== xii ? (x - prev) * (lut[xii] - y) : 0);
}
