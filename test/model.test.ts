// The CPU model against darktable's own code (test/reference/dt_ref.cpp,
// compiled by g++ in single precision): every case over the 1000 test
// pixels, black, greys, both gamuts' primaries, near-black and HDR colours
// and negative channels among them.
//
// The error is taken relative to the pixel's scale, the largest channel of
// its input or either output (at least 1e-3). Three floors set the bounds:
//  • the perceptual (UCS) formula with darktable's grading-RGB detour
//    emulated is within 1.2e-5 up to a scale of 8. Above, brightness near
//    UCS's L* limit turns into Y through a difference 3.4e-5 wide, so a
//    float's last bit is 1e-4 there;
//  • without the detour, as the stage runs, darktable's vector power at
//    exponent 1 (3.7e-5 relative per grading channel) shows, amplified by
//    saturation to 1.2e-4 (2e-4 through JzAzBz);
//  • JzAzBz in float is its own floor: darktable's PQ curve raises to the
//    134th power and back, and its round trip at neutral already strays
//    1.9e-4 from its input. The model is double precision throughout.

import { describe, expect, it } from "vitest";
import { LUT_JZAZBZ, LUT_UCS } from "../src/luts";
import { DEFAULT_PARAMS, FORMULAS, processWorking, type Params, type Vec3 } from "../src/model";
import { PRESETS } from "../src/presets";
import { dtCases, dtOut, dtPixels, dtVectors, paramsOf, type DtCase } from "./support/dt-vectors";

const scaleOf = (input: Vec3, a: Vec3, b: Vec3): number => Math.max(...input, ...a, ...b, 1e-3);

/** The worst error relative to scale, over the pixels whose scale is in
 *  (lo, hi]. */
function worst(c: DtCase, p: Params, lo: number, hi: number, emulateVectorPow: boolean, out: readonly number[] = c.out): number {
  let w = 0;
  dtPixels.forEach((px, k) => {
    const got = processWorking(px, p, { emulateVectorPow });
    const want = dtOut(c, k, out);
    const scale = scaleOf(px, got, want);
    if (!(scale > lo && scale <= hi)) return;
    for (let i = 0; i < 3; i++) w = Math.max(w, Math.abs(got[i] - want[i]) / scale);
  });
  return w;
}

const ucsCases = dtCases.filter((c) => c.params.saturation_formula === FORMULAS.perceptual);
const jzCases = dtCases.filter((c) => c.params.saturation_formula === FORMULAS.jzazbz);

describe("the reference vectors", () => {
  it("cover both formulas, the presets and 1000 pixels", () => {
    expect(dtPixels).toHaveLength(1000);
    expect(ucsCases.length).toBeGreaterThanOrEqual(15);
    expect(jzCases.length).toBeGreaterThanOrEqual(10);
    expect(dtCases.filter((c) => c.name.startsWith("preset:"))).toHaveLength(4);
  });

  it("include black, greys, HDR and negative channels", () => {
    expect(dtPixels[0]).toEqual([0, 0, 0]);
    expect(dtPixels.some(([r, g, b]) => r === g && g === b && r >= 16)).toBe(true);
    expect(dtPixels.some((px) => Math.min(...px) < 0)).toBe(true);
    expect(dtPixels.some((px) => Math.max(...px) > 0 && Math.max(...px) <= 1e-4)).toBe(true);
  });
});

describe("the gamut LUTs", () => {
  it("are darktable's, entry for entry", () => {
    expect(LUT_JZAZBZ).toEqual(dtVectors.lutJzazbz);
    expect(LUT_UCS).toEqual(dtVectors.lutUcs);
    expect(LUT_JZAZBZ).toHaveLength(512);
    expect(LUT_UCS).toHaveLength(512);
  });
});

describe("the model against darktable", () => {
  it.each(ucsCases.map((c) => [c.name, c] as const))("perceptual, detour emulated: %s", (_, c) => {
    const p = paramsOf(c);
    expect(worst(c, p, -Infinity, 8, true)).toBeLessThan(1.2e-5);
    expect(worst(c, p, 8, Infinity, true)).toBeLessThan(4e-4);
  });

  it.each(ucsCases.map((c) => [c.name, c] as const))("perceptual, as the stage runs: %s", (_, c) => {
    const p = paramsOf(c);
    expect(worst(c, p, -Infinity, 8, false)).toBeLessThan(1.2e-4);
    expect(worst(c, p, 8, Infinity, false)).toBeLessThan(4e-3);
  });

  it.each(jzCases.map((c) => [c.name, c] as const))("JzAzBz, the PQ powers in double: %s", (_, c) => {
    expect(c.outPqDouble).toHaveLength(c.out.length);
    expect(worst(c, paramsOf(c), -Infinity, Infinity, true, c.outPqDouble)).toBeLessThan(1e-5);
    expect(worst(c, paramsOf(c), -Infinity, Infinity, false, c.outPqDouble)).toBeLessThan(2e-4);
  });

  it.each(jzCases.map((c) => [c.name, c] as const))("JzAzBz, darktable as it is: %s", (_, c) => {
    expect(worst(c, paramsOf(c), -Infinity, Infinity, false)).toBeLessThan(4e-4);
  });

  it("has darktable's presets", () => {
    for (const preset of PRESETS) {
      const c = dtCases.find((k) => k.name.startsWith("preset:") && paramsMatch(paramsOf(k), preset.params));
      expect(c, preset.id).toBeDefined();
    }
  });
});

/** Equal to float precision (darktable's params are floats). */
function paramsMatch(a: Params, b: Params): boolean {
  const flat = (p: Params): number[] => [
    p.formula,
    ...Object.values(p.chroma),
    p.vibrance,
    ...Object.values(p.saturation),
    ...Object.values(p.brilliance),
    ...Object.values(p.masks),
  ];
  const x = flat(a);
  const y = flat(b);
  return x.every((v, i) => Math.abs(v - y[i]) < 1e-7);
}

describe("the model's edges", () => {
  it("draws nothing but finite, non-negative values, black included", () => {
    for (const c of dtCases) {
      const p = paramsOf(c);
      for (const px of dtPixels) {
        for (const v of processWorking(px, p)) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("keeps black black under every case", () => {
    for (const c of dtCases) for (const v of processWorking([0, 0, 0], paramsOf(c))) expect(v).toBe(0);
  });

  it("is finite at a mask grey fulcrum of 0, where darktable divides by it", () => {
    const p: Params = { ...DEFAULT_PARAMS, masks: { ...DEFAULT_PARAMS.masks, maskGreyFulcrum: 0 }, chroma: { ...DEFAULT_PARAMS.chroma, shadows: 0.5 } };
    for (const px of dtPixels.slice(0, 50)) for (const v of processWorking(px, p)) expect(Number.isFinite(v)).toBe(true);
  });
});
