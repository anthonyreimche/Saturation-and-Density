// The panel over the photo's bag: presets, the four tabs and their sliders,
// the slice picker, the masks tab, reset, and the mask registration.

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { activate } from "../src/index";
import { DEFAULT_PARAMS, FORMULAS, SLICE_NAMES, type Params } from "../src/model";
import { SaturationDensityPanel } from "../src/Panel";
import { PARAM_KEYS, bagPatch, qualified, readParams, resetPatch } from "../src/params";
import { PRESETS } from "../src/presets";
import { React } from "../src/rt";
import { fakeApi } from "./support/fake-api";

function setup(initial: Params = DEFAULT_PARAMS) {
  const rig = fakeApi(bagPatch(initial));
  activate(rig.api);
  const view = render(<SaturationDensityPanel />);
  const sliders = () => rig.sliders(view.container);
  const labels = () => sliders().map((s) => s.label);
  const slider = (label: string) => {
    const found = sliders().find((s) => s.label === label);
    if (!found) throw new Error(`no slider ${label}`);
    return found;
  };
  const tab = (name: string) => act(() => void fireEvent.click(screen.getByRole("tab", { name })));
  const params = () => readParams(rig.params());
  return { rig, view, sliders, labels, slider, tab, params };
}

afterEach(cleanup);

describe("presets", () => {
  it("lists every preset and writes its params as one undo step", () => {
    const { rig, params } = setup();
    const menu = screen.getByLabelText("Saturation & Density preset") as HTMLSelectElement;
    expect([...menu.options].map((o) => o.textContent)).toEqual(["Presets", ...PRESETS.map((p) => p.label)]);
    const legacy = PRESETS[0];
    act(() => void fireEvent.change(menu, { target: { value: legacy.id } }));
    expect(params()).toEqual(legacy.params);
    expect(rig.params()).toMatchObject(bagPatch(legacy.params));
    expect(rig.commits).toEqual([`Saturation & Density: preset: ${legacy.label}`]);
  });
});

describe("tabs", () => {
  it("offers Global, Tones, Slices and Masks", () => {
    setup();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Global", "Tones", "Slices", "Masks"]);
  });

  it("Global shows chroma, vibrance, saturation and brilliance", () => {
    const { labels } = setup();
    expect(labels()).toEqual(["Chroma", "Vibrance", "Saturation", "Brilliance"]);
  });

  it("Tones shows shadows, midtones and highlights for each effect", () => {
    const { labels, tab } = setup();
    tab("Tones");
    expect(labels()).toEqual(["Shadows", "Midtones", "Highlights", "Shadows", "Midtones", "Highlights", "Shadows", "Midtones", "Highlights"]);
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual(["Chroma", "Saturation", "Brilliance"]);
  });

  it("Slices shows hue, chroma, saturation and brilliance for the chosen slice", () => {
    const { labels, tab } = setup();
    tab("Slices");
    expect(labels()).toEqual(["Hue", "Chroma", "Saturation", "Brilliance"]);
    for (const name of SLICE_NAMES) expect(screen.getByRole("button", { name: new RegExp(`^${name}`, "i") })).toBeTruthy();
  });

  it("Masks shows the four mask sliders and the formula", () => {
    const { labels, tab } = setup();
    tab("Masks");
    expect(labels()).toEqual(["Shadows fall-off", "Highlights fall-off", "Mask grey fulcrum", "White fulcrum"]);
    const formula = screen.getByLabelText("Saturation formula") as HTMLSelectElement;
    expect([...formula.options].map((o) => o.textContent)).toEqual(["Perceptual", "JzAzBz"]);
  });
});

describe("sliders", () => {
  it("write the qualified key as a fraction, merged with the rest, and commit on release", () => {
    const { rig, slider, params } = setup({ ...DEFAULT_PARAMS, vibrance: 0.4 });
    act(() => slider("Chroma").onChange(25));
    expect(rig.params()[qualified("sdChroma")]).toEqual([0.25, 0, 0, 0]);
    expect(params().vibrance).toBe(0.4);
    act(() => slider("Chroma").onCommit?.());
    expect(rig.commits).toEqual(["Saturation & Density: chroma"]);
  });

  it("show percentages and reset on double-click to neutral", () => {
    const { slider } = setup({ ...DEFAULT_PARAMS, vibrance: 0.2 });
    expect(slider("Vibrance")).toMatchObject({ value: 20, min: -100, max: 100, defaultValue: 0 });
  });

  it("Global writes vibrance and the global members of saturation and brilliance", () => {
    const { slider, params } = setup();
    act(() => slider("Vibrance").onChange(-30));
    act(() => slider("Saturation").onChange(10));
    act(() => slider("Brilliance").onChange(-5));
    expect(params().vibrance).toBeCloseTo(-0.3, 12);
    expect(params().saturation.global).toBeCloseTo(0.1, 12);
    expect(params().brilliance.global).toBeCloseTo(-0.05, 12);
  });

  it("Tones write the right effect and tone", () => {
    const { sliders, tab, params } = setup();
    tab("Tones");
    act(() => sliders()[0].onChange(50));
    act(() => sliders()[5].onChange(-20));
    act(() => sliders()[7].onChange(70));
    expect(params().chroma.shadows).toBeCloseTo(0.5, 12);
    expect(params().saturation.highlights).toBeCloseTo(-0.2, 12);
    expect(params().brilliance.midtones).toBeCloseTo(0.7, 12);
    expect(params().chroma.global).toBe(0);
  });

  it("carry a tooltip that tells them from the basic sliders", () => {
    const { view } = setup();
    const tip = (label: string) => within(view.container).getByText(new RegExp(`^${label} `)).parentElement?.getAttribute("title");
    expect(tip("Chroma")).toBe("Adds or removes colour at constant luminance (additive).");
    expect(tip("Saturation")).toMatch(/^Subtractive saturation/);
    expect(tip("Brilliance")).toBe("Brightens or darkens colours relative to greys.");
    expect(tip("Vibrance")).toMatch(/low-chroma colours more/);
  });
});

describe("slices", () => {
  it("edit the selected slice's slot of the array", () => {
    const { rig, slider, tab, params } = setup();
    tab("Slices");
    act(() => void fireEvent.click(screen.getByRole("button", { name: /^blue/i })));
    act(() => slider("Hue").onChange(-40));
    act(() => slider("Saturation").onChange(30));
    expect(params().slices[4]).toEqual({ hue: -40, chroma: 0, saturation: 0.3, brilliance: 0 });
    expect(params().slices[0]).toEqual(DEFAULT_PARAMS.slices[0]);
    const arr = rig.params()[qualified("sdSlices")] as number[];
    expect(arr.slice(16, 20)).toEqual([-40, 0, 0.3, 0]);
  });

  it("shows the hue in degrees", () => {
    const { slider, tab } = setup();
    tab("Slices");
    expect(slider("Hue")).toMatchObject({ min: -180, max: 180, defaultValue: 0 });
  });

  it("mark the slices that are not neutral", () => {
    const slices = DEFAULT_PARAMS.slices.map((s, i) => (i === 2 ? { ...s, chroma: 0.2 } : s));
    const { tab } = setup({ ...DEFAULT_PARAMS, slices });
    tab("Slices");
    const edited = screen.getAllByRole("button").filter((b) => /\(edited\)$/.test(b.getAttribute("aria-label") ?? ""));
    expect(edited.map((b) => b.getAttribute("aria-label"))).toEqual(["Green (edited)"]);
  });
});

describe("masks", () => {
  it("disable the white fulcrum under JzAzBz only", () => {
    const { tab } = setup();
    tab("Masks");
    const disabled = () => screen.getByText(/^White fulcrum/).closest("[aria-disabled=true]") !== null;
    expect(disabled()).toBe(false);
    act(() => void fireEvent.change(screen.getByLabelText("Saturation formula"), { target: { value: String(FORMULAS.jzazbz) } }));
    expect(disabled()).toBe(true);
    expect(screen.getByText(/^Shadows fall-off/).closest("[aria-disabled=true]")).toBeNull();
  });

  it("write the formula, fall-offs and fulcrums in their units", () => {
    const { rig, slider, tab, params } = setup();
    tab("Masks");
    act(() => void fireEvent.change(screen.getByLabelText("Saturation formula"), { target: { value: String(FORMULAS.jzazbz) } }));
    act(() => slider("Shadows fall-off").onChange(150));
    act(() => slider("Mask grey fulcrum").onChange(25));
    act(() => slider("White fulcrum").onChange(2.5));
    expect(params().formula).toBe(FORMULAS.jzazbz);
    expect(params().masks).toMatchObject({ shadowsWeight: 1.5, maskGreyFulcrum: 0.25, whiteFulcrum: 2.5 });
    expect(rig.commits).toEqual(["Saturation & Density: formula"]);
  });

  it("reset the mask grey fulcrum to its exact default and show it unrounded", () => {
    const { slider, tab } = setup();
    tab("Masks");
    const fulcrum = slider("Mask grey fulcrum");
    expect(fulcrum.defaultValue).toBeCloseTo(18.45, 10);
    expect(fulcrum.value).toBeCloseTo(18.45, 10);
    expect(fulcrum.step).toBeLessThanOrEqual(0.05);
  });
});

describe("typed values past the track", () => {
  it("clamp to the range and leave the other slices as they were", () => {
    const busy: Params = {
      ...DEFAULT_PARAMS,
      slices: DEFAULT_PARAMS.slices.map((s, i) => (i === 3 ? { ...s, saturation: 0.4 } : s)),
    };
    const { slider, tab, params } = setup(busy);
    tab("Slices");
    act(() => slider("Hue").onChange(200));
    expect(params().slices[0].hue).toBe(180);
    expect(params().slices[3].saturation).toBe(0.4);
    act(() => slider("Hue").onChange(-30));
    expect(params().slices[0].hue).toBe(-30);
    expect(params().slices[3].saturation).toBe(0.4);
  });
});

describe("reset and registration", () => {
  it("resets through the develop store to resetPatch", () => {
    const rig = fakeApi(bagPatch({ ...DEFAULT_PARAMS, vibrance: 0.5 }));
    activate(rig.api);
    rig.panels[0].onReset?.();
    expect(rig.params()).toMatchObject(resetPatch());
    expect(rig.commits).toEqual(["Saturation & Density reset"]);
  });

  it("registers a mask panel that owns every param key", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.panels).toHaveLength(1);
    expect(rig.panels[0].mask?.owns).toEqual(PARAM_KEYS.map(qualified));
    expect(rig.panels[0].mask?.component).toBe(rig.panels[0].component);
  });

  it("never names the programs it came from", () => {
    const { view, tab } = setup();
    let text = PRESETS.map((p) => p.label).join(" ");
    for (const name of ["Global", "Tones", "Slices", "Masks"]) {
      tab(name);
      text += view.container.textContent ?? "";
      for (const n of view.container.querySelectorAll("[title],[aria-label]")) text += ` ${n.getAttribute("title")} ${n.getAttribute("aria-label")}`;
    }
    expect(text).not.toMatch(/darktable|resolve|ucs|ansel/i);
  });
});
