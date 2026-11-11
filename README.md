# Saturation & Density

A Safelight extension for colour that gets denser as it gets more saturated, not just brighter and louder. It ports the saturation side of darktable's color balance rgb module and adds colour slices of its own.

## What it does

The panel has a Presets menu and four tabs (Global, Tones, Slices, Masks).

- **Global**: Chroma, Vibrance, Saturation and Brilliance for the whole image.
- **Tones**: the same Chroma, Saturation and Brilliance, separately for Shadows, Midtones and Highlights.
- **Slices**: Red, Yellow, Green, Cyan, Blue, Magenta and Skin, each with Hue (degrees), Chroma, Saturation and Brilliance. A dot marks a slice you have changed. With every slice at zero the result is identical to the tabs above.
- **Masks**: the saturation formula, the shadows and highlights fall-off, the mask grey fulcrum and the white fulcrum.

The three effects differ:

- **Chroma** adds or removes colour at constant luminance (additive).
- **Saturation** is subtractive: colours get denser and darker as they saturate.
- **Brilliance** brightens or darkens colours relative to greys.
- **Vibrance** boosts low-chroma colours more than colours that are already colourful.

### The two formulas

Saturation and Brilliance rotate each colour in a lightness and chroma plane. **Perceptual** is gentle and the default. **JzAzBz** is stronger and more subtractive, but heavy saturation can crush saturated blues toward black. The white fulcrum only affects Perceptual, so it is disabled under JzAzBz.

## Things to know

- The extension runs in Safelight's scene-linear phase. Unless the display transform sets `skipToneShoulder`, it sees highlights that the tone shoulder has already rolled off, so results on bright highlights differ from darktable's.
- The first nudge of any control turns on gamut mapping, which can shift very saturated colours a little. darktable does the same while its module is on.

## Credits

The chroma, vibrance, saturation, brilliance and mask maths are ported from darktable's color balance rgb (Aurélien Pierre and the darktable developers). The colour slices are original to this extension.

## Licence

GPL-3.0-or-later. See `LICENSE`.
