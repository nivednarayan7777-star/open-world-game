export const START = { x: -74, y: 2, z: 12 };

export const ITEMS = {
  karimeen: { ico: "🐟", name: "Karimeen", desc: "", sell: 90 },
  mathi: { ico: "🐠", name: "Mathi", desc: "", sell: 22 },
  ayala: { ico: "🐟", name: "Ayala", desc: "", sell: 28 },
  chemmeen: { ico: "🦐", name: "Chemmeen", desc: "", sell: 45 },
  kakka: { ico: "🐚", name: "Kakka", desc: "", sell: 18 },
  boot: { ico: "👢", name: "Boot", desc: "", sell: 2 },
};

export const FISH = [
  { id: "mathi", weight: 34 },
  { id: "ayala", weight: 26 },
  { id: "chemmeen", weight: 16 },
  { id: "karimeen", weight: 12 },
  { id: "kakka", weight: 8 },
  { id: "boot", weight: 4 },
];

export const VEHICLES = [
  { id: "walk", name: "Walk", hint: "", ico: "🚶" },
  { id: "scooter", name: "Scooter", hint: "", ico: "🛵" },
  { id: "auto", name: "Auto", hint: "", ico: "🛺" },
];

export const ACTIVITIES = [
  { id: "fish", name: "Fish", hint: "Pond", ico: "🎣" },
  { id: "sit", name: "Sit", hint: "", ico: "·" },
];

export const MENU = {
  chaya: [
    { id: "chai", name: "Chaya", price: 12, food: 14 },
    { id: "sulaimani", name: "Sulaimani", price: 18, food: 12 },
    { id: "pazhampori", name: "Pazhampori", price: 15, food: 16 },
    { id: "vada", name: "Parippu vada", price: 12, food: 14 },
    { id: "bonda", name: "Bonda", price: 15, food: 15 },
    { id: "puttu", name: "Puttu + kadala", price: 40, food: 38 },
    { id: "appam", name: "Appam", price: 20, food: 18 },
    { id: "omelette", name: "Omelette", price: 25, food: 22 },
  ],
  hotel: [
    { id: "meals", name: "Kerala meals", price: 90, food: 55 },
    { id: "fishrice", name: "Fish curry rice", price: 110, food: 58 },
    { id: "stew", name: "Appam stew", price: 80, food: 48 },
    { id: "biryani", name: "Biryani", price: 140, food: 62 },
    { id: "kappa", name: "Kappa + meen", price: 95, food: 52 },
    { id: "sadya", name: "Sadya", price: 160, food: 70 },
  ],
  thattukada: [
    { id: "porotta", name: "Porotta", price: 20, food: 18 },
    { id: "beef", name: "Beef fry", price: 80, food: 42 },
    { id: "dosha", name: "Dosha", price: 30, food: 24 },
    { id: "egg", name: "Egg curry", price: 50, food: 32 },
    { id: "chilli", name: "Chilli porotta", price: 70, food: 40 },
  ],
  market: [],
};

export const JOBS = [
  { id: "tea", name: "Tea boy", pay: 35, game: "pour", need: 3, hint: "Hold the kettle over the cup" },
  { id: "waiter", name: "Waiter", pay: 50, game: "tray", need: 5, hint: "Drag the tray, catch plates" },
  { id: "cook", name: "Thattu cook", pay: 42, game: "pan", need: 3, hint: "Drag 1–2–3 onto the pan" },
  { id: "fisher", name: "Fisher", pay: 40, game: "hook", need: 3, hint: "Drag the hook onto the fish" },
  { id: "vendor", name: "Vendor", pay: 38, game: "sort", need: 6, hint: "Drag to Keep or Sell" },
  { id: "picker", name: "Tea picker", pay: 45, game: "basket", need: 7, hint: "Drag leaves into the basket" },
  { id: "guide", name: "Fort guide", pay: 48, game: "trace", need: 5, hint: "Draw through the points" },
  { id: "cleaner", name: "Beach", pay: 32, game: "bin", need: 6, hint: "Drag trash to the bin" },
  { id: "dam", name: "Dam crew", pay: 55, game: "slider", need: 1, hint: "Drag the gate, hold the middle" },
  { id: "temple", name: "Temple", pay: 30, game: "flame", need: 4, hint: "Carry flame lamp to lamp" },
  { id: "coconut", name: "Coconut", pay: 40, game: "climb", need: 1, hint: "Climb, then swipe to cut" },
];

export function pickFish() {
  const total = FISH.reduce((s, f) => s + f.weight, 0);
  let r = Math.random() * total;
  for (const f of FISH) {
    r -= f.weight;
    if (r <= 0) return f.id;
  }
  return "mathi";
}

export function jobById(id) {
  return JOBS.find((j) => j.id === id);
}
