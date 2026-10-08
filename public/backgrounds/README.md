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
| `heating` | Heating | 2026-10-08, Superdesign, `bytedance/seedream-5.0-lite`, 4K 16:9 (4096 × 2304) |
| `water` | Hot water | 2026-10-08, Superdesign, `bytedance/seedream-5.0-lite`, 4K 16:9 (4096 × 2304) |
| `presence` | Presence | 2026-10-08, Superdesign, `bytedance/seedream-5.0-lite`, 4K 16:9 (4096 × 2304) |
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

### `heating`

> Photorealistic wide interior photograph of a modern living room at dusk, clearly a heated home
> in the cold season: a flat white panel radiator under a large window, a wall thermostat beside
> it, a sofa with a wool blanket, light oak floor; outside the window a cold blue evening. Even,
> soft, mid-toned light across the whole frame, especially along the top: no bright lamp, no
> black window frame, no deep shadows at the top. No people, no text, no brand logos. Calm
> composition with free wall area so that user-interface cards can be laid over the picture.
> Realistic interior photography, 16:9.

Model `bytedance/seedream-5.0-lite`, image size 4K, aspect ratio 16:9; prompt agreed with the
owner on 2026-10-08 (HAS-196). Tones untouched: asking for even, mid-toned light at the top was
enough for the title in both schemes.

### `water`

> Photorealistic wide interior photograph of a modern home bathroom at dusk, clearly recognisable
> as a bathroom: a washbasin on a wooden vanity with a tap, a round mirror above it, a soap
> dispenser, a toothbrush cup and a small plant; next to it a wall-mounted heated towel rail
> (ladder radiator) with a folded towel hanging on it; a walk-in shower with a glass screen and a
> rain shower head in the background; matte stone-grey wall tiles. Even, soft, mid-toned light
> across the whole frame, especially along the top of the picture: no bright light strips, no
> black window frame, no deep shadows at the top. No people, no text, no brand logos. Calm
> composition with some free wall area so that user-interface cards can be laid over the picture.
> Realistic interior photography, 16:9.

Model `bytedance/seedream-5.0-lite`, image size 4K, aspect ratio 16:9; prompt agreed with the
owner on 2026-10-08 (HAS-195). Tones `0-232`: the lamp in the ceiling, in the top band where the
title lies, is a little too bright for the light title of the dark scheme.

The second picture for this view. The first - an empty tiled room with a walk-in shower and a
large window - was turned down by the owner: nothing in it said "bathroom". A photo has to read
as its place at a glance, so the prompt names the things that make it one.

### `presence`

> Photorealistic wide interior photograph of the entrance hall of a modern family home at dusk,
> clearly a place people come and go through. The furniture and objects are spread across the
> whole width of the frame, from the left edge to the right: a front door with a glass side
> panel, a wooden bench with two pairs of shoes under it, a row of wall hooks with coats, a scarf
> and a backpack, a tall mirror, a key shelf, a console table with a bowl and a lamp turned off,
> an umbrella stand, a plant, a rug on the floor. No large empty wall, no large empty floor, no
> large empty ceiling: every part of the picture shows something of the hall. Even, soft,
> mid-toned light across the whole frame, especially along the top: no bright lamp, no black
> door frame, no deep shadows at the top. No people, no text, no brand logos. Calm, tidy,
> realistic interior photography, 16:9.

Model `bytedance/seedream-5.0-lite`, image size 4K, aspect ratio 16:9; prompt agreed with the
owner on 2026-10-08 (HAS-203). Tones `22-237`: the lit ceiling in the top band is too bright for
the light title of the dark scheme, and the top of the door frame too dark for the dark title of
the light one.

The owner's note for this and every later photo: **the things of the place are spread over the
whole picture** - not half of it a wall, a floor or empty space. The prompt says so in words
("from the left edge to the right", "no large empty wall").

### `boiler`

> Photorealistic wide interior photograph of a tidy modern residential boiler room at dusk: a
> wall-mounted gas furnace, a white hot-water tank, neat copper pipes with pumps and valves on a
> smooth concrete wall, warm amber light from a single lamp, deep navy shadows. No people, no
> text, no brand logos. Calm composition with large empty wall areas so that user-interface cards
> can be laid over the picture. Realistic architecture photography, 16:9.

Model `bytedance/seedream-5.0-lite`, image size 4K, aspect ratio 16:9; prompt agreed with the
owner on 2026-10-08 (HAS-195). Tones `45-255`: the wall is nearly black at the top, which a dark title
in the light scheme cannot be read on.
