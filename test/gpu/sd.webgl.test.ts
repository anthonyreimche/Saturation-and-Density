// The stage on the real renderer. Run via `npm run test:gpu` (run.cjs copies
// this file into a SafeLight checkout and runs it under its headless
// Chromium + SwiftShader rig). What the CPU suite cannot check:
//  • core's own stage contract accepts the stage without a warning;
//  • the GLSL compiles with the host's namespacing and binds the LUT
//    texture, and an idle edit leaves the frame exactly as it was;
//  • in float32, with the half-float LUT pairs and the PQ rewrite, the
//    shader lands on the double-precision model over the reference pixels
//    (black, greys, both gamuts' primaries, near-black and HDR colours,
//    negative channels), for both formulas, the masks, the presets and the
//    slices, and draws nothing that isn't finite. Relative to each pixel's
//    scale: the perceptual formula within 1e-5 up to a scale of 8 (above
//    it, brightness near UCS's L* limit is ill-conditioned: 2e-3); JzAzBz
//    within 1e-4 (3e-4 above 8). Float32 can't hold JzAzBz closer: near the
//    top of its PQ curve a unit in the last place of the encoded value is
//    ten of the linear one, raised to the 6.3rd power, and the cone matrices
//    spread a channel's error over greys. darktable's own float code strays
//    1.9e-4 from its input at neutral (test/model.test.ts);
//  • what a full-size frame costs with the stage on.

import { describe, expect, it } from "vitest";
import vectors from "@sd-test/reference/vectors.json";
import { REC2020_TO_REC709, apply3 } from "@sd/colour";
import { DEFAULT_PARAMS, FORMULAS, SLICE_COUNT, process709, type Params, type Vec3 } from "@sd/model";
import { EXT_ID, STAGE_ID, bagPatch, qualified, resetPatch } from "@sd/params";
import { PRESETS } from "@sd/presets";
import { LUT_KEY, lutTexture, saturationStage } from "@sd/stage";
import { CURRENT_PROCESS_VERSION } from "@/catalog/process-version";
import { checkStageContract } from "@/extensions/stage-validation";
import type { ProcessingStageContribution } from "@/extensions/types";
import { OPEN_PROBE, builtinStages, floatImage, identityParams, withRenderer, type FloatImage } from "@/rendering/webgl/webgl.test-support";

const AS_DRAWN = { encoding: "perceptual", primaries: "rec709" } as const;

const W = 40;
const H = 25;
const PIXELS: Vec3[] = Array.from({ length: W * H }, (_, k) =>
  apply3(REC2020_TO_REC709, [vectors.pixels[3 * k], vectors.pixels[3 * k + 1], vectors.pixels[3 * k + 2]]),
);
const SCENE = floatImage(W, H, (x, y) => PIXELS[y * W + x]);

type DtParams = (typeof vectors.cases)[number]["params"];

function paramsOf(name: string): Params {
  const q = vectors.cases.find((c) => c.name === name)?.params as DtParams | undefined;
  if (!q) throw new Error(`no reference case ${name}`);
  return {
    ...DEFAULT_PARAMS,
    formula: q.saturation_formula as Params["formula"],
    chroma: { global: q.chroma_global, shadows: q.chroma_shadows, midtones: q.chroma_midtones, highlights: q.chroma_highlights },
    vibrance: q.vibrance,
    saturation: { global: q.saturation_global, shadows: q.saturation_shadows, midtones: q.saturation_midtones, highlights: q.saturation_highlights },
    brilliance: { global: q.brilliance_global, shadows: q.brilliance_shadows, midtones: q.brilliance_midtones, highlights: q.brilliance_highlights },
    masks: { shadowsWeight: q.shadows_weight, highlightsWeight: q.highlights_weight, maskGreyFulcrum: q.mask_grey_fulcrum, whiteFulcrum: q.white_fulcrum },
  };
}

const SLICES: Params["slices"] = Array.from({ length: SLICE_COUNT }, (_, i) => ({
  hue: [25, -40, 60, -15, 90, -120, 10][i],
  chroma: [0.4, -0.3, 0.2, 0.5, -0.6, 0.3, -0.2][i],
  saturation: [0.5, 0.3, -0.4, 0.2, 0.6, -0.5, 0.25][i],
  brilliance: [-0.2, 0.3, 0.1, -0.4, 0.2, 0.5, -0.1][i],
}));

const CASES: [string, Params][] = [
  ["neutral, perceptual (forced on)", DEFAULT_PARAMS],
  ["neutral, JzAzBz (forced on)", { ...DEFAULT_PARAMS, formula: FORMULAS.jzazbz }],
  ...[
    "chroma by tone",
    "vibrance +0.7",
    "saturation by tone, perceptual",
    "brilliance by tone, perceptual",
    "saturation global +0.5, JzAzBz",
    "saturation by tone, JzAzBz",
    "brilliance by tone, JzAzBz",
    "masks: shadows fall-off 3, highlights 0, fulcrum 0.3",
    "white fulcrum +2, perceptual",
    "white fulcrum -1.5, perceptual",
    "everything, perceptual",
    "everything, JzAzBz",
    "extremes +1, JzAzBz",
    "extremes -1, perceptual",
  ].map((name): [string, Params] => [name, paramsOf(name)]),
  ...PRESETS.map((p): [string, Params] => [`preset: ${p.id}`, p.params]),
  ["slices, perceptual", { ...DEFAULT_PARAMS, slices: SLICES }],
  ["slices, JzAzBz", { ...DEFAULT_PARAMS, formula: FORMULAS.jzazbz, slices: SLICES }],
];

const TEXTURES = { [`${STAGE_ID}.${LUT_KEY}`]: lutTexture() };
const stages = (): ProcessingStageContribution[] => [...builtinStages(), saturationStage()];

function render(image: FloatImage, bags: Record<string, Record<string, unknown>>, withStage = true): Record<string, Float32Array> {
  const frames: Record<string, Float32Array> = {};
  withRenderer({ stages: withStage ? stages() : builtinStages(), pipeline: OPEN_PROBE }, (renderer) => {
    renderer.setImage(image);
    renderer.setStageTextures(TEXTURES);
    renderer.setParams(identityParams({ processVersion: CURRENT_PROCESS_VERSION }));
    for (const [name, bag] of Object.entries(bags)) {
      renderer.setContributedParams(bag);
      const frame = renderer.readFloatFrame("pre-output", Infinity, AS_DRAWN);
      if (!frame) throw new Error(`no frame for ${name}`);
      frames[name] = frame.data;
    }
  });
  return frames;
}

const bagOf = (p: Params): Record<string, unknown> => ({ ...bagPatch(p), [qualified("sdActive")]: 1 });

interface Errors {
  sdr: number;
  hdr: number;
  p99: number;
  at: Vec3 | null;
}

/** |GPU − model| relative to each pixel's scale, the model run on the frame
 *  the stage was handed (the idle frame). */
function errors(identity: Float32Array, frame: Float32Array, p: Params): Errors {
  let sdr = 0;
  let hdr = 0;
  let at: Vec3 | null = null;
  const all: number[] = [];
  for (let k = 0; k < W * H; k++) {
    const input: Vec3 = [identity[4 * k], identity[4 * k + 1], identity[4 * k + 2]];
    const want = process709(input, p);
    const got: Vec3 = [frame[4 * k], frame[4 * k + 1], frame[4 * k + 2]];
    const scale = Math.max(...input.map(Math.abs), ...got.map(Math.abs), ...want.map(Math.abs), 1e-3);
    let e = 0;
    for (let i = 0; i < 3; i++) e = Math.max(e, Math.abs(got[i] - want[i]) / scale);
    all.push(e);
    if (scale <= 8) {
      if (e > sdr) {
        sdr = e;
        at = input;
      }
    } else hdr = Math.max(hdr, e);
  }
  all.sort((a, b) => b - a);
  return { sdr, hdr, p99: all[Math.floor(all.length / 100)], at };
}

describe("Saturation & Density on the GPU", () => {
  it("passes core's stage contract without a warning", () => {
    expect(checkStageContract(saturationStage(), EXT_ID)).toMatchObject({ error: null, warnings: [] });
  });

  const bags: Record<string, Record<string, unknown>> = { identity: resetPatch() };
  for (const [name, p] of CASES) bags[name] = bagOf(p);
  const frames = render(SCENE, bags);

  it("leaves the frame exactly as it was while idle", () => {
    const without = render(SCENE, { identity: {} }, false).identity;
    expect(Array.from(frames.identity)).toEqual(Array.from(without));
  });

  it("draws only finite values", () => {
    for (const [name, frame] of Object.entries(frames)) expect(frame.every(Number.isFinite), name).toBe(true);
  });

  it.each(CASES)("lands on the model: %s", (name, p) => {
    const e = errors(frames.identity, frames[name], p);
    console.log(`[sd-gpu] ${name}: sdr ${e.sdr.toExponential(2)} hdr ${e.hdr.toExponential(2)} p99 ${e.p99.toExponential(2)} at ${JSON.stringify(e.at)}`);
    if (p.formula === FORMULAS.jzazbz) {
      expect(e.sdr).toBeLessThan(1e-4);
      expect(e.hdr).toBeLessThan(3e-4);
    } else {
      expect(e.sdr).toBeLessThan(1e-5);
      expect(e.hdr).toBeLessThan(2e-3);
    }
  });

  it("costs a full-size frame no more than a few times the idle one", () => {
    const big = floatImage(1536, 1024, (x, y) => PIXELS[(y * 1536 + x) % PIXELS.length]);
    const timed: Record<string, number> = {};
    withRenderer({ stages: stages(), pipeline: OPEN_PROBE }, (renderer) => {
      renderer.setImage(big);
      renderer.setStageTextures(TEXTURES);
      renderer.setParams(identityParams({ processVersion: CURRENT_PROCESS_VERSION }));
      const time = (name: string, bag: Record<string, unknown>) => {
        renderer.setContributedParams(bag);
        renderer.readFloatFrame("pre-output", Infinity, AS_DRAWN);
        const t0 = performance.now();
        renderer.readFloatFrame("pre-output", Infinity, AS_DRAWN);
        timed[name] = performance.now() - t0;
      };
      time("idle", resetPatch());
      time("perceptual", bagOf(paramsOf("everything, perceptual")));
      time("JzAzBz", bagOf(paramsOf("everything, JzAzBz")));
      time("slices", bagOf({ ...DEFAULT_PARAMS, slices: SLICES }));
    });
    console.log(`[sd-gpu] 1536×1024 frame, ms: ${JSON.stringify(timed)}`);
    for (const name of ["perceptual", "JzAzBz", "slices"]) expect(timed[name]).toBeLessThan(Math.max(10 * timed.idle, 5000));
  });
});
