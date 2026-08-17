# How the cartoon look is made

Everything below is what is actually in `index.html`, with the real numbers. It
is written so you can rebuild the look from nothing, in the order that works,
without paying again for the mistakes that were paid for once already.

**The constraint that shapes all of it: three.js r128.** No colour management, no
`outputColorSpace`, no TSL, no WebGPU. Several things that are one line in a
modern build are done by hand here. Read the traps before changing a value.

---

## 1. The order matters more than the values

Each step makes the next one judgeable. Do them out of order and you will tune
lights against materials that have no texture, or fight exposure when the real
problem is a material.

1. Textures — until surfaces exist you are looking at flat paint, not shading.
2. Sky — on a black background every light balance looks wrong.
3. Lights — only now can they be judged, against a real sky.
4. Tone mapping — you discover you need it when you raise the light and
   something turns white.
5. Material saturation — you discover this only after tone mapping, because
   until then you blame the exposure.
6. Outlines — last. They are the signature, not the structure, and on a broken
   scene they hide problems instead of revealing them.

---

## 2. Toon shading

Materials are `MeshToonMaterial` with a shared gradient map of **three hard
bands**:

```js
const steps = [76, 150, 255];          // three bands, no fourth
const data  = new Uint8Array(steps.length * 4);
steps.forEach((v, i) => { data[i*4] = data[i*4+1] = data[i*4+2] = v; data[i*4+3] = 255; });
const t = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
t.needsUpdate = true;
t.minFilter = t.magFilter = THREE.NearestFilter;
```

**Trap — the whole scene renders red.** r128 samples the gradient map with
`.rgb`. In `RedFormat` green and blue stay at zero, so every lit surface is
multiplied by pure red. It must be `RGBAFormat` with the grey **replicated on
all three channels**.

**Trap — a fourth band kills the look.** Three steps give the hard terminator
that reads as drawing. Four softens it into ordinary shading; the cartoon read
disappears and no amount of colour fixes it.

`NearestFilter` matters too: with linear filtering the bands blur into a ramp
and you are back to smooth shading.

---

## 3. Colour management, by hand

```js
renderer.outputEncoding = THREE.LinearEncoding;   // the composite pass writes final colour
texture.encoding        = THREE.sRGBEncoding;     // every canvas-painted texture
color.convertSRGBToLinear();                      // every material, light, fog, background
```

Every colour in the source is written as an sRGB hex — because that is the space
you pick colours in — and linearised in code. A single pass at startup walks the
whole scene and converts every material colour, every light colour, the fog and
the background. Colours reassigned per frame (the day cycle) are converted again
each time, through one helper:

```js
function lerpSRGB(target, a, b, k) {
  return target.copy(_cA.setHex(a)).lerp(_cB.setHex(b), k).convertSRGBToLinear();
}
```

**Trap — everything looks bleached.** That is an sRGB value being used as if it
were linear. Miss one light and the whole frame washes out.

**Trap — `getHexString()` lies above 1.0.** In r128 `getHex()` is
`(r*255) << 16 ^ (g*255) << 8 ^ (b*255)` with no clamping. A colour of
`(1.115, 1.05, 1.033)` — perfectly valid, just over-bright — prints as
`#1d0a07`, which looks black. Do not debug colour by its hex string; print the
components.

---

## 4. Lighting: four sources, never one

A single strong key destroys the palette. An orange key multiplied by a green
surface zeroes the blue and turns grass brown, and without a rim light the
silhouettes do not separate from the sky.

- **Key** — warm but **pale**, directional, casts the shadows.
- **Rim** — blue, from behind. *This is what gives the evening its colour*, not
  the key.
- **Ambient** — hemisphere, violet above, dark warm below.
- **Bounce** — a directional light with **negative** `position.y`, tinted like
  the sun at 30% of its intensity, so eaves and undersides are not dead grey.

The day cycle interpolates six keyframes. These are the real values:

| t | phase | sun | intensity | fog | sky | sun height |
|---|---|---|---|---|---|---|
| 0.00 | Alba | `ffcaa0` | 1.15 | `f3d3b4` | `ffd9bc` | 6 |
| 0.28 | Mattina | `fdf0e2` | 1.32 | `d2e2f2` | `b8d2ef` | 26 |
| 0.55 | Pomeriggio | `fdf1dc` | 1.28 | `d6e2f0` | `c0d8ee` | 22 |
| 0.75 | Tramonto | `ffd6ac` | 2.05 | `f6c9a6` | `fff2e0` | 8 |
| 0.88 | Crepuscolo | `c9a0d0` | 0.85 | `b094b4` | `b69cc4` | 3 |
| 1.00 | Notte | `8fa0dc` | 0.45 | `55608c` | `6d7aa8` | 2 |

Daytime intensities are deliberately low (1.28–1.32). They were 1.70–1.75 and
the midday scene was flat white.

**Fog is tinted with the horizon colour, not the sky colour.** Tint it with the
background and the far end of the street reads as a wall.

---

## 5. Sky

Not a solid `scene.background`. A `SphereGeometry` in `BackSide` with a
`ShaderMaterial` and three stops — warm at the horizon, magenta in the middle,
violet at the zenith — blended with `smoothstep` on normalised height.
`depthWrite: false`, `fog: false`, `renderOrder: -100`.

One colour never makes a sunset: what reads as depth is the *gap* between a warm
horizon and a cold zenith.

---

## 6. The composition pass

Outlines are **not** inflated duplicate meshes. `ink()` in the source is
deliberately a no-op — the outlines come from one composition pass, so they are
uniform by construction instead of by discipline.

Per frame:

1. **Prepass** — `scene.overrideMaterial = MeshNormalMaterial`, rendered into a
   target that carries a `DepthTexture`.
2. **Scene** — rendered into a HalfFloat target with MSAA.
3. **Bright pass** then a separable gaussian blur, for the bloom.
4. **Composite** — one GLSL1 shader that does outlines, bloom, ACES tone
   mapping, grade and vignette in a single pass.

The edge detector is a **Roberts cross on both depth and normals**:

```glsl
float edge = clamp(max(dE, nE * 0.85), 0.0, 1.0) * uOutline;
edge *= 1.0 - smoothstep(uFade * 0.55, uFade, dc);   // fades with distance
col   = mix(col, col * 0.20 + uInk * 0.05, edge);
```

Depth alone misses creases on a flat wall; normals alone miss silhouettes
against a distant object. You need both, and the depth term must be normalised
by distance or everything far away turns into a solid outline.

Tone mapping is **ACES Filmic**, exposure around 0.95. Without it every value
above 1 is clipped rather than compressed, and the characteristic symptom is
that dark surfaces look correct while only the bright ones blow out.

**Excluding things from the outline pass** is done with `THREE.Layers`: sprites,
points, lines, the sky dome and the water surface are put on **layer 1**, which
the normal prepass does not render. Leave the sky in and the horizon gets a
black line around it.

---

## 7. Materials: pick them darker than you want them

A material already light (`0xf0b8c8`) multiplied by a strong key goes out of
range whatever you do. The colour you choose is not the colour you see: it is
the colour *before* the light.

Rule of thumb: **if a surface must read light on screen, choose it medium in the
code.** The cherry blossom is `0xe88bab`, which looks too saturated in a colour
picker and correct in the render.

---

## 8. Textures: painted at load, never loaded

There is not a single image file in the repository. Every texture — roof tiles,
plaster, asphalt, concrete, gravel, the 2048×512 train livery with its lit
windows and passenger silhouettes — is painted onto a `<canvas>` at startup by
one helper:

```js
function CT(w, h, draw, rx, ry) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = MAXA;
  t.encoding = THREE.sRGBEncoding;    // painted on screen: must be decoded to linear
  if (rx) t.repeat.set(rx, ry || rx);
  return t;
}
```

That is why the whole game is 800 KB and needs no asset pipeline. It also means
UV scale is your responsibility: when geometry is merged, scale the UVs per
piece before merging or one wall will show tiles four times the size of its
neighbour.

**Normal maps are painted too, and they are not drawings.** The water normal map
is generated by summing sines into a height field and taking the *slope* at each
point by central differences — the colour of a normal map is the gradient, not a
picture of waves. It must **not** be flagged `sRGBEncoding`: it is data.

---

## 9. Water

`THREE.Water` from the r128 examples, vendored locally. It reflects the scene
with a mirror camera and distorts the reflection with the painted normal map.

Two changes were needed to stop it fighting the cel-shaded look, both made in
`vendor/Water.js`:

```glsl
float rf0 = 0.05;                                   // was 0.3
float reflectance = (rf0 + (1.0 - rf0) * pow(1.0 - theta, 5.0)) * 0.62;
vec3  albedo = mix((sunColor * diffuseLight * 0.3 + scatter * 2.4) * getShadowMask(), ...);
```

With the stock `rf0 = 0.3` the surface is a mirror even head-on, and at sunset
the pink sky erased the river completely. The water also needs its **own**
colour, tinted only partly by the sky, or it becomes a pink mirror in which the
river disappears. Its `waterColor` is driven from the day cycle each frame.

The newer libraries (Water Pro, Tidewater) are built on TSL and WebGPU and need
three.js r160+. On r128 they are not an option.

---

## 10. Character proportions

Shading is only half of the cartoon read; the other half is proportion.

- **Head-to-body ratio.** 6–6.5 heads is a realistic teenager; **4.5–5 is the
  cartoon register**. The residents sit at about 4.8. At 6 the silhouette
  dissolves at five metres. Scaling a whole figure down does not make a child —
  it makes a small adult. What changes with age is the *ratio*, so the builder
  takes five parameters: head size, shoulder width, torso girth, limb thickness
  and stoop.
- **Eyes sit at or just below the middle of the head**, not higher.
- **A sphere is not a head.** Narrow the lower half by moving vertices — leaving
  the UVs alone, so eyes and mouth do not move — and a jaw appears.
- **Joints must match the limb radius exactly.** A sphere fatter than the
  cylinder it joins reads as a ball bearing at every elbow.
- **No sharp edges on a body.** Box shoes were the only hard corners on the
  whole figure and they were the first thing the eye found.

---

## 11. Continuous geometry

Long structures — the viaduct deck, its parapets — are built as a **single
ribbon**: vertices are shared between one station and the next, so there are no
joints. Building them from one box per segment, each stretched slightly to avoid
gaps, produces a visible step at every joint on a slope. It reads as a
staircase, and adding more segments does not help — it adds more steps.

The same applies to embankments: one continuous sloped solid, sunk below ground
so its bottom is invisible, not a row of blocks of increasing height.

---

## 12. What to check after each step

- **textures** — can you read the stone on the road and the lattice on the
  facades? If not, the texture object is empty and everything is flat paint.
- **sky** — is there a gradient from bottom to top of frame, or one flat tone?
- **light** — do the shadowed facades have a cold cast, or are they grey?
- **tone mapping** — crop the brightest region: is it pure `255,255,255`? Then
  you are clipping.
- **materials** — are the colours you chose still recognisable after the light?
- **outlines** — count the meshes on layer 0; if it is fewer than total minus
  exclusions, you are skipping some.
- **motion** — for anything animated, freeze the camera, step the clock by hand
  and diff two frames. If under a few per cent of pixels change, it is not
  moving as much as you think.
