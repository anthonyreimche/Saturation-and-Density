// The CPU reference of the Saturation & Density stage.
//
// Part A is the saturation side of darktable 5.6.1's color balance rgb
// (src/iop/colorbalancergb.c process() and commit_params(), © Aurélien Pierre
// and the darktable developers, GPL-3.0-or-later): chroma and vibrance in
// Kirk's Ych at constant Y, then perceptual saturation and brilliance by
// rotating the lightness/chroma plane of JzAzBz or darktable UCS 22, each
// weighted by darktable's shadows/midtones/highlights opacity masks, then
// gamut mapping against a per-hue LUT of the working gamut.
//
// The 4-way wheels, contrast and hue shift are not ported. At their neutral
// values darktable still takes the pixel through its grading RGB and back,
// which only rounds, except that its vector power at exponent 1 is a
// polynomial approximation off by up to 3.7e-5 relative. The port skips the
// detour; `emulateVectorPow` puts it back, float approximation and all, so
// the tests can show the residue against darktable is that and nothing else.
//
// Part B, the colour slices, is Safelight's own: six hue vectors at the
// Yrg hues of the Rec.709 primaries and secondaries, plus skin. Each pixel's
// weights come from its input Yrg hue and chroma, which no exposure change
// moves, and each slice's values add to darktable's own knobs: the hue shift
// turns the Ych hue ahead of the gamut check, chroma adds to the chroma
// boost, saturation and brilliance add to the perceptual rotation. All-zero
// slices add +0, so they change no bit.

import {
  FLT_MIN,
  JZ_AI,
  JZ_D,
  JZ_D0,
  LMS_TO_GRADING,
  GRADING_TO_LMS,
  LMS_TO_XYZ_D65,
  REC2020_TO_REC709,
  REC709_TO_REC2020,
  UCS_CHROMA_L_EXPONENT,
  UCS_CHROMA_M_EXPONENT,
  UCS_CHROMA_SCALE,
  WORKING_TO_LMS,
  XYZ_D65_TO_WORKING,
  apply3,
  gamutCheckYrg,
  jzazbzToXyz,
  lmsToYrg,
  lookupGamut,
  softClip,
  ucsBrightness,
  ucsJchToXyY,
  ucsLightness,
  xyYToUcsJch,
  xyYToXyz,
  xyzToJzazbz,
  xyzToXyY,
  yToLStar,
  ychToYrg,
  yrgToLms,
  yrgToYch,
  workingHueChroma,
  type Vec3,
  type Ych,
} from "./colour";
import { LUT_JZAZBZ, LUT_UCS } from "./luts";

export type { Vec3 } from "./colour";

// ── Params ───────────────────────────────────────────────────────────────────

/** dt_iop_colorbalancrgb_saturation_t: darktable's enum values. */
export const FORMULAS = Object.freeze({ jzazbz: 0, perceptual: 1 } as const);
export type Formula = (typeof FORMULAS)[keyof typeof FORMULAS];

/** One effect, globally and by tone. */
export interface Tones {
  global: number;
  shadows: number;
  midtones: number;
  highlights: number;
}

/** darktable's masks tab. */
export interface Masks {
  /** "shadows fall-off", 0..3. */
  shadowsWeight: number;
  /** "highlights fall-off", 0..3. */
  highlightsWeight: number;
  /** "mask middle-grey fulcrum", 0..1 (linear). */
  maskGreyFulcrum: number;
  /** "white fulcrum", EV, -16..16. Only the perceptual formula reads it. */
  whiteFulcrum: number;
}

/** One colour slice. */
export interface Slice {
  /** Hue shift, degrees, -180..180. */
  hue: number;
  /** -1..1, as the chroma sliders. */
  chroma: number;
  /** -1..1, as the saturation sliders. */
  saturation: number;
  /** -1..1, as the brilliance sliders. */
  brilliance: number;
}

export interface Params {
  formula: Formula;
  chroma: Tones;
  /** -1..1. */
  vibrance: number;
  saturation: Tones;
  brilliance: Tones;
  masks: Masks;
  /** SLICE_COUNT of them, in SLICE_NAMES order. */
  slices: readonly Slice[];
}

/** The tone-weighted sliders' range (darktable's $MIN/$MAX). */
export const TONE_LIMIT = 1;
export const VIBRANCE_LIMIT = 1;
export const SLICE_HUE_LIMIT = 180;
export const MASK_RANGES = Object.freeze({
  shadowsWeight: [0, 3],
  highlightsWeight: [0, 3],
  maskGreyFulcrum: [0, 1],
  whiteFulcrum: [-16, 16],
} as const satisfies Record<keyof Masks, readonly [number, number]>);

export const SLICE_NAMES = ["red", "yellow", "green", "cyan", "blue", "magenta", "skin"] as const;
export type SliceName = (typeof SLICE_NAMES)[number];
export const SLICE_COUNT = SLICE_NAMES.length;
/** The six hue vectors; skin is the last slice. */
export const HUE_VECTORS = 6;
export const SKIN = 6;

const ZERO_TONES: Tones = Object.freeze({ global: 0, shadows: 0, midtones: 0, highlights: 0 });
const ZERO_SLICE: Slice = Object.freeze({ hue: 0, chroma: 0, saturation: 0, brilliance: 0 });

export const DEFAULT_PARAMS: Params = Object.freeze({
  formula: FORMULAS.perceptual,
  chroma: ZERO_TONES,
  vibrance: 0,
  saturation: ZERO_TONES,
  brilliance: ZERO_TONES,
  masks: Object.freeze({ shadowsWeight: 1, highlightsWeight: 1, maskGreyFulcrum: 0.1845, whiteFulcrum: 0 }),
  slices: Object.freeze(Array.from({ length: SLICE_COUNT }, () => ZERO_SLICE)),
});

const tonesIdle = (t: Tones): boolean => t.global === 0 && t.shadows === 0 && t.midtones === 0 && t.highlights === 0;

/** True while no effect is asked for. The formula and the masks change
 *  nothing by themselves, so they don't count: an untouched photo keeps its
 *  pixels even though darktable, enabled at neutral, would gamut-map them. */
export function isIdle(p: Params): boolean {
  return (
    tonesIdle(p.chroma) &&
    tonesIdle(p.saturation) &&
    tonesIdle(p.brilliance) &&
    p.vibrance === 0 &&
    p.slices.every((s) => s.hue === 0 && s.chroma === 0 && s.saturation === 0 && s.brilliance === 0)
  );
}

// ── commit_params ────────────────────────────────────────────────────────────

/** opacity_masks' exponent: pow(Y, this) puts middle grey at 50 %. */
export const MASK_EXPONENT = 0.4101205819200422;
/** The smallest mask grey fulcrum the port divides by; darktable divides by
 *  0 there and draws NaN. */
export const MIN_MASK_FULCRUM = 1e-6;

export interface Derived {
  formula: Formula;
  chroma: Tones;
  saturation: Tones;
  brilliance: Tones;
  vibrance: number;
  shadowsWeight: number;
  highlightsWeight: number;
  midtonesWeight: number;
  /** In the mask's pow(Y, MASK_EXPONENT) units. */
  maskGreyFulcrum: number;
  /** 2^white fulcrum, linear. */
  whiteFulcrum: number;
  /** UCS lightness of the white fulcrum. */
  lWhite: number;
}

export function derive(p: Params): Derived {
  const shadowsWeight = 2 + 2 * p.masks.shadowsWeight;
  const highlightsWeight = 2 + 2 * p.masks.highlightsWeight;
  const s2 = shadowsWeight * shadowsWeight;
  const h2 = highlightsWeight * highlightsWeight;
  const whiteFulcrum = Math.pow(2, p.masks.whiteFulcrum);
  return {
    formula: p.formula,
    chroma: p.chroma,
    saturation: p.saturation,
    brilliance: p.brilliance,
    vibrance: p.vibrance,
    shadowsWeight,
    highlightsWeight,
    midtonesWeight: (s2 * h2) / (s2 + h2),
    maskGreyFulcrum: Math.pow(Math.max(p.masks.maskGreyFulcrum, MIN_MASK_FULCRUM), MASK_EXPONENT),
    whiteFulcrum,
    lWhite: yToLStar(whiteFulcrum),
  };
}

/** Shadows, midtones and highlights opacities at pow(Y, MASK_EXPONENT) = x. */
export function opacityMasks(x: number, d: Derived): Vec3 {
  const offset = x - d.maskGreyFulcrum;
  const norm = offset / d.maskGreyFulcrum;
  const alpha = 1 / (1 + Math.exp(norm * d.shadowsWeight));
  const beta = 1 / (1 + Math.exp(-norm * d.highlightsWeight));
  const gamma = Math.exp((-offset * offset * d.midtonesWeight) / 4) * (1 - alpha) ** 2 * (1 - beta) ** 2 * 8;
  return [alpha, gamma, beta];
}

const toneSum = (t: Tones, op: Vec3): number => t.shadows * op[0] + t.midtones * op[1] + t.highlights * op[2];

// ── Colour slices ────────────────────────────────────────────────────────────

/** The six vectors' colours as linear Rec.709, in SLICE_NAMES order. */
const VECTOR_COLOURS: readonly Vec3[] = [
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 1, 1],
  [0, 0, 1],
  [1, 0, 1],
];

/** A typical skin colour, linear Rec.709 (sRGB 217, 160, 130). */
export const SKIN_COLOUR: Vec3 = [0.693872, 0.351533, 0.223228];

const rec709HueChroma = (rgb: Vec3) => workingHueChroma(apply3(REC709_TO_REC2020, rgb));

/** Each slice's centre: the Yrg hue (radians) of its colour, in SLICE_NAMES order. */
export const SLICE_CENTRES: readonly number[] = [...VECTOR_COLOURS, SKIN_COLOUR].map((c) => rec709HueChroma(c).hue);

/** The swatch colours the panel draws for the slices, display sRGB. */
export const SLICE_SWATCHES: readonly string[] = ["#e0403a", "#e0c83a", "#4cc048", "#46c4d0", "#4a62e0", "#c84ad0", "#d9a082"];

const TWO_PI = 2 * Math.PI;

/** An angle wrapped into [-pi, pi). */
export const wrapAngle = (a: number): number => a - TWO_PI * Math.floor((a + Math.PI) / TWO_PI);

/** The angular gap from each vector to the next one around the circle,
 *  either way: [to the one below, to the one above]. */
export const SLICE_GAPS: readonly (readonly [number, number])[] = SLICE_CENTRES.slice(0, HUE_VECTORS).map((h, i, all) => {
  const offsets = all.filter((_, j) => j !== i).map((o) => wrapAngle(o - h));
  const above = Math.min(...offsets.map((d) => (d > 0 ? d : d + TWO_PI)));
  const below = Math.min(...offsets.map((d) => (d < 0 ? -d : TWO_PI - d)));
  return [below, above] as const;
});

/** Below this Yrg chroma a pixel takes no hue vector at all, above SLICE_GATE[1]
 *  all of it: greys have no hue to select by. */
export const SLICE_GATE: readonly [number, number] = [0.004, 0.025];
/** The skin window: half-width in hue (radians), and the chroma band (rises
 *  over [0], [1], falls over [2], [3]) relative to the skin colour's chroma. */
export const SKIN_HUE_HALF_WIDTH = (30 * Math.PI) / 180;
export const SKIN_CHROMA: number = rec709HueChroma(SKIN_COLOUR).chroma;
export const SKIN_BAND: readonly [number, number, number, number] = [0.2, 0.5, 1.8, 3].map((k) => k * SKIN_CHROMA) as unknown as [
  number,
  number,
  number,
  number,
];

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** A raised-cosine bump: 1 at t = 0, 0 from |t| = 1. */
const bump = (t: number): number => (t < 1 ? 0.5 + 0.5 * Math.cos(Math.PI * t) : 0);

/** The slices' weights at an input Yrg hue (radians) and chroma, in
 *  SLICE_NAMES order. The six vectors split the circle between neighbours,
 *  so they sum to the chroma gate; skin overrides them by its own weight. */
export function sliceWeights(hue: number, chroma: number): number[] {
  const skinDelta = Math.abs(wrapAngle(hue - SLICE_CENTRES[SKIN]));
  const skin =
    bump(skinDelta / SKIN_HUE_HALF_WIDTH) *
    smoothstep(SKIN_BAND[0], SKIN_BAND[1], chroma) *
    (1 - smoothstep(SKIN_BAND[2], SKIN_BAND[3], chroma));
  const keep = smoothstep(SLICE_GATE[0], SLICE_GATE[1], chroma) * (1 - skin);
  const out: number[] = [];
  for (let i = 0; i < HUE_VECTORS; i++) {
    const delta = wrapAngle(hue - SLICE_CENTRES[i]);
    const t = delta >= 0 ? delta / SLICE_GAPS[i][1] : -delta / SLICE_GAPS[i][0];
    out.push(bump(t) * keep);
  }
  out.push(skin);
  return out;
}

/** The slices' values summed by weight: hue shift (degrees), chroma,
 *  saturation, brilliance. */
export function sliceSums(slices: readonly Slice[], weights: readonly number[]): [number, number, number, number] {
  const k: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < SLICE_COUNT; i++) {
    k[0] += weights[i] * slices[i].hue;
    k[1] += weights[i] * slices[i].chroma;
    k[2] += weights[i] * slices[i].saturation;
    k[3] += weights[i] * slices[i].brilliance;
  }
  return k;
}

// ── darktable's vector power, for emulateVectorPow ──────────────────────────

const f32 = Math.fround;
const bits = new DataView(new ArrayBuffer(4));
const floatBits = (x: number): number => (bits.setFloat32(0, x), bits.getUint32(0));
const bitsFloat = (i: number): number => (bits.setUint32(0, i >>> 0), bits.getFloat32(0));

/** dt_vector_log2: a degree-5 minimax polynomial in the mantissa. */
function dtLog2(x: number): number {
  const i = floatBits(x);
  const mant = bitsFloat((i & 0x007fffff) | 0x3f800000);
  const exp = f32(((i & 0x7f800000) >>> 23) - 127);
  let p = f32(f32(0.0596515482674574969533 * mant) - 0.465725644288844778798);
  p = f32(f32(p * mant) + 1.48116647521213171641);
  p = f32(f32(p * mant) - 2.52074962577807006663);
  p = f32(f32(p * mant) + 2.8882704548164776201);
  return f32(f32(p * f32(mant - 1)) + exp);
}

/** Round half to even, as _mm_cvtps_epi32 does. */
function roundEven(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** dt_vector_exp2: a degree-4 polynomial on the fraction, scaled by 2^int. */
function dtExp2(input: number): number {
  const x = Math.max(Math.min(input, 129), f32(-126.99999));
  const ipart = roundEven(f32(x - 0.5));
  const fpart = f32(x - ipart);
  let p = f32(f32(1.3534167e-2 * fpart) + 5.2011464e-2);
  p = f32(f32(p * fpart) + 2.4144275e-1);
  p = f32(f32(p * fpart) + 6.9300383e-1);
  p = f32(f32(p * fpart) + 1.0000026);
  return f32(bitsFloat((127 + ipart) << 23) * p);
}

/** dt_vector_powf at exponent 1, darktable's midtones at neutral. */
export const dtVectorPow1 = (x: number): number => dtExp2(dtLog2(f32(x)));

// ── process() ────────────────────────────────────────────────────────────────

export interface ProcessOptions {
  /** Take darktable's grading RGB detour with its vector power (see above). */
  emulateVectorPow?: boolean;
  /** Leave the slice sums out entirely (the identity test's baseline). */
  ignoreSlices?: boolean;
}

const HALF_PI = Math.PI / 2;

/** The grading-RGB detour process() takes at the neutral wheels. */
function gradingDetour(ych: Ych, op: Vec3, d: Derived): Vec3 {
  const grading = apply3(LMS_TO_GRADING, yrgToLms(ychToYrg(ych)));
  const [alpha, , beta] = op;
  const slope = (1 - beta) * (1 - alpha + alpha) + beta;
  const rgb = grading.map((v) => {
    const x = v * slope;
    const sign = x < 0 ? -1 : 1;
    return dtVectorPow1(Math.abs(x) / d.whiteFulcrum) * sign * d.whiteFulcrum;
  }) as unknown as Vec3;
  const yrg = lmsToYrg(apply3(GRADING_TO_LMS, rgb));
  const Y = Math.max(yrg[0] / d.whiteFulcrum, 0) * d.whiteFulcrum;
  return apply3(LMS_TO_XYZ_D65, yrgToLms([Y, yrg[1], yrg[2]]));
}

function perceptualJzazbz(xyz: Vec3, sat: number, bril: number): Vec3 {
  const jab = xyzToJzazbz(xyz);
  let J = jab[0];
  let C = Math.hypot(jab[1], jab[2]);
  const h = Math.atan2(jab[2], jab[1]);
  const T = Math.atan2(C, J);
  const sinT = Math.sin(T);
  const cosT = Math.cos(T);
  let S = J * cosT + C * sinT;
  const O = S * Math.min(Math.max(T * sat, -T), HALF_PI - T);
  S = Math.max(S * bril, 0);
  J = Math.max(S * cosT - O * sinT, 0);
  C = Math.max(S * sinT + O * cosT, 0);

  const maxSat = lookupGamut(LUT_JZAZBZ, h);
  const s = J > 0 ? softClip(C / J, 0.8 * maxSat, maxSat) : maxSat;
  const maxCAtSat = J * s;
  const maxJAtSat = s > 0 ? C / s : J;
  J = (J + maxJAtSat) / 2;
  C = (C + maxCAtSat) / 2;

  const cosH = Math.cos(h);
  const sinH = Math.sin(h);
  const iz = Math.max((J + JZ_D0) / (1 + JZ_D - JZ_D * (J + JZ_D0)), 0);
  let maxC = C;
  for (let k = 0; k < 3; k++) {
    const slope = JZ_AI[3 * k + 1] * cosH + JZ_AI[3 * k + 2] * sinH;
    if (iz + C * slope < 0) maxC = Math.min(-iz / slope, maxC);
  }
  return jzazbzToXyz([J, maxC * cosH, maxC * sinH]);
}

/** Below this UCS chroma a pixel has no direction to turn in: darktable
 *  divides by FLT_MIN there, which float32 overflows. Its result is the
 *  brightness scaled, to 1e-30. */
export const UCS_ROTATION_MIN_CHROMA = 1e-30;

function perceptualUcs(xyz: Vec3, sat: number, bril: number, lWhite: number): Vec3 {
  const jch = xyYToUcsJch(xyzToXyY(xyz), lWhite);
  const H = jch[2];
  let C = jch[1];
  let B = ucsBrightness(jch[0], C);
  const radius = Math.hypot(C, B);
  let a = Math.max(1 + sat, 0);
  const b = Math.max(1 + bril, 0);
  if (C > UCS_ROTATION_MIN_CHROMA) {
    const sinT = C / radius;
    const cosT = B / radius;
    const P = Math.max(FLT_MIN, C);
    const W = sinT * C + cosT * B;
    const maxA = Math.hypot(P, W) / P;
    a = softClip(a, 0.5 * maxA, maxA);
    const Pp = (a - 1) * P;
    const Wp = Math.sqrt(Math.max(P * P * (1 - a * a) + W * W, 0)) * b;
    C = Math.max(cosT * Pp + sinT * Wp, 0);
    B = Math.max(-sinT * Pp + cosT * Wp, 0);
  } else {
    C = 0;
    B = radius * b;
  }
  const J = ucsLightness(B, C);

  const maxM2 = lookupGamut(LUT_UCS, H);
  const maxChroma =
    (UCS_CHROMA_SCALE * Math.pow(J * lWhite, UCS_CHROMA_L_EXPONENT) * Math.pow(maxM2, UCS_CHROMA_M_EXPONENT)) / lWhite;
  const boundaryB = ucsBrightness(J, maxChroma);
  const boundaryS = boundaryB > 0 ? maxChroma / boundaryB : 0;
  const S = softClip(B > 0 ? C / B : 0, 0.8 * boundaryS, boundaryS);
  const outC = S * B;
  return xyYToXyz(ucsJchToXyY([ucsLightness(B, outC), outC, H], lWhite));
}

/** One pixel of darktable's working RGB (linear Rec.2020) through the stage. */
export function processWorking(rgb: Vec3, p: Params, options: ProcessOptions = {}): Vec3 {
  const d = derive(p);
  const lms = apply3(WORKING_TO_LMS, [Math.max(rgb[0], 0), Math.max(rgb[1], 0), Math.max(rgb[2], 0)]);
  const ych = yrgToYch(lmsToYrg(lms));
  ych[0] = Math.max(ych[0], 0);
  const op = opacityMasks(Math.pow(ych[0], MASK_EXPONENT), d);

  const k = options.ignoreSlices ? null : sliceSums(p.slices, sliceWeights(Math.atan2(ych[3], ych[2]), ych[1]));

  const turn = k ? (k[0] * Math.PI) / 180 : 0;
  const cosTurn = Math.cos(turn);
  const sinTurn = Math.sin(turn);
  const [, , cosH, sinH] = ych;
  ych[2] = cosTurn * cosH - sinTurn * sinH;
  ych[3] = sinTurn * cosH + cosTurn * sinH;

  let chromaBoost = d.chroma.global + toneSum(d.chroma, op);
  if (k) chromaBoost += k[1];
  const vibrance = d.vibrance !== 0 ? d.vibrance * (1 - Math.pow(ych[1], Math.abs(d.vibrance))) : 0;
  ych[1] *= Math.max(1 + chromaBoost + vibrance, 0);
  gamutCheckYrg(ych);

  const xyz = options.emulateVectorPow ? gradingDetour(ych, op, d) : apply3(LMS_TO_XYZ_D65, yrgToLms(ychToYrg(ych)));

  let sat = d.saturation.global + toneSum(d.saturation, op);
  let bril = d.brilliance.global + toneSum(d.brilliance, op);
  if (k) {
    sat += k[2];
    bril += k[3];
  }
  const out =
    d.formula === FORMULAS.jzazbz ? perceptualJzazbz(xyz, sat, 1 + bril) : perceptualUcs(xyz, sat, bril, d.lWhite);
  const w = apply3(XYZ_D65_TO_WORKING, out);
  return [Math.max(w[0], 0), Math.max(w[1], 0), Math.max(w[2], 0)];
}

/** One pixel of Safelight's linear Rec.709 through the stage. */
export function process709(rgb: Vec3, p: Params, options: ProcessOptions = {}): Vec3 {
  return apply3(REC2020_TO_REC709, processWorking(apply3(REC709_TO_REC2020, rgb), p, options));
}
