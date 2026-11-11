// What activate() registers: the stage and its LUT texture, named under the
// manifest's id; deactivate() takes the stage back out.

import { describe, expect, it } from "vitest";
import manifest from "../safelight.json";
import pkg from "../package.json";
import { activate, deactivate } from "../src/index";
import { EXT_ID, STAGE_ID } from "../src/params";
import { LUT_KEY, lutTexture } from "../src/stage";
import { fakeApi } from "./support/fake-api";

describe("activate", () => {
  it("registers the stage", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.stages.map((s) => s.id)).toEqual([STAGE_ID]);
  });

  it("hands the stage its LUT texture", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.textures.get(`${STAGE_ID}.${LUT_KEY}`)).toEqual(lutTexture());
  });

  it("names its contributions under the manifest's id", () => {
    expect(EXT_ID).toBe(manifest.id);
    expect(STAGE_ID.startsWith(`${manifest.id}.`)).toBe(true);
  });

  it("keeps the manifest and package versions in step", () => {
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.license).toBe("GPL-3.0-or-later");
  });

  it("registers the panel", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.panels.map((p) => p.id)).toEqual([`${EXT_ID}.panel`]);
  });

  it("unregisters the stage on deactivate, once", () => {
    const rig = fakeApi();
    activate(rig.api);
    deactivate();
    deactivate();
    expect(rig.unregistered).toEqual([STAGE_ID]);
  });
});
