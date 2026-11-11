// A line-by-line TypeScript transcription of the stage's GLSL (src/stage.ts),
// helper for helper, in double precision: the half-float LUT pairs read back
// as the texture holds them, the PQ curve through the log1p and expm1
// series, every guard as the shader has it. Held to the model in
// shader-mirror.test.ts, so a slip in the GLSL's logic shows on the CPU; the
// GPU spec (test/gpu) holds the real shader to the model in float.

import {
  D65_XY,
  FLT_MIN,
  GRADING_TO_LMS,
  JZ_A,
  JZ_AI,
  JZ_B,
  JZ_C3,
  JZ_D,
  JZ_D0,
  JZ_G,
  JZ_M,
  JZ_MI,
  JZ_N,
  JZ_P,
  LMS_TO_GRADING,
  LMS_TO_XYZ_D65,
  LUT_SIZE,
  REC2020_TO_REC709,
  REC709_TO_REC2020,
  UCS_CHROMA_INVERSE_EXPONENT,
  UCS_CHROMA_L_EXPONENT,
  UCS_CHROMA_M_EXPONENT,
  UCS_CHROMA_SCALE,
  UCS_HCB_EXPONENT,
  UCS_L_STAR_EXPONENT,
  UCS_L_STAR_INVERSE_EXPONENT,
  UCS_L_STAR_OFFSET,
  UCS_L_STAR_RANGE,
  UCS_L_STAR_UPPER_LIMIT,
  UCS_UV_FACTORS,
  UCS_UV_HALF,
  UCS_UV_OFFSETS,
  UCS_UV_PRIME,
  UCS_UV_UNPRIME,
  UCS_UV_X_FACTORS,
  UCS_UV_Y_FACTORS,
  UCS_XY_OFFSETS,
  UCS_XY_U_FACTORS,
  UCS_XY_V_FACTORS,
  WORKING_TO_LMS,
  XYZ_D65_TO_WORKING,
  YRG_WHITE,
  YRG_Y_WEIGHTS,
  apply3,
  type Vec3,
} from "../../src/colour";
import {
  FORMULAS,
  HUE_VECTORS,
  MASK_EXPONENT,
  MIN_MASK_FULCRUM,
  SKIN,
  SKIN_BAND,
  SKIN_HUE_HALF_WIDTH,
  SLICE_CENTRES,
  SLICE_GAPS,
  SLICE_GATE,
  UCS_ROTATION_MIN_CHROMA,
  isIdle,
  smoothstep,
  type Params,
} from "../../src/model";
import { LUT_SCALES, PQ_C1P, PQ_K, lutTexture, toHalf } from "../../src/stage";

type Vec2 = [number, number];

/** The texture as the GPU holds it: every float rounded to half. */
const TEXELS = Array.from(lutTexture().data, toHalf);
const texel = (i: number): [number, number, number, number] => [TEXELS[4 * i], TEXELS[4 * i + 1], TEXELS[4 * i + 2], TEXELS[4 * i + 3]];

const clamp = (x: number, lo: number, hi: number): number => Math.min(Math.max(x, lo), hi);
const pow = (x: number, y: number): number => (x > 0 ? Math.pow(x, y) : 0);

function yrgFromLms(lms: Vec3): Vec3 {
  const y = YRG_Y_WEIGHTS[0] * lms[0] + YRG_Y_WEIGHTS[1] * lms[1];
  const a = lms[0] + lms[1] + lms[2];
  const n: Vec3 = a === 0 ? [0, 0, 0] : [lms[0] / a, lms[1] / a, lms[2] / a];
  const rgb = apply3(LMS_TO_GRADING, n);
  return [y, rgb[0], rgb[1]];
}

function lmsFromYrg(yrg: Vec3): Vec3 {
  const lms = apply3(GRADING_TO_LMS, [yrg[1], yrg[2], 1 - yrg[1] - yrg[2]]);
  const denom = YRG_Y_WEIGHTS[0] * lms[0] + YRG_Y_WEIGHTS[1] * lms[1];
  const k = denom === 0 ? 0 : yrg[0] / denom;
  return [lms[0] * k, lms[1] * k, lms[2] * k];
}

function opacities(x: number, masks: readonly number[]): Vec3 {
  const sw = 2 + 2 * masks[0];
  const hw = 2 + 2 * masks[1];
  const mw = (sw * sw * hw * hw) / (sw * sw + hw * hw);
  const fulcrum = Math.pow(Math.max(masks[2], MIN_MASK_FULCRUM), MASK_EXPONENT);
  const offset = x - fulcrum;
  const norm = offset / fulcrum;
  const alpha = 1 / (1 + Math.exp(clamp(norm * sw, -80, 80)));
  const beta = 1 / (1 + Math.exp(clamp(-norm * hw, -80, 80)));
  const gamma = Math.exp((-offset * offset * mw) / 4) * (1 - alpha) * (1 - alpha) * (1 - beta) * (1 - beta) * 8;
  return [alpha, gamma, beta];
}

function cosSin(a: number): Vec2 {
  const x = 0.5 * a;
  const x2 = x * x;
  const s = x * (1 - (x2 / 6) * (1 - (x2 / 20) * (1 - (x2 / 42) * (1 - (x2 / 72) * (1 - (x2 / 110) * (1 - x2 / 156))))));
  const c = 1 - (x2 / 2) * (1 - (x2 / 12) * (1 - (x2 / 30) * (1 - (x2 / 56) * (1 - (x2 / 90) * (1 - (x2 / 132) * (1 - x2 / 182))))));
  return [c * c - s * s, 2 * s * c];
}

const wrap = (a: number): number => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
const bump = (t: number): number => (t < 1 ? 0.5 + 0.5 * cosSin(Math.PI * t)[0] : 0);
function vector(hue: number, centre: number, below: number, above: number): number {
  const delta = wrap(hue - centre);
  return bump(delta >= 0 ? delta / above : -delta / below);
}

function sliceWeights(hue: number, chroma: number): number[] {
  const skin =
    bump(Math.abs(wrap(hue - SLICE_CENTRES[SKIN])) / SKIN_HUE_HALF_WIDTH) *
    smoothstep(SKIN_BAND[0], SKIN_BAND[1], chroma) *
    (1 - smoothstep(SKIN_BAND[2], SKIN_BAND[3], chroma));
  const keep = smoothstep(SLICE_GATE[0], SLICE_GATE[1], chroma) * (1 - skin);
  const w: number[] = [];
  for (let i = 0; i < HUE_VECTORS; i++) w.push(vector(hue, SLICE_CENTRES[i], SLICE_GAPS[i][0], SLICE_GAPS[i][1]) * keep);
  w.push(skin);
  return w;
}

function gamutCheckYrg(c: number, hue: Vec2): number {
  const r = c * hue[0] + YRG_WHITE[0];
  const g = c * hue[1] + YRG_WHITE[1];
  let m = c;
  if (r < 0) m = Math.min(-YRG_WHITE[0] / hue[0], m);
  if (g < 0) m = Math.min(-YRG_WHITE[1] / hue[1], m);
  if (r + g > 1) m = Math.min((1 - YRG_WHITE[0] - YRG_WHITE[1]) / (hue[0] + hue[1]), m);
  return m;
}

function softClip(x: number, soft: number, hard: number): number {
  const norm = hard - soft;
  if (!(norm > 0)) return Math.min(x, soft);
  return x > soft ? soft + (1 - Math.exp(-(x - soft) / norm)) * norm : x;
}

const atan2 = (y: number, x: number): number => (x === 0 && y === 0 ? 0 : Math.atan2(y, x));

function lutCoord(hue: number): Vec3 {
  const x = (LUT_SIZE * (hue + Math.PI)) / (2 * Math.PI);
  const below = Math.floor(x);
  return [below & (LUT_SIZE - 1), Math.ceil(x) & (LUT_SIZE - 1), x - below];
}

function lutValue(a: Vec2, b: Vec2, q: Vec3, unscale: number): number {
  const ya = (a[0] + a[1]) * unscale;
  const yb = (b[0] + b[1]) * unscale;
  return ya + (q[0] !== q[1] ? q[2] * (yb - ya) : 0);
}

function log1p(u: number): number {
  const s = u / (2 + u);
  const s2 = s * s;
  return 2 * s * (1 + s2 * (1 / 3 + s2 * (0.2 + s2 / 7)));
}

const expm1 = (z: number): number => z * (1 + (z / 2) * (1 + (z / 3) * (1 + (z / 4) * (1 + (z / 5) * (1 + (z / 6) * (1 + z / 7))))));

function log2Split(v: number): Vec2 {
  let e = Math.floor(Math.log2(v));
  let m = v / 2 ** e;
  if (m >= 2) {
    m /= 2;
    e += 1;
  }
  if (m > Math.SQRT2) {
    m *= 0.5;
    e += 1;
  }
  const s = (m - 1) / (m + 1);
  const s2 = s * s;
  const ln = 2 * s * (1 + s2 * (1 / 3 + s2 * (0.2 + s2 * (1 / 7 + s2 * (1 / 9 + s2 / 11)))));
  return [e, ln * Math.LOG2E];
}

function exp2(a: number): number {
  if (a < -126) return 0;
  const i = Math.floor(Math.min(a, 127) + 0.5);
  const y = (a - i) * Math.LN2;
  const p = 1 + y * (1 + (y / 2) * (1 + (y / 3) * (1 + (y / 4) * (1 + (y / 5) * (1 + (y / 6) * (1 + y / 7))))));
  return p * 2 ** i;
}

function powPrecise(v: number, y: number): number {
  const l = log2Split(v);
  return exp2(l[0] * y + l[1] * y);
}

function pqForward(lms: number): number {
  const x = lms > 0 ? powPrecise(lms / 10000, JZ_N) : 0;
  const u = (PQ_K * x) / (1 + JZ_C3 * x);
  return PQ_C1P * exp2((JZ_P / Math.LN2) * log1p(u));
}

function pqInverse(pq: number): number {
  if (!(pq > PQ_C1P)) return 0;
  const l = log2Split(pq * (1 / PQ_C1P));
  const u = expm1(l[0] * (Math.LN2 / JZ_P) + l[1] * (Math.LN2 / JZ_P));
  const denom = PQ_K - JZ_C3 * u;
  return denom > 0 ? 10000 * powPrecise(u / denom, 1 / JZ_N) : 0;
}

function jzazbz(xyz: Vec3): Vec3 {
  const xp: Vec3 = [JZ_B * xyz[0] - (JZ_B - 1) * xyz[2], JZ_G * xyz[1] - (JZ_G - 1) * xyz[0], xyz[2]];
  const lms = apply3(JZ_M, xp);
  const iab = apply3(JZ_A, [pqForward(lms[0]), pqForward(lms[1]), pqForward(lms[2])]);
  return [Math.max(((1 + JZ_D) * iab[0]) / (1 + JZ_D * iab[0]) - JZ_D0, 0), iab[1], iab[2]];
}

function jzazbzToXyz(jab: Vec3): Vec3 {
  let iz = jab[0] + JZ_D0;
  iz = Math.max(iz / (1 + JZ_D - JZ_D * iz), 0);
  const pq = apply3(JZ_AI, [iz, jab[1], jab[2]]).map((v) => Math.max(v, 0));
  const xp = apply3(JZ_MI, [pqInverse(pq[0]), pqInverse(pq[1]), pqInverse(pq[2])]);
  const x = (xp[0] + (JZ_B - 1) * xp[2]) / JZ_B;
  return [x, (xp[1] + (JZ_G - 1) * x) / JZ_G, xp[2]];
}

function jzRotate(jc: Vec2, sat: number, bril: number): Vec2 {
  const t = atan2(jc[1], jc[0]);
  const r = Math.hypot(jc[0], jc[1]);
  const sinT = r > 0 ? jc[1] / r : 0;
  const cosT = r > 0 ? jc[0] / r : 1;
  let so = jc[0] * cosT + jc[1] * sinT;
  const o = so * Math.min(Math.max(t * sat, -t), Math.PI / 2 - t);
  so = Math.max(so * bril, 0);
  return [Math.max(so * cosT - o * sinT, 0), Math.max(so * sinT + o * cosT, 0)];
}

function jzGamut(jc: Vec2, dir: Vec2, maxSat: number): Vec3 {
  const s = jc[0] > 0 ? softClip(jc[1] / jc[0], 0.8 * maxSat, maxSat) : maxSat;
  const maxCAtSat = jc[0] * s;
  const maxJAtSat = s > 0 ? jc[1] / s : jc[0];
  const j = (jc[0] + maxJAtSat) / 2;
  const c = (jc[1] + maxCAtSat) / 2;
  const [cosH, sinH] = dir;
  let iz = j + JZ_D0;
  iz = Math.max(iz / (1 + JZ_D - JZ_D * iz), 0);
  let m = c;
  for (let k = 0; k < 3; k++) {
    const slope = JZ_AI[3 * k + 1] * cosH + JZ_AI[3 * k + 2] * sinH;
    if (slope < 0 && iz + c * slope < 0) m = Math.min(-iz / slope, m);
  }
  return jzazbzToXyz([j, m * cosH, m * sinH]);
}

function lStar(y: number): number {
  const yHat = pow(y, UCS_L_STAR_EXPONENT);
  return (UCS_L_STAR_RANGE * yHat) / (yHat + UCS_L_STAR_OFFSET);
}

const signedFloor = (d: number): number => (d >= 0 ? Math.max(FLT_MIN, d) : Math.min(-FLT_MIN, d));

function ucsJch(xyz: Vec3, lWhite: number): { jch: Vec3; dir: Vec2 } {
  const p = xyz.map((v) => Math.max(v, 0));
  const sum = p[0] + p[1] + p[2];
  const xy: Vec2 = sum > 0 ? [p[0] / sum, p[1] / sum] : [D65_XY[0], D65_XY[1]];
  const uvd = [0, 1, 2].map((c) => UCS_UV_X_FACTORS[c] * xy[0] + UCS_UV_Y_FACTORS[c] * xy[1] + UCS_UV_OFFSETS[c]);
  const div = signedFloor(uvd[2]);
  const uv: Vec2 = [uvd[0] / div, uvd[1] / div];
  const star: Vec2 = [
    (UCS_UV_FACTORS[0] * uv[0]) / (Math.abs(uv[0]) + UCS_UV_HALF[0]),
    (UCS_UV_FACTORS[1] * uv[1]) / (Math.abs(uv[1]) + UCS_UV_HALF[1]),
  ];
  const prime: Vec2 = [UCS_UV_PRIME[0] * star[0] + UCS_UV_PRIME[1] * star[1], UCS_UV_PRIME[2] * star[0] + UCS_UV_PRIME[3] * star[1]];
  const l = lStar(p[1]);
  const m2 = prime[0] * prime[0] + prime[1] * prime[1];
  const dir: Vec2 = m2 > 0 ? [prime[0] / Math.sqrt(m2), prime[1] / Math.sqrt(m2)] : [1, 0];
  const jch: Vec3 = [l / lWhite, (UCS_CHROMA_SCALE * pow(l, UCS_CHROMA_L_EXPONENT) * pow(m2, UCS_CHROMA_M_EXPONENT)) / lWhite, atan2(prime[1], prime[0])];
  return { jch, dir };
}

function ucsXyz(jc: Vec2, dir: Vec2, lWhite: number): Vec3 {
  const l = clamp(jc[0] * lWhite, 0, UCS_L_STAR_UPPER_LIMIT);
  const m = l !== 0 ? pow((jc[1] * lWhite) / (UCS_CHROMA_SCALE * Math.pow(l, UCS_CHROMA_L_EXPONENT)), UCS_CHROMA_INVERSE_EXPONENT) : 0;
  const prime: Vec2 = [m * dir[0], m * dir[1]];
  const star: Vec2 = [UCS_UV_UNPRIME[0] * prime[0] + UCS_UV_UNPRIME[1] * prime[1], UCS_UV_UNPRIME[2] * prime[0] + UCS_UV_UNPRIME[3] * prime[1]];
  const uv: Vec2 = [
    (-UCS_UV_HALF[0] * star[0]) / (Math.abs(star[0]) - UCS_UV_FACTORS[0]),
    (-UCS_UV_HALF[1] * star[1]) / (Math.abs(star[1]) - UCS_UV_FACTORS[1]),
  ];
  const xyd = [0, 1, 2].map((c) => UCS_XY_U_FACTORS[c] * uv[0] + UCS_XY_V_FACTORS[c] * uv[1] + UCS_XY_OFFSETS[c]);
  const div = signedFloor(xyd[2]);
  const xy: Vec2 = [xyd[0] / div, xyd[1] / div];
  const y = pow((UCS_L_STAR_OFFSET * l) / (UCS_L_STAR_RANGE - l), UCS_L_STAR_INVERSE_EXPONENT);
  return xy[1] === 0 ? [0, 0, 0] : [(y * xy[0]) / xy[1], y, (y * (1 - xy[0] - xy[1])) / xy[1]];
}

const brightness = (j: number, c: number): number => j * (pow(c, UCS_HCB_EXPONENT) + 1);

function ucsRotate(c: number, b: number, sat: number, bril: number): Vec2 {
  let a = Math.max(1 + sat, 0);
  const bb = Math.max(1 + bril, 0);
  if (!(c > UCS_ROTATION_MIN_CHROMA)) return [0, Math.hypot(c, b) * bb];
  const radius = Math.hypot(c, b);
  const sinT = c / radius;
  const cosT = b / radius;
  const w = sinT * c + cosT * b;
  const maxA = Math.hypot(c, w) / c;
  a = softClip(a, 0.5 * maxA, maxA);
  const pp = (a - 1) * c;
  const wp = Math.sqrt(Math.max(c * c * (1 - a * a) + w * w, 0)) * bb;
  return [Math.max(cosT * pp + sinT * wp, 0), Math.max(-sinT * pp + cosT * wp, 0)];
}

function ucsGamut(cb: Vec2, dir: Vec2, maxM2: number, lWhite: number): Vec3 {
  const j = cb[1] / (pow(cb[0], UCS_HCB_EXPONENT) + 1);
  const maxChroma = (UCS_CHROMA_SCALE * pow(j * lWhite, UCS_CHROMA_L_EXPONENT) * pow(maxM2, UCS_CHROMA_M_EXPONENT)) / lWhite;
  const boundaryB = brightness(j, maxChroma);
  const boundaryS = boundaryB > 0 ? maxChroma / boundaryB : 0;
  const s = softClip(cb[1] > 0 ? cb[0] / cb[1] : 0, 0.8 * boundaryS, boundaryS);
  const c = s * cb[1];
  return ucsXyz([cb[1] / (pow(c, UCS_HCB_EXPONENT) + 1), c], dir, lWhite);
}

/** The uniforms as the GLSL reads them. */
export interface MirrorUniforms {
  sdFormula: number;
  sdActive: number;
  sdChroma: readonly number[];
  sdSaturation: readonly number[];
  sdBrilliance: readonly number[];
  sdMasks: readonly number[];
  sdVibrance: number;
  sdSlices: readonly number[];
}

export function uniformsOf(p: Params): MirrorUniforms {
  const tones = (t: Params["chroma"]) => [t.global, t.shadows, t.midtones, t.highlights];
  return {
    sdFormula: p.formula,
    sdActive: isIdle(p) ? 0 : 1,
    sdChroma: tones(p.chroma),
    sdSaturation: tones(p.saturation),
    sdBrilliance: tones(p.brilliance),
    sdMasks: [p.masks.shadowsWeight, p.masks.highlightsWeight, p.masks.maskGreyFulcrum, p.masks.whiteFulcrum],
    sdVibrance: p.vibrance,
    sdSlices: p.slices.flatMap((s) => [s.hue, s.chroma, s.saturation, s.brilliance]),
  };
}

const dot3 = (v: readonly number[], op: Vec3): number => v[1] * op[0] + v[2] * op[1] + v[3] * op[2];

/** The inline block on one `lin` (linear Rec.709). */
export function shaderPixel(lin: Vec3, u: MirrorUniforms): Vec3 {
  if (u.sdActive === 0) return lin;
  const rgb = apply3(REC709_TO_REC2020, lin).map((v) => Math.max(v, 0)) as unknown as Vec3;
  const yrg = yrgFromLms(apply3(WORKING_TO_LMS, rgb));
  const rg: Vec2 = [yrg[1] - YRG_WHITE[0], yrg[2] - YRG_WHITE[1]];
  let c = Math.hypot(rg[0], rg[1]);
  let hue: Vec2 = c !== 0 ? [rg[0] / c, rg[1] / c] : [1, 0];
  const y = Math.max(yrg[0], 0);
  const op = opacities(pow(y, MASK_EXPONENT), u.sdMasks);

  const w = sliceWeights(Math.atan2(hue[1], hue[0]), c);
  const k = [0, 1, 2, 3].map((j) => w.reduce((sum, wi, i) => sum + wi * u.sdSlices[4 * i + j], 0));

  if (k[0] !== 0) {
    const turn = cosSin((k[0] * Math.PI) / 180);
    hue = [turn[0] * hue[0] - turn[1] * hue[1], turn[1] * hue[0] + turn[0] * hue[1]];
  }
  const boost = u.sdChroma[0] + dot3(u.sdChroma, op) + k[1];
  const vib = u.sdVibrance !== 0 ? u.sdVibrance * (1 - pow(c, Math.abs(u.sdVibrance))) : 0;
  c = gamutCheckYrg(c * Math.max(1 + boost + vib, 0), hue);
  let xyz = apply3(LMS_TO_XYZ_D65, lmsFromYrg([y, c * hue[0] + YRG_WHITE[0], c * hue[1] + YRG_WHITE[1]]));

  const sat = u.sdSaturation[0] + dot3(u.sdSaturation, op) + k[2];
  const bril = u.sdBrilliance[0] + dot3(u.sdBrilliance, op) + k[3];
  if (u.sdFormula === FORMULAS.jzazbz) {
    const jab = jzazbz(xyz);
    const h = atan2(jab[2], jab[1]);
    const cz = Math.hypot(jab[1], jab[2]);
    const dir: Vec2 = cz > 0 ? [jab[1] / cz, jab[2] / cz] : [1, 0];
    const jc = jzRotate([jab[0], cz], sat, 1 + bril);
    const q = lutCoord(h);
    const a = texel(q[0]);
    const b = texel(q[1]);
    xyz = jzGamut(jc, dir, lutValue([a[0], a[1]], [b[0], b[1]], q, 1 / LUT_SCALES.jzazbz));
  } else {
    const lw = lStar(Math.pow(2, u.sdMasks[3]));
    const { jch, dir } = ucsJch(xyz, lw);
    const cb = ucsRotate(jch[1], brightness(jch[0], jch[1]), sat, bril);
    const q = lutCoord(jch[2]);
    const a = texel(q[0]);
    const b = texel(q[1]);
    xyz = ucsGamut(cb, dir, lutValue([a[2], a[3]], [b[2], b[3]], q, 1 / LUT_SCALES.ucs), lw);
  }
  const out = apply3(XYZ_D65_TO_WORKING, xyz).map((v) => Math.max(v, 0)) as unknown as Vec3;
  return apply3(REC2020_TO_REC709, out);
}
