/** Drag-based job minigames. Same iOS card; play happens in #mg-stage. */

export const JOB_KIND = {
  tea: "chaya",
  waiter: "hotel",
  cook: "thattukada",
  fisher: "pond",
  vendor: "market",
  picker: "tea",
  guide: "fort",
  cleaner: "beach",
  dam: "dam",
  temple: "temple",
  coconut: null,
};

function el(html) {
  const d = document.createElement("div");
  d.innerHTML = html.trim();
  return d.firstElementChild;
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function setPos(node, x, y) {
  if (!node) return;
  node.style.left = (x * 100) + "%";
  node.style.top = (y * 100) + "%";
}

function hit(a, b, r) {
  return Math.hypot(a.x - b.x, a.y - b.y) < r;
}

export function buildMini(work, st) {
  work.stage = st;
  st.innerHTML = "";
  work.down = false;
  work.px = 0.5;
  work.py = 0.5;
  work.hold = 0;
  work.items = [];
  work.spawn = 0.2;
  const g = work.game;

  if (g === "pour") {
    st.append(
      el(`<div class="mg-cup"><i id="mg-tea"></i><b></b></div>`),
      el(`<div class="mg-stream" id="mg-stream" hidden></div>`),
      el(`<div class="mg-kettle" id="mg-drag"></div>`)
    );
    work.px = 0.78; work.py = 0.22; work.fill = 0;
    setPos(st.querySelector("#mg-drag"), work.px, work.py);
  } else if (g === "tray") {
    st.append(el(`<div class="mg-tray" id="mg-drag"></div>`));
    work.px = 0.5; work.py = 0.86;
    setPos(st.querySelector("#mg-drag"), work.px, work.py);
  } else if (g === "pan") {
    st.append(el(`<div class="mg-pan"></div>`));
    work.order = [0, 1, 2];
    work.seqI = 0;
    const spots = [[0.18, 0.28], [0.18, 0.62], [0.82, 0.45]];
    work.order.forEach((n, i) => {
      const c = el(`<div class="mg-chip" data-i="${n}">${n + 1}</div>`);
      c.style.left = spots[i][0] * 100 + "%";
      c.style.top = spots[i][1] * 100 + "%";
      st.append(c);
      work.items.push({ i: n, el: c, x: spots[i][0], y: spots[i][1], home: spots[i], held: false, in: false });
    });
  } else if (g === "hook") {
    st.append(
      el(`<div class="mg-water"></div>`),
      el(`<div class="mg-line" id="mg-line"></div>`),
      el(`<div class="mg-hook" id="mg-drag"></div>`),
      el(`<div class="mg-swim" id="mg-fish"></div>`)
    );
    work.px = 0.5; work.py = 0.2;
    work.fish = { x: 0.2, y: 0.62, vx: 0.35 };
    setPos(st.querySelector("#mg-drag"), work.px, work.py);
    setPos(st.querySelector("#mg-fish"), work.fish.x, work.fish.y);
  } else if (g === "sort") {
    st.append(
      el(`<div class="mg-bin left">Keep</div>`),
      el(`<div class="mg-bin right">Sell</div>`)
    );
    work.nextCard = true;
  } else if (g === "basket") {
    st.append(el(`<div class="mg-basket">Basket</div>`));
  } else if (g === "trace") {
    const pts = [[0.16, 0.72], [0.32, 0.28], [0.55, 0.58], [0.72, 0.22], [0.86, 0.7]];
    work.pts = pts;
    work.seqI = 0;
    pts.forEach((p, i) => {
      const d = el(`<div class="mg-node" data-i="${i}">${i + 1}</div>`);
      setPos(d, p[0], p[1]);
      st.append(d);
    });
    const path = el(`<div class="mg-ink" id="mg-ink"></div>`);
    st.append(path);
  } else if (g === "bin") {
    st.append(el(`<div class="mg-dump">Bin</div>`));
    for (let i = 0; i < 6; i++) {
      const t = el(`<div class="mg-trash"></div>`);
      const x = 0.16 + (i % 3) * 0.22 + Math.random() * 0.06;
      const y = 0.22 + Math.floor(i / 3) * 0.28 + Math.random() * 0.06;
      setPos(t, x, y);
      st.append(t);
      work.items.push({ el: t, x, y, held: false, done: false });
    }
  } else if (g === "slider") {
    st.append(
      el(`<div class="mg-well"><div class="ok"></div><div class="mg-waterline" id="mg-water"></div></div>`),
      el(`<div class="mg-handle" id="mg-drag"></div>`)
    );
    work.px = 0.82; work.py = 0.5; work.level = 0.5; work.hold = 0;
    setPos(st.querySelector("#mg-drag"), work.px, work.py);
  } else if (g === "scoop") {
    st.append(el(`<div class="mg-net" id="mg-drag"></div>`));
    work.px = 0.5; work.py = 0.5;
    setPos(st.querySelector("#mg-drag"), work.px, work.py);
    for (let i = 0; i < 3; i++) {
      const f = el(`<div class="mg-swim"></div>`);
      const fish = { el: f, x: 0.2 + i * 0.25, y: 0.3 + i * 0.15, vx: 0.22 * (i % 2 ? 1 : -1), vy: 0.1 };
      setPos(f, fish.x, fish.y);
      st.append(f);
      work.items.push(fish);
    }
  } else if (g === "river") {
    st.append(el(`<div class="mg-boat" id="mg-drag"></div>`));
    work.px = 0.5; work.py = 0.82;
    work.gates = [];
    work.passed = 0;
    setPos(st.querySelector("#mg-drag"), work.px, work.py);
  } else if (g === "flame") {
    const src = el(`<div class="mg-flame src" id="mg-src"></div>`);
    setPos(src, 0.5, 0.82);
    st.append(src);
    work.seqI = 0;
    work.pts = [[0.2, 0.28], [0.42, 0.22], [0.64, 0.22], [0.84, 0.3]];
    work.pts.forEach((p, i) => {
      const l = el(`<div class="mg-lamp" data-i="${i}"></div>`);
      setPos(l, p[0], p[1]);
      st.append(l);
    });
    work.carry = false;
  } else if (g === "climb") {
    st.append(
      el(`<div class="mg-trunk"></div>`),
      el(`<div class="mg-climber" id="mg-drag"></div>`)
    );
    work.px = 0.5; work.py = 0.82; work.phase = "up";
    setPos(st.querySelector("#mg-drag"), work.px, work.py);
  }
}

export function miniPointer(work, type, x, y) {
  if (!work) return;
  const g = work.game;
  if (type === "down") {
    work.down = true;
    work.px0 = x; work.py0 = y;
  }
  if (type === "up") {
    work.down = false;
    work.held = null;
    if (g === "pour") pourRelease(work);
    if (g === "trace" && work.seqI < (work.pts?.length || 0)) {
      work.seqI = 0;
      work.stage?.querySelectorAll(".mg-node").forEach((n) => n.classList.remove("on"));
    }
    if (g === "flame") work.carry = false;
    if (g === "climb" && work.phase === "cut") {
      if (Math.abs(x - (work.px0 || x)) > 0.32) {
        work.got = 1;
        work._win = true;
      }
    }
  }
  if (type !== "up") {
    work.lx = x; work.ly = y;
    if (work.down) drag(work, x, y);
  }
}

function drag(work, x, y) {
  const g = work.game;
  const st = work.stage;
  if (g === "pour" || g === "hook" || g === "scoop" || g === "climb") {
    work.px = clamp(x, 0.06, 0.94);
    work.py = clamp(y, 0.08, 0.92);
    setPos(st.querySelector("#mg-drag"), work.px, work.py);
  } else if (g === "tray" || g === "river") {
    work.px = clamp(x, 0.12, 0.88);
    setPos(st.querySelector("#mg-drag"), work.px, work.py);
  } else if (g === "slider") {
    work.py = clamp(y, 0.12, 0.88);
    setPos(st.querySelector("#mg-drag"), work.px, work.py);
  } else if (g === "pan") {
    const it = work.held || work.items.find((c) => !c.in && hit({ x, y }, c, 0.1));
    if (it) {
      work.held = it;
      it.held = true;
      it.x = x; it.y = y;
      setPos(it.el, x, y);
      if (hit({ x, y }, { x: 0.5, y: 0.52 }, 0.16)) {
        if (it.i === work.seqI) {
          it.in = true;
          it.held = false;
          work.held = null;
          setPos(it.el, 0.5, 0.52);
          it.el.classList.add("in");
          work.seqI += 1;
          work.got = work.seqI;
          if (work.seqI >= 3) work._win = true;
        } else {
          it.x = it.home[0]; it.y = it.home[1];
          setPos(it.el, it.x, it.y);
          it.held = false;
          work.held = null;
          work.miss += 1;
          if (work.miss >= 3) work._fail = "Wrong order";
        }
      }
    }
  } else if (g === "sort") {
    const card = work.card;
    if (card) {
      card.x = x; card.y = y;
      setPos(card.el, x, y);
      if (x < 0.22) settleSort(work, "keep");
      else if (x > 0.78) settleSort(work, "sell");
    }
  } else if (g === "basket" || g === "bin") {
    const it = work.held || work.items.find((c) => !c.done && hit({ x, y }, c, 0.09));
    if (it) {
      work.held = it;
      it.x = x; it.y = y;
      setPos(it.el, x, y);
      const bin = g === "basket" ? { x: 0.5, y: 0.86, r: 0.16 } : { x: 0.84, y: 0.82, r: 0.14 };
      if (hit(it, bin, bin.r)) {
        if (it.bad) {
          work.miss += 1;
          if (work.miss >= 3) work._fail = "Wrong one";
        } else {
          work.got += 1;
        }
        it.done = true;
        it.el.remove();
        work.held = null;
        work.items = work.items.filter((t) => t !== it);
        if (work.got >= work.need) work._win = true;
      }
    }
  } else if (g === "trace") {
    const p = work.pts[work.seqI];
    if (p && hit({ x, y }, { x: p[0], y: p[1] }, 0.09)) {
      st.querySelector(`.mg-node[data-i="${work.seqI}"]`)?.classList.add("on");
      work.seqI += 1;
      work.got = work.seqI;
      if (work.seqI >= work.pts.length) work._win = true;
    }
  } else if (g === "flame") {
    const src = { x: 0.5, y: 0.82 };
    if (!work.carry && hit({ x, y }, src, 0.1)) work.carry = true;
    if (work.carry) {
      const p = work.pts[work.seqI];
      if (p && hit({ x, y }, { x: p[0], y: p[1] }, 0.09)) {
        st.querySelector(`.mg-lamp[data-i="${work.seqI}"]`)?.classList.add("on");
        work.seqI += 1;
        work.got = work.seqI;
        work.carry = false;
        if (work.seqI >= work.pts.length) work._win = true;
      }
    }
  }
}

function pourRelease(work) {
  const stream = work.stage.querySelector("#mg-stream");
  if (stream) stream.hidden = true;
  if (work.fill >= 0.5 && work.fill <= 0.78) {
    work.got += 1;
    if (work.got >= work.need) work._win = true;
  } else if (work.fill > 0.12) {
    work.miss += 1;
    if (work.miss >= 3) work._fail = "Spilled";
  }
  work.fill = 0;
  const tea = work.stage.querySelector("#mg-tea");
  if (tea) tea.style.height = "0%";
}

function settleSort(work, side) {
  const card = work.card;
  if (!card) return;
  const ok = (side === "sell" && card.sell) || (side === "keep" && !card.sell);
  card.el.remove();
  work.card = null;
  work.down = false;
  if (ok) {
    work.got += 1;
    if (work.got >= work.need) work._win = true;
  } else {
    work.miss += 1;
    if (work.miss >= 3) work._fail = "Wrong bin";
  }
  work.nextCard = true;
}

function spawnCard(work) {
  const sell = Math.random() < 0.5;
  const c = el(`<div class="mg-card">${sell ? "₹" : "Keep"}</div>`);
  c.classList.toggle("sell", sell);
  work.stage.append(c);
  work.card = { el: c, x: 0.5, y: 0.48, sell };
  setPos(c, 0.5, 0.48);
}

function spawnLeaf(work) {
  const bad = Math.random() < 0.22;
  const n = el(`<div class="mg-leaf${bad ? " bad" : ""}"></div>`);
  const x = 0.14 + Math.random() * 0.72;
  const y = 0.12 + Math.random() * 0.45;
  setPos(n, x, y);
  work.stage.append(n);
  work.items.push({ el: n, x, y, bad, done: false, held: false });
}

export function tickMini(work, dt) {
  if (!work) return;
  work.t += dt;
  const st = work.stage;
  const g = work.game;

  if (g === "pour") {
    const over = work.down && Math.abs(work.px - 0.5) < 0.16 && work.py < 0.55;
    const stream = st.querySelector("#mg-stream");
    if (stream) stream.hidden = !over;
    if (over) {
      work.fill = clamp(work.fill + dt * 0.42, 0, 1);
      const tea = st.querySelector("#mg-tea");
      if (tea) tea.style.height = (work.fill * 100) + "%";
      if (work.fill >= 1) {
        work.fill = 1;
        work.down = false;
        pourRelease(work);
      }
    }
    if (work.t > 18) work._fail = "Time";
  } else if (g === "tray") {
    work.spawn -= dt;
    if (work.spawn <= 0 && work.got < work.need) {
      const d = el(`<div class="mg-dish"></div>`);
      const item = { el: d, x: 0.12 + Math.random() * 0.76, y: -0.08, v: 0.32 + Math.random() * 0.18 };
      setPos(d, item.x, item.y);
      st.append(d);
      work.items.push(item);
      work.spawn = 0.72;
    }
    for (const it of [...work.items]) {
      it.y += it.v * dt;
      setPos(it.el, it.x, it.y);
      if (it.y > 0.78 && it.y < 0.94 && Math.abs(it.x - work.px) < 0.16) {
        work.got += 1;
        it.el.remove();
        work.items = work.items.filter((x) => x !== it);
        if (work.got >= work.need) work._win = true;
      } else if (it.y > 1.05) {
        it.el.remove();
        work.items = work.items.filter((x) => x !== it);
        work.miss += 1;
        if (work.miss >= 3) work._fail = "Dropped";
      }
    }
    if (work.t > 16) work._fail = "Time";
  } else if (g === "hook") {
    const f = work.fish;
    f.x += f.vx * dt;
    if (f.x > 0.9 || f.x < 0.1) f.vx *= -1;
    f.y = 0.58 + Math.sin(work.t * 2.2) * 0.12;
    setPos(st.querySelector("#mg-fish"), f.x, f.y);
    const line = st.querySelector("#mg-line");
    if (line) {
      line.style.left = work.px * 100 + "%";
      line.style.height = work.py * 100 + "%";
    }
    if (work.down && hit({ x: work.px, y: work.py }, f, 0.08)) {
      work.got += 1;
      f.x = Math.random() * 0.7 + 0.15;
      f.vx = (Math.random() < 0.5 ? -1 : 1) * (0.28 + work.got * 0.08);
      if (work.got >= work.need) work._win = true;
    }
    if (work.t > 16) work._fail = "Time";
  } else if (g === "sort") {
    if (work.nextCard && !work.card) {
      work.nextCard = false;
      spawnCard(work);
    }
    if (work.t > 18) work._fail = "Time";
  } else if (g === "basket") {
    work.spawn -= dt;
    if (work.spawn <= 0 && work.got < work.need && work.items.length < 4) {
      spawnLeaf(work);
      work.spawn = 0.7;
    }
    if (work.t > 18) work._fail = "Time";
  } else if (g === "slider") {
    const target = 1 - work.py;
    work.level += (target - work.level) * dt * 2.2;
    work.level += Math.sin(work.t * 2.4) * dt * 0.22;
    work.level = clamp(work.level, 0.04, 0.96);
    const w = st.querySelector("#mg-water");
    if (w) w.style.bottom = (work.level * 100) + "%";
    if (work.level > 0.36 && work.level < 0.64 && work.down) work.hold += dt;
    else work.hold = Math.max(0, work.hold - dt * 0.4);
    work.got = work.hold;
    if (work.hold >= 2.5) work._win = true;
    if (work.t > 16) work._fail = "Lost it";
  } else if (g === "scoop") {
    for (const f of work.items) {
      if (work.down) {
        const dx = f.x - work.px, dy = f.y - work.py;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 0.28) { f.x += (dx / d) * dt * 0.45; f.y += (dy / d) * dt * 0.45; }
        if (d < 0.09) {
          f.caught = true;
          f.el.remove();
          work.got += 1;
          if (work.got >= work.need) work._win = true;
        }
      }
      if (f.caught) continue;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.x < 0.08 || f.x > 0.92) f.vx *= -1;
      if (f.y < 0.12 || f.y > 0.88) f.vy *= -1;
      setPos(f.el, f.x, f.y);
    }
    work.items = work.items.filter((f) => !f.caught);
    setPos(st.querySelector("#mg-drag"), work.px, work.py);
    if (work.t > 16) work._fail = "Time";
  } else if (g === "river") {
    work.spawn -= dt;
    if (work.spawn <= 0 && work.passed < 4) {
      work.gates.push({
        y: -0.12,
        x: 0.22 + Math.random() * 0.56,
        w: 0.22,
        el: (() => {
          const row = el(`<div class="mg-gate"><i></i><i></i></div>`);
          st.append(row);
          return row;
        })(),
      });
      work.spawn = 1.15;
    }
    for (const gate of [...work.gates]) {
      gate.y += dt * 0.38;
      gate.el.style.top = gate.y * 100 + "%";
      const gapL = gate.x - gate.w / 2, gapR = gate.x + gate.w / 2;
      const left = gate.el.children[0], right = gate.el.children[1];
      if (left) left.style.width = gapL * 100 + "%";
      if (right) { right.style.left = gapR * 100 + "%"; right.style.width = (1 - gapR) * 100 + "%"; }
      if (gate.y > 0.76 && gate.y < 0.9) {
        if (work.px < gapL + 0.04 || work.px > gapR - 0.04) work._fail = "Hit the bank";
        else if (!gate.ok) { gate.ok = true; work.passed += 1; work.got = work.passed; if (work.passed >= 4) work._win = true; }
      }
      if (gate.y > 1.1) { gate.el.remove(); work.gates = work.gates.filter((x) => x !== gate); }
    }
    if (work.t > 18) work._fail = "Time";
  } else if (g === "climb") {
    work.spawn -= dt;
    if (work.phase === "up") {
      if (work.py < 0.2) work.phase = "cut";
      if (work.spawn <= 0) {
        const n = el(`<div class="mg-nut"></div>`);
        const nut = { el: n, x: 0.2 + Math.random() * 0.6, y: -0.08, v: 0.4 };
        setPos(n, nut.x, nut.y);
        st.append(n);
        work.items.push(nut);
        work.spawn = 0.7;
      }
      for (const n of [...work.items]) {
        n.y += n.v * dt;
        setPos(n.el, n.x, n.y);
        if (hit(n, { x: work.px, y: work.py }, 0.08)) work._fail = "Hit";
        if (n.y > 1.1) { n.el.remove(); work.items = work.items.filter((x) => x !== n); }
      }
    }
    if (work.t > 16 && work.phase !== "cut") work._fail = "Time";
  } else if (g === "pan" || g === "trace" || g === "flame" || g === "bin") {
    if (work.t > 20) work._fail = "Time";
  }
}

export function miniHint(job) {
  return job.hint;
}
