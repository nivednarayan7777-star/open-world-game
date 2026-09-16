import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function safeName(n) {
  return String(n || "").replace(/[^a-zA-Z0-9_\- ]/g, "").trim().slice(0, 18);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname === "/save") {
    const dir = path.join(ROOT, "saves");
    if (req.method === "POST") {
      let body = "";
      req.on("data", (c) => { body += c; if (body.length > 20000) req.destroy(); });
      req.on("end", () => {
        try {
          const data = JSON.parse(body);
          const name = safeName(data.name);
          if (!name) { res.writeHead(400); res.end("bad name"); return; }
          fs.mkdirSync(dir, { recursive: true });
          data.name = name;
          fs.writeFileSync(path.join(dir, name + ".json"), JSON.stringify(data));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end('{"ok":true}');
        } catch {
          res.writeHead(400); res.end("bad");
        }
      });
      return;
    }
    const name = safeName(url.searchParams.get("name"));
    const file = path.join(dir, name + ".json");
    fs.readFile(file, "utf8", (err, txt) => {
      if (err) { res.writeHead(404); res.end("{}"); return; }
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-cache" });
      res.end(txt);
    });
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p === "/") p = "/index.html";
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(file).pipe(res);
  });
});

const wss = new WebSocketServer({ server, path: "/ws" });
const players = new Map();

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function broadcast(obj, except) {
  const s = JSON.stringify(obj);
  for (const c of wss.clients) {
    if (c !== except && c.readyState === 1) c.send(s);
  }
}

wss.on("connection", (ws) => {
  const id = Math.random().toString(36).slice(2, 9);
  const me = { id, name: "Wanderer", x: -78, y: 2, z: 18, yaw: 0, veh: "walk" };
  players.set(id, me);
  ws._kid = id;
  send(ws, {
    type: "hello",
    id,
    others: [...players.values()].filter((p) => p.id !== id),
  });
  broadcast({ type: "join", player: { ...me } }, ws);

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    const p = players.get(id);
    if (!p) return;
    if (msg.type === "state") {
      p.name = String(msg.name || p.name).slice(0, 18);
      p.x = Number(msg.x) || 0;
      p.y = Number(msg.y) || 0;
      p.z = Number(msg.z) || 0;
      p.yaw = Number(msg.yaw) || 0;
      p.veh = String(msg.veh || "walk").slice(0, 12);
      p.spd = Number(msg.spd) || 0;
      broadcast({ type: "state", player: p }, ws);
    } else if (msg.type === "chat") {
      const text = String(msg.text || "").slice(0, 140).trim();
      if (!text) return;
      const name = String(msg.name || p.name).slice(0, 18);
      p.name = name;
      broadcast({ type: "chat", id, name, text }, ws);
    }
  });

  ws.on("close", () => {
    players.delete(id);
    broadcast({ type: "leave", id });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Keralam RP http://0.0.0.0:${PORT}`);
});
