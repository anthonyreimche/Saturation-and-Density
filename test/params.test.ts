// The bag contract: every param survives the trip through the bag, a bad
// value reads as its default key by key, and `sdActive` follows isIdle.

import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, FORMULAS, SLICE_COUNT, isIdle, type Params } from "../src/model";
import { EXT_ID, PARAM_KEYS, SLICE_STRIDE, STAGE_ID, bagPatch, qualified, readParams, resetPatch } from "../src/params";
import { PRESETS } from "../src/presets";

const BUSY: Params = {
  formula: FORMULAS.jzazbz,
  chroma: { global: 0.1, shadows: -0.2, midtones: 0.3, highlights: -0.4 },
  vibrance: -0.35,
  saturation: { global: 0.5, shadows: 0.6, midtones: -0.7, highlights: 0.8 },
  brilliance: { global: -0.9, shadows: 1, midtones: -1, highlights: 0.05 },
  masks: { shadowsWeight: 2.5, highlightsWeight: 0.25, maskGreyFulcrum: 0.3, whiteFulcrum: -3 },
  slices: Array.from({ length: SLICE_COUNT }, (_, i) => ({ hue: 25 * i - 80, chroma: 0.1 * i - 0.3, saturation: -0.05 * i, brilliance: 0.12 * i - 0.5 })),
};

describe("keys", () => {
  it("live under the stage's id, which lives under the manifest's", () => {
    expect(STAGE_ID).toBe(`${EXT_ID}.scene`);
    for (const key of PARAM_KEYS) expect(qualified(key)).toBe(`saturation-density.scene.${key}`);
  });

  it("all start with sd, so no key is a GLSL word the host would rewrite", () => {
    for (const key of PARAM_KEYS) expect(key).toMatch(/^sd[A-Z]/);
  });

  it("are exactly what bagPatch writes", () => {
    expect(Object.keys(bagPatch(DEFAULT_PARAMS)).sort()).toEqual(PARAM_KEYS.map(qualified).sort());
  });
});

describe("bagPatch", () => {
  it("writes the tones as vec4s in the order global, shadows, midtones, highlights", () => {
    const bag = bagPatch(BUSY);
    expect(bag[qualified("sdChroma")]).toEqual([0.1, -0.2, 0.3, -0.4]);
    expect(bag[qualified("sdSaturation")]).toEqual([0.5, 0.6, -0.7, 0.8]);
    expect(bag[qualified("sdBrilliance")]).toEqual([-0.9, 1, -1, 0.05]);
    expect(bag[qualified("sdMasks")]).toEqual([2.5, 0.25, 0.3, -3]);
    expect(bag[qualified("sdVibrance")]).toBe(-0.35);
    expect(bag[qualified("sdFormula")]).toBe(0);
  });

  it("writes the slices as one vec4 per slice: hue, chroma, saturation, brilliance", () => {
    const slices = bagPatch(BUSY)[qualified("sdSlices")] as number[];
    expect(slices).toHaveLength(SLICE_STRIDE * SLICE_COUNT);
    expect(slices.slice(8, 12)).toEqual([BUSY.slices[2].hue, BUSY.slices[2].chroma, BUSY.slices[2].saturation, BUSY.slices[2].brilliance]);
  });

  it("sets sdActive from isIdle", () => {
    expect(bagPatch(DEFAULT_PARAMS)[qualified("sdActive")]).toBe(0);
    expect(bagPatch(BUSY)[qualified("sdActive")]).toBe(1);
    expect(resetPatch()[qualified("sdActive")]).toBe(0);
  });
});

describe("isIdle", () => {
  it("holds at the defaults, whatever the formula and masks", () => {
    expect(isIdle(DEFAULT_PARAMS)).toBe(true);
    expect(isIdle({ ...DEFAULT_PARAMS, formula: FORMULAS.jzazbz, masks: BUSY.masks })).toBe(true);
  });

  it("breaks on any effect", () => {
    const one = (p: Partial<Params>) => isIdle({ ...DEFAULT_PARAMS, ...p });
    expect(one({ vibrance: 0.01 })).toBe(false);
    expect(one({ chroma: { ...DEFAULT_PARAMS.chroma, highlights: -0.01 } })).toBe(false);
    expect(one({ saturation: { ...DEFAULT_PARAMS.saturation, shadows: 0.01 } })).toBe(false);
    expect(one({ brilliance: { ...DEFAULT_PARAMS.brilliance, global: 0.01 } })).toBe(false);
    for (const field of ["hue", "chroma", "saturation", "brilliance"] as const) {
      const slices = DEFAULT_PARAMS.slices.map((s, i) => (i === 6 ? { ...s, [field]: 0.5 } : s));
      expect(one({ slices }), field).toBe(false);
    }
  });

  it("breaks on every preset", () => {
    for (const p of PRESETS) expect(isIdle(p.params), p.id).toBe(false);
  });
});

describe("readParams", () => {
  it("reads back what bagPatch wrote", () => {
    expect(readParams(bagPatch(BUSY))).toEqual(BUSY);
    expect(readParams(bagPatch(DEFAULT_PARAMS))).toEqual(DEFAULT_PARAMS);
    for (const p of PRESETS) expect(readParams(bagPatch(p.params))).toEqual(p.params);
  });

  it("reads an empty bag as the defaults", () => {
    expect(readParams({})).toEqual(DEFAULT_PARAMS);
  });

  it("reads the ranges' ends as they are", () => {
    const edges: Params = {
      ...DEFAULT_PARAMS,
      vibrance: -1,
      chroma: { global: 1, shadows: -1, midtones: 1, highlights: -1 },
      masks: { shadowsWeight: 3, highlightsWeight: 0, maskGreyFulcrum: 1, whiteFulcrum: -16 },
      slices: DEFAULT_PARAMS.slices.map(() => ({ hue: 180, chroma: -1, saturation: 1, brilliance: -1 })),
    };
    expect(readParams(bagPatch(edges))).toEqual(edges);
  });

  const BAD: [string, unknown][] = [
    ["a string", "0.5"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["null", null],
    ["an object", { x: 1 }],
  ];

  it.each(BAD)("reads %s as the default, key by key", (_, bad) => {
    for (const key of PARAM_KEYS) {
      if (key === "sdActive") continue;
      const bag = { ...bagPatch(BUSY), [qualified(key)]: bad };
      const read = readParams(bag);
      const expected = readParams(bagPatch(BUSY));
      const fallback = readParams({});
      const field = {
        sdFormula: "formula",
        sdChroma: "chroma",
        sdSaturation: "saturation",
        sdBrilliance: "brilliance",
        sdMasks: "masks",
        sdVibrance: "vibrance",
        sdSlices: "slices",
      }[key] as keyof Params;
      expect(read[field], key).toEqual(fallback[field]);
      for (const other of Object.keys(expected) as (keyof Params)[]) {
        if (other !== field) expect(read[other], `${key} spared ${other}`).toEqual(expected[other]);
      }
    }
  });

  // The core slider's number field takes typed values past the track, and the
  // GPU binds whatever the bag holds. Clamping entry by entry keeps the panel
  // reading what the shader draws, and one bad number can't reset its siblings.
  it("clamps an out-of-range entry to its range and keeps the entries beside it", () => {
    const over = (key: Parameters<typeof qualified>[0], value: unknown) => readParams({ ...bagPatch(BUSY), [qualified(key)]: value });
    expect(over("sdVibrance", 1.01).vibrance).toBe(1);
    expect(over("sdChroma", [0.1, -0.2, 1.5, -0.4]).chroma).toEqual({ global: 0.1, shadows: -0.2, midtones: 1, highlights: -0.4 });
    expect(over("sdSaturation", [-1.01, 0.6, -0.7, 0.8]).saturation).toEqual({ ...BUSY.saturation, global: -1 });
    expect(over("sdMasks", [3.1, 0.25, 0.3, -3]).masks).toEqual({ ...BUSY.masks, shadowsWeight: 3 });
    expect(over("sdMasks", [2.5, 0.25, -0.1, -3]).masks).toEqual({ ...BUSY.masks, maskGreyFulcrum: 0 });
    expect(over("sdMasks", [2.5, 0.25, 0.3, 17]).masks).toEqual({ ...BUSY.masks, whiteFulcrum: 16 });
    const slices = bagPatch(BUSY)[qualified("sdSlices")] as number[];
    const read = over("sdSlices", slices.map((v, i) => (i === 4 ? 200 : v))).slices;
    expect(read[1]).toEqual({ ...BUSY.slices[1], hue: 180 });
    expect(read.filter((_, i) => i !== 1)).toEqual(BUSY.slices.filter((_, i) => i !== 1));
  });

  it("reads a non-finite entry as that entry's default, and a malformed key as the key's default", () => {
    const over = (key: Parameters<typeof qualified>[0], value: unknown) => readParams({ ...bagPatch(BUSY), [qualified(key)]: value });
    expect(over("sdVibrance", Number.NaN).vibrance).toBe(0);
    expect(over("sdChroma", [0.1, Number.POSITIVE_INFINITY, 0.3, -0.4]).chroma).toEqual({ ...BUSY.chroma, shadows: 0 });
    expect(over("sdMasks", [2.5, 0.25, "x", -3]).masks).toEqual({ ...BUSY.masks, maskGreyFulcrum: DEFAULT_PARAMS.masks.maskGreyFulcrum });
    const slices = bagPatch(BUSY)[qualified("sdSlices")] as number[];
    expect(over("sdSlices", slices.slice(0, 24)).slices).toEqual(DEFAULT_PARAMS.slices);
    expect(over("sdChroma", [0, 0, 0]).chroma).toEqual(DEFAULT_PARAMS.chroma);
    expect(over("sdChroma", "0.5").chroma).toEqual(DEFAULT_PARAMS.chroma);
  });

  it("clamps what bagPatch writes, so the bag never holds a value the panel would read differently", () => {
    const wild: Params = {
      ...BUSY,
      vibrance: 3,
      chroma: { ...BUSY.chroma, midtones: 1.5 },
      masks: { ...BUSY.masks, whiteFulcrum: 20 },
      slices: BUSY.slices.map((s, i) => (i === 2 ? { ...s, hue: -250, brilliance: 2 } : s)),
    };
    const patch = bagPatch(wild);
    expect(patch[qualified("sdVibrance")]).toBe(1);
    expect(patch[qualified("sdChroma")]).toEqual([0.1, -0.2, 1, -0.4]);
    expect((patch[qualified("sdMasks")] as number[])[3]).toBe(16);
    expect((patch[qualified("sdSlices")] as number[]).slice(2 * SLICE_STRIDE, 3 * SLICE_STRIDE)).toEqual([-180, BUSY.slices[2].chroma, BUSY.slices[2].saturation, 1]);
    expect(readParams(patch)).toEqual(readParams(bagPatch(readParams(patch))));
  });

  it("reads an unknown formula as the default one", () => {
    const read = (v: unknown) => readParams({ [qualified("sdFormula")]: v }).formula;
    expect(read(0)).toBe(FORMULAS.jzazbz);
    expect(read(1)).toBe(FORMULAS.perceptual);
    expect(read(2)).toBe(DEFAULT_PARAMS.formula);
    expect(read(0.5)).toBe(DEFAULT_PARAMS.formula);
  });

  it("never hands out the defaults' own objects", () => {
    const a = readParams({});
    expect(a.chroma).not.toBe(DEFAULT_PARAMS.chroma);
    expect(a.slices[0]).not.toBe(DEFAULT_PARAMS.slices[0]);
  });
});
