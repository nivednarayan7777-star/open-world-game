# Keralam

A Kerala roleplay you open in a phone or computer browser. Walk, jobs, food, chat, 14 districts.

This Arena preview is **only for you while building**. Other people cannot keep using that link. To let them play, host the game (or run it on your computer).

## Fastest: friends on the same Wi‑Fi

On your computer, in this folder:

```bash
npm install
npm start
```

Then:

1. Find your computer’s local IP (Windows: `ipconfig`, Mac/Linux: `ifconfig` or `ip addr`). Example: `192.168.1.24`
2. Send friends `http://192.168.1.24:8080`
3. They open it in Chrome / Safari. Same Wi‑Fi, no extra apps.

You must leave the terminal running. When you close it, the game goes down.

## Anyone on the internet (a real link)

The game needs a small Node server (files + multiplayer chat). Free hosts that work:

- [Render](https://render.com) — New Web Service → connect a GitHub repo of this folder → start command `npm start`
- [Railway](https://railway.app) — New project → deploy this folder
- [Fly.io](https://fly.io)

Use **Node 18+**. The server already reads `PORT` (hosts set this for you).

After deploy you get a URL like `https://keralam.onrender.com`. Send that. Phone and PC both work. People who open it at the same time can see each other and chat.

### Put it on GitHub first

```bash
git init
git add .
git commit -m "Keralam"
```

Create a repo on GitHub, push, then connect that repo to Render/Railway.

Do **not** use GitHub Pages / Netlify alone if you want chat and saves on the server. Those are static-only. The `node server.js` process has to stay running.

## itch.io

Zip this whole folder, upload as **HTML** on [itch.io](https://itch.io). For chat/multiplayer, itch still needs the Node server, so a Render URL in the itch description is simpler than embedding.

## What players need

- A browser (Chrome or Safari)
- Internet (Three.js loads from a CDN)
- No install, no account

Each person types a **name** on the title screen. That name keeps their save.

## Controls

**Phone:** left stick walk · drag to look · Act / Jump / Run  
**Computer:** WASD · mouse look · E act · Tab menu · 1 walk · 2 scooter · 3 auto

## Terrain and ground

The ground is a port of the reference Blender scene the game was styled after
(a `.blend` the project owner supplied): a wide, gently rolling slab of smooth
shading whose entire look comes from one material —

    Texture Coordinate.Generated → Mapping
      → Musgrave (FBM, Scale 8.5, Detail 1.6, Dimension 0.6)
      → ColorRamp (B-spline, stops 0.0 / 0.2909 / 0.8591)
      → Principled BSDF (Roughness 1.0, Specular IOR Level 0)

No image textures at all: every bit of detail is that one green ramp, painted
as soft ~13 m blobs. `terrain.js` carries that recipe — the ramp's stops, the
Musgrave settings, the height shape and the shader that re-runs the recipe per
pixel in world space — and `world.js` builds the slab, its skirt, the grass and
the tea bushes from it. The blend's colours are used verbatim, then passed
through `BLEND_GRADE`: Keralam's warm sun + warm hemisphere + ACES tone mapping
render greens brighter and yellower than Blender's Cycles, so the palette is
pre-compensated for that measured shift.

### Checking the ground against the reference

The reference scene can be re-read straight out of the file, and the game can be
screenshotted headlessly, so "does it match?" is a measurement, not an opinion:

- `blend-probe` (Actions, or `bash .github/run_probe.sh` after
  `.github/fetch_blend.sh`) downloads the `.blend`, dumps its scene and node
  graphs into `probe/*.json` and renders it from several angles.
- `game-shots` (Actions) boots the game in headless Chromium, walks the
  districts, and takes ground swatches with every prop hidden.
- `.github/compare_ground.py` then compares the two sets of numbers (hue,
  saturation, value, patch contrast) and writes
  `probe/shots/ground_report.json`.

**Where the measurement stands.** `debugGroundOnly` looks for a mesh named
`ground` — which `world.js` never set, so the swatch pass was photographing an
empty scene and the numbers in `ground_report.json` (`null`) meant nothing. The
mesh is named now, and the first honest reading is: ground-only swatch — hue
65.1°, saturation 0.394, value 0.873 (near) and 64.8 / 0.392 / 0.874 (far),
against the reference's 113°, 0.694, 0.63. So the game's own ground is still
lighter and yellower than the reference's; the palette it renders (unchanged by
the scenery kit, which only adds the `island` / `island-lake` cases) is a set of
pale yellow-greens. Closing that gap is a change to `buildWorld`'s palette, and
it would move every district, so it is left as the next piece of this goal
rather than smuggled in with the kit.

## The scenery kit (islands, rocks, conifers)

A second reference file — a low-poly scenery kit the project owner supplied
(`Low Poly Scenery Hills and Lake.glb`) — is part of the terrain now:

- **What it holds.** A slab of land 2.75 × 2.5 units with a hill (0.53 units
  tall) and a bowl holding a lake, five shapes of rock (40 flat-shaded triangles
  each, mirrored and scaled into the 36 boulders the kit ships) and three
  conifers (464 triangles each). Every shape is faceted, which is the kit's
  whole character. The file also carries a stray default cube and a star-shaped
  "sun", which the baker drops.
- **How it gets in.** `.github/bake_scenery.mjs` reads the `.glb` (glTF binary:
  JSON chunk + BIN chunk, no textures), welds the vertices, de-duplicates the
  shapes, replaces the slab's paper-thin skirt with a deep one, clips the kit's
  sheet of sea down to the lake actually visible in the bowl, bakes a 65 × 65
  height field of the slab, quantises everything to int16 and writes
  `scenery-data.js` (68 KB, committed — the game never fetches anything).
  The file measures height in z (the lake sheet is 0.012 thick there, the
  conifers are 1.14 tall there), so the baker rotates it into the game's Y-up
  axes, `(x, y, z) → (x, z, −y)`, before it measures anything.
- **How it is placed.** `scenery.js` rebuilds the geometry and `world.js` seats
  it: each district is given up to two islands — off the beach in coastal and
  backwater districts, on the slopes in the highlands — chosen from candidates
  that clear the district's own places, with the same placement every build.
  The surrounding terrain is *blended* up to each island's rim, so the slab is
  buried rather than floating: no seam, no step, and the hill simply rises out
  of the ground. The island's own height field then takes over underfoot, so the
  hill is walkable and the lake is a pool you can swim in (it joins `fishSpots`,
  so the game's fishing and swimming already work there).
- **And on the ground itself.** The kit's rocks and conifers are scattered
  across every district as well — boulders on banks and hillsides, conifers in
  stands above the village, never in the water, on a road or in a lake.

Painted with the game's own ground palette, so an island reads as part of
Keralam's terrain rather than a model dropped on it: green on the hill, sand at
the waterline, the lake bed darker, the kit's grey on steep faces, and the
conifers' own dark-to-light tiers.
