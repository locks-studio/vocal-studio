/* ——— Timeline ———
   Lignes : règle du temps, « Visuel » (scènes), une ligne par personne, « Sons » (musique, bruitages), puis « + Personne ».
   Blocs : on les déplace (même vers une autre ligne), on tire leurs bords pour les raccourcir, S coupe, Suppr efface. */
const TL = {
  cv: null, g: null, w: 0, h: 0, dpr: 1,
  left: 190,     // colonne des noms
  t0: 0,         // temps au bord gauche
  pps: 20,       // pixels par seconde
  scrollY: 0,
  drag: null,
  hover: null,
  rec: new Map(), // touche 1..9 tenue pendant la lecture → départ du passage de parole
};
const RULER = 26, ROW_VIS = 40, ROW_P = 58, ROW_SONS = 50, ROW_ADD = 34;

function rows() {
  const out = [{ kind: "ruler", h: RULER }, { kind: "visual", h: ROW_VIS, label: "Visuel" }];
  for (const p of P.people) out.push({ kind: "person", id: p.id, h: ROW_P, label: p.name, color: p.color, p });
  out.push({ kind: "sons", id: SONS, h: ROW_SONS, label: "Sons", color: "#9aa0b4" });
  out.push({ kind: "add", h: ROW_ADD });
  let y = 0;
  for (const r of out) { r.y = r.kind === "ruler" ? 0 : y - TL.scrollY; y += r.h; }
  // La règle reste en haut, le reste défile
  return out;
}
const tx = (t) => TL.left + (t - TL.t0) * TL.pps;
const xt = (x) => TL.t0 + (x - TL.left) / TL.pps;

function initTimeline() {
  TL.cv = $("#tl");
  TL.g = TL.cv.getContext("2d");
  new ResizeObserver(sizeTimeline).observe($("#tlWrap"));
  TL.cv.addEventListener("pointerdown", tlDown);
  TL.cv.addEventListener("pointermove", tlMove);
  TL.cv.addEventListener("pointerup", tlUp);
  TL.cv.addEventListener("pointercancel", tlUp);
  TL.cv.addEventListener("dblclick", tlDbl);
  TL.cv.addEventListener("wheel", tlWheel, { passive: false });
  TL.cv.addEventListener("pointerleave", () => { TL.hover = null; TL.cv.style.cursor = ""; });
  sizeTimeline();
}
function sizeTimeline() {
  const r = $("#tlWrap").getBoundingClientRect();
  TL.dpr = devicePixelRatio || 1;
  TL.w = r.width; TL.h = r.height;
  TL.cv.width = Math.round(r.width * TL.dpr);
  TL.cv.height = Math.round(r.height * TL.dpr);
}

// Zoom : le curseur 0..1 va de « tout le projet » à « 400 px par seconde »
function minPps() { return Math.max(0.5, (TL.w - TL.left - 30) / duration()); }
function setZoom(z, anchorX) {
  const lo = Math.log(minPps()), hi = Math.log(400);
  const pps = Math.exp(lo + (hi - lo) * Math.max(0, Math.min(1, z)));
  const ax = anchorX ?? Math.max(TL.left, Math.min(TL.w, tx(now())));
  const at = xt(ax);
  TL.pps = pps;
  TL.t0 = Math.max(0, at - (ax - TL.left) / pps);
  $("#zoom").value = z;
}
function zoomValue() {
  const lo = Math.log(minPps()), hi = Math.log(400);
  return (Math.log(TL.pps) - lo) / (hi - lo);
}
function fitAll() { TL.t0 = 0; setZoom(0, TL.left); }

/* — Dessin — */
function niceStep(pps) {
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
  return steps.find((s) => s * pps >= 70) || 3600;
}
function drawTimeline() {
  const g = TL.g, W = TL.w, H = TL.h;
  g.setTransform(TL.dpr, 0, 0, TL.dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  g.fillStyle = "#07070a";
  g.fillRect(0, 0, W, H);
  const R = rows();
  const tEnd = xt(W);
  const step = niceStep(TL.pps);

  // Lignes (fond)
  for (const r of R) {
    if (r.kind === "ruler" || r.y + r.h < RULER || r.y > H) continue;
    const sel = (r.kind === "person" && Sel.kind === "person" && Sel.id === r.id);
    g.fillStyle = sel ? "rgba(252,187,221,.06)" : r.kind === "visual" ? "#0c0c11" : "#09090d";
    g.fillRect(TL.left, r.y, W - TL.left, r.h);
    g.fillStyle = "rgba(255,255,255,.06)";
    g.fillRect(0, r.y + r.h - 1, W, 1);
  }
  // Graduations verticales
  g.fillStyle = "rgba(255,255,255,.035)";
  for (let t = Math.floor(TL.t0 / step) * step; t < tEnd; t += step) g.fillRect(Math.round(tx(t)), RULER, 1, H);

  g.save();
  g.beginPath();
  g.rect(TL.left, RULER, W - TL.left, H - RULER);
  g.clip();
  for (const r of R) {
    if (r.y + r.h < RULER || r.y > H) continue;
    if (r.kind === "visual") drawScenes(r);
    if (r.kind === "person" || r.kind === "sons") for (const c of P.clips) if (c.row === r.id) drawClip(c, r);
  }
  // Fantôme d'un bloc déplacé vers une autre ligne
  g.restore();

  // Colonne des noms
  for (const r of R) {
    if (r.kind === "ruler" || r.y + r.h < RULER || r.y > H) continue;
    g.fillStyle = "#0e0e13";
    g.fillRect(0, r.y, TL.left, r.h);
    g.fillStyle = "rgba(255,255,255,.06)";
    g.fillRect(0, r.y + r.h - 1, TL.left, 1);
    g.textBaseline = "middle";
    if (r.kind === "add") {
      g.fillStyle = TL.hover === "add" ? "#fcbbdd" : "#8a8d99";
      g.font = "500 12.5px Figtree, sans-serif";
      g.fillText("+ Ajouter une personne", 14, r.y + r.h / 2);
      continue;
    }
    if (r.kind === "visual") {
      g.fillStyle = "#8a8d99";
      g.font = "600 11px Figtree, sans-serif";
      g.fillText("VISUEL", 14, r.y + r.h / 2);
      continue;
    }
    // Pastille de couleur (ou numéro de touche), nom, boutons muet / solo
    const idx = P.people.indexOf(r.p);
    g.fillStyle = r.color;
    g.beginPath(); g.arc(22, r.y + r.h / 2, 9, 0, 7); g.fill();
    if (r.kind === "person" && idx < 9) {
      g.fillStyle = "#1a0d16"; g.font = "700 10.5px Figtree, sans-serif"; g.textAlign = "center";
      g.fillText(String(idx + 1), 22, r.y + r.h / 2 + 0.5); g.textAlign = "left";
    }
    g.fillStyle = TL.rec.has(r.id) ? "#fcbbdd" : "#f4f5f8";
    g.font = "600 13px Figtree, sans-serif";
    g.fillText(ellipsis(g, r.label, TL.left - 100), 40, r.y + r.h / 2);
    const mu = Player.mutedRows.has(r.id), so = Player.soloRow === r.id;
    pill(g, TL.left - 56, r.y + r.h / 2 - 10, "M", mu, "#ff8a8a");
    pill(g, TL.left - 30, r.y + r.h / 2 - 10, "S", so, "#ffc46b");
  }

  // Règle du temps
  g.fillStyle = "#0e0e13";
  g.fillRect(0, 0, W, RULER);
  g.fillStyle = "rgba(255,255,255,.08)";
  g.fillRect(0, RULER - 1, W, 1);
  g.font = "500 10.5px JetBrains Mono, monospace";
  g.textBaseline = "middle";
  for (let t = Math.floor(TL.t0 / step) * step; t < tEnd; t += step) {
    const x = Math.round(tx(t));
    if (x < TL.left) continue;
    g.fillStyle = "rgba(255,255,255,.2)";
    g.fillRect(x, RULER - 8, 1, 7);
    g.fillStyle = "#8a8d99";
    g.fillText(fmt(t, step < 1), x + 4, RULER / 2 - 1);
  }
  g.fillStyle = "#5d606b";
  g.font = "600 10.5px Figtree, sans-serif";
  g.fillText(P.format === "9:16" ? "VERTICAL 1080 × 1920" : "1920 × 1080 · 60 i/s", 14, RULER / 2);

  // Tête de lecture
  const px = Math.round(tx(now()));
  if (px >= TL.left) {
    g.fillStyle = "#fcbbdd";
    g.fillRect(px, 0, 1.5, H);
    g.beginPath(); g.moveTo(px - 6, 0); g.lineTo(px + 7.5, 0); g.lineTo(px + 0.75, 9); g.closePath(); g.fill();
  }
  // Ligne d'accroche pendant un glisser
  if (TL.drag && TL.drag.snapX != null) {
    g.fillStyle = "rgba(255,227,241,.7)";
    g.fillRect(Math.round(TL.drag.snapX), RULER, 1, H);
  }
}
function pill(g, x, y, txt, on, col) {
  g.fillStyle = on ? col : "rgba(255,255,255,.06)";
  roundRect(g, x, y, 22, 20, 6); g.fill();
  g.fillStyle = on ? "#14070d" : "#8a8d99";
  g.font = "700 10.5px Figtree, sans-serif"; g.textAlign = "center";
  g.fillText(txt, x + 11, y + 10.5); g.textAlign = "left";
}
function ellipsis(g, s, w) {
  if (g.measureText(s).width <= w) return s;
  while (s.length > 1 && g.measureText(s + "…").width > w) s = s.slice(0, -1);
  return s + "…";
}
function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function drawClip(c, r) {
  const g = TL.g;
  const x0 = tx(c.start), x1 = tx(c.start + c.dur);
  if (x1 < TL.left || x0 > TL.w) return;
  const y = r.y + 5, h = r.h - 10;
  const sel = Sel.kind === "clip" && Sel.id === c.id;
  const col = r.kind === "sons" ? "#9aa0b4" : r.color;
  g.save();
  roundRect(g, x0, y, Math.max(3, x1 - x0), h, 7);
  g.fillStyle = hexA(col, c.kind === "talk" ? 0.32 : 0.13);
  g.fill();
  g.clip();
  // Forme du son : la courbe de volume, en barres
  const env = ENV.get(c.file);
  if (c.kind === "audio" && env) {
    g.fillStyle = hexA(col, 0.85);
    const a = Math.max(x0, TL.left), b = Math.min(x1, TL.w);
    const mid = y + h / 2;
    for (let x = Math.floor(a); x < b; x += 2) {
      const t0 = xt(x) - c.start + c.in, t1 = xt(x + 2) - c.start + c.in;
      let i0 = Math.max(0, Math.floor(t0 / env.step)), i1 = Math.min(env.lvl.length, Math.ceil(t1 / env.step));
      let m = 0;
      if (i1 - i0 > 400) { const s = Math.ceil((i1 - i0) / 400); for (let i = i0; i < i1; i += s) m = Math.max(m, env.lvl[i]); }
      else for (let i = i0; i < i1; i++) if (env.lvl[i] > m) m = env.lvl[i];
      const hh = (m / 255) * (h / 2 - 3);
      if (hh > 0.4) g.fillRect(x, mid - hh, 1.4, hh * 2);
    }
  } else if (c.kind === "audio") {
    g.fillStyle = "#8a8d99"; g.font = "500 11px Figtree, sans-serif"; g.textBaseline = "middle";
    g.fillText("Analyse…", Math.max(x0, TL.left) + 8, y + h / 2);
  }
  // Nom du bloc
  if (x1 - x0 > 60) {
    g.font = "600 10.5px Figtree, sans-serif"; g.textBaseline = "top";
    g.fillStyle = "rgba(255,255,255,.75)";
    g.fillText(c.kind === "talk" ? "Parle" : c.name, Math.max(x0, TL.left) + 7, y + 4);
  }
  g.restore();
  roundRect(g, x0, y, Math.max(3, x1 - x0), h, 7);
  g.strokeStyle = sel ? "#fff" : hexA(col, 0.5);
  g.lineWidth = sel ? 2 : 1;
  g.stroke();
}

function drawScenes(r) {
  const g = TL.g;
  sortScenes();
  const end = duration();
  P.scenes.forEach((s, i) => {
    const next = P.scenes[i + 1] ? P.scenes[i + 1].start : end;
    const x0 = tx(s.start), x1 = tx(next);
    if (x1 < TL.left || x0 > TL.w) return;
    const sel = Sel.kind === "scene" && Sel.id === s.id;
    roundRect(g, x0 + 1, r.y + 5, Math.max(4, x1 - x0 - 2), r.h - 10, 7);
    const grad = g.createLinearGradient(x0, 0, x1, 0);
    grad.addColorStop(0, "rgba(252,187,221,.2)"); grad.addColorStop(1, "rgba(255,227,241,.08)");
    g.fillStyle = grad; g.fill();
    g.strokeStyle = sel ? "#fff" : "rgba(252,187,221,.35)"; g.lineWidth = sel ? 2 : 1; g.stroke();
    g.fillStyle = "#ffe3f1"; g.font = "600 11px Figtree, sans-serif"; g.textBaseline = "middle";
    if (x1 - x0 > 50) g.fillText(ellipsis(g, lookLabel(s.look), x1 - Math.max(x0, TL.left) - 16), Math.max(x0, TL.left) + 9, r.y + r.h / 2);
  });
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* — Souris — */
function rowAt(y) {
  if (y < RULER) return { kind: "ruler" };
  return rows().find((r) => r.kind !== "ruler" && y >= r.y && y < r.y + r.h) || null;
}
function clipAt(r, x) {
  if (!r || (r.kind !== "person" && r.kind !== "sons")) return null;
  const t = xt(x);
  const list = P.clips.filter((c) => c.row === r.id && t >= c.start && t <= c.start + c.dur);
  // Le plus court au-dessus (pour attraper un petit bloc posé sur un grand)
  return list.sort((a, b) => a.dur - b.dur)[0] || null;
}
function sceneBlockAt(x) {
  sortScenes();
  const t = xt(x);
  let s = P.scenes[0];
  for (const x2 of P.scenes) if (x2.start <= t) s = x2;
  return s;
}
// Points d'accroche : tête de lecture, début, bords des autres blocs et des scènes
function snapTime(t, ignoreId) {
  const lim = 8 / TL.pps;
  let best = null, bd = lim;
  const cand = [0, now(), ...P.scenes.map((s) => s.start)];
  for (const c of P.clips) if (c.id !== ignoreId) cand.push(c.start, c.start + c.dur);
  for (const v of cand) { const d = Math.abs(v - t); if (d < bd) { bd = d; best = v; } }
  return best;
}

function tlDown(e) {
  if (e.button !== 0) return;
  const x = e.offsetX, y = e.offsetY;
  const r = rowAt(y);
  TL.cv.setPointerCapture(e.pointerId);
  if (!r) return;
  if (x < TL.left) {
    if (r.kind === "add") { checkpoint(); const p = addPerson(); select("person", p.id); return; }
    if (r.kind === "person" || r.kind === "sons") {
      // Boutons M (muet) et S (solo)
      const cy = r.y + r.h / 2;
      if (Math.abs(y - cy) < 11 && x >= TL.left - 56 && x < TL.left - 34) { Player.mutedRows.has(r.id) ? Player.mutedRows.delete(r.id) : Player.mutedRows.add(r.id); return; }
      if (Math.abs(y - cy) < 11 && x >= TL.left - 30 && x < TL.left - 8) { Player.soloRow = Player.soloRow === r.id ? null : r.id; return; }
      if (r.kind === "person") select("person", r.id); else select(null);
    }
    if (r.kind === "visual") select("scene", sceneAt(now()).id);
    return;
  }
  if (r.kind === "ruler") { TL.drag = { type: "scrub" }; seek(xt(x)); return; }
  if (r.kind === "visual") {
    const s = sceneBlockAt(x);
    // Bord gauche d'une scène (sauf la première) : on déplace la limite
    if (s !== P.scenes[0] && Math.abs(tx(s.start) - x) < 6) { beginGesture(); TL.drag = { type: "sceneEdge", id: s.id }; return; }
    select("scene", s.id);
    TL.drag = { type: "scrub" };
    seek(xt(x));
    return;
  }
  const c = clipAt(r, x);
  if (c) {
    select("clip", c.id);
    const x0 = tx(c.start), x1 = tx(c.start + c.dur);
    beginGesture();
    if (x - x0 < 7 && x1 - x0 > 16) TL.drag = { type: "trimL", id: c.id, start: c.start, inn: c.in, dur: c.dur };
    else if (x1 - x < 7 && x1 - x0 > 16) TL.drag = { type: "trimR", id: c.id, dur: c.dur };
    else TL.drag = { type: "move", id: c.id, grab: xt(x) - c.start, row: c.row };
    return;
  }
  select(null);
  TL.drag = { type: "scrub" };
  seek(xt(x));
}

function tlMove(e) {
  const x = e.offsetX, y = e.offsetY;
  const d = TL.drag;
  if (!d) {
    const r = rowAt(y);
    TL.hover = r && r.kind === "add" && x < TL.left ? "add" : null;
    let cur = "";
    if (r && x >= TL.left) {
      const c = clipAt(r, x);
      if (c) { const x0 = tx(c.start), x1 = tx(c.start + c.dur); cur = (x - x0 < 7 || x1 - x < 7) && x1 - x0 > 16 ? "ew-resize" : "grab"; }
      else if (r.kind === "visual") { const s = sceneBlockAt(x); cur = s !== P.scenes[0] && Math.abs(tx(s.start) - x) < 6 ? "ew-resize" : ""; }
    } else if (r && x < TL.left && (r.kind === "add" || r.kind === "person")) cur = "pointer";
    TL.cv.style.cursor = cur;
    return;
  }
  d.snapX = null;
  const snap = (t, id) => { if (e.altKey) return t; const s = snapTime(t, id); if (s != null) { d.snapX = tx(s); return s; } return t; };
  if (d.type === "scrub") { seek(xt(x)); return; }
  if (d.type === "sceneEdge") {
    const s = scene(d.id);
    const i = P.scenes.indexOf(s);
    const lo = P.scenes[i - 1].start + 0.1, hi = P.scenes[i + 1] ? P.scenes[i + 1].start - 0.1 : duration();
    s.start = Math.max(lo, Math.min(hi, snap(xt(x))));
    return;
  }
  const c = clip(d.id);
  if (!c) return;
  if (d.type === "move") {
    let st = xt(x) - d.grab;
    // Accroche par le début ou par la fin du bloc
    const a = e.altKey ? null : snapTime(st, c.id), b = e.altKey ? null : snapTime(st + c.dur, c.id);
    if (a != null && (b == null || Math.abs(a - st) <= Math.abs(b - st - c.dur))) { st = a; d.snapX = tx(a); }
    else if (b != null) { st = b - c.dur; d.snapX = tx(b); }
    c.start = Math.max(0, st);
    const r = rowAt(y);
    if (r && (r.kind === "person" || r.kind === "sons") && (c.kind === "audio" || r.kind === "person")) c.row = r.id;
  } else if (d.type === "trimL") {
    // Le début bouge, la fin reste en place
    const min = d.start - d.inn;                       // pas avant le début du fichier
    const max = d.start + d.dur - 0.05;
    const st = Math.max(c.kind === "talk" ? 0 : min, Math.min(max, snap(xt(x), c.id)));
    c.in = c.kind === "talk" ? 0 : d.inn + (st - d.start);
    c.dur = d.dur - (st - d.start);
    c.start = st;
  } else if (d.type === "trimR") {
    const maxEnd = c.kind === "talk" ? Infinity : c.start + (c.srcDur - c.in);
    const end = Math.max(c.start + 0.05, Math.min(maxEnd, snap(xt(x), c.id)));
    c.dur = end - c.start;
  }
  if (window.onProjectChange) window.onProjectChange(true);
}

function tlUp() {
  if (!TL.drag) return;
  if (TL.drag.type !== "scrub") endGesture();
  TL.drag = null;
}

// Double-clic sur une ligne vide de personne : ajoute un passage « parle » de 2 s (mode audio mélangé)
function tlDbl(e) {
  const r = rowAt(e.offsetY);
  if (!r || e.offsetX < TL.left || r.kind !== "person" || clipAt(r, e.offsetX)) return;
  checkpoint();
  const c = { id: uid(), row: r.id, kind: "talk", file: null, name: "Parle", start: Math.max(0, xt(e.offsetX)), in: 0, dur: 2, srcDur: Infinity, gain: 1 };
  P.clips.push(c);
  select("clip", c.id);
}

function tlWheel(e) {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const z = zoomValue() - Math.sign(e.deltaY) * 0.05;
    setZoom(z, Math.max(TL.left, e.offsetX));
    return;
  }
  if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    TL.t0 = Math.max(0, TL.t0 + (e.deltaX || e.deltaY) / TL.pps);
    return;
  }
  // Molette seule : défilement vertical s'il y a beaucoup de personnes, sinon horizontal
  const total = rows().reduce((s, r) => s + (r.kind === "ruler" ? 0 : r.h), 0) + RULER;
  if (total > TL.h) TL.scrollY = Math.max(0, Math.min(total - TL.h + 20, TL.scrollY + e.deltaY));
  else TL.t0 = Math.max(0, TL.t0 + e.deltaY / TL.pps);
}

// La tête de lecture reste visible pendant la lecture (la vue suit par pages)
function followPlayhead() {
  if (!Player.playing || TL.drag) return;
  const x = tx(now());
  if (x > TL.w - 40 || x < TL.left) TL.t0 = Math.max(0, now() - 30 / TL.pps);
}

/* — Couper, effacer — */
function cutAtPlayhead() {
  const t = now();
  // Une scène sélectionnée : on coupe la ligne Visuel
  if (Sel.kind === "scene") return splitScene(t);
  // Un bloc sélectionné : on ne coupe que lui ; sinon tous les blocs sous la tête de lecture
  const inside = (c) => c && t > c.start + 0.02 && t < c.start + c.dur - 0.02;
  const targets = Sel.kind === "clip" ? [clip(Sel.id)].filter(inside) : P.clips.filter(inside);
  if (!targets.length) return toast("Rien à couper sous la tête de lecture");
  checkpoint();
  for (const c of targets) {
    const cut = t - c.start;
    const right = { ...c, id: uid(), start: t, in: c.in + (c.kind === "talk" ? 0 : cut), dur: c.dur - cut };
    c.dur = cut;
    P.clips.push(right);
  }
}
// Nouvelle scène à partir de t, avec une copie du style en cours (on le change ensuite à droite)
function splitScene(t) {
  const cur = sceneAt(t);
  if (Math.abs(cur.start - t) < 0.05) return toast("Une scène commence déjà ici");
  checkpoint();
  const s = { id: uid(), start: t, look: JSON.parse(JSON.stringify(cur.look)) };
  P.scenes.push(s);
  sortScenes();
  select("scene", s.id);
  toast("Nouvelle scène : change son style à droite");
}
function deleteSelection() {
  if (Sel.kind === "clip") { checkpoint(); P.clips = P.clips.filter((c) => c.id !== Sel.id); select(null); }
  else if (Sel.kind === "scene") {
    const s = scene(Sel.id);
    if (!s || s === P.scenes[0]) return toast("La première scène ne s'efface pas (change son style à droite)");
    checkpoint();
    P.scenes = P.scenes.filter((x) => x !== s);
    select("scene", sceneAt(s.start).id);
  } else if (Sel.kind === "person") removePerson(Sel.id);
}
function removePerson(id) {
  const p = person(id);
  if (!p) return;
  const n = clipsOf(id).length;
  if (n && !confirm(`Supprimer ${p.name} et ses ${n} bloc(s) audio ?`)) return;
  checkpoint();
  P.people = P.people.filter((x) => x.id !== id);
  P.clips = P.clips.filter((c) => c.row !== id);
  select(null);
}

/* — Dire qui parle au clavier (audio mélangé) : maintenir 1..9 pendant la lecture — */
function recKeyDown(n) {
  const p = P.people[n - 1];
  if (!p || !Player.playing || TL.rec.has(p.id)) return;
  TL.rec.set(p.id, now());
}
function recKeyUp(n) {
  const p = P.people[n - 1];
  if (!p || !TL.rec.has(p.id)) return;
  const st = TL.rec.get(p.id);
  TL.rec.delete(p.id);
  const en = now();
  if (en - st < 0.1) return;
  checkpoint();
  P.clips.push({ id: uid(), row: p.id, kind: "talk", file: null, name: "Parle", start: st, in: 0, dur: en - st, srcDur: Infinity, gain: 1 });
}
