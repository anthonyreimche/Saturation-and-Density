// darktable's output for the reference cases and presets
// (test/reference/vectors.json), typed, and each case's params as the
// extension's. Read with JSON.parse rather than imported: the bundler's JSON
// import turns darktable's -0 into 0.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_PARAMS, type Formula, type Params } from "../../src/model";
import type { Vec3 } from "../../src/colour";

/** darktable's params, by its own field names (the ported ones). */
export interface DtParams {
  saturation_formula: number;
  chroma_global: number;
  chroma_shadows: number;
  chroma_midtones: number;
  chroma_highlights: number;
  vibrance: number;
  saturation_global: number;
  saturation_shadows: number;
  saturation_midtones: number;
  saturation_highlights: number;
  brilliance_global: number;
  brilliance_shadows: number;
  brilliance_midtones: number;
  brilliance_highlights: number;
  shadows_weight: number;
  highlights_weight: number;
  mask_grey_fulcrum: number;
  white_fulcrum: number;
}

export interface DtCase {
  name: string;
  params: DtParams;
  /** Working RGB (linear Rec.2020), three floats per pixel. */
  out: number[];
  /** JzAzBz cases: the same with the PQ curve's powers in double (dt_ref.cpp). */
  outPqDouble?: number[];
}

interface Vectors {
  matrixIn: number[];
  matrixOut: number[];
  lutJzazbz: number[];
  lutUcs: number[];
  pixels: number[];
  cases: DtCase[];
}

const vectors = JSON.parse(readFileSync(resolve(process.cwd(), "test/reference/vectors.json"), "utf8")) as Vectors;

export const dtVectors = vectors;
export const dtCases = vectors.cases;

/** The test pixels as working RGB. */
export const dtPixels: Vec3[] = Array.from({ length: vectors.pixels.length / 3 }, (_, k) => [
  vectors.pixels[3 * k],
  vectors.pixels[3 * k + 1],
  vectors.pixels[3 * k + 2],
]);

export const dtOut = (c: DtCase, k: number, out: readonly number[] = c.out): Vec3 => [out[3 * k], out[3 * k + 1], out[3 * k + 2]];

export function paramsOf(c: DtCase): Params {
  const q = c.params;
  return {
    ...DEFAULT_PARAMS,
    formula: q.saturation_formula as Formula,
    chroma: { global: q.chroma_global, shadows: q.chroma_shadows, midtones: q.chroma_midtones, highlights: q.chroma_highlights },
    vibrance: q.vibrance,
    saturation: {
      global: q.saturation_global,
      shadows: q.saturation_shadows,
      midtones: q.saturation_midtones,
      highlights: q.saturation_highlights,
    },
    brilliance: {
      global: q.brilliance_global,
      shadows: q.brilliance_shadows,
      midtones: q.brilliance_midtones,
      highlights: q.brilliance_highlights,
    },
    masks: {
      shadowsWeight: q.shadows_weight,
      highlightsWeight: q.highlights_weight,
      maskGreyFulcrum: q.mask_grey_fulcrum,
      whiteFulcrum: q.white_fulcrum,
    },
  };
}
