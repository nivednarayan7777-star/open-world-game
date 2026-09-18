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

Latest run: the game's ground renders at hue 113–115°, saturation 0.69, blob
contrast ~1.2 against the reference's 113–114°, 0.69–0.71 and ~1.26–1.45.
