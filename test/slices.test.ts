// The colour slices, Safelight's own: no darktable reference, so these pin
// what they promise. Zero slices change no bit; the six vectors split the
// hue circle between neighbours and leave greys alone; skin overrides them;
// a slice at its own centre acts as the global slider; a hue shift wraps.

import { describe, expect, it } from "vitest";
import { REC709_TO_REC2020, apply3, workingHueChroma } from "../src/colour";
import {
  DEFAULT_PARAMS,
  FORMULAS,
  HUE_VECTORS,
  SKIN,
  SKIN_BAND,
  SKIN_CHROMA,
  SKIN_COLOUR,
  SLICE_CENTRES,
  SLICE_COUNT,
  SLICE_GATE,
  SLICE_NAMES,
  SLICE_SWATCHES,
  process709,
  processWorking,
  sliceWeights,
  smoothstep,
  wrapAngle,
  type Params,
  type Slice,
  type Vec3,
} from "../src/model";
import { dtCases, dtPixels, paramsOf } from "./support/dt-vectors";

const ZERO: Slice = { hue: 0, chroma: 0, saturation: 0, brilliance: 0 };

function withSlice(base: Params, index: number, s: Partial<Slice>): Params {
  return { ...base, slices: base.slices.map((k, i) => (i === index ? { ...ZERO, ...s } : k)) };
}

const everySlice = (s: Slice): Params => ({ ...DEFAULT_PARAMS, slices: Array.from({ length: SLICE_COUNT }, () => s) });

const deg = (r: number): number => (r * 180) / Math.PI;

describe("the slices", () => {
  it("are red, yellow, green, cyan, blue, magenta and skin, with a swatch each", () => {
    expect(SLICE_NAMES).toEqual(["red", "yellow", "green", "cyan", "blue", "magenta", "skin"]);
    expect(SLICE_CENTRES).toHaveLength(SLICE_COUNT);
    expect(SLICE_SWATCHES).toHaveLength(SLICE_COUNT);
    for (const s of SLICE_SWATCHES) expect(s).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("put the six vectors round the circle in order, at the Rec.709 primaries and secondaries", () => {
    const red = workingHueChroma(apply3(REC709_TO_REC2020, [1, 0, 0])).hue;
    expect(SLICE_CENTRES[0]).toBeCloseTo(red, 12);
    for (let i = 0; i < HUE_VECTORS; i++) {
      const next = wrapAngle(SLICE_CENTRES[(i + 1) % HUE_VECTORS] - SLICE_CENTRES[i]);
      expect(next, SLICE_NAMES[i]).toBeGreaterThan(0);
    }
  });

  it("sit skin between red and yellow", () => {
    const fromRed = wrapAngle(SLICE_CENTRES[SKIN] - SLICE_CENTRES[0]);
    const toYellow = wrapAngle(SLICE_CENTRES[1] - SLICE_CENTRES[SKIN]);
    expect(fromRed).toBeGreaterThan(0);
    expect(toYellow).toBeGreaterThan(0);
  });
});

describe("sliceWeights", () => {
  const hues = Array.from({ length: 720 }, (_, i) => -Math.PI + (i * 2 * Math.PI) / 720);

  it("splits the circle between neighbouring vectors: a partition of unity", () => {
    for (const h of hues) {
      const w = sliceWeights(h, 0.6);
      expect(w[SKIN]).toBe(0);
      expect(w.slice(0, HUE_VECTORS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      expect(w.filter((x) => x > 0).length).toBeLessThanOrEqual(2);
    }
  });

  it("is all one vector at its centre", () => {
    for (let i = 0; i < HUE_VECTORS; i++) {
      const w = sliceWeights(SLICE_CENTRES[i], 0.6);
      expect(w[i], SLICE_NAMES[i]).toBeCloseTo(1, 12);
    }
  });

  it("halves at the midpoint between two vectors", () => {
    const mid = SLICE_CENTRES[2] + wrapAngle(SLICE_CENTRES[3] - SLICE_CENTRES[2]) / 2;
    const w = sliceWeights(mid, 0.6);
    expect(w[2]).toBeCloseTo(0.5, 12);
    expect(w[3]).toBeCloseTo(0.5, 12);
  });

  it("gates the vectors off towards grey", () => {
    for (const h of hues) {
      expect(sliceWeights(h, SLICE_GATE[0] * 0.99).every((x) => x === 0)).toBe(true);
      const w = sliceWeights(h, 0.5 * (SLICE_GATE[0] + SLICE_GATE[1]));
      const sum = w.slice(0, HUE_VECTORS).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(smoothstep(SLICE_GATE[0], SLICE_GATE[1], 0.5 * (SLICE_GATE[0] + SLICE_GATE[1])) * (1 - w[SKIN]), 12);
    }
  });

  it("lets skin override the vectors: the vectors keep what skin leaves", () => {
    const w = sliceWeights(SLICE_CENTRES[SKIN], SKIN_CHROMA);
    expect(w[SKIN]).toBeCloseTo(1, 12);
    expect(w.slice(0, HUE_VECTORS).every((x) => Math.abs(x) < 1e-12)).toBe(true);
    for (const h of hues) {
      for (const c of [SKIN_BAND[0], SKIN_BAND[1], SKIN_CHROMA, SKIN_BAND[2], SKIN_BAND[3] * 1.2]) {
        const v = sliceWeights(h, c);
        expect(v.reduce((a, b) => a + b, 0)).toBeCloseTo(smoothstep(SLICE_GATE[0], SLICE_GATE[1], c) * (1 - v[SKIN]) + v[SKIN], 12);
      }
    }
  });

  it("keeps skin to a hue window and a chroma band", () => {
    expect(sliceWeights(SLICE_CENTRES[SKIN] + Math.PI / 2, SKIN_CHROMA)[SKIN]).toBe(0);
    expect(sliceWeights(SLICE_CENTRES[SKIN], SKIN_BAND[0] * 0.9)[SKIN]).toBe(0);
    expect(sliceWeights(SLICE_CENTRES[SKIN], SKIN_BAND[3] * 1.1)[SKIN]).toBe(0);
  });

  it("finds skin in a typical skin colour", () => {
    const { hue, chroma } = workingHueChroma(apply3(REC709_TO_REC2020, SKIN_COLOUR));
    expect(sliceWeights(hue, chroma)[SKIN]).toBeCloseTo(1, 9);
  });
});

describe("the slices in the pixel path", () => {
  it("change no bit at zero, in every case, for every pixel", () => {
    for (const c of dtCases) {
      const p = paramsOf(c);
      for (const px of dtPixels) {
        const a = processWorking(px, p);
        const b = processWorking(px, p, { ignoreSlices: true });
        for (let i = 0; i < 3; i++) expect(Object.is(a[i], b[i])).toBe(true);
      }
    }
  });

  it("leave greys alone, whatever they are set to", () => {
    const loud = everySlice({ hue: 120, chroma: 1, saturation: 1, brilliance: -1 });
    for (const y of [0, 1e-4, 0.18, 1, 16]) {
      const px: Vec3 = apply3(REC709_TO_REC2020, [y, y, y]);
      for (const formula of [FORMULAS.perceptual, FORMULAS.jzazbz]) {
        const a = processWorking(px, { ...loud, formula });
        const b = processWorking(px, { ...DEFAULT_PARAMS, formula });
        for (let i = 0; i < 3; i++) expect(Object.is(a[i], b[i])).toBe(true);
      }
    }
  });

  it("act as the global slider for a pixel at their centre", () => {
    const pure: Vec3 = apply3(REC709_TO_REC2020, [0, 0, 0.5]);
    const { hue, chroma } = workingHueChroma(pure);
    expect(sliceWeights(hue, chroma)[4]).toBe(1);
    for (const formula of [FORMULAS.perceptual, FORMULAS.jzazbz]) {
      const base = { ...DEFAULT_PARAMS, formula };
      const bySlice = processWorking(pure, withSlice(base, 4, { chroma: -0.3, saturation: 0.4, brilliance: -0.2 }));
      const byGlobal = processWorking(pure, {
        ...base,
        chroma: { ...base.chroma, global: -0.3 },
        saturation: { ...base.saturation, global: 0.4 },
        brilliance: { ...base.brilliance, global: -0.2 },
      });
      for (let i = 0; i < 3; i++) expect(bySlice[i]).toBeCloseTo(byGlobal[i], 12);
    }
  });

  it("turn the hue by the slice's shift", () => {
    const red: Vec3 = apply3(REC709_TO_REC2020, [0.3, 0.12, 0.1]);
    const before = workingHueChroma(red);
    const w = sliceWeights(before.hue, before.chroma);
    const out = processWorking(red, withSlice(DEFAULT_PARAMS, 0, { hue: 20 }));
    const after = workingHueChroma(out);
    expect(deg(wrapAngle(after.hue - before.hue))).toBeCloseTo(20 * w[0], 1);
  });

  it("wrap the hue shift: +180 and -180 are the same turn", () => {
    const red: Vec3 = apply3(REC709_TO_REC2020, [0.4, 0.05, 0.05]);
    const a = processWorking(red, withSlice(DEFAULT_PARAMS, 0, { hue: 180 }));
    const b = processWorking(red, withSlice(DEFAULT_PARAMS, 0, { hue: -180 }));
    for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i], 9);
  });

  it("make colours denser with saturation in JzAzBz: lower luminance, the hue kept", () => {
    const base: Params = { ...DEFAULT_PARAMS, formula: FORMULAS.jzazbz };
    const green: Vec3 = apply3(REC709_TO_REC2020, [0.05, 0.25, 0.06]);
    const plain = processWorking(green, base);
    const dense = processWorking(green, withSlice(base, 2, { saturation: 0.6 }));
    const Y = (rgb: Vec3) => 0.2627 * rgb[0] + 0.678 * rgb[1] + 0.0593 * rgb[2];
    expect(Y(dense)).toBeLessThan(Y(plain));
    expect(workingHueChroma(dense).chroma).toBeGreaterThan(workingHueChroma(plain).chroma);
  });

  it("raise chroma at constant luminance with chroma", () => {
    const blue: Vec3 = [0.05, 0.08, 0.3];
    const plain = process709(blue, DEFAULT_PARAMS);
    const more = process709(blue, withSlice(DEFAULT_PARAMS, 4, { chroma: 0.4 }));
    const Y709 = (rgb: Vec3) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    expect(Math.abs(Y709(more) - Y709(plain)) / Y709(plain)).toBeLessThan(0.02);
    const c = (rgb: Vec3) => workingHueChroma(apply3(REC709_TO_REC2020, rgb)).chroma;
    expect(c(more)).toBeGreaterThan(1.2 * c(plain));
  });

  it("leave a slice's colours alone when another slice moves", () => {
    const blue: Vec3 = apply3(REC709_TO_REC2020, [0.02, 0.04, 0.5]);
    const a = processWorking(blue, DEFAULT_PARAMS);
    const b = processWorking(blue, withSlice(DEFAULT_PARAMS, 1, { chroma: 1, saturation: 1, hue: 90 }));
    for (let i = 0; i < 3; i++) expect(Object.is(a[i], b[i])).toBe(true);
  });
});
