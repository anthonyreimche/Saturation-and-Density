// The GLSL's logic, through its TypeScript transcription, against the model:
// every reference case and a set of slice cases over the test pixels, and
// the LUT texture's half-float pairs against the LUTs.

import { describe, expect, it } from "vitest";
import { REC2020_TO_REC709, apply3 } from "../src/colour";
import { LUT_JZAZBZ, LUT_UCS } from "../src/luts";
import { DEFAULT_PARAMS, FORMULAS, SLICE_COUNT, process709, type Params, type Vec3 } from "../src/model";
import { PRESETS } from "../src/presets";
import { LUT_SCALES, lutTexture, splitHalf, toHalf } from "../src/stage";
import { dtCases, dtPixels, paramsOf } from "./support/dt-vectors";
import { shaderPixel, uniformsOf } from "./support/shader-mirror";

const PIXELS: Vec3[] = dtPixels.map((px) => apply3(REC2020_TO_REC709, px));

const SLICES: Params["slices"] = Array.from({ length: SLICE_COUNT }, (_, i) => ({
  hue: [25, -40, 60, -15, 90, -120, 10][i],
  chroma: [0.4, -0.3, 0.2, 0.5, -0.6, 0.3, -0.2][i],
  saturation: [0.5, 0.3, -0.4, 0.2, 0.6, -0.5, 0.25][i],
  brilliance: [-0.2, 0.3, 0.1, -0.4, 0.2, 0.5, -0.1][i],
}));

export const SLICE_CASES: [string, Params][] = [
  ["slices, perceptual", { ...DEFAULT_PARAMS, slices: SLICES }],
  ["slices, JzAzBz", { ...DEFAULT_PARAMS, formula: FORMULAS.jzazbz, slices: SLICES }],
  ["slices over a preset", { ...PRESETS[2].params, slices: SLICES }],
  ["slices at the ends", { ...DEFAULT_PARAMS, formula: FORMULAS.jzazbz, slices: SLICES.map(() => ({ hue: 180, chroma: 1, saturation: -1, brilliance: 1 })) }],
];

const CASES: [string, Params][] = [...dtCases.map((c): [string, Params] => [c.name, paramsOf(c)]), ...SLICE_CASES];

/** The worst |mirror − model| relative to the pixel's scale, active even
 *  at neutral (the logic is what is checked), with the pixel, over the
 *  pixels whose scale is in (lo, hi]. */
function worst(p: Params, lo: number, hi: number): { error: number; pixel: Vec3 | null } {
  const u = { ...uniformsOf(p), sdActive: 1 };
  let error = 0;
  let pixel: Vec3 | null = null;
  for (const px of PIXELS) {
    const got = shaderPixel(px, u);
    const want = process709(px, p);
    const scale = Math.max(...px, ...got, ...want, 1e-3);
    if (!(scale > lo && scale <= hi)) continue;
    for (let i = 0; i < 3; i++) {
      const e = Math.abs(got[i] - want[i]) / scale;
      if (e > error) {
        error = e;
        pixel = px;
      }
    }
  }
  return { error, pixel };
}

describe("the shader's logic matches the model", () => {
  // Above a scale of 8 brilliance can push UCS lightness against its upper
  // limit, where Y comes from a difference 3.4e-5 wide: the LUT pairs'
  // 1e-7 shows there 100 times over.
  it.each(CASES)("%s", (_, p) => {
    const sdr = worst(p, -Infinity, 8);
    expect(sdr.error, JSON.stringify(sdr.pixel)).toBeLessThan(1e-6);
    const hdr = worst(p, 8, Infinity);
    expect(hdr.error, JSON.stringify(hdr.pixel)).toBeLessThan(2e-5);
  });

  it("is the pixel itself while idle", () => {
    const u = uniformsOf(DEFAULT_PARAMS);
    expect(u.sdActive).toBe(0);
    for (const px of PIXELS) expect(shaderPixel(px, u)).toBe(px);
  });

  it("is finite everywhere, black included", () => {
    for (const [, p] of CASES) {
      const u = { ...uniformsOf(p), sdActive: 1 };
      for (const px of [[0, 0, 0] as Vec3, ...PIXELS]) for (const v of shaderPixel(px, u)) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe("the LUT texture", () => {
  const tex = lutTexture();

  it("is 512 × 1 rgba16f", () => {
    expect(tex).toMatchObject({ width: 512, height: 1, format: "rgba16f" });
    expect(tex.data).toBeInstanceOf(Float32Array);
    expect(tex.data).toHaveLength(512 * 4);
  });

  it("scales each LUT by a power of two into [2^13, 2^14)", () => {
    for (const [lut, scale] of [[LUT_JZAZBZ, LUT_SCALES.jzazbz], [LUT_UCS, LUT_SCALES.ucs]] as const) {
      expect(Number.isInteger(Math.log2(scale))).toBe(true);
      const top = Math.max(...lut) * scale;
      expect(top).toBeGreaterThanOrEqual(2 ** 13);
      expect(top).toBeLessThan(2 ** 14);
    }
  });

  it("holds a high half the texture stores exactly, and a low half within half an ulp of it", () => {
    for (let i = 0; i < tex.data.length; i += 2) {
      const hi = tex.data[i];
      expect(toHalf(hi)).toBe(hi);
      const ulp = 2 ** (Math.floor(Math.log2(Math.abs(hi))) - 10);
      expect(Math.abs(tex.data[i + 1])).toBeLessThanOrEqual(ulp / 2);
    }
  });

  it("gives back each LUT entry to 2e-7 once both halves are rounded to half", () => {
    for (let i = 0; i < 512; i++) {
      const jz = (toHalf(tex.data[4 * i]) + toHalf(tex.data[4 * i + 1])) / LUT_SCALES.jzazbz;
      const ucs = (toHalf(tex.data[4 * i + 2]) + toHalf(tex.data[4 * i + 3])) / LUT_SCALES.ucs;
      expect(Math.abs(jz - LUT_JZAZBZ[i]) / LUT_JZAZBZ[i]).toBeLessThan(2e-7);
      expect(Math.abs(ucs - LUT_UCS[i]) / LUT_UCS[i]).toBeLessThan(2e-7);
    }
  });

  it("splits a value into a pair summing to it", () => {
    for (const v of [1700.123456, 8191.9, 12345.678]) {
      const [hi, lo] = splitHalf(v);
      expect(hi + lo).toBe(v);
      expect(toHalf(hi)).toBe(hi);
    }
  });
});
