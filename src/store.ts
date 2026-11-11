// Session state of the panel, not part of the edit: the open tab and the
// colour slice being edited.

import { api } from "./rt";
import type { AppStore } from "./safelight";

export type Tab = "global" | "tones" | "slices" | "masks";

export interface UiState {
  tab: Tab;
  /** Index into SLICE_NAMES. */
  slice: number;
  setTab(tab: Tab): void;
  setSlice(slice: number): void;
}

let current: AppStore<UiState> | null = null;

export function initStore(): void {
  current = api.stores.create<UiState>((set) => ({
    tab: "global",
    slice: 0,
    setTab: (tab) => set({ tab }),
    setSlice: (slice) => set({ slice }),
  }));
}

export function store(): AppStore<UiState> {
  if (!current) throw new Error("[saturation-density] store() called before activate()");
  return current;
}
