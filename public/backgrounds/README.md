# Backgrounds

The photos behind the views, two WebP files each (2560 and 1280 wide, 16:9) made by
`node scripts/make-background.mjs <source> <name>` from a generated source, plus a sidecar
`<name>.json` with the darkest and the lightest patch of the picture - of the whole frame, and of
its top quarter, where the title of the page lies - for `npm run check:contrast`.
How a view gets its photo is in `CLAUDE.md` ("Backgrounds"). A photo whose top band is too dark or
too bright for the title of the page gets its tones narrowed (`<black>-<white>`, the third
argument of the script) - by as little as makes `npm run check:contrast` pass.

| Name | View | Generated |
|---|---|---|
| `home` | Overview | 2026-10-07, Superdesign, `bytedance/seedream-5.0-lite`, 4K 16:9 (4096 × 2304) |
| `water` | Hot water | 2026-10-08, Superdesign, `bytedance/seedream-5.0-lite`, 4K 16:9 (4096 × 2304) |
| `boiler` | Boiler room | 2026-10-08, Superdesign, `bytedance/seedream-5.0-lite`, 4K 16:9 (4096 × 2304) |

## Prompts

Every photo records its prompt and model here, so it can be regenerated or matched by the next
one.

### `home`

> Photorealistic wide exterior photograph of a modern single-family house with a flat roof and
> large floor-to-ceiling glass walls, seen from its garden at blue hour just after sunset. Warm
> light glows from inside the house; a neat lawn and a few trees in the foreground; no people, no
> cars, no text. Calm, quiet composition with a lot of empty dusk sky above and open lawn below,
> so that user-interface cards can be laid over the picture. Soft natural light, subtle haze, deep
> navy-blue sky, realistic architecture photography, 16:9.

Model `bytedance/seedream-5.0-lite`, image size 4K, aspect ratio 16:9; the owner chose the
picture on 2026-10-07 (HAS-209).

### `water`

> Photorealistic wide interior photograph of a modern minimalist bathroom at blue hour: a walk-in
> rain shower behind clear glass with soft steam, matte stone walls, a large window with deep
> navy dusk sky, warm indirect light along the ceiling. No people, no text. Calm, quiet
> composition with large empty wall and floor areas so that user-interface cards can be laid over
> the picture. Soft natural light, subtle haze, realistic architecture photography, 16:9.

Model `bytedance/seedream-5.0-lite`, image size 4K, aspect ratio 16:9; prompt agreed with the
owner on 2026-10-08 (HAS-195). Tones `36-232`: the black frame of the window and the white strip
of light, both in the top band where the title lies, were too far apart for one title colour per
scheme.

### `boiler`

> Photorealistic wide interior photograph of a tidy modern residential boiler room at dusk: a
> wall-mounted gas furnace, a white hot-water tank, neat copper pipes with pumps and valves on a
> smooth concrete wall, warm amber light from a single lamp, deep navy shadows. No people, no
> text, no brand logos. Calm composition with large empty wall areas so that user-interface cards
> can be laid over the picture. Realistic architecture photography, 16:9.

Model `bytedance/seedream-5.0-lite`, image size 4K, aspect ratio 16:9; prompt agreed with the
owner on 2026-10-08 (HAS-195). Tones `45-255`: the wall is nearly black at the top, which a dark title
in the light scheme cannot be read on.
