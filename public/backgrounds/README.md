# Backgrounds

The photos behind the views, two WebP files each (2560 and 1280 wide, 16:9) made by
`node scripts/make-background.mjs <source> <name>` from a generated source, plus a sidecar
`<name>.json` with the darkest and the lightest patch of the picture - of the whole frame, and of
its top quarter, where the title of the page lies - for `npm run check:contrast`.
How a view gets its photo is in `CLAUDE.md` ("Backgrounds").

| Name | View | Generated |
|---|---|---|
| `home` | Overview | 2026-10-07, Superdesign, `bytedance/seedream-5.0-lite`, 4K 16:9 (4096 × 2304) |

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
