// The param-bag contract: the stage's params under its qualified keys, as the
// GPU uniforms take them. The four tone-weighted effects are a vec4 each in
// the order global, shadows, midtones, highlights; the masks are one vec4
// (shadows fall-off, highlights fall-off, mask grey fulcrum, white fulcrum);
// the seven colour slices are one vec4[7] (hue shift in degrees, chroma,
// saturation, brilliance per slice, in SLICE_NAMES order). `sdActive` is 0
// while every effect is neutral, which lets the renderer leave the stage out
// of the program.
//
// Every key starts with `sd`: the host rewrites uniform keys wherever they
// appear as whole words in the stage's GLSL, so a key must not collide with a
// GLSL name. A value out of range is clamped entry by entry, a non-number
// entry reads as its default, and a key of the wrong shape as the key's
// default, so the panel and the shader see the same params.

import {
  DEFAULT_PARAMS,
  FORMULAS,
  MASK_RANGES,
  SLICE_COUNT,
  SLICE_HUE_LIMIT,
  TONE_LIMIT,
  VIBRANCE_LIMIT,
  isIdle,
  type Formula,
  type Masks,
  type Params,
  type Slice,
  type Tones,
} from "./model";

export const EXT_ID = "saturation-density";
export const STAGE_ID = `${EXT_ID}.scene`;

export const PARAM_KEYS = [
  "sdFormula",
  "sdActive",
  "sdChroma",
  "sdSaturation",
  "sdBrilliance",
  "sdMasks",
  "sdVibrance",
  "sdSlices",
] as const;
export type ParamKey = (typeof PARAM_KEYS)[number];

export const qualified = (key: ParamKey): string => `${STAGE_ID}.${key}`;

/** Floats per slice in the slices array: hue shift, chroma, saturation, brilliance. */
export const SLICE_STRIDE = 4;

type BagValue = number | number[];

const tonesArray = (t: Tones): number[] => [t.global, t.shadows, t.midtones, t.highlights];
const masksArray = (m: Masks): number[] => [m.shadowsWeight, m.highlightsWeight, m.maskGreyFulcrum, m.whiteFulcrum];
const slicesArray = (s: readonly Slice[]): number[] => s.flatMap((k) => [k.hue, k.chroma, k.saturation, k.brilliance]);

type Range = readonly [number, number];

const TONE_RANGE: Range = [-TONE_LIMIT, TONE_LIMIT];
const VIBRANCE_RANGE: Range = [-VIBRANCE_LIMIT, VIBRANCE_LIMIT];
const TONE_RANGES = Array.from({ length: 4 }, () => TONE_RANGE);
const MASK_RANGE_LIST = [MASK_RANGES.shadowsWeight, MASK_RANGES.highlightsWeight, MASK_RANGES.maskGreyFulcrum, MASK_RANGES.whiteFulcrum];
const SLICE_RANGES = Array.from({ length: SLICE_COUNT }, () => [[-SLICE_HUE_LIMIT, SLICE_HUE_LIMIT] as const, TONE_RANGE, TONE_RANGE, TONE_RANGE]).flat();

const clampTo = (x: number, [min, max]: Range): number => Math.min(max, Math.max(min, x));
const clampAll = (values: readonly number[], ranges: readonly Range[]): number[] => values.map((x, i) => clampTo(x, ranges[i]));

// The core slider's number field accepts typed values past the track and the
// GPU binds whatever the bag holds, so every write is clamped here: the bag
// then never holds a value that the panel would read back differently.
export function bagPatch(p: Params): Record<string, BagValue> {
  return {
    [qualified("sdFormula")]: p.formula,
    [qualified("sdActive")]: isIdle(p) ? 0 : 1,
    [qualified("sdChroma")]: clampAll(tonesArray(p.chroma), TONE_RANGES),
    [qualified("sdSaturation")]: clampAll(tonesArray(p.saturation), TONE_RANGES),
    [qualified("sdBrilliance")]: clampAll(tonesArray(p.brilliance), TONE_RANGES),
    [qualified("sdMasks")]: clampAll(masksArray(p.masks), MASK_RANGE_LIST),
    [qualified("sdVibrance")]: clampTo(p.vibrance, VIBRANCE_RANGE),
    [qualified("sdSlices")]: clampAll(slicesArray(p.slices), SLICE_RANGES),
  };
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The array at `key`, entry by entry: a finite entry clamped to its range,
 *  anything else its default. Null when the key isn't an array of the right
 *  length, which reads as the whole key's default. */
function readArray(
  bag: Readonly<Record<string, unknown>>,
  key: ParamKey,
  ranges: readonly Range[],
  defaults: readonly number[],
): number[] | null {
  const v = bag[qualified(key)];
  if (!Array.isArray(v) || v.length !== ranges.length) return null;
  return v.map((x: unknown, i) => (finite(x) ? clampTo(x, ranges[i]) : defaults[i]));
}

function readTones(bag: Readonly<Record<string, unknown>>, key: ParamKey, fallback: Tones): Tones {
  const v = readArray(bag, key, TONE_RANGES, tonesArray(fallback));
  return v ? { global: v[0], shadows: v[1], midtones: v[2], highlights: v[3] } : { ...fallback };
}

function readFormula(v: unknown): Formula {
  return Object.values(FORMULAS).find((f) => f === v) ?? DEFAULT_PARAMS.formula;
}

/** `bag` is the host's untyped per-photo bag (any extension writes to it). */
export function readParams(bag: Readonly<Record<string, unknown>>): Params {
  const masks = readArray(bag, "sdMasks", MASK_RANGE_LIST, masksArray(DEFAULT_PARAMS.masks));
  const slices = readArray(bag, "sdSlices", SLICE_RANGES, slicesArray(DEFAULT_PARAMS.slices));
  const vibrance = bag[qualified("sdVibrance")];
  return {
    formula: readFormula(bag[qualified("sdFormula")]),
    chroma: readTones(bag, "sdChroma", DEFAULT_PARAMS.chroma),
    vibrance: finite(vibrance) ? clampTo(vibrance, VIBRANCE_RANGE) : DEFAULT_PARAMS.vibrance,
    saturation: readTones(bag, "sdSaturation", DEFAULT_PARAMS.saturation),
    brilliance: readTones(bag, "sdBrilliance", DEFAULT_PARAMS.brilliance),
    masks: masks
      ? { shadowsWeight: masks[0], highlightsWeight: masks[1], maskGreyFulcrum: masks[2], whiteFulcrum: masks[3] }
      : { ...DEFAULT_PARAMS.masks },
    slices: slices
      ? Array.from({ length: SLICE_COUNT }, (_, i) => {
          const o = SLICE_STRIDE * i;
          return { hue: slices[o], chroma: slices[o + 1], saturation: slices[o + 2], brilliance: slices[o + 3] };
        })
      : DEFAULT_PARAMS.slices.map((s) => ({ ...s })),
  };
}

export const resetPatch = (): Record<string, BagValue> => bagPatch(DEFAULT_PARAMS);
