/**
 * Visual QA harness: boots the game in headless Chromium (SwiftShader WebGL),
 * walks every district kind and screenshots the ground so the terrain can be
 * compared against the reference Blender scene.
 *
 * Usage: node .github/shots.mjs [outDir]
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const OUT = process.argv[2] || "probe/shots";
const URL = process.env.GAME_URL || "http://127.0.0.1:8080";
fs.mkdirSync(OUT, { recursive: true });

/** district id → list of [label, x, z, yaw, pitch] vantage points */
const SHOTS = [
  ["ekm", [
    ["spawn", null, null, 0.35, -0.18],
    ["inland", 20, 20, 2.2, -0.10],
    ["beach", -100, 10, 4.7, -0.06],
  ]],
  ["alpy", [
    ["spawn", null, null, 0.35, -0.18],
    ["backwater", -40, -30, 1.2, -0.05],
  ]],
  ["pta", [
    ["spawn", null, null, 0.35, -0.18],
    ["midland", 40, 0, 5.6, -0.05],
  ]],
  ["idk", [
    ["spawn", null, null, 0.35, -0.18],
    ["slopes", 60, 10, 3.0, 0.06],
    ["ridge", 120, 30, 4.0, 0.10],
  ]],
  ["kkd", [
    ["spawn", null, null, 0.35, -0.18],
    ["hills", 50, 40, 2.6, 0.04],
  ]],
  ["kollam", [
    ["spawn", null, null, 0.35, -0.18],
    ["backwater", -30, -20, 1.9, -0.05],
  ]],
  ["tsr", [
    ["spawn", null, null, 0.35, -0.18],
    ["inland", 60, -40, 3.6, 0.0],
  ]],
  ["wyd", [
    ["spawn", null, null, 0.35, -0.18],
    ["highland", 40, -30, 2.4, 0.06],
  ]],
];

const notes = [];
const errors = [];
let browser = null;
try {
browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on("console", (m) => {
  const t = m.text();
  if (m.type() === "error" || /error|exception/i.test(t)) errors.push(`[console] ${t}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => !!window.__keralam, null, { timeout: 60000 });
await page.fill("#name-in", "Shot");
await page.click("#btn-start");
await page.waitForFunction(() => window.__keralam?.state === "play", null, { timeout: 120000 });
// let the first district finish loading + a few animation frames
await page.waitForTimeout(2500);

for (const [district, views] of SHOTS) {
  await page.evaluate((id) => window.__keralam.setDistrict(id), district);
  await page.waitForTimeout(2000);
  const [startX, startZ] = await page.evaluate(() => {
    const s = window.__keralam.start || { x: 0, z: 0 };
    return [s.x, s.z];
  });
  for (const [label, x, z, yaw, pitch] of views) {
    await page.evaluate(([px, pz, y, p]) => {
      const k = window.__keralam;
      if (px != null) k.place(px, pz);
      k.look(y, p);
    }, [x, z, yaw, pitch]);
    await page.waitForTimeout(900);
    const file = path.join(OUT, `${district}-${label}.png`);
    await page.screenshot({ path: file });
    const info = await page.evaluate(() => {
      const k = window.__keralam;
      return {
        district: k.world?.root?.name,
        x: +k.player.x.toFixed(1),
        y: +k.player.y.toFixed(2),
        z: +k.player.z.toFixed(1),
        objects: k.scene.children.length,
      };
    });
    notes.push({ file, ...info });
    console.log("shot", file, JSON.stringify(info));
  }

  // The scenery kit's islands: the owner's hill-with-a-lake, seated in this
  // district's terrain. Three angles — from the shore looking at the hill, on
  // the hill itself looking around, and from the sea looking back at it.
  const islands = await page.evaluate(() => {
    const list = window.__keralam.world?.islands || [];
    return list.map((i) => ({ ...i.spec }));
  });
  for (const [n, isl] of islands.entries()) {
    const tag = `${district}-island${n}`;
    // Approach from the landward side and from the seaward side of z, so the
    // camera is always inside the map (the islands sit out near the edge).
    const views = [
      ["east", isl.x + isl.radius + 7, isl.z, null],     // from the land, looking waterward
      ["on", isl.x, isl.z, null],                        // standing on the island
      ["north", isl.x, isl.z - isl.radius - 9, null],    // from the sea, looking back
    ];
    for (const [label, px, pz, _] of views) {
      const placed = await page.evaluate(([x, z, cx, cz, on]) => {
        const k = window.__keralam;
        k.look(Math.atan2(cx - x, cz - z), on ? 0.02 : -0.06);
        const y = k.place(x, z);
        // The sea view can land in deep water off the map's edge, where the
        // camera sits under the sea floor; report the height so it can be skipped.
        return { y, water: k.WATER ?? 0.42 };
      }, [px, pz, isl.x, isl.z, label === "on"]);
      if (placed.y != null && placed.y < placed.water - 0.4) {
        console.log("skip (underwater)", tag, label, JSON.stringify(placed));
        continue;
      }
      // the camera eases toward the player; let it arrive before the shot
      await page.waitForTimeout(1800);
      const file = path.join(OUT, `${tag}-${label}.png`);
      await page.screenshot({ path: file });
      const info = await page.evaluate(() => {
        const k = window.__keralam;
        return { x: +k.player.x.toFixed(1), y: +k.player.y.toFixed(2), z: +k.player.z.toFixed(1) };
      });
      notes.push({ file, ...info });
      console.log("shot", file, JSON.stringify(info));
    }
  }

  // Ground swatches: everything but the ground slab hidden and the camera
  // pointed at it, so `compare_ground.py` can measure the ground's own colour
  // and mottling with no trees, buildings or HUD in the way.
  //
  //   near  — straight down, ~2.7 m of ground across the frame. Matched against
  //           the reference's top-down view (view_groundtop.png): colour,
  //           saturation, brightness and fine grain.
  //   far   — a normal walking eye-line. Matched against the reference's
  //           perspective views: the ~13 m blob pattern of the ramp.
  await page.evaluate((id) => window.__keralam.setDistrict(id), district);
  await page.waitForTimeout(1200);
  await page.evaluate(([px, pz, sx, sz]) => {
    const k = window.__keralam;
    // Always re-seat the player for the swatches: the island shots above leave
    // them on the island, and a swatch taken from there measures the sea.
    if (px != null) k.place(px, pz);
    else k.place(sx, sz);
  }, [views[0][1], views[0][2], startX, startZ]);
  await page.evaluate(() => window.__keralam.debugGroundOnly(true));
  const CLIP = { x: 240, y: 100, width: 800, height: 560 };
  for (const [tag, pitch] of [["near", -1.35], ["far", -0.32]]) {
    await page.evaluate((p) => window.__keralam.look(0.4, p), pitch);
    await page.waitForTimeout(700);
    const swatch = path.join(OUT, `ground-${district}-${tag}.png`);
    await page.screenshot({ path: swatch, clip: CLIP });
    console.log("swatch", swatch);
  }
  await page.evaluate(() => window.__keralam.debugGroundOnly(false));
}

} catch (err) {
  errors.push("FATAL " + (err && err.stack || err));
  console.error("FATAL", err);
} finally {
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ notes, errors }, null, 1));
  console.log("errors:", errors.slice(0, 20));
  if (browser) await browser.close().catch(() => {});
}
