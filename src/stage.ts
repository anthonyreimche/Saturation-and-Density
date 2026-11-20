// The GPU side: one inline fragment in the scene-linear phase, after Colour
// Equaliser, as darktable's pipe orders color balance rgb after the colour
// equalizer and before the tone mapper. There is no prepass; the work is per
// pixel.
//
// The branch takes `lin` (linear Rec.709) to darktable's working Rec.2020,
// runs model.ts processWorking() and takes the result back. The gamut LUTs
// come in one 512×1 rgba16f texture set in activate (lutTexture): JzAzBz in
// r and g, UCS in b and a, each as a half-float pair (hi + lo) of the LUT
// scaled by a power of two, so the pair holds about 22 bits. The shader reads
// the two texels round the hue with texelFetch and interpolates them as
// darktable's lookup_gamut does.
//
// Where float32 differs from the double-precision model the shader rewrites
// the maths, not the result: JzAzBz's PQ curve raises to the 134th power and
// back, so both ways go through u = (base / c1) − 1 with log1p and expm1
// series and a log2 split at the float's exponent (sdPqForward and
// sdPqInverse below, colour.ts jzPq for the plain form); GPU sin and cos are
// replaced by series or by the ratios darktable's atan2 came from. Every
// place darktable divides by something that can be 0, takes atan2(0, 0) or
// pow(0, y), the shader guards with darktable's own result there.
//
// While no effect is set `sdActive` is 0: the renderer leaves the stage out,
// and where it is in the program (a mask's copy, a build without dormancy)
// the branch is not taken, so the stage is a bit-exact no-op. Every constant
// is formatted from the model's numbers, so the shader and the CPU reference
// cannot drift.

import {
  D65_XY,
  FLT_MIN,
  JZ_A,
  JZ_AI,
  JZ_B,
  JZ_C1,
  JZ_C2,
  JZ_C3,
  JZ_D,
  JZ_D0,
  JZ_G,
  JZ_M,
  JZ_MI,
  JZ_N,
  JZ_P,
  LMS_TO_XYZ_D65,
  GRADING_TO_LMS,
  LMS_TO_GRADING,
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
  type Mat3,
  type Vec3,
} from "./colour";
import { LUT_JZAZBZ, LUT_UCS } from "./luts";
import {
  DEFAULT_PARAMS,
  FORMULAS,
  HUE_VECTORS,
  MASK_EXPONENT,
  MIN_MASK_FULCRUM,
  SKIN,
  SKIN_BAND,
  SKIN_HUE_HALF_WIDTH,
  SLICE_CENTRES,
  SLICE_COUNT,
  SLICE_GAPS,
  SLICE_GATE,
  UCS_ROTATION_MIN_CHROMA,
  VIBRANCE_LIMIT,
} from "./model";
import { PARAM_KEYS, STAGE_ID, bagPatch, qualified, type ParamKey } from "./params";
import type { GlslType, ProcessingStageContribution, StageTextureData, UniformDeclaration } from "./safelight";

/** A GLSL float literal at full single precision, always with a decimal point
 *  (GLSL ES never promotes an integer literal to float). */
export function glslLiteral(v: number): string {
  const s = v.toPrecision(10);
  if (!s.includes("e")) return s.includes(".") ? s : `${s}.0`;
  const [mantissa, exponent] = s.split("e");
  return `${mantissa.includes(".") ? mantissa : `${mantissa}.0`}e${exponent}`;
}

const vec3 = (v: Vec3): string => `vec3(${v.map(glslLiteral).join(", ")})`;

/** A row-major 3×3 as a GLSL mat3 constructor (column-major arguments). */
export function glslMat3(rowMajor: Mat3): string {
  const cols = [0, 3, 6, 1, 4, 7, 2, 5, 8].map((i) => glslLiteral(rowMajor[i]));
  return `mat3(${cols.join(", ")})`;
}

const L = glslLiteral;

// ── The LUT texture ─────────────────────────────────────────────────────────

/** The texture's key: a sampler2D of that name in the GLSL. */
export const LUT_KEY = "sdLut";

/** The power of two that puts a LUT's largest entry in [2^13, 2^14), so the
 *  smallest entries still have a normal high half. The low half may be
 *  subnormal or zero; the pair still holds each entry to 2e-7. */
const scaleFor = (lut: readonly number[]): number => 2 ** (13 - Math.floor(Math.log2(Math.max(...lut))));
export const LUT_SCALES = Object.freeze({ jzazbz: scaleFor(LUT_JZAZBZ), ucs: scaleFor(LUT_UCS) });

/** x as an RGBA16F texel holds it: 11 significant bits, round to nearest. */
export function toHalf(x: number): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  const q = 2 ** (Math.max(Math.floor(Math.log2(Math.abs(x))), -14) - 10);
  return Math.round(x / q) * q;
}

/** One LUT entry as the half-float pair the texture holds. */
export function splitHalf(v: number): [number, number] {
  const hi = toHalf(v);
  return [hi, v - hi];
}

/** The stage's LUT texture: per hue entry, JzAzBz hi, lo, UCS hi, lo. */
export function lutTexture(): StageTextureData {
  const data = new Float32Array(LUT_SIZE * 4);
  for (let i = 0; i < LUT_SIZE; i++) {
    const [jzHi, jzLo] = splitHalf(LUT_JZAZBZ[i] * LUT_SCALES.jzazbz);
    const [ucsHi, ucsLo] = splitHalf(LUT_UCS[i] * LUT_SCALES.ucs);
    data.set([jzHi, jzLo, ucsHi, ucsLo], 4 * i);
  }
  return { data, width: LUT_SIZE, height: 1, format: "rgba16f", version: 1 };
}

// ── The PQ rewrite ──────────────────────────────────────────────────────────

/** (c1 + c2·x) / (1 + c3·x) = c1·(1 + u), u = k·x / (1 + c3·x). */
export const PQ_K = JZ_C2 / JZ_C1 - JZ_C3;
/** c1^p: the PQ curve at x = 0. */
export const PQ_C1P = Math.pow(JZ_C1, JZ_P);

// ── GLSL ────────────────────────────────────────────────────────────────────

const PI = L(Math.PI);
const TWO_PI = L(2 * Math.PI);

// Helpers take everything as arguments, so a mask's copy of the stage shares
// them: the host rewrites the uniform keys (all `sd` and a capital) at
// identifier boundaries, and no helper, parameter or local here is named
// like one.
const HELPERS = `
vec3 sdYrgFromLms(vec3 lms) {
  float sdy = ${L(YRG_Y_WEIGHTS[0])} * lms.x + ${L(YRG_Y_WEIGHTS[1])} * lms.y;
  float a = lms.x + lms.y + lms.z;
  vec3 n = a == 0.0 ? vec3(0.0) : lms / a;
  vec3 rgb = ${glslMat3(LMS_TO_GRADING)} * n;
  return vec3(sdy, rgb.x, rgb.y);
}
vec3 sdLmsFromYrg(vec3 yrg) {
  vec3 lms = ${glslMat3(GRADING_TO_LMS)} * vec3(yrg.y, yrg.z, 1.0 - yrg.y - yrg.z);
  float denom = ${L(YRG_Y_WEIGHTS[0])} * lms.x + ${L(YRG_Y_WEIGHTS[1])} * lms.y;
  return lms * (denom == 0.0 ? 0.0 : yrg.x / denom);
}

// opacity_masks: shadows, midtones, highlights at pow(Y, ${MASK_EXPONENT}),
// from the raw masks params (fall-offs, fulcrum). The exponents are clamped
// where exp would overflow; the opacity there is 0 or 1 either way.
vec3 sdOpacities(float x, vec4 masks) {
  float sw = 2.0 + 2.0 * masks.x;
  float hw = 2.0 + 2.0 * masks.y;
  float mw = sw * sw * hw * hw / (sw * sw + hw * hw);
  float fulcrum = pow(max(masks.z, ${L(MIN_MASK_FULCRUM)}), ${L(MASK_EXPONENT)});
  float offset = x - fulcrum;
  float norm = offset / fulcrum;
  float alpha = 1.0 / (1.0 + exp(clamp(norm * sw, -80.0, 80.0)));
  float beta = 1.0 / (1.0 + exp(clamp(-norm * hw, -80.0, 80.0)));
  float gamma = exp(-offset * offset * mw / 4.0) * (1.0 - alpha) * (1.0 - alpha) * (1.0 - beta) * (1.0 - beta) * 8.0;
  return vec3(alpha, gamma, beta);
}

// cos and sin of an angle in [-pi, pi], from Taylor series at half the
// angle (to 1e-9): GPU sin and cos can be far coarser (SwiftShader's are
// 2e-4 off). Where darktable takes sin and cos of an atan2 the shader takes
// the ratios atan2 came from instead.
vec2 sdCosSin(float a) {
  float x = 0.5 * a;
  float x2 = x * x;
  float s = x * (1.0 - x2 / 6.0 * (1.0 - x2 / 20.0 * (1.0 - x2 / 42.0 * (1.0 - x2 / 72.0 * (1.0 - x2 / 110.0 * (1.0 - x2 / 156.0))))));
  float c = 1.0 - x2 / 2.0 * (1.0 - x2 / 12.0 * (1.0 - x2 / 30.0 * (1.0 - x2 / 56.0 * (1.0 - x2 / 90.0 * (1.0 - x2 / 132.0 * (1.0 - x2 / 182.0))))));
  return vec2(c * c - s * s, 2.0 * s * c);
}
float sdWrap(float a) {
  return a - ${TWO_PI} * floor((a + ${PI}) / ${TWO_PI});
}
float sdBump(float t) {
  return t < 1.0 ? 0.5 + 0.5 * sdCosSin(${PI} * t).x : 0.0;
}
float sdVector(float hue, float centre, float below, float above) {
  float delta = sdWrap(hue - centre);
  return sdBump(delta >= 0.0 ? delta / above : -delta / below);
}

// The slices' weights at the input Yrg hue and chroma (model.ts sliceWeights):
// red, yellow, green in \`lo\`, cyan, blue, magenta in \`hi\`, skin returned.
float sdSliceWeights(float hue, float chroma, out vec3 lo, out vec3 hi) {
  float skin = sdBump(abs(sdWrap(hue - ${L(SLICE_CENTRES[SKIN])})) / ${L(SKIN_HUE_HALF_WIDTH)})
    * smoothstep(${L(SKIN_BAND[0])}, ${L(SKIN_BAND[1])}, chroma)
    * (1.0 - smoothstep(${L(SKIN_BAND[2])}, ${L(SKIN_BAND[3])}, chroma));
  float keep = smoothstep(${L(SLICE_GATE[0])}, ${L(SLICE_GATE[1])}, chroma) * (1.0 - skin);
${Array.from({ length: HUE_VECTORS }, (_, i) => {
  const target = i < 3 ? `lo.${"xyz"[i]}` : `hi.${"xyz"[i - 3]}`;
  return `  ${target} = sdVector(hue, ${L(SLICE_CENTRES[i])}, ${L(SLICE_GAPS[i][0])}, ${L(SLICE_GAPS[i][1])}) * keep;`;
}).join("\n")}
  return skin;
}

// gamut_check_Yrg: the chroma clipped so rg stays inside Yrg's triangle.
float sdGamutCheckYrg(float c, vec2 hue) {
  vec2 rg = c * hue + vec2(${L(YRG_WHITE[0])}, ${L(YRG_WHITE[1])});
  float m = c;
  if (rg.x < 0.0) m = min(${L(-YRG_WHITE[0])} / hue.x, m);
  if (rg.y < 0.0) m = min(${L(-YRG_WHITE[1])} / hue.y, m);
  if (rg.x + rg.y > 1.0) m = min(${L(1 - YRG_WHITE[0] - YRG_WHITE[1])} / (hue.x + hue.y), m);
  return m;
}

float sdSoftClip(float x, float soft, float hard) {
  float norm = hard - soft;
  if (!(norm > 0.0)) return min(x, soft);
  return x > soft ? soft + (1.0 - exp(-(x - soft) / norm)) * norm : x;
}

float sdAtan2(float y, float x) {
  return x == 0.0 && y == 0.0 ? 0.0 : atan(y, x);
}

// lookup_gamut: the two texels round a hue and the weight between them.
vec3 sdLutCoord(float hue) {
  float x = ${L(LUT_SIZE)} * (hue + ${PI}) / ${TWO_PI};
  float below = floor(x);
  int a = int(below) & ${LUT_SIZE - 1};
  int b = int(ceil(x)) & ${LUT_SIZE - 1};
  return vec3(float(a), float(b), x - below);
}
float sdLutValue(vec2 a, vec2 b, vec3 q, float unscale) {
  float ya = (a.x + a.y) * unscale;
  float yb = (b.x + b.y) * unscale;
  return ya + (q.x != q.y ? q.z * (yb - ya) : 0.0);
}

// JzAzBz's PQ curve both ways through u = (base / c1) - 1, which float
// holds to its last bit where the base itself would lose 134 of them.
float sdLog1p(float u) {
  float s = u / (2.0 + u);
  float s2 = s * s;
  return 2.0 * s * (1.0 + s2 * (${L(1 / 3)} + s2 * (0.2 + s2 * ${L(1 / 7)})));
}
float sdExpm1(float z) {
  return z * (1.0 + z / 2.0 * (1.0 + z / 3.0 * (1.0 + z / 4.0 * (1.0 + z / 5.0 * (1.0 + z / 6.0 * (1.0 + z / 7.0))))));
}
// log2 of a positive normal float as its exponent and the mantissa's log2,
// apart: the mantissa from the float's bits, reduced to [sqrt(1/2), sqrt(2)),
// its log from an atanh series. GPU log2, exp2 and pow are a few ulps off
// (SwiftShader's 5e-7), which the PQ curve's 134th power and the steep
// inverse near its top multiply past 1e-4. The bits need highp: the
// program's ints are mediump, 16 bits on a driver that honours it.
vec2 sdLog2Split(float v) {
  highp int bits = floatBitsToInt(v);
  float e = float(((bits >> 23) & 255) - 127);
  float m = intBitsToFloat((bits & 8388607) | 1065353216);
  if (m > ${L(Math.SQRT2)}) {
    m *= 0.5;
    e += 1.0;
  }
  float s = (m - 1.0) / (m + 1.0);
  float s2 = s * s;
  float ln = 2.0 * s * (1.0 + s2 * (${L(1 / 3)} + s2 * (0.2 + s2 * (${L(1 / 7)} + s2 * (${L(1 / 9)} + s2 * ${L(1 / 11)})))));
  return vec2(e, ln * ${L(Math.LOG2E)});
}
// 2^a from its whole part, exactly, and a Taylor series on the rest.
float sdExp2(float a) {
  if (a < -126.0) return 0.0;
  float i = floor(min(a, 127.0) + 0.5);
  float y = (a - i) * ${L(Math.LN2)};
  float p = 1.0 + y * (1.0 + y / 2.0 * (1.0 + y / 3.0 * (1.0 + y / 4.0 * (1.0 + y / 5.0 * (1.0 + y / 6.0 * (1.0 + y / 7.0))))));
  highp int biased = int(i) + 127;
  return p * intBitsToFloat(biased << 23);
}
float sdPowPrecise(float v, float y) {
  vec2 l = sdLog2Split(v);
  return sdExp2(l.x * y + l.y * y);
}
float sdPqForward(float lms) {
  float x = lms > 0.0 ? sdPowPrecise(lms / 10000.0, ${L(JZ_N)}) : 0.0;
  float u = ${L(PQ_K)} * x / (1.0 + ${L(JZ_C3)} * x);
  return ${L(PQ_C1P)} * sdExp2(${L(JZ_P / Math.LN2)} * sdLog1p(u));
}
float sdPqInverse(float pq) {
  if (!(pq > ${L(PQ_C1P)})) return 0.0;
  vec2 l = sdLog2Split(pq * ${L(1 / PQ_C1P)});
  float u = sdExpm1(l.x * ${L(Math.LN2 / JZ_P)} + l.y * ${L(Math.LN2 / JZ_P)});
  float denom = ${L(PQ_K)} - ${L(JZ_C3)} * u;
  return denom > 0.0 ? 10000.0 * sdPowPrecise(u / denom, ${L(1 / JZ_N)}) : 0.0;
}
vec3 sdJzazbz(vec3 xyz) {
  vec3 xp = vec3(${L(JZ_B)} * xyz.x - ${L(JZ_B - 1)} * xyz.z, ${L(JZ_G)} * xyz.y - ${L(JZ_G - 1)} * xyz.x, xyz.z);
  vec3 lms = ${glslMat3(JZ_M)} * xp;
  vec3 iab = ${glslMat3(JZ_A)} * vec3(sdPqForward(lms.x), sdPqForward(lms.y), sdPqForward(lms.z));
  return vec3(max(${L(1 + JZ_D)} * iab.x / (1.0 + ${L(JZ_D)} * iab.x) - ${L(JZ_D0)}, 0.0), iab.y, iab.z);
}
vec3 sdJzazbzToXyz(vec3 jab) {
  float iz = jab.x + ${L(JZ_D0)};
  iz = max(iz / (${L(1 + JZ_D)} - ${L(JZ_D)} * iz), 0.0);
  vec3 pq = max(${glslMat3(JZ_AI)} * vec3(iz, jab.y, jab.z), vec3(0.0));
  vec3 xp = ${glslMat3(JZ_MI)} * vec3(sdPqInverse(pq.x), sdPqInverse(pq.y), sdPqInverse(pq.z));
  float sdx = (xp.x + ${L(JZ_B - 1)} * xp.z) / ${L(JZ_B)};
  return vec3(sdx, (xp.y + ${L(JZ_G - 1)} * sdx) / ${L(JZ_G)}, xp.z);
}

// The JzAzBz saturation and brilliance rotation of the J, C plane by T =
// atan2(C, J), up to the gamut mapping.
vec2 sdJzRotate(vec2 jc, float sat, float bril) {
  float t = sdAtan2(jc.y, jc.x);
  float r = length(jc);
  float sinT = r > 0.0 ? jc.y / r : 0.0;
  float cosT = r > 0.0 ? jc.x / r : 1.0;
  float so = jc.x * cosT + jc.y * sinT;
  float o = so * min(max(t * sat, -t), ${L(Math.PI / 2)} - t);
  so = max(so * bril, 0.0);
  return vec2(max(so * cosT - o * sinT, 0.0), max(so * sinT + o * cosT, 0.0));
}
// The JzAzBz gamut mapping at the hue whose cos and sin are \`dir\`, with the
// LUT's largest C / J there, then the clip of L'M'S' negatives, back to XYZ.
vec3 sdJzGamut(vec2 jc, vec2 dir, float maxSat) {
  float s = jc.x > 0.0 ? sdSoftClip(jc.y / jc.x, 0.8 * maxSat, maxSat) : maxSat;
  float maxCAtSat = jc.x * s;
  float maxJAtSat = s > 0.0 ? jc.y / s : jc.x;
  float j = (jc.x + maxJAtSat) / 2.0;
  float c = (jc.y + maxCAtSat) / 2.0;
  float cosH = dir.x;
  float sinH = dir.y;
  float iz = j + ${L(JZ_D0)};
  iz = max(iz / (${L(1 + JZ_D)} - ${L(JZ_D)} * iz), 0.0);
  float m = c;
${[0, 1, 2]
  .map(
    (k) => `  float slope${k} = ${L(JZ_AI[3 * k + 1])} * cosH + ${L(JZ_AI[3 * k + 2])} * sinH;
  if (slope${k} < 0.0 && iz + c * slope${k} < 0.0) m = min(-iz / slope${k}, m);`,
  )
  .join("\n")}
  return sdJzazbzToXyz(vec3(j, m * cosH, m * sinH));
}

// darktable UCS 22.
float sdPow(float x, float y) {
  return x > 0.0 ? pow(x, y) : 0.0;
}
float sdLStar(float sdy) {
  float yHat = sdPow(sdy, ${L(UCS_L_STAR_EXPONENT)});
  return ${L(UCS_L_STAR_RANGE)} * yHat / (yHat + ${L(UCS_L_STAR_OFFSET)});
}
float sdSignedFloor(float d) {
  return d >= 0.0 ? max(${L(FLT_MIN)}, d) : min(${L(-FLT_MIN)}, d);
}
// XYZ D65 to J, C, H; the hue from the UV' plane, its cos and sin in \`dir\`.
vec3 sdUcsJch(vec3 xyz, float lWhite, out vec2 dir) {
  vec3 p = max(xyz, vec3(0.0));
  float sum = p.x + p.y + p.z;
  vec2 xy = sum > 0.0 ? p.xy / sum : vec2(${L(D65_XY[0])}, ${L(D65_XY[1])});
  vec3 uvd = ${vec3(UCS_UV_X_FACTORS)} * xy.x + ${vec3(UCS_UV_Y_FACTORS)} * xy.y + ${vec3(UCS_UV_OFFSETS)};
  vec2 uv = uvd.xy / sdSignedFloor(uvd.z);
  vec2 star = vec2(${L(UCS_UV_FACTORS[0])}, ${L(UCS_UV_FACTORS[1])}) * uv / (abs(uv) + vec2(${L(UCS_UV_HALF[0])}, ${L(UCS_UV_HALF[1])}));
  vec2 prime = vec2(${L(UCS_UV_PRIME[0])} * star.x + ${L(UCS_UV_PRIME[1])} * star.y, ${L(UCS_UV_PRIME[2])} * star.x + ${L(UCS_UV_PRIME[3])} * star.y);
  float lStar = sdLStar(p.y);
  float m2 = dot(prime, prime);
  dir = m2 > 0.0 ? prime / sqrt(m2) : vec2(1.0, 0.0);
  return vec3(lStar / lWhite, ${L(UCS_CHROMA_SCALE)} * sdPow(lStar, ${L(UCS_CHROMA_L_EXPONENT)}) * sdPow(m2, ${L(UCS_CHROMA_M_EXPONENT)}) / lWhite, sdAtan2(prime.y, prime.x));
}
// J, C and the hue's cos and sin back to XYZ D65.
vec3 sdUcsXyz(vec2 jc, vec2 dir, float lWhite) {
  float lStar = clamp(jc.x * lWhite, 0.0, ${L(UCS_L_STAR_UPPER_LIMIT)});
  float m = lStar != 0.0 ? sdPow(jc.y * lWhite / (${L(UCS_CHROMA_SCALE)} * pow(lStar, ${L(UCS_CHROMA_L_EXPONENT)})), ${L(UCS_CHROMA_INVERSE_EXPONENT)}) : 0.0;
  vec2 prime = m * dir;
  vec2 star = vec2(${L(UCS_UV_UNPRIME[0])} * prime.x + ${L(UCS_UV_UNPRIME[1])} * prime.y, ${L(UCS_UV_UNPRIME[2])} * prime.x + ${L(UCS_UV_UNPRIME[3])} * prime.y);
  vec2 uv = -vec2(${L(UCS_UV_HALF[0])}, ${L(UCS_UV_HALF[1])}) * star / (abs(star) - vec2(${L(UCS_UV_FACTORS[0])}, ${L(UCS_UV_FACTORS[1])}));
  vec3 xyd = ${vec3(UCS_XY_U_FACTORS)} * uv.x + ${vec3(UCS_XY_V_FACTORS)} * uv.y + ${vec3(UCS_XY_OFFSETS)};
  vec2 xy = xyd.xy / sdSignedFloor(xyd.z);
  float sdy = sdPow(${L(UCS_L_STAR_OFFSET)} * lStar / (${L(UCS_L_STAR_RANGE)} - lStar), ${L(UCS_L_STAR_INVERSE_EXPONENT)});
  return xy.y == 0.0 ? vec3(0.0) : vec3(sdy * xy.x / xy.y, sdy, sdy * (1.0 - xy.x - xy.y) / xy.y);
}
float sdBrightness(float j, float c) {
  return j * (sdPow(c, ${L(UCS_HCB_EXPONENT)}) + 1.0);
}
// The UCS saturation and brilliance rotation in the C, B plane: chroma and
// brightness after it. A pixel without chroma has no direction to turn in,
// and darktable's own result there is its brightness scaled.
vec2 sdUcsRotate(float c, float b, float sat, float bril) {
  float a = max(1.0 + sat, 0.0);
  float bb = max(1.0 + bril, 0.0);
  if (!(c > ${L(UCS_ROTATION_MIN_CHROMA)})) return vec2(0.0, length(vec2(c, b)) * bb);
  float radius = length(vec2(c, b));
  float sinT = c / radius;
  float cosT = b / radius;
  float w = sinT * c + cosT * b;
  float maxA = length(vec2(c, w)) / c;
  a = sdSoftClip(a, 0.5 * maxA, maxA);
  float pp = (a - 1.0) * c;
  float wp = sqrt(max(c * c * (1.0 - a * a) + w * w, 0.0)) * bb;
  return vec2(max(cosT * pp + sinT * wp, 0.0), max(-sinT * pp + cosT * wp, 0.0));
}
// The UCS gamut mapping: saturation soft-clipped at constant brightness
// against the boundary the LUT's colourfulness gives at the hue.
vec3 sdUcsGamut(vec2 cb, vec2 dir, float maxM2, float lWhite) {
  float j = cb.y / (sdPow(cb.x, ${L(UCS_HCB_EXPONENT)}) + 1.0);
  float maxChroma = ${L(UCS_CHROMA_SCALE)} * sdPow(j * lWhite, ${L(UCS_CHROMA_L_EXPONENT)}) * sdPow(maxM2, ${L(UCS_CHROMA_M_EXPONENT)}) / lWhite;
  float boundaryB = sdBrightness(j, maxChroma);
  float boundaryS = boundaryB > 0.0 ? maxChroma / boundaryB : 0.0;
  float s = sdSoftClip(cb.y > 0.0 ? cb.x / cb.y : 0.0, 0.8 * boundaryS, boundaryS);
  float c = s * cb.y;
  return sdUcsXyz(vec2(cb.y / (sdPow(c, ${L(UCS_HCB_EXPONENT)}) + 1.0), c), dir, lWhite);
}
`;

const INLINE = `
{
  if (sdActive != 0) {
    vec3 sdRgb = max(${glslMat3(REC709_TO_REC2020)} * lin, vec3(0.0));
    vec3 sdYrg = sdYrgFromLms(${glslMat3(WORKING_TO_LMS)} * sdRgb);
    vec2 sdRg = sdYrg.yz - vec2(${L(YRG_WHITE[0])}, ${L(YRG_WHITE[1])});
    float sdC = length(sdRg);
    vec2 sdHue = sdC != 0.0 ? sdRg / sdC : vec2(1.0, 0.0);
    float sdY = max(sdYrg.x, 0.0);
    vec3 sdOp = sdOpacities(sdPow(sdY, ${L(MASK_EXPONENT)}), sdMasks);

    vec3 sdWlo;
    vec3 sdWhi;
    float sdWskin = sdSliceWeights(atan(sdHue.y, sdHue.x), sdC, sdWlo, sdWhi);
    vec4 sdK = sdWlo.x * sdSlices[0] + sdWlo.y * sdSlices[1] + sdWlo.z * sdSlices[2]
      + sdWhi.x * sdSlices[3] + sdWhi.y * sdSlices[4] + sdWhi.z * sdSlices[5] + sdWskin * sdSlices[${SKIN}];

    if (sdK.x != 0.0) {
      vec2 sdTurn = sdCosSin(radians(sdK.x));
      sdHue = vec2(sdTurn.x * sdHue.x - sdTurn.y * sdHue.y, sdTurn.y * sdHue.x + sdTurn.x * sdHue.y);
    }
    float sdBoost = sdChroma.x + dot(sdChroma.yzw, sdOp) + sdK.y;
    float sdVib = sdVibrance != 0.0 ? sdVibrance * (1.0 - sdPow(sdC, abs(sdVibrance))) : 0.0;
    sdC = sdGamutCheckYrg(sdC * max(1.0 + sdBoost + sdVib, 0.0), sdHue);
    vec3 sdXyz = ${glslMat3(LMS_TO_XYZ_D65)} * sdLmsFromYrg(vec3(sdY, sdC * sdHue + vec2(${L(YRG_WHITE[0])}, ${L(YRG_WHITE[1])})));

    float sdSat = sdSaturation.x + dot(sdSaturation.yzw, sdOp) + sdK.z;
    float sdBril = sdBrilliance.x + dot(sdBrilliance.yzw, sdOp) + sdK.w;
    if (sdFormula == ${FORMULAS.jzazbz}) {
      vec3 sdJab = sdJzazbz(sdXyz);
      float sdH = sdAtan2(sdJab.z, sdJab.y);
      float sdCz = length(sdJab.yz);
      vec2 sdDir = sdCz > 0.0 ? sdJab.yz / sdCz : vec2(1.0, 0.0);
      vec2 sdJc = sdJzRotate(vec2(sdJab.x, sdCz), sdSat, 1.0 + sdBril);
      vec3 sdQ = sdLutCoord(sdH);
      float sdMax = sdLutValue(texelFetch(sdLut, ivec2(int(sdQ.x), 0), 0).xy, texelFetch(sdLut, ivec2(int(sdQ.y), 0), 0).xy, sdQ, ${L(1 / LUT_SCALES.jzazbz)});
      sdXyz = sdJzGamut(sdJc, sdDir, sdMax);
    } else {
      float sdLw = sdLStar(exp2(sdMasks.w));
      vec2 sdDir;
      vec3 sdJch = sdUcsJch(sdXyz, sdLw, sdDir);
      vec2 sdCb = sdUcsRotate(sdJch.y, sdBrightness(sdJch.x, sdJch.y), sdSat, sdBril);
      vec3 sdQ = sdLutCoord(sdJch.z);
      float sdMax = sdLutValue(texelFetch(sdLut, ivec2(int(sdQ.x), 0), 0).zw, texelFetch(sdLut, ivec2(int(sdQ.y), 0), 0).zw, sdQ, ${L(1 / LUT_SCALES.ucs)});
      sdXyz = sdUcsGamut(sdCb, sdDir, sdMax, sdLw);
    }
    lin = ${glslMat3(REC2020_TO_REC709)} * max(${glslMat3(XYZ_D65_TO_WORKING)} * sdXyz, vec3(0.0));
  }
}
`;

type Scalar = { glslType: GlslType; range: { min: number; max: number; step?: number } };

const SCALARS: Partial<Record<ParamKey, Scalar>> = {
  sdFormula: { glslType: "int", range: { min: 0, max: 1, step: 1 } },
  sdActive: { glslType: "int", range: { min: 0, max: 1, step: 1 } },
  sdVibrance: { glslType: "float", range: { min: -VIBRANCE_LIMIT, max: VIBRANCE_LIMIT } },
};

const LABELS: Record<ParamKey, string> = {
  sdFormula: "saturation formula",
  sdActive: "active",
  sdChroma: "chroma",
  sdSaturation: "saturation",
  sdBrilliance: "brilliance",
  sdMasks: "masks",
  sdVibrance: "vibrance",
  sdSlices: "colour slices",
};

function uniforms(): UniformDeclaration[] {
  const defaults = bagPatch(DEFAULT_PARAMS);
  return PARAM_KEYS.map((key): UniformDeclaration => {
    const value = defaults[qualified(key)];
    const label = LABELS[key];
    const scalar = SCALARS[key];
    if (scalar) return { key, glslType: scalar.glslType, default: value, label, range: scalar.range };
    if (key === "sdSlices") return { key, glslType: "vec4", length: SLICE_COUNT, default: value, label };
    return { key, glslType: "vec4", default: value, label };
  });
}

export function saturationStage(): ProcessingStageContribution {
  return {
    id: STAGE_ID,
    name: "Saturation & Density",
    phase: "scene-linear",
    priority: 90,
    after: ["colour-equaliser.rings"],
    glsl: INLINE,
    helpers: HELPERS,
    uniforms: uniforms(),
    textures: [{ key: LUT_KEY, kind: "lut", width: LUT_SIZE, height: 1, format: "rgba16f" }],
    presetScope: "global",
    // A mask's copy runs at the defaults until one of its effects moves, so
    // the gate keeps an untouched mask bit-exact too.
    mask: { maskable: true },
    dormantWhen: { sdActive: 0 },
  };
}
