import * as THREE from "three";
import { buildWorld, heightAt, surfaceY, WATER, SIZE, placeName, LANDMARKS, ROADS, setDistrict, disposeWorld, CURRENT } from "./world.js";
import { DISTRICTS } from "./districts.js";
import { startAudio, setAmbience, bell, click } from "./audio.js";
import { createHuman, animateHuman } from "./character.js";
import { ITEMS, VEHICLES, ACTIVITIES, pickFish, MENU, JOBS, jobById } from "./content.js";
import { buildMini as buildJobMini, tickMini as tickJobMini, miniPointer, JOB_KIND } from "./minigames.js";
import { makeAuto, makeScooter } from "./vehicles.js";

const TOUCH = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 1;
const $ = (id) => document.getElementById(id);
const canvas = $("c");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.35 : 1.85));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 520);
const clock = new THREE.Clock();

let world;
let state = "title";
let panel = null;
let sideOpen = false;
let vehicle = "walk";
let yaw = 0.35, pitch = -0.28;
let vy = 0, grounded = true, swimming = false;
const player = { x: -74, y: 2, z: 12, speed: 0 };
const keys = {};
const bag = {};
let money = 80;
let hunger = 72;
let saveAcc = 0;
let shopOn = null;
let work = null;
let earnAcc = 0;
let hour = 10.4;
let rainAmt = 0.08;
let interact = null;
let sitting = false;
let fishing = false;
let fishingT = 0;
const joy = { x: 0, y: 0 };
let myName = "Wanderer";
let yawLook = 0;

const skins = [
  { skin: 0xc68642, shirt: 0x3a6a88, pants: 0x2c3a4a, hair: 0x1a1210 },
  { skin: 0xb07a4a, shirt: 0xf0e6d0, pants: 0x1a1a1a, hair: 0x1a1410 },
  { skin: 0xc09060, shirt: 0x2d6a3a, pants: 0x3a2a20, hair: 0x1a1010 },
];

function nametag(text) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(10,16,14,0.72)";
  g.fillRect(18, 18, 220, 30);
  g.strokeStyle = "rgba(212,160,23,0.55)";
  g.strokeRect(18, 18, 220, 30);
  g.fillStyle = "#f4ead5";
  g.font = "18px Karla, sans-serif";
  g.textAlign = "center";
  g.fillText(text, 128, 40);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  spr.scale.set(1.15, 0.28, 1);
  spr.position.y = 2.12;
  spr.userData.canvas = c;
  return spr;
}

function setNametag(spr, text) {
  const c = spr.userData.canvas;
  if (!c) return;
  const g = c.getContext("2d");
  g.clearRect(0, 0, 256, 64);
  g.fillStyle = "rgba(10,16,14,0.72)";
  g.fillRect(18, 18, 220, 30);
  g.strokeStyle = "rgba(212,160,23,0.55)";
  g.strokeRect(18, 18, 220, 30);
  g.fillStyle = "#f4ead5";
  g.font = "18px Karla, sans-serif";
  g.textAlign = "center";
  g.fillText(text.slice(0, 18), 128, 40);
  spr.material.map.needsUpdate = true;
}

const me = createHuman(skins[0]);
const meTag = nametag(myName);
me.add(meTag);
scene.add(me);

const autoMesh = makeAuto();
const scooterMesh = makeScooter();
autoMesh.visible = false;
scooterMesh.visible = false;
scene.add(autoMesh, scooterMesh);

const remotes = new Map();
const localId = Math.random().toString(36).slice(2, 9);
let ws = null;
let bc = null;
let netAcc = 0;
let onlineN = 1;

function toast(text, sub = "") {
  $("toast-text").textContent = text;
  $("toast-sub").textContent = sub;
  $("toast").classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => $("toast").classList.remove("show"), 2800);
}

function give(id, n = 1) {
  bag[id] = (bag[id] || 0) + n;
  const it = ITEMS[id];
  if (it) toast(it.name);
  persist();
}

function stats() {
  const m = $("hud-money");
  const f = $("hud-food");
  if (m) m.textContent = "₹" + Math.floor(money);
  if (f) f.textContent = String(Math.max(0, Math.floor(hunger)));
  const sc = $("shop-cash");
  if (sc) sc.textContent = "₹" + Math.floor(money);
}

function renderInv() {
  const g = $("inv-grid");
  const ids = Object.keys(bag).filter((k) => bag[k] > 0);
  g.innerHTML = ids.map((id) => {
    const it = ITEMS[id] || { ico: "•", name: id, desc: "" };
    return `<div class="inv-item"><div class="ico">${it.ico}</div><b>${it.name}</b><div style="opacity:.7;margin-top:4px">×${bag[id]}</div></div>`;
  }).join("") || `<div class="inv-item empty">Empty.</div>`;
}

function drawMap(ctx, w, h, mini) {
  ctx.fillStyle = "#0b1a16";
  ctx.fillRect(0, 0, w, h);
  const s = w / SIZE;
  const toX = (x) => (x + SIZE / 2) * s;
  const toY = (z) => (z + SIZE / 2) * s;
  ctx.fillStyle = "#1a4a4a";
  ctx.fillRect(0, 0, w * 0.3, h);
  ctx.fillStyle = "#2d6a28";
  ctx.fillRect(w * 0.28, 0, w * 0.4, h);
  ctx.fillStyle = "#3d8a28";
  ctx.fillRect(w * 0.62, 0, w, h);
  ctx.fillStyle = "#163a22";
  ctx.fillRect(w * 0.4, 0, w * 0.5, h * 0.28);
  ctx.fillStyle = "#c8b56a";
  ctx.fillRect(w * 0.18, 0, w * 0.12, h);
  ctx.strokeStyle = "#8a6e4b";
  ctx.lineWidth = mini ? 2 : 3.5;
  ctx.lineJoin = "round";
  for (const path of ROADS) {
    ctx.beginPath();
    for (let i = 0; i < path.length; i++) {
      const px = toX(path[i][0]), py = toY(path[i][1]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  if (!mini) {
    ctx.fillStyle = "#d4a017";
    ctx.font = "11px Karla";
    for (const L of LANDMARKS) {
      ctx.fillRect(toX(L.x) - 2, toY(L.z) - 2, 4, 4);
      ctx.fillText(L.name, toX(L.x) + 6, toY(L.z) + 4);
    }
  } else {
    ctx.fillStyle = "#d4a017";
    for (const L of LANDMARKS) ctx.fillRect(toX(L.x) - 1, toY(L.z) - 1, 2, 2);
  }
  ctx.fillStyle = "#f4ead5";
  ctx.beginPath();
  ctx.arc(toX(player.x), toY(player.z), mini ? 3 : 5, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = "#c45c26";
  ctx.beginPath();
  ctx.moveTo(toX(player.x), toY(player.z));
  ctx.lineTo(toX(player.x + Math.sin(yaw) * 12), toY(player.z + Math.cos(yaw) * 12));
  ctx.stroke();
  ctx.fillStyle = "#7ec4ef";
  for (const r of remotes.values()) {
    ctx.beginPath();
    ctx.arc(toX(r.x), toY(r.z), mini ? 2 : 4, 0, 6.3);
    ctx.fill();
  }
}

function discover() {
  const p = placeName(player.x, player.z);
  $("hud-place").textContent = p.name;
  $("hud-region").textContent = CURRENT?.name || "Kerala";
}

function setSky(dt) {
  hour = (hour + dt * 0.1) % 24;
  const h = hour;
  let sky, fog, sunC, sunI, hemiI, ambI, rainWant;
  if (h > 5.5 && h < 7.5) {
    const t = (h - 5.5) / 2;
    sky = new THREE.Color(0xff8a65).lerp(new THREE.Color(0x7ec4ef), t);
    fog = sky; sunC = new THREE.Color(0xff9966); sunI = 0.8 + t * 1.2; hemiI = 0.6; ambI = 0.3; rainWant = 0.05;
  } else if (h < 17) {
    sky = new THREE.Color(0x7ec4ef);
    fog = new THREE.Color(0x9ec9e8); sunC = new THREE.Color(0xfff3d6); sunI = 2.15; hemiI = 1.15; ambI = 0.45; rainWant = 0.06;
  } else if (h < 19) {
    const t = (h - 17) / 2;
    sky = new THREE.Color(0x7ec4ef).lerp(new THREE.Color(0x2a1a38), t);
    fog = sky; sunC = new THREE.Color(0xff7744); sunI = 1.4 - t * 1.1; hemiI = 0.7; ambI = 0.3; rainWant = 0.12;
  } else {
    sky = new THREE.Color(0x0b1420);
    fog = new THREE.Color(0x0a1218); sunC = new THREE.Color(0x8899bb); sunI = 0.1; hemiI = 0.22; ambI = 0.38; rainWant = 0.18;
  }
  scene.background.copy(sky);
  scene.fog.color.copy(fog);
  world.sun.color.copy(sunC);
  world.sun.intensity = sunI;
  world.hemi.intensity = hemiI;
  world.lamp.intensity = ambI;
  const ang = ((h - 6) / 12) * Math.PI;
  world.sun.position.set(Math.cos(ang) * 120, Math.sin(ang) * 110 + 16, 50);
  if (world.sky) world.sky.material.uniforms.sunPosition.value.copy(world.sun.position);
  rainAmt += (rainWant - rainAmt) * dt * 0.25;
  const night = h >= 19 || h < 5.5;
  for (const L of world.nightLights) L.intensity = night ? 1.4 : 0;
  world.flies.material.opacity = night ? 0.9 : 0;
  const nearSea = player.x < -80;
  const wind = 0.55 + Math.sin(hour * 0.4) * 0.25;
  if (world.uWind) world.uWind.value = 0.7 + wind;
  setAmbience({ rain: 0.08 + rainAmt * 0.22, waves: nearSea ? 0.12 : 0.03, pad: night ? 0.05 : 0.07, wind: 0.05 + wind * 0.08 });
  const names = h < 5 ? "Night" : h < 7 ? "Dawn" : h < 12 ? "Morning" : h < 17 ? "Afternoon" : h < 19 ? "Dusk" : "Night";
  $("hud-time").textContent = names;
}

function collide(x, z) {
  const half = SIZE / 2 - 6;
  x = Math.max(-half, Math.min(half, x));
  z = Math.max(-half, Math.min(half, z));
  const pr = vehicle === "auto" ? 1.1 : vehicle === "scooter" ? 0.7 : 0.55;
  const list = world.colliders || [];
  for (let pass = 0; pass < 3; pass++) {
    for (const c of list) {
      if (c.hw != null) {
        const dx = x - c.x, dz = z - c.z;
        const cos = Math.cos(c.rot || 0), sin = Math.sin(c.rot || 0);
        let lx = dx * cos - dz * sin;
        let lz = dx * sin + dz * cos;
        const hw = c.hw + pr, hd = c.hd + pr;
        if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) {
          const ox = hw - Math.abs(lx);
          const oz = hd - Math.abs(lz);
          if (ox < oz) lx = Math.sign(lx || 1) * hw;
          else lz = Math.sign(lz || 1) * hd;
          x = c.x + lx * cos + lz * sin;
          z = c.z - lx * sin + lz * cos;
        }
      } else if (c.r) {
        const dx = x - c.x, dz = z - c.z;
        const need = c.r + pr;
        const d = Math.hypot(dx, dz);
        if (d < need && d > 1e-5) {
          const psh = need / d;
          x = c.x + dx * psh;
          z = c.z + dz * psh;
        }
      }
    }
  }
  x = Math.max(-half, Math.min(half, x));
  z = Math.max(-half, Math.min(half, z));
  return { x, z };
}

function tryStep(nx, nz) {
  const c = collide(nx, nz);
  const y1 = surfaceY(c.x, c.z, world.docks);
  if (grounded && !swimming && y1 - player.y > 1.15) return null;
  return c;
}

function nearFish() {
  for (const s of world?.fishSpots || []) {
    if (Math.hypot(player.x - s.x, player.z - s.z) < (s.r || 5) + 1.4) return s;
  }
  return null;
}

function nearShop() {
  for (const s of world?.shops || []) {
    if (Math.hypot(player.x - s.x, player.z - s.z) < s.r) return s;
  }
  return null;
}

function nearJob() {
  for (const j of world?.jobs || []) {
    if (Math.hypot(player.x - j.x, player.z - j.z) < j.r) return j;
  }
  return null;
}

function openShop(s) {
  shopOn = s;
  $("shop-title").textContent = s.title;
  const list = $("shop-list");
  if (s.kind === "market") {
    const rows = Object.keys(bag).filter((id) => ITEMS[id]?.sell && bag[id] > 0);
    list.innerHTML = rows.length
      ? rows.map((id) => {
          const it = ITEMS[id];
          return `<button type="button" class="shop-row" data-sell="${id}"><span>${it.ico} ${it.name} ×${bag[id]}</span><small>₹${it.sell}</small></button>`;
        }).join("")
      : `<div class="shop-row" style="cursor:default">No fish to sell</div>`;
  } else {
    const menu = MENU[s.kind] || MENU.chaya;
    list.innerHTML = menu.map((f) =>
      `<button type="button" class="shop-row" data-buy="${f.id}"><span>${f.name}</span><small>₹${f.price}</small></button>`
    ).join("");
  }
  $("shop").hidden = false;
  stats();
}

function closeShop() {
  shopOn = null;
  $("shop").hidden = true;
}

function buyFood(id) {
  if (!shopOn) return;
  const menu = MENU[shopOn.kind] || [];
  const f = menu.find((x) => x.id === id);
  if (!f) return;
  if (money < f.price) { toast("No money"); return; }
  money -= f.price;
  hunger = Math.min(100, hunger + f.food);
  toast(f.name);
  stats();
  persist();
}

function sellFish(id) {
  const it = ITEMS[id];
  if (!it?.sell || !bag[id]) return;
  bag[id] -= 1;
  if (bag[id] <= 0) delete bag[id];
  money += it.sell;
  toast("₹" + it.sell);
  stats();
  persist();
  if (shopOn) openShop(shopOn);
}

function mgCount() {
  if (!work) return;
  const n = work.need || 1;
  const fill = $("mg-fill");
  const count = $("mg-count");
  if (work.game === "slider") {
    if (count) count.textContent = "Hold the middle";
    if (fill) fill.style.width = Math.min(100, (work.hold / 2.5) * 100) + "%";
    return;
  }
  if (work.game === "climb" && work.phase === "cut") {
    if (count) count.textContent = "Swipe to cut";
    if (fill) fill.style.width = "90%";
    return;
  }
  if (count) count.textContent = `${Math.min(work.got, n)} / ${n}`;
  if (fill) fill.style.width = Math.min(100, (work.got / n) * 100) + "%";
}

function openMini() {
  if (!work) return;
  $("mg-job").textContent = work.name;
  $("mg-hint").textContent = work.hint || "Play";
  $("minigame").hidden = false;
  buildJobMini(work, $("mg-stage"));
  mgCount();
}

function closeMini(won) {
  const pay = work?.pay || 0;
  $("minigame").hidden = true;
  const st = $("mg-stage");
  if (st) st.innerHTML = "";
  sitting = false;
  work = null;
  if (won) {
    money += pay;
    toast("₹" + pay);
    stats();
    persist();
  }
}

function finishMini(won) {
  if (!work) return;
  closeMini(won);
}

function hitMini() {}

function tickMini(dt) {
  if (!work) return;
  tickJobMini(work, dt);
  if (work._win) { finishMini(true); return; }
  if (work._fail) { toast(work._fail); finishMini(false); return; }
  mgCount();
}

function startWork(spot) {
  const J = jobById(spot.id);
  if (!J || work) return;
  sitting = true;
  document.exitPointerLock?.();
  if (shopOn) closeShop();
  work = {
    ...J,
    game: J.game || "pour",
    need: J.need || 3,
    got: 0,
    miss: 0,
    t: 0,
    hold: 0,
    items: [],
  };
  openMini();
}

function tickWork(dt) {
  tickMini(dt);
}

function hopTo(x, z) {
  if (vehicle === "boat") setVehicle("walk");
  player.x = x;
  player.z = z;
  player.y = surfaceY(x, z, world.docks);
  vy = 0;
  if (vehicle === "auto") autoMesh.position.set(player.x, player.y, player.z);
  if (vehicle === "scooter") scooterMesh.position.set(player.x, player.y, player.z);
}

function placeKindForJob(id) {
  const k = JOB_KIND[id];
  if (id === "cleaner") return ["beach", "drivein"];
  if (id === "fisher") return ["pond", "lake"];
  return k ? [k] : [];
}

function districtHasJob(dist, id) {
  if (id === "coconut") return true;
  const kinds = placeKindForJob(id);
  return (dist.places || []).some((p) => kinds.includes(p.kind));
}

function travelToJob(id) {
  const J = jobById(id);
  if (!J || !world) return;
  openSide(false);
  let spot = (world.jobs || []).find((j) => j.id === id);
  if (!spot) {
    const d = DISTRICTS.find((D) => districtHasJob(D, id));
    if (d && d.id !== CURRENT.id) loadDistrict(d.id);
    spot = (world.jobs || []).find((j) => j.id === id);
  }
  if (!spot) {
    toast(J.name, "Not on this map");
    return;
  }
  hopTo(spot.x, spot.z);
  toast(J.name);
}

function tickShop() {
  const s = nearShop();
  if (s) {
    if (!shopOn || shopOn.x !== s.x || shopOn.z !== s.z) openShop(s);
  } else if (shopOn) closeShop();
}

function nearest() {
  let best = null, bd = 4.2;
  if (vehicle === "boat") best = { type: "exitboat", label: "Step onto the bank" };
  else if (vehicle === "auto" || vehicle === "scooter") {
    best = { type: "exitveh", label: `Park the ${vehicle === "auto" ? "auto" : "scooter"}` };
  } else {
    const b = world.playerBoat;
    if (b) {
      const d = Math.hypot(player.x - b.position.x, player.z - b.position.z);
      if (d < 4.5 && d < bd) { bd = d; best = { type: "boat", label: "Board the houseboat" }; }
    }
    const dA = Math.hypot(player.x - autoMesh.position.x, player.z - autoMesh.position.z);
    if (autoMesh.visible && dA < 3.2 && dA < bd) { bd = dA; best = { type: "auto", label: "Ride the auto" }; }
    const dS = Math.hypot(player.x - scooterMesh.position.x, player.z - scooterMesh.position.z);
    if (scooterMesh.visible && dS < 2.6 && dS < bd) { bd = dS; best = { type: "scooter", label: "Hop on the scooter" }; }
    const L = world.lighthouse;
    if (L && Math.hypot(player.x - L.x, player.z - L.z) < 4.5) {
      best = { type: "climb", label: "Climb the lighthouse" };
    }
    if (!best && nearFish() && !fishing) best = { type: "fish", label: "Fish" };
    const j = nearJob();
    if (j && !work) {
      const J = jobById(j.id);
      if (J) best = { type: "job", job: j, label: J.name };
    }
  }
  if (fishing) best = { type: "fishing", label: "…" };
  interact = best;
  const pr = $("prompt");
  if (best && state === "play" && !sideOpen && !work) {
    $("prompt-text").textContent = best.label;
    pr.classList.add("show");
  } else pr.classList.remove("show");
}

function climbLight() {
  const L = world?.lighthouse;
  if (!L) { toast("No lighthouse"); return; }
  vehicle = "walk";
  player.x = L.x;
  player.z = L.z;
  player.y = world.lighthouseTop || 22;
  vy = 0;
  toast("Lighthouse");
}

function parkLand(mesh, x, z, rot) {
  mesh.visible = true;
  mesh.position.set(x, surfaceY(x, z, world.docks), z);
  mesh.rotation.y = rot || 0;
}

function setVehicle(kind, opts = {}) {
  if (kind === vehicle && !opts.force) return;
  const prev = vehicle;
  if (prev === "boat" && world.playerBoat) {
    const b = world.playerBoat;
    player.x = b.position.x + 3;
    player.z = b.position.z;
  }
  if (prev === "auto") parkLand(autoMesh, player.x + 2.2, player.z, autoMesh.rotation.y);
  if (prev === "scooter") parkLand(scooterMesh, player.x + 1.4, player.z, scooterMesh.rotation.y);

  vehicle = kind;
  sitting = false;
  fishing = false;

  if (kind === "walk") {
    toast("Walk");
  } else if (kind === "auto") {
    if (!opts.keepPos) {
      autoMesh.position.set(player.x, surfaceY(player.x, player.z, world.docks), player.z);
    }
    autoMesh.visible = true;
    autoMesh.rotation.y = me.rotation.y;
    toast("Auto");
  } else if (kind === "scooter") {
    if (!opts.keepPos) {
      scooterMesh.position.set(player.x, surfaceY(player.x, player.z, world.docks), player.z);
    }
    scooterMesh.visible = true;
    scooterMesh.rotation.y = me.rotation.y;
    toast("Scooter");
  } else if (kind === "boat") {
    const b = world.playerBoat;
    if (!b) return;
    const gh = heightAt(player.x, player.z);
    if (gh > WATER + 1.4 && !opts.force) {
      player.x = b.position.x;
      player.z = b.position.z;
    } else if (gh <= WATER + 1.4) {
      b.position.x = player.x;
      b.position.z = player.z;
    }
    toast("Boat");
  }
  markVehicle();
}

function startFish() {
  if (vehicle !== "walk" || fishing) return;
  if (!nearFish()) {
    toast("Find a pond");
    return;
  }
  fishing = true;
  sitting = true;
  fishingT = 2.2 + Math.random() * 2.4;
  toast("Fishing");
}

function finishFish() {
  fishing = false;
  sitting = false;
  const id = pickFish();
  give(id);
}

function doInteract() {
  if (work) { hitMini(); return; }
  if (fishing) return;
  if (!interact) {
    if (nearFish() && vehicle === "walk") startFish();
    return;
  }
  if (interact.type === "boat") setVehicle("boat", { keepPos: true });
  else if (interact.type === "exitboat") setVehicle("walk");
  else if (interact.type === "auto") setVehicle("auto", { keepPos: true, force: true });
  else if (interact.type === "scooter") setVehicle("scooter", { keepPos: true, force: true });
  else if (interact.type === "exitveh") setVehicle("walk");
  else if (interact.type === "climb") climbLight();
  else if (interact.type === "fish") startFish();
  else if (interact.type === "job") startWork(interact.job);
}

function togglePanel(id) {
  const el = $(id);
  if (panel === id) {
    el.classList.remove("show");
    panel = null;
    state = "play";
    return;
  }
  if (panel) $(panel).classList.remove("show");
  if (id === "inventory") renderInv();
  if (id === "map-panel") {
    const c = $("map-canvas");
    drawMap(c.getContext("2d"), c.width, c.height, false);
  }
  el.classList.add("show");
  panel = id;
  state = "panel";
  document.exitPointerLock?.();
}

function closePanels() {
  ["pause", "inventory", "map-panel"].forEach((id) => $(id).classList.remove("show"));
  panel = null;
  if (state === "panel") state = "play";
}

function openSide(on) {
  sideOpen = on;
  $("sidebar").classList.toggle("open", on);
  $("sidebar").setAttribute("aria-hidden", on ? "false" : "true");
  if (on) document.exitPointerLock?.();
}

function typing() {
  const a = document.activeElement;
  return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA");
}

function driveLand(mesh, dt, spd) {
  if (keys["a"] || keys["arrowleft"]) mesh.rotation.y += dt * 1.7;
  if (keys["d"] || keys["arrowright"]) mesh.rotation.y -= dt * 1.7;
  mesh.rotation.y += joy.x * dt * 1.8;
  const fwd = new THREE.Vector3(Math.sin(mesh.rotation.y), 0, Math.cos(mesh.rotation.y));
  let v = 0;
  if (keys["w"] || keys["arrowup"]) v = spd;
  if (keys["s"] || keys["arrowdown"]) v = -spd * 0.55;
  v += -joy.y * spd;
  if (v) {
    const nx = player.x + fwd.x * v * dt;
    const nz = player.z + fwd.z * v * dt;
    const sx = tryStep(nx, player.z);
    if (sx) player.x = sx.x;
    const sz = tryStep(player.x, nz);
    if (sz) player.z = sz.z;
  }
  const gnd = surfaceY(player.x, player.z, world.docks);
  player.y = gnd;
  mesh.position.set(player.x, gnd, player.z);
  me.rotation.y = mesh.rotation.y;
  player.speed = Math.abs(v);
  vy = 0;
  grounded = true;
  swimming = false;
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  if (world?.water) world.water.material.uniforms.uTime.value = t;
  if (world?.uTime) world.uTime.value = t;
  if (world?.uPlayer) world.uPlayer.value.set(player.x, player.y, player.z);
  if (world?.sway) {
    for (const m of world.sway) {
      const w = m.userData.wind;
      if (!w) continue;
      const a = Math.sin(t * w.spd + w.ph) * w.amp;
      // island trees hang off the island group, so their own position is local
      const wx = w.wx !== undefined ? w.wx : m.position.x;
      const wz = w.wz !== undefined ? w.wz : m.position.z;
      const d = Math.hypot(wx - player.x, wz - player.z);
      const touch = Math.max(0, 1 - d / 3.5);
      m.rotation.z = a + touch * 0.18;
      m.rotation.x = Math.cos(t * w.spd * 0.65 + w.ph) * w.amp * 0.45 + touch * 0.1;
    }
  }
  if (world?.clouds) {
    world.clouds.position.x = Math.sin(t * 0.02) * 18;
    world.clouds.position.z = Math.cos(t * 0.015) * 12;
  }
  function driftLeaves(mesh, dt, t, speed) {
    if (!mesh) return;
    mesh.position.set(player.x, player.y + 4, player.z);
    const lp = mesh.geometry.attributes.position;
    for (let i = 0; i < lp.count; i++) {
      let x = lp.getX(i) + dt * speed;
      let y = lp.getY(i) - dt * 1.6;
      let z = lp.getZ(i) + Math.sin(t + i) * dt * 1.4;
      if (y < 0) { y = 12; x = (Math.random() - 0.5) * 80; z = (Math.random() - 0.5) * 80; }
      if (x > 45) x = -45;
      lp.setXYZ(i, x, y, z);
    }
    lp.needsUpdate = true;
  }
  driftLeaves(world?.leaves, dt, t, 2.8);
  driftLeaves(world?.leaflets, dt, t, 2.1);

  if (world && (state === "play" || state === "panel")) {
    setSky(dt);
    if (world.rain) {
      world.rain.position.set(player.x, player.y, player.z);
      const pos = world.rain.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - (18 + rainAmt * 22) * dt;
        if (y < 0) y = 26;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      world.rain.material.opacity = rainAmt < 0.14 ? 0 : 0.2 + rainAmt * 0.5;
    }
    if (world.flies && (hour >= 19 || hour < 5.5)) {
      const fp = world.flies.geometry.attributes.position;
      for (let i = 0; i < fp.count; i++) {
        fp.setX(i, fp.getX(i) + Math.sin(t + i) * 0.01);
        fp.setY(i, 1.5 + Math.abs(Math.sin(t * 0.7 + i)) * 2.2);
      }
      fp.needsUpdate = true;
    }
  }

  if (world && state === "play" && !sideOpen && !fishing) {
    const inBoat = vehicle === "boat";
    const driving = vehicle === "auto" || vehicle === "scooter";
    const sprint = keys["shift"] && !swimming && vehicle === "walk";
    const tired = hunger < 18 ? 0.58 : 1;
    const spd = vehicle === "walk" ? (swimming ? 3.6 : sprint ? 11.5 : 6.6) * tired : 0;
    const camF = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const camR = new THREE.Vector3(camF.z, 0, -camF.x);
    let mx = 0, mz = 0;
    if (!sitting && vehicle === "walk") {
      if (keys["w"] || keys["arrowup"]) { mx += camF.x; mz += camF.z; }
      if (keys["s"] || keys["arrowdown"]) { mx -= camF.x; mz -= camF.z; }
      if (keys["a"] || keys["arrowleft"]) { mx -= camR.x; mz -= camR.z; }
      if (keys["d"] || keys["arrowright"]) { mx += camR.x; mz += camR.z; }
      if (joy.x || joy.y) {
        mx += camF.x * -joy.y + camR.x * -joy.x;
        mz += camF.z * -joy.y + camR.z * -joy.x;
      }
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; yawLook = Math.atan2(mx, mz); }
    if (ml > 0 && vehicle === "walk") {
      const nx = player.x + mx * spd * dt;
      const nz = player.z + mz * spd * dt;
      const sx = tryStep(nx, player.z);
      if (sx) player.x = sx.x;
      const sz = tryStep(player.x, nz);
      if (sz) player.z = sz.z;
      me.rotation.y = Math.atan2(mx, mz);
    }
    if (vehicle === "walk") player.speed = ml * spd;

    if (inBoat) {
      const b = world.playerBoat;
      if (keys["a"] || keys["arrowleft"]) b.rotation.y += dt * 1.5;
      if (keys["d"] || keys["arrowright"]) b.rotation.y -= dt * 1.5;
      b.rotation.y += joy.x * dt * 1.6;
      const fwd = new THREE.Vector3(Math.sin(b.rotation.y), 0, Math.cos(b.rotation.y));
      let v = 0;
      if (keys["w"] || keys["arrowup"]) v = 8;
      if (keys["s"] || keys["arrowdown"]) v = -5;
      v += -joy.y * 8;
      const nx = b.position.x + fwd.x * v * dt;
      const nz = b.position.z + fwd.z * v * dt;
      const gh = heightAt(nx, nz);
      if (gh < WATER + 1.2) {
        b.position.x = nx; b.position.z = nz;
      }
      b.position.y = WATER + 0.12 + Math.sin(t * 1.4) * 0.05;
      player.x = b.position.x;
      player.z = b.position.z;
      player.y = WATER + 0.85;
      me.rotation.y = b.rotation.y;
      vy = 0;
      player.speed = Math.abs(v);
    } else if (driving) {
      if (vehicle === "auto") driveLand(autoMesh, dt, 14);
      else driveLand(scooterMesh, dt, 16);
    } else {
      const gnd = surfaceY(player.x, player.z, world.docks);
      let pond = null;
      for (const s of world.fishSpots || []) {
        if (Math.hypot(player.x - s.x, player.z - s.z) < Math.max(1.5, (s.r || 5) - 1.15)) {
          pond = s;
          break;
        }
      }
      swimming = !!pond;
      if (swimming) {
        const swimY = (pond.y != null ? pond.y : gnd) - 0.7;
        vy -= 11 * dt;
        vy *= Math.max(0, 1 - 2.4 * dt);
        player.y += vy * dt;
        if (player.y < swimY) { player.y = swimY; vy = 0; }
        grounded = false;
      } else {
        vy -= 24 * dt;
        player.y += vy * dt;
        if (player.y <= gnd) { player.y = gnd; vy = 0; grounded = true; }
        else grounded = false;
      }
    }

    const seated = sitting || vehicle !== "walk";
    animateHuman(me, player.speed > 0.2 && !seated, t, swimming, seated);
    me.position.set(player.x, player.y, player.z);

    const dist = vehicle === "auto" ? 13.5 : 11.2, hgt = 4.8;
    const off = new THREE.Vector3(
      -Math.sin(yaw) * dist * Math.cos(pitch),
      hgt - Math.sin(pitch) * 7,
      -Math.cos(yaw) * dist * Math.cos(pitch)
    );
    const targetCam = new THREE.Vector3(player.x, player.y + 1.1, player.z).add(off);
    const camG = surfaceY(targetCam.x, targetCam.z, world.docks);
    if (targetCam.y < camG + 1.2) targetCam.y = camG + 1.2;
    camera.position.lerp(targetCam, 1 - Math.pow(0.002, dt));
    camera.lookAt(player.x, player.y + 1.5, player.z);

    hunger = Math.max(0, hunger - dt * 0.18);
    if (vehicle === "auto" || vehicle === "boat") {
      earnAcc += player.speed * dt * 0.12;
      if (earnAcc > 8) {
        const n = Math.floor(earnAcc);
        money += n;
        earnAcc -= n;
        stats();
      }
    }
    if (!work) tickShop();
    else if (shopOn) closeShop();
    tickWork(dt);
    stats();
    nearest();
    discover();
    drawMap($("minimap").getContext("2d"), 148, 148, true);
    netTick(dt);
    tickRemotes(dt);
    saveAcc += dt;
    if (saveAcc > 4) { saveAcc = 0; persist(); }
  } else {
    camera.position.lerp(new THREE.Vector3(player.x - Math.sin(yaw) * 11, player.y + 5.2, player.z - Math.cos(yaw) * 11), 0.05);
    camera.lookAt(player.x, player.y + 1.5, player.z);
    me.position.set(player.x, player.y, player.z);
    if (fishing) {
      fishingT -= dt;
      animateHuman(me, false, t, false, true);
      if (fishingT <= 0) finishFish();
    }
    if (work) tickWork(dt);
    tickRemotes(dt);
  }

  renderer.render(scene, camera);
}

function spawnAtStart() {
  const s = CURRENT.start;
  player.x = s.x;
  player.z = s.z;
  player.y = surfaceY(s.x, s.z, world.docks);
  vy = 0;
  vehicle = "walk";
  fishing = false;
  sitting = false;
  parkLand(scooterMesh, s.x + 3.2, s.z - 2.4, 0.4);
  parkLand(autoMesh, s.x - 4, s.z + 6, -0.5);
  me.position.set(player.x, player.y, player.z);
}

function bootWorld(id = "ekm") {
  $("loadbar").style.width = "40%";
  setDistrict(id);
  world = buildWorld(scene, { lite: TOUCH });
  $("loadbar").style.width = "70%";
  spawnAtStart();
  $("loadbar").style.width = "100%";
  setTimeout(() => ($("loadbar").style.width = "0%"), 400);
}

function loadDistrict(id) {
  if (!id) return;
  if (CURRENT?.id === id && world) {
    spawnAtStart();
    toast(CURRENT.name);
    return;
  }
  $("loadbar").style.width = "30%";
  disposeWorld(world);
  world = null;
  setDistrict(id);
  world = buildWorld(scene, { lite: TOUCH });
  spawnAtStart();
  fillPlaces();
  markDistrict();
  $("loadbar").style.width = "100%";
  setTimeout(() => ($("loadbar").style.width = "0%"), 280);
  toast(CURRENT.name);
  const mt = $("map-title");
  if (mt) mt.textContent = CURRENT.name;
  persist();
}

function jump() {
  if (state !== "play" || sideOpen) return;
  if (grounded && !swimming && vehicle === "walk" && !sitting && !fishing) {
    vy = 7.4;
    grounded = false;
  }
}

function tryLock() {
  if (work) return;
  if (state === "play" && !sideOpen && !document.body.classList.contains("is-touch") && !typing()) {
    canvas.requestPointerLock?.();
  }
}

addEventListener("keydown", (e) => {
  if (typing()) {
    if (e.key === "Escape") document.activeElement.blur();
    return;
  }
  keys[e.key.toLowerCase()] = true;
  if (e.key === " ") e.preventDefault();
  if (e.key === "Tab") {
    e.preventDefault();
    if (state === "play" || sideOpen) openSide(!sideOpen);
    return;
  }
  if (work) {
    if (e.key === "Escape") { closeMini(false); return; }
    if (e.key === "e" || e.key === "E" || e.key === " ") { e.preventDefault(); hitMini(); return; }
  }
  if (state === "panel" && e.key === "Escape") { closePanels(); return; }
  if (sideOpen && e.key === "Escape") { openSide(false); return; }
  if (state !== "play") return;
  if (e.key === "Escape") togglePanel("pause");
  if (e.key === "e" || e.key === "E") doInteract();
  if (e.key === "i" || e.key === "I") togglePanel("inventory");
  if (e.key === "m" || e.key === "M") togglePanel("map-panel");
  if (e.key === "c" || e.key === "C") {
    if (vehicle === "walk" && !fishing) {
      sitting = !sitting;
      toast(sitting ? "Sit" : "Walk");
    }
  }
  if (e.key === "Enter") {
    openSide(true);
    setTab("chat");
    setTimeout(() => $("chat-in").focus(), 50);
  }
  if (e.key === "1") setVehicle("walk");
  if (e.key === "2") setVehicle("scooter");
  if (e.key === "3") setVehicle("auto");
  if (e.key === " ") jump();
});
addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

canvas.addEventListener("click", tryLock);
document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement === canvas && state === "play" && !sideOpen) {
    yaw -= e.movementX * 0.0018;
    pitch -= e.movementY * 0.0016;
    pitch = Math.max(-0.95, Math.min(0.4, pitch));
  }
});

function fit() {
  const w = visualViewport?.width || innerWidth;
  const h = visualViewport?.height || innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener("resize", fit);
visualViewport?.addEventListener("resize", fit);

function enableTouch() {
  document.body.classList.add("is-touch");
  $("touch-ui").classList.remove("hidden");
  $("prompt-key").textContent = "TAP";
  $("hintbar").textContent = "Left stick to walk · drag to look";
  document.exitPointerLock?.();
}
if (TOUCH) enableTouch();
addEventListener("touchstart", enableTouch, { once: true, passive: true });

const stickEl = $("stick");
const knob = $("stick-knob");
let stickPid = null, lookPid = null, lookX = 0, lookY = 0;

function stickCenter() {
  const r = stickEl.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, max: r.width * 0.42 };
}
function moveStick(e) {
  const c = stickCenter();
  let dx = e.clientX - c.x, dy = e.clientY - c.y;
  const m = Math.hypot(dx, dy) || 1;
  if (m > c.max) { dx *= c.max / m; dy *= c.max / m; }
  joy.x = dx / c.max;
  joy.y = dy / c.max;
  knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}
function endStick() {
  stickPid = null;
  joy.x = 0; joy.y = 0;
  knob.style.transform = "translate(-50%, -50%)";
}
stickEl.addEventListener("pointerdown", (e) => {
  e.preventDefault(); e.stopPropagation();
  stickEl.setPointerCapture(e.pointerId);
  stickPid = e.pointerId;
  moveStick(e);
});
stickEl.addEventListener("pointermove", (e) => { if (e.pointerId === stickPid) moveStick(e); });
stickEl.addEventListener("pointerup", (e) => { if (e.pointerId === stickPid) endStick(); });
stickEl.addEventListener("pointercancel", (e) => { if (e.pointerId === stickPid) endStick(); });

function lookStart(e) {
  if (state !== "play" || sideOpen || work) return;
  if (e.target.closest("#stick, .tbtn, .panel, #title-screen, .prompt, #sidebar, .ios-fab, #shop, #minigame, input, button, form")) return;
  lookPid = e.pointerId;
  lookX = e.clientX;
  lookY = e.clientY;
}
function lookMove(e) {
  if (e.pointerId !== lookPid || state !== "play" || sideOpen) return;
  yaw -= (e.clientX - lookX) * 0.0048;
  pitch -= (e.clientY - lookY) * 0.004;
  pitch = Math.max(-0.95, Math.min(0.4, pitch));
  lookX = e.clientX;
  lookY = e.clientY;
}
function lookEnd(e) {
  if (e.pointerId === lookPid) lookPid = null;
}
addEventListener("pointerdown", lookStart);
addEventListener("pointermove", lookMove);
addEventListener("pointerup", lookEnd);
addEventListener("pointercancel", lookEnd);

function bindHold(el, on, off) {
  const down = (e) => { e.preventDefault(); e.stopPropagation(); el.setPointerCapture?.(e.pointerId); on(); };
  const up = () => off && off();
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
}

$("t-act").addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); doInteract(); });
$("t-jump").addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); jump(); });
bindHold($("t-run"), () => { keys.shift = true; }, () => { keys.shift = false; });
$("t-menu").addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); openSide(!sideOpen); });
$("t-map").addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); togglePanel("map-panel"); });
$("t-pause").addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); togglePanel("pause"); });
$("prompt").addEventListener("pointerdown", (e) => { e.preventDefault(); doInteract(); });
canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

/* ---------- sidebar ---------- */
const KIND_ICO = {
  beach: "🌊", drivein: "🌊", fort: "🏰", temple: "🛕", church: "⛪", mosque: "🕌",
  lighthouse: "🗼", nets: "🗼", jetty: "▣", pond: "🎣", lake: "💧", tea: "🍃",
  peak: "⛰", dam: "▬", cave: "⬤", paddy: "🌾", houseboat: "▣", chaya: "🍵",
  palace: "▣", factory: "🏭", shrine: "⛩", tower: "🗼", mandapam: "▣",
  thattukada: "🍛", hotel: "🏨", market: "🛒", forest: "🌳", island: "🏝",
};

function fillSidebar() {
  $("district-list").innerHTML = DISTRICTS.map((d) => `
    <button type="button" class="ios-row" data-dist="${d.id}">
      <span class="ico">📍</span>
      <span><b>${d.name}</b><small>${d.kind}</small></span>
    </button>`).join("");
  fillPlaces();
  const jl = $("job-list");
  if (jl) jl.innerHTML = JOBS.map((j) => `
    <button type="button" class="ios-row" data-job="${j.id}">
      <span class="ico">₹</span>
      <span><b>${j.name}</b><small>${j.hint} · ₹${j.pay}</small></span>
    </button>`).join("");
  $("vehicle-list").innerHTML = VEHICLES.map((v) => `
    <button type="button" class="ios-row" data-veh="${v.id}">
      <span class="ico">${v.ico}</span>
      <span><b>${v.name}</b><small>${v.hint}</small></span>
    </button>`).join("");
  markVehicle();
  markDistrict();
}

function fillPlaces() {
  const el = $("place-list");
  if (!el) return;
  const kick = $("places-kicker");
  if (kick) kick.textContent = CURRENT ? CURRENT.name : "Places";
  el.innerHTML = (CURRENT?.places || []).map((p) => `
    <button type="button" class="ios-row" data-place="${p.id}">
      <span class="ico">${KIND_ICO[p.kind] || "·"}</span>
      <span><b>${p.name}</b><small>${p.kind}</small></span>
    </button>`).join("");
}

function markDistrict() {
  $("district-list")?.querySelectorAll("[data-dist]").forEach((b) => {
    b.classList.toggle("on", b.dataset.dist === CURRENT?.id);
  });
}

function markVehicle() {
  $("vehicle-list")?.querySelectorAll("[data-veh]").forEach((b) => {
    b.classList.toggle("on", b.dataset.veh === vehicle);
  });
}

function setTab(id) {
  document.querySelectorAll(".ios-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === id));
  document.querySelectorAll(".ios-tab").forEach((s) => s.classList.toggle("on", s.id === "tab-" + id));
}

$("ios-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (b) setTab(b.dataset.tab);
});
$("district-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-dist]");
  if (!b) return;
  openSide(false);
  loadDistrict(b.dataset.dist);
});
$("place-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-place]");
  if (!b || !world) return;
  const L = (CURRENT.places || []).find((x) => x.id === b.dataset.place);
  if (!L) return;
  openSide(false);
  if (vehicle === "boat") setVehicle("walk");
  player.x = L.x;
  player.z = L.z;
  player.y = surfaceY(L.x, L.z, world.docks);
  vy = 0;
  if (vehicle === "auto") autoMesh.position.set(player.x, player.y, player.z);
  if (vehicle === "scooter") scooterMesh.position.set(player.x, player.y, player.z);
  toast(L.name);
});
$("job-list")?.addEventListener("click", (e) => {
  const b = e.target.closest("[data-job]");
  if (!b) return;
  travelToJob(b.dataset.job);
});
$("mg-close")?.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); closeMini(false); });
function mgXY(e) {
  const st = $("mg-stage");
  const r = st.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
}
$("mg-stage")?.addEventListener("pointerdown", (e) => {
  if (!work) return;
  e.preventDefault();
  e.stopPropagation();
  $("mg-stage").setPointerCapture?.(e.pointerId);
  const p = mgXY(e);
  miniPointer(work, "down", p.x, p.y);
});
$("mg-stage")?.addEventListener("pointermove", (e) => {
  if (!work) return;
  const p = mgXY(e);
  miniPointer(work, "move", p.x, p.y);
});
$("mg-stage")?.addEventListener("pointerup", (e) => {
  if (!work) return;
  const p = mgXY(e);
  miniPointer(work, "up", p.x, p.y);
});
$("mg-stage")?.addEventListener("pointercancel", (e) => {
  if (!work) return;
  const p = mgXY(e);
  miniPointer(work, "up", p.x, p.y);
});
$("shop-list")?.addEventListener("click", (e) => {
  const buy = e.target.closest("[data-buy]");
  const sell = e.target.closest("[data-sell]");
  if (buy) buyFood(buy.dataset.buy);
  if (sell) sellFish(sell.dataset.sell);
});
$("vehicle-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-veh]");
  if (!b) return;
  openSide(false);
  setVehicle(b.dataset.veh);
});
$("side-close").onclick = () => openSide(false);
$("side-fab").onclick = () => openSide(true);

$("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const inp = $("chat-in");
  const text = inp.value.trim();
  if (!text) return;
  inp.value = "";
  sendChat(text);
});

function appendChat(name, text, mine) {
  const log = $("chat-log");
  const d = document.createElement("div");
  d.className = "chat-line" + (mine ? " me" : "");
  d.innerHTML = `<span class="who">${name}</span>${text.replace(/[<>]/g, "")}`;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}

function updateOnline() {
  const n = 1 + remotes.size;
  onlineN = n;
  $("online-chip").textContent = n === 1 ? "1 online" : `${n} online`;
  const names = [myName, ...[...remotes.values()].map((r) => r.name)].filter(Boolean);
  $("online-row").textContent = names.join(" · ");
}

function ensureRemote(p) {
  if (!p || p.id === localId) return;
  let r = remotes.get(p.id);
  if (!r) {
    const skin = skins[Math.abs(hash(p.id)) % skins.length];
    const mesh = createHuman(skin);
    const tag = nametag(p.name || "Wanderer");
    mesh.add(tag);
    scene.add(mesh);
    r = { id: p.id, mesh, tag, x: p.x || 0, y: p.y || 0, z: p.z || 0, yaw: p.yaw || 0, name: p.name || "Wanderer", spd: 0 };
    remotes.set(p.id, r);
  }
  if (p.name && p.name !== r.name) {
    r.name = p.name;
    setNametag(r.tag, p.name);
  }
  if (p.x != null) { r.tx = p.x; r.ty = p.y; r.tz = p.z; r.tyaw = p.yaw; r.spd = p.spd || 0; }
  updateOnline();
  return r;
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function tickRemotes(dt) {
  for (const r of remotes.values()) {
    if (r.tx == null) continue;
    r.x += (r.tx - r.x) * Math.min(1, dt * 8);
    r.y += (r.ty - r.y) * Math.min(1, dt * 8);
    r.z += (r.tz - r.z) * Math.min(1, dt * 8);
    r.mesh.position.set(r.x, r.y, r.z);
    r.mesh.rotation.y += (r.tyaw - r.mesh.rotation.y) * Math.min(1, dt * 6);
    animateHuman(r.mesh, (r.spd || 0) > 0.4, clock.elapsedTime);
  }
}

function dropRemote(id) {
  const r = remotes.get(id);
  if (!r) return;
  scene.remove(r.mesh);
  remotes.delete(id);
  updateOnline();
}

function onNet(msg) {
  if (!msg || msg.id === localId) return;
  if (msg.type === "hello") {
    (msg.others || []).forEach(ensureRemote);
  } else if (msg.type === "join" && msg.player) {
    ensureRemote(msg.player);
    toast(msg.player.name || "Someone", "Walked into Kerala");
  } else if (msg.type === "state" && msg.player) {
    ensureRemote(msg.player);
  } else if (msg.type === "leave") {
    dropRemote(msg.id);
  } else if (msg.type === "chat") {
    appendChat(msg.name || "Wanderer", msg.text, false);
  }
}

function netSend(obj) {
  const payload = { ...obj, id: localId };
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload));
  else bc?.postMessage(payload);
}

function netTick(dt) {
  netAcc += dt;
  if (netAcc < 0.1) return;
  netAcc = 0;
  netSend({ type: "state", name: myName, x: player.x, y: player.y, z: player.z, yaw: me.rotation.y, veh: vehicle, spd: player.speed });
}

function sendChat(text) {
  appendChat(myName, text, true);
  netSend({ type: "chat", name: myName, text });
}

function connectNet() {
  try {
    bc = new BroadcastChannel("keralam-rp");
    bc.onmessage = (e) => {
      const m = e.data;
      if (!m || m.id === localId) return;
      if (m.type === "state") ensureRemote(m);
      else onNet(m);
    };
  } catch (_) {}
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${proto}//${location.host}/ws`;
  try {
    ws = new WebSocket(url);
    ws.onmessage = (e) => {
      try { onNet(JSON.parse(e.data)); } catch (_) {}
    };
    ws.onopen = () => {
      netSend({ type: "state", name: myName, x: player.x, y: player.y, z: player.z, yaw: me.rotation.y, veh: vehicle, spd: 0 });
    };
    ws.onerror = () => {};
    ws.onclose = () => { ws = null; };
  } catch (_) {}
}


function saveKey(name) {
  return "keralam-save:" + String(name || myName).trim().slice(0, 18);
}

function snapshot() {
  return {
    name: myName,
    money,
    hunger,
    bag: { ...bag },
    x: player.x,
    y: player.y,
    z: player.z,
    yaw,
    district: CURRENT?.id || "ekm",
    vehicle: vehicle === "boat" ? "walk" : vehicle,
    hour,
    t: Date.now(),
  };
}

function applySave(s) {
  if (!s) return false;
  money = Number.isFinite(+s.money) ? +s.money : money;
  hunger = Number.isFinite(+s.hunger) ? +s.hunger : hunger;
  if (s.bag && typeof s.bag === "object") {
    for (const k of Object.keys(bag)) delete bag[k];
    Object.assign(bag, s.bag);
  }
  if (Number.isFinite(+s.hour)) hour = +s.hour;
  if (Number.isFinite(+s.yaw)) yaw = +s.yaw;
  if (Number.isFinite(+s.x) && Number.isFinite(+s.z) && world) {
    hopTo(+s.x, +s.z);
  }
  if (s.vehicle === "scooter" || s.vehicle === "auto") {
    setVehicle(s.vehicle, { keepPos: true, force: true });
  }
  stats();
  return true;
}

function persist() {
  if (state !== "play" && state !== "panel") return;
  const data = snapshot();
  try { localStorage.setItem(saveKey(), JSON.stringify(data)); } catch (_) {}
  try { localStorage.setItem("keralam-last", myName); } catch (_) {}
  fetch("/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).catch(() => {});
}

function readLocal(name) {
  try {
    const raw = localStorage.getItem(saveKey(name));
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && typeof s === "object" ? s : null;
  } catch (_) { return null; }
}

function enterGame(name) {
  if (state === "play" || state === "loading") return;
  myName = (name || $("name-in").value || "Wanderer").trim().slice(0, 18) || "Wanderer";
  setNametag(meTag, myName);
  $("side-name").textContent = myName;
  state = "loading";
  const btn = $("btn-start");
  if (btn) btn.textContent = "Loading…";
  $("title-screen").style.display = "none";
  const local = readLocal(myName);
  try {
    bootWorld(local?.district || "ekm");
    if (local) applySave(local);
  } catch (err) {
    console.error(err);
    state = "title";
    $("title-screen").style.display = "flex";
    if (btn) btn.textContent = "Play";
    toast("Couldn't load", String(err?.message || err).slice(0, 80));
    return;
  }
  $("hud").classList.add("show");
  $("side-fab").hidden = false;
  if (TOUCH) enableTouch();
  fillSidebar();
  stats();
  connectNet();
  updateOnline();
  state = "play";
  try { startAudio().then(() => bell()).catch(() => {}); } catch (_) {}
  toast(local ? "Welcome back" : myName, local ? myName : "");
  persist();
  if (!local) {
    fetch("/save?name=" + encodeURIComponent(myName)).then((r) => r.ok ? r.json() : null).then((s) => {
      if (!s || !s.name) return;
      if (s.district && s.district !== CURRENT.id) loadDistrict(s.district);
      applySave(s);
      persist();
      toast("Welcome back", myName);
    }).catch(() => {});
  }
  tryLock();
}

$("name-form").addEventListener("submit", (e) => {
  e.preventDefault();
  e.stopPropagation();
  enterGame($("name-in").value);
});
$("btn-resume").onclick = () => closePanels();

fillSidebar();
try {
  const last = localStorage.getItem("keralam-last");
  if (last && $("name-in")) $("name-in").value = last;
} catch (_) {}
addEventListener("visibilitychange", () => { if (document.hidden) persist(); });
addEventListener("pagehide", persist);

/**
 * Small hook for tooling and the browser console: jump around, set the hour,
 * inspect the world. The screenshot harness in .github/shots.mjs uses it.
 */
window.__keralam = {
  scene,
  camera,
  renderer,
  get world() { return world; },
  get state() { return state; },
  get player() { return player; },
  get yaw() { return yaw; },
  setHour(h) { hour = h; },
  setDistrict(id) { loadDistrict(id); },
  look(y, p) { yaw = y; if (p != null) pitch = p; },
  place(x, z) {
    if (!world) return null;
    player.x = x;
    player.z = z;
    player.y = surfaceY(x, z, world.docks);
    me.position.set(player.x, player.y, player.z);
    return player.y;
  },
  surfaceY: (x, z) => (world ? surfaceY(x, z, world.docks) : null),
  /**
   * Hide everything but the ground (used by the screenshot harness to take
   * clean ground swatches for the comparison against the reference blend).
   * Returns how many children were hidden.
   */
  debugGroundOnly(on = true) {
    if (!world) return 0;
    let n = 0;
    // the player, the parked rides and the name plate live on the scene, not in
    // the world root, so they are hidden separately
    for (const o of [me, autoMesh, scooterMesh]) {
      if (!o) continue;
      if (on) {
        if (!("__vis" in o.userData)) o.userData.__vis = o.visible;
        o.visible = false;
        n++;
      } else if ("__vis" in o.userData) {
        o.visible = o.userData.__vis;
        delete o.userData.__vis;
        n++;
      }
    }
    for (const child of world.root.children) {
      const keep = child.isLight || child.name === "ground" || child.name === "ground-edge" || child === world.water;
      if (keep) continue;
      if (on) {
        if (!("__vis" in child.userData)) child.userData.__vis = child.visible;
        child.visible = false;
        n++;
      } else if ("__vis" in child.userData) {
        child.visible = child.userData.__vis;
        delete child.userData.__vis;
        n++;
      }
    }
    return n;
  },
};

loop();
