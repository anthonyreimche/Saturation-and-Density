// Saturation & Density, a Safelight extension (GPL-3.0-or-later).
//
// darktable's color balance rgb saturation tools (chroma, vibrance,
// perceptual saturation and brilliance by tone, the masks, both saturation
// formulas) plus colour slices. Registers the scene-linear stage (stage.ts),
// hands it its gamut LUT texture and registers the Develop panel (Panel.tsx),
// which also edits a mask's values in the Masking panel.

import { SaturationDensityPanel } from "./Panel";
import { EXT_ID, PARAM_KEYS, STAGE_ID, qualified, resetPatch } from "./params";
import { api, initRuntime } from "./rt";
import type { SafelightAPI } from "./safelight";
import { LUT_KEY, lutTexture, saturationStage } from "./stage";
import { initStore } from "./store";

export { EXT_ID };

export const PANEL_ID = `${EXT_ID}.panel`;

function reset(): void {
  const dev = api.stores.useDevelopStore.getState();
  dev.setDynParams(resetPatch());
  void dev.commitEdit("Saturation & Density reset");
}

// Null until activate() runs.
let activeHost: SafelightAPI | null = null;

export function activate(host: SafelightAPI): void {
  initRuntime(host);
  initStore();
  activeHost = host;
  // While no effect is set `sdActive` is 0: the renderer leaves the stage
  // out, so an untouched photo renders bit for bit unchanged.
  host.registerProcessingStage(saturationStage());
  host.setStageTexture(STAGE_ID, LUT_KEY, lutTexture());
  host.registerPanel({
    id: PANEL_ID,
    title: "Saturation & Density",
    component: SaturationDensityPanel,
    defaultDock: { module: "develop", direction: "right", width: 268 },
    onReset: reset,
    mask: { component: SaturationDensityPanel, owns: PARAM_KEYS.map(qualified) },
  });
}

export function deactivate(): void {
  const host = activeHost;
  if (!host) return;
  activeHost = null;
  // A throw here would skip the host's sweep of this extension's
  // registrations, so a failure is logged instead.
  try {
    host.unregisterProcessingStage(STAGE_ID);
  } catch (err) {
    console.warn("[saturation-density] deactivate failed:", err);
  }
}
