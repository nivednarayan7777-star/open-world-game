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
];

const browser = await chromium.launch({
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
const errors = [];
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

const notes = [];
for (const [district, views] of SHOTS) {
  await page.evaluate((id) => window.__keralam.setDistrict(id), district);
  await page.waitForTimeout(2000);
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
}

fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ notes, errors }, null, 1));
console.log("errors:", errors.slice(0, 20));
await browser.close();
