// A stage runs on every photo, so at rest it must leave the image as it
// was, and its shader must be one every GPU builds and runs cheaply. Unit
// tests can't run GLSL (test/gpu does, and the shader mirror holds its
// logic); these hold the stage's place in the pipeline, the uniforms the bag
// binds, the dormancy gate and a shader shape Direct3D 11 links.

import { describe, expect, it } from "vitest";
import { REC709_TO_REC2020, WORKING_TO_LMS } from "../src/colour";
import { DEFAULT_PARAMS, SLICE_COUNT } from "../src/model";
import { PARAM_KEYS, STAGE_ID, bagPatch, qualified } from "../src/params";
import { LUT_KEY, glslLiteral, glslMat3, saturationStage } from "../src/stage";

const stage = saturationStage();
const helpers = stage.helpers ?? "";
const inline = stage.glsl;
const glsl = `${helpers}\n${inline}`;
const code = (src: string): string => src.replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");

describe("saturationStage", () => {
  it("sits in the scene-linear phase after Colour Equaliser, as darktable orders color balance rgb", () => {
    expect(stage.id).toBe(STAGE_ID);
    expect(stage.phase).toBe("scene-linear");
    expect(stage.priority).toBe(90);
    expect(stage.after).toEqual(["colour-equaliser.rings"]);
  });

  it("reads lin as linear Rec.709 and converts it itself", () => {
    expect(stage.space).toBeUndefined();
    expect(inline).toContain(glslMat3(REC709_TO_REC2020));
    expect(inline).toContain(glslMat3(WORKING_TO_LMS));
  });

  it("declares one uniform per param, defaulting to the defaults' bag values", () => {
    expect(stage.uniforms.map((u) => u.key)).toEqual([...PARAM_KEYS]);
    const patch = bagPatch(DEFAULT_PARAMS);
    for (const u of stage.uniforms) expect(u.default).toEqual(patch[qualified(u.key as (typeof PARAM_KEYS)[number])]);
  });

  it("types the uniforms as the shader reads them", () => {
    const types = Object.fromEntries(stage.uniforms.map((u) => [u.key, [u.glslType, u.length]]));
    expect(types).toEqual({
      sdFormula: ["int", undefined],
      sdActive: ["int", undefined],
      sdChroma: ["vec4", undefined],
      sdSaturation: ["vec4", undefined],
      sdBrilliance: ["vec4", undefined],
      sdMasks: ["vec4", undefined],
      sdVibrance: ["float", undefined],
      sdSlices: ["vec4", SLICE_COUNT],
    });
  });

  // Every develop-program uniform shares one budget (224 vectors at WebGL 2's
  // minimum) and each mask that uses the stage adds a copy; core caps array
  // uniforms at 64.
  it("takes 14 uniform rows, its one array 7 long", () => {
    expect(stage.uniforms.reduce((sum, u) => sum + (u.length ?? 1), 0)).toBe(14);
    for (const u of stage.uniforms) expect(u.length ?? 1).toBeLessThanOrEqual(64);
  });

  it("is dormant while no effect is set, on a scalar key", () => {
    expect(stage.dormantWhen).toEqual({ sdActive: 0 });
    const active = stage.uniforms.find((u) => u.key === "sdActive");
    expect(active?.length).toBeUndefined();
    expect(active?.glslType).toBe("int");
    expect(bagPatch(DEFAULT_PARAMS)[qualified("sdActive")]).toBe(0);
  });

  it("takes its gamut LUTs from one 512 × 1 rgba16f lut texture", () => {
    expect(stage.textures).toEqual([{ key: LUT_KEY, kind: "lut", width: 512, height: 1, format: "rgba16f" }]);
  });

  it("is maskable and a global look in presets", () => {
    expect(stage.mask).toEqual({ maskable: true });
    expect(stage.presetScope).toBe("global");
  });
});

describe("the GLSL", () => {
  const keys = [...PARAM_KEYS, LUT_KEY];

  it("names every key with sd and a capital, so no GLSL word collides with one", () => {
    for (const key of keys) expect(key).toMatch(/^sd[A-Z]/);
  });

  // The host rewrites keys at identifier boundaries in the inline block and,
  // for a mask's copy, with the copy's prefix; the helpers are shared.
  it("mentions no key in the helpers", () => {
    for (const key of keys) expect(code(helpers)).not.toMatch(new RegExp(`\\b${key}\\b`));
  });

  it("declares no identifier named like a key", () => {
    for (const key of keys) {
      expect(code(glsl)).not.toMatch(new RegExp(`\\b(?:float|int|bool|[iu]?vec[234]|mat[234])\\s+${key}\\b`));
    }
  });

  // stage-validation's own pattern: Direct3D 11 copies a constant array into
  // every pixel's scratch memory on every draw.
  it("has no const arrays and no local arrays at all", () => {
    expect(code(glsl)).not.toMatch(/\bconst\s+(?:\w+\s+)*\w+\s*\[/);
    expect(code(glsl)).not.toMatch(/\b(?:float|int|bool|[iu]?vec[234]|mat[234])\s*(?:\[[^\]]*\]\s*\w+|\w+\s*\[[^\]]*\])\s*[;=]/);
  });

  it("has no loops", () => {
    expect(code(glsl)).not.toMatch(/\b(?:for|while|do)\s*[({]/);
  });

  // The fetch budget: two texels per pixel, read exactly, from whichever
  // formula's branch runs. No filtered or derivative reads.
  it("reads the LUT with four texelFetch calls, two per formula branch, and nothing else", () => {
    expect(code(glsl).match(/\btexelFetch\s*\(/g)).toHaveLength(4);
    expect(code(helpers)).not.toMatch(/\btexelFetch\b/);
    expect(code(glsl)).not.toMatch(/\btexture(?:Lod|Grad|Proj)?\s*\(/);
    expect(code(glsl)).not.toMatch(/\b(?:dFdx|dFdy|fwidth)\b/);
    const branches = code(inline).split(/\}\s*else\s*\{/);
    expect(branches).toHaveLength(2);
    for (const branch of branches) expect(branch.match(/\btexelFetch\s*\(/g)).toHaveLength(2);
  });

  it("only writes the pixel inside the branch the active flag guards", () => {
    const body = code(inline);
    const branch = body.indexOf("if (sdActive != 0)");
    expect(branch).toBeGreaterThan(0);
    expect(body.match(/\blin\s*=[^=]/g)).toHaveLength(1);
    expect(body.search(/\blin\s*=[^=]/)).toBeGreaterThan(branch);
  });

  // The fragment program's ints are mediump unless declared highp: 16 bits
  // where the driver honours precision (Mesa behind ANGLE's GLES backend),
  // which scrambles a float's 32 bits into different noise at every pixel.
  it("holds a float's bits in highp ints", () => {
    const src = code(glsl);
    const toBits = [...src.matchAll(/([^;{}]*)\bfloatBitsTo(?:Int|Uint)\s*\(/g)];
    expect(toBits.length).toBeGreaterThan(0);
    for (const [, before] of toBits) expect(before).toMatch(/\bhighp\s+u?int\s+\w+\s*=\s*$/);
    const fromBits = [...src.matchAll(/\bu?intBitsToFloat\s*\(([^;]*);/g)];
    expect(fromBits.length).toBeGreaterThan(0);
    for (const { 1: arg, index } of fromBits) {
      expect(arg).not.toMatch(/\bu?int\s*\(/);
      for (const [name] of arg.matchAll(/\b[A-Za-z_]\w*\b(?!\s*\()/g)) {
        // The nearest declaration above the use is the one in scope.
        const declared = [...src.slice(0, index).matchAll(new RegExp(`(highp\\s+)?\\bu?int\\s+${name}\\s*[=;,)]`, "g"))].at(-1);
        if (declared) expect({ name, highp: Boolean(declared[1]) }).toEqual({ name, highp: true });
      }
    }
  });

  it("guards atan(0, 0) and pow(0, y)", () => {
    expect(helpers).toMatch(/x == 0\.0 && y == 0\.0 \? 0\.0 : atan\(y, x\)/);
    expect(helpers).toMatch(/x > 0\.0 \? pow\(x, y\) : 0\.0/);
  });

  it("writes float literals GLSL accepts", () => {
    expect(glslLiteral(1)).toBe("1.000000000");
    expect(glslLiteral(-2)).toBe("-2.000000000");
    expect(glslLiteral(0.25)).toBe("0.2500000000");
    expect(glslLiteral(1.6295499532821566e-11)).toBe("1.629549953e-11");
    expect(glslLiteral(1e-30)).toBe("1.000000000e-30");
    expect(glslLiteral(1.1754943508222875e-38)).toBe("1.175494351e-38");
    expect(glslLiteral(1e21)).toBe("1.000000000e+21");
    for (const lit of code(glsl).match(/(?<![\w.])\d+\.\d*(?:e[+-]?\d+)?/g) ?? []) expect(Number.isFinite(Number(lit))).toBe(true);
  });
});
