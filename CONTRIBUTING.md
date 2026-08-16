# Contributing

**Every contribution is welcome**, from a one-line fix to a whole district.
There is no review bar to clear and no style test to pass: if it makes the
neighbourhood better, it goes in. Opening an issue to say "this looks wrong"
is a contribution too.


The scene is one file, `index.html`, organised in labelled sections. Pick one
and work inside it — most additions do not touch anything else.

## The current goal: mobile

Making this run well on a phone is the priority. The touch controls already
exist in the source; what does not exist is the performance work. The renderer
draws the scene four times per frame — normals and depth, colour, bloom,
composition — which is fine on a desktop GPU and far too much for a mid-range
phone at native resolution. Reduced pixel ratio, MSAA off, smaller shadow maps,
bloom at a lower fraction. The cel look survives all of that; only sharpness
gives, and on a six-inch screen you will not miss it.

If you have a phone and twenty minutes, just running it and reporting the
frame rate and the model is genuinely useful.

## Other good first areas

- **A new district.** Streets that curve, blocks with courtyards. The rule is
  no cloning: two houses with the same footprint should still look different.
- **House variety.** `house()` takes width, depth and height. It could take a
  roof type, a floor count, a plaster palette, a shop front instead of an
  entrance.
- **Interiors.** Doors that open onto a genkan and a tatami room.
- **Traffic.** Cars on the expressway deck, which is currently empty.
- **Sound.** There is only the crossing bell.

## House rules

**Reuse `house()` rather than inventing new boxes.** It already carries the
plinth, the tiled roof with its gable board and rafters, the gutters, the
aerial, the shuttered windows, the entrance with its noren and lantern, the
balcony. Detail is inherited, not added afterwards.

**Derive geometry, do not hardcode it.** The roof pitch comes from the width;
the number of window bays comes from the width; the arch springs from the
clearance the train needs. Fixed values break the moment someone builds a wider
house — that is exactly how the roof used to leave a gap at the ridge.

**Prove behaviour by running it.** `node tools/walktest.mjs` measures the ground
heights, the step onto the kerb, where you stop against a wall, and whether W
moves the way the camera is facing. A screenshot cannot settle any of those.

**Explain the why in the comment, not the what.** `// three bands, four softens
it and the cartoon read goes` is worth keeping. `// set the gradient map` is not.

## Three traps that will cost you an afternoon

- Toon gradient map in `RedFormat` → **the whole scene renders red**. Use
  `RGBAFormat`.
- Forgetting `convertSRGBToLinear()` on a colour → everything looks bleached.
- Copying light intensities without a tone mapping pass → anything above 1
  clips to flat white, and pink cherry blossom turns into cotton wool.
