// The Saturation & Density panel: a preset menu and four tabs. Global and
// Tones hold the chroma, vibrance, saturation and brilliance sliders, Slices
// the per-colour sliders, Masks the saturation formula and the tone masks.
//
// It edits whatever useParamScope hands it: the photo's bag in the dock, a
// mask's in the Masking panel. Every slider writes the whole parameter set
// merged over the live bag, and commits on release, so one drag is one undo
// step. Fractions show as percent: the core slider shows the plain number it
// is given, so the panel scales rather than formats.

import {
  DEFAULT_PARAMS,
  FORMULAS,
  MASK_RANGES,
  SLICE_HUE_LIMIT,
  SLICE_NAMES,
  SLICE_SWATCHES,
  type Formula,
  type Masks,
  type Params,
  type Slice,
  type Tones,
} from "./model";
import { bagPatch, readParams } from "./params";
import { PRESETS } from "./presets";
import { React, api } from "./rt";
import { store, type Tab } from "./store";

const TABS: { value: Tab; label: string }[] = [
  { value: "global", label: "Global" },
  { value: "tones", label: "Tones" },
  { value: "slices", label: "Slices" },
  { value: "masks", label: "Masks" },
];

const FORMULA_OPTIONS = [
  { value: String(FORMULAS.perceptual), label: "Perceptual" },
  { value: String(FORMULAS.jzazbz), label: "JzAzBz" },
];

const FORMULA_TIP = "Perceptual is gentle. JzAzBz is stronger and more subtractive, but heavy saturation can crush saturated blues toward black.";

const TIPS = {
  chroma: "Adds or removes colour at constant luminance (additive).",
  saturation:
    "Subtractive saturation: colours get denser and darker as they saturate. Strongest with the JzAzBz formula, gentler with Perceptual.",
  brilliance: "Brightens or darkens colours relative to greys.",
  vibrance: "Boosts low-chroma colours more than colours that are already colourful.",
} as const;

type Effect = "chroma" | "saturation" | "brilliance";
type Tone = keyof Tones;

const EFFECTS: { key: Effect; title: string }[] = [
  { key: "chroma", title: "Chroma" },
  { key: "saturation", title: "Saturation" },
  { key: "brilliance", title: "Brilliance" },
];

const TONES: { key: Exclude<Tone, "global">; label: string }[] = [
  { key: "shadows", label: "Shadows" },
  { key: "midtones", label: "Midtones" },
  { key: "highlights", label: "Highlights" },
];

const FRACTION = { min: -100, max: 100, step: 1, defaultValue: 0 };

// Rounded only to shed float noise (0.2 × 100 is 20.000000000000004): a
// fraction such as the mask grey fulcrum's 18.45 % must show and reset exactly.
const percent = (fraction: number): number => Math.round(fraction * 1e6) / 1e4;

const titleCase = (name: string): string => name[0].toUpperCase() + name.slice(1);

const isNeutral = (s: Slice): boolean => s.hue === 0 && s.chroma === 0 && s.saturation === 0 && s.brilliance === 0;

const withTone = (current: Params, effect: Effect, tone: Tone, percentValue: number): Params => ({
  ...current,
  [effect]: { ...current[effect], [tone]: percentValue / 100 },
});

interface Range {
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export function SaturationDensityPanel() {
  const { Slider } = api.components;
  const { Button, Field, Row, SegmentedControl, Section, Select, Stack } = api.ui;
  const scope = api.develop.useParamScope();
  const tab = store()((s) => s.tab);
  const sliceIndex = store()((s) => s.slice);
  const p = readParams(scope.getParams());
  const live = (): Params => readParams(scope.getParams());
  const apply = (next: Params) => scope.setParams(bagPatch(next));
  const commit = (what: string) => scope.commit(`Saturation & Density: ${what}`);

  // The core slider has no tooltip or disabled state, so the wrapper carries both.
  const slider = (
    label: string,
    value: number,
    range: Range,
    write: (value: number, current: Params) => Params,
    what: string,
    tip?: string,
    disabled = false,
  ) => (
    <div
      key={`${label}-${what}`}
      title={tip}
      aria-disabled={disabled ? true : undefined}
      style={disabled ? { opacity: 0.4, pointerEvents: "none" } : undefined}
    >
      <Slider label={label} value={value} {...range} onChange={(v) => apply(write(v, live()))} onCommit={() => commit(what)} />
    </div>
  );

  const globalTab = (
    <>
      {slider("Chroma", percent(p.chroma.global), FRACTION, (v, c) => withTone(c, "chroma", "global", v), "chroma", TIPS.chroma)}
      {slider("Vibrance", percent(p.vibrance), FRACTION, (v, c) => ({ ...c, vibrance: v / 100 }), "vibrance", TIPS.vibrance)}
      {slider("Saturation", percent(p.saturation.global), FRACTION, (v, c) => withTone(c, "saturation", "global", v), "saturation", TIPS.saturation)}
      {slider("Brilliance", percent(p.brilliance.global), FRACTION, (v, c) => withTone(c, "brilliance", "global", v), "brilliance", TIPS.brilliance)}
    </>
  );

  const tonesTab = (
    <>
      {EFFECTS.map((e) => (
        <Section key={e.key} title={e.title}>
          <Stack gap={4}>
            {TONES.map((t) =>
              slider(t.label, percent(p[e.key][t.key]), FRACTION, (v, c) => withTone(c, e.key, t.key, v), `${e.key} ${t.key}`, TIPS[e.key]),
            )}
          </Stack>
        </Section>
      ))}
    </>
  );

  const withSlice = (current: Params, patch: Partial<Slice>): Params => ({
    ...current,
    slices: current.slices.map((s, i) => (i === sliceIndex ? { ...s, ...patch } : s)),
  });
  const slice = p.slices[sliceIndex];
  const sliceName = SLICE_NAMES[sliceIndex];

  const slicesTab = (
    <>
      <Row gap={4} wrap>
        {SLICE_NAMES.map((name, i) => {
          const edited = !isNeutral(p.slices[i]);
          return (
            <Button
              key={name}
              size="sm"
              active={i === sliceIndex}
              aria-pressed={i === sliceIndex}
              aria-label={`${titleCase(name)}${edited ? " (edited)" : ""}`}
              title={titleCase(name)}
              onClick={() => store().getState().setSlice(i)}
            >
              <Row gap={4} align="center">
                <span style={{ width: 12, height: 12, borderRadius: 6, background: SLICE_SWATCHES[i], display: "inline-block" }} />
                {edited ? <span style={{ width: 4, height: 4, borderRadius: 2, background: "currentColor", display: "inline-block" }} /> : null}
              </Row>
            </Button>
          );
        })}
      </Row>
      {slider(
        "Hue",
        Math.round(slice.hue),
        { min: -SLICE_HUE_LIMIT, max: SLICE_HUE_LIMIT, step: 1, defaultValue: 0 },
        (v, c) => withSlice(c, { hue: v }),
        `${sliceName} hue`,
        "Turns this colour toward its neighbour, in degrees.",
      )}
      {slider("Chroma", percent(slice.chroma), FRACTION, (v, c) => withSlice(c, { chroma: v / 100 }), `${sliceName} chroma`, TIPS.chroma)}
      {slider("Saturation", percent(slice.saturation), FRACTION, (v, c) => withSlice(c, { saturation: v / 100 }), `${sliceName} saturation`, TIPS.saturation)}
      {slider("Brilliance", percent(slice.brilliance), FRACTION, (v, c) => withSlice(c, { brilliance: v / 100 }), `${sliceName} brilliance`, TIPS.brilliance)}
    </>
  );

  const d = DEFAULT_PARAMS.masks;
  const withMask = (current: Params, patch: Partial<Masks>): Params => ({ ...current, masks: { ...current.masks, ...patch } });
  const percentRange = (key: keyof Masks): Range => ({
    min: MASK_RANGES[key][0] * 100,
    max: MASK_RANGES[key][1] * 100,
    step: key === "maskGreyFulcrum" ? 0.05 : 1,
    defaultValue: percent(d[key]),
  });

  const masksTab = (
    <>
      <Field label="Saturation formula">
        <Select
          ariaLabel="Saturation formula"
          title={FORMULA_TIP}
          value={String(p.formula)}
          options={FORMULA_OPTIONS}
          onChange={(v) => {
            apply({ ...live(), formula: Number(v) as Formula });
            commit("formula");
          }}
        />
      </Field>
      {slider(
        "Shadows fall-off",
        percent(p.masks.shadowsWeight),
        percentRange("shadowsWeight"),
        (v, c) => withMask(c, { shadowsWeight: v / 100 }),
        "shadows fall-off",
        "How softly the shadows mask fades into the midtones.",
      )}
      {slider(
        "Highlights fall-off",
        percent(p.masks.highlightsWeight),
        percentRange("highlightsWeight"),
        (v, c) => withMask(c, { highlightsWeight: v / 100 }),
        "highlights fall-off",
        "How softly the highlights mask fades into the midtones.",
      )}
      {slider(
        "Mask grey fulcrum",
        percent(p.masks.maskGreyFulcrum),
        percentRange("maskGreyFulcrum"),
        (v, c) => withMask(c, { maskGreyFulcrum: v / 100 }),
        "mask grey fulcrum",
        "The grey level, as a percentage, that divides shadows from highlights in the masks.",
      )}
      {slider(
        "White fulcrum",
        Math.round(p.masks.whiteFulcrum * 10) / 10,
        { min: MASK_RANGES.whiteFulcrum[0], max: MASK_RANGES.whiteFulcrum[1], step: 0.1, defaultValue: d.whiteFulcrum },
        (v, c) => withMask(c, { whiteFulcrum: v }),
        "white fulcrum",
        "The white level, in EV, that the Perceptual formula measures brightness against. Not used by JzAzBz.",
        p.formula === FORMULAS.jzazbz,
      )}
    </>
  );

  return (
    <Stack gap={6} style={{ padding: 8 }}>
      <Select
        ariaLabel="Saturation & Density preset"
        value=""
        placeholder="Presets"
        options={PRESETS.map((pr) => ({ value: pr.id, label: pr.label }))}
        onChange={(id) => {
          const preset = PRESETS.find((pr) => pr.id === id);
          if (!preset) return;
          apply(preset.params);
          commit(`preset: ${preset.label}`);
        }}
      />
      <SegmentedControl size="sm" value={tab} options={TABS} onChange={(v) => store().getState().setTab(v as Tab)} />
      {tab === "global" ? globalTab : null}
      {tab === "tones" ? tonesTab : null}
      {tab === "slices" ? slicesTab : null}
      {tab === "masks" ? masksTab : null}
    </Stack>
  );
}
