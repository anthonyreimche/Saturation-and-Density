// darktable's four "basic colourfulness" presets for color balance rgb
// (init_presets), as the extension's params. The neutral 4-ways, contrast
// and hue shift they carry are the parts not ported; everything else is
// here, the mask defaults included.

import { DEFAULT_PARAMS, FORMULAS, type Params, type Tones } from "./model";

export interface Preset {
  id: string;
  /** For the panel's preset menu (no program names). */
  label: string;
  params: Params;
}

const tones = (t: Partial<Tones>): Tones => ({ global: 0, shadows: 0, midtones: 0, highlights: 0, ...t });

export const PRESETS: readonly Preset[] = [
  {
    id: "legacy",
    label: "Basic colourfulness: legacy",
    params: {
      ...DEFAULT_PARAMS,
      formula: FORMULAS.jzazbz,
      chroma: tones({ global: 0.2 }),
      saturation: tones({ shadows: 0.1, midtones: 0.05, highlights: -0.05 }),
    },
  },
  {
    id: "natural-skin",
    label: "Basic colourfulness: natural skin",
    params: { ...DEFAULT_PARAMS, saturation: tones({ global: 0.2, shadows: 0.3, highlights: -0.5 }) },
  },
  {
    id: "vibrant",
    label: "Basic colourfulness: vibrant colours",
    params: { ...DEFAULT_PARAMS, saturation: tones({ global: 0.2, shadows: 0.5, highlights: -0.25 }) },
  },
  {
    id: "standard",
    label: "Basic colourfulness: standard",
    params: { ...DEFAULT_PARAMS, saturation: tones({ global: 0.2, shadows: 0.25, highlights: -0.25 }) },
  },
];
