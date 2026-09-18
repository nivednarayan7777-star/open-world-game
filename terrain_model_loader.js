/**
 * terrain_model_loader.js — loads the glTF landscape / rock model
 * provided at terrain_model.glb and integrates it into the world.
 *
 * The source file (Google Drive link) is a THREE.GLTFExporter r170
 * scene containing:
 *   • Landscape (mesh 0)  — ground slab
 *   • rock_01 … rock_05 instances (meshes 1-36)
 *   • sun / trees / water (meshes 37-41)
 *
 * Usage:
 *   import { loadTerrainModel } from './terrain_model_loader.js';
 *   loadTerrainModel(scene, root, () => { done; });
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const ROCK_NAMES = [
  "rock_01","rock_02","rock_03","rock_04","rock_05"
];

/** Load the model, place Landscape as ground, scatter rocks. */
export function loadTerrainModel(scene, root, onLoaded) {
  const loader = new GLTFLoader();
  loader.load(
    "terrain_model.glb",
    (gltf) => {
      const model = gltf.scene;
      // Ensure all materials are double-sided for terrain viewing
      model.traverse((o) => {
        if (o.isMesh) {
          if (o.material) {
            if (Array.isArray(o.material)) {
              o.material.forEach((m) => { if (m) m.side = THREE.DoubleSide; });
            } else {
              o.material.side = THREE.DoubleSide;
            }
          }
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });

      // 1. Landscape as ground replacement
      const landscape = model.getObjectByName("Landscape");
      if (landscape) {
        // Scale the small reference slab up to world size (~100 units)
        landscape.scale.set(30, 30, 15);
        landscape.position.set(0, -0.3, 0);
        // Keep the landscape visible but don’t block light
        landscape.receiveShadow = true;
        root.add(landscape);
      }

      // 2. Scatter rock instances across the world
      // The model includes explicit rock instances; we clone a curated set
      // and place them randomly within the world bounds used by world.js.
      const rockClones = [];
      ROCK_NAMES.forEach((base) => {
        // Find the first mesh with this base name (e.g. rock_01)
        const src = model.getObjectByName(base);
        if (src) {
          for (let i = 0; i < 4; i++) {
            const clone = src.clone(true);
            clone.name = base + "_scattered_" + i;
            const rx = (Math.random() - 0.5) * 70; // world width ~70
            const rz = (Math.random() - 0.5) * 70;
            const ry = 0.2 + Math.random() * 1.5; // slight height variation
            clone.position.set(rx, ry, rz);
            clone.rotation.set(
              Math.random() * Math.PI,
              Math.random() * Math.PI,
              Math.random() * Math.PI
            );
            const s = 0.8 + Math.random() * 1.2; // varied scale
            clone.scale.set(s, s, s);
            rockClones.push(clone);
            root.add(clone);
          }
        }
      });

      // 3. Add water plane from model (optional — keeps original water)
      const water = model.getObjectByName("water");
      if (water) {
        water.scale.set(20, 20, 20);
        water.position.set(0, -0.15, 0);
        root.add(water);
      }

      // 4. Sun / lighting (if the model brings its own sun mesh, ignore
      //    because Keralam already has a lighting rig; we just don’t add
      //    the sun mesh to root to avoid duplicate lights.)

      if (onLoaded) onLoaded({ model, landscape, rockClones, water });
    },
    undefined,
    (err) => {
      console.error("terrain_model.glb failed to load:", err);
      if (onLoaded) onLoaded({ error: err });
    }
  );
}
);
}
