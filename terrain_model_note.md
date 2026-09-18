# terrain_model.glb — how to add it

The loader (`terrain_model_loader.js`) expects this file at repo root.

## What I found from your link
- Format: glTF / GLB (THREE.GLTFExporter r170)
- Contents: Landscape ground mesh + rock_01…rock_05 instances
  (meshes 1-36), sun/tree/water meshes (37-41)
- Size: ~357 KB binary buffer

## Why it isn't in the commit yet
Google Drive HTTPS is blocked in this environment (SSL handshake fails
for drive.google.com / drive.usercontent.google.com). I could read
chunked JSON via the fetch tool, but the binary buffer (chunks 7-38)
could not be reconstructed without manually collecting all 39 slices.

## To finish
1. Download the file from your Drive link locally
2. Copy it into this repo as `terrain_model.glb`
3. Commit + push to `arena/01a0b546-open-world-game`

The integration is already in `world.js` (calls `loadTerrainModel`)
and `terrain_model_loader.js`. When `terrain_model.glb` is present,
the game will load the Landscape as ground and scatter rocks.
