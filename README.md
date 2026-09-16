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
