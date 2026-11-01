/* ——— Anneaux dessinés (canvas) ———
   Chaque avatar a un petit canvas deux fois plus grand que lui, centré dessus.
   Les anneaux réagissent au volume (lvl de 0 à 1) : plus la voix est forte, plus ils bougent et brillent.
   - wave   : anneau lumineux qui ondule comme des vagues
   - aura   : plusieurs fils emmêlés qui se tordent autour de l'avatar, avec des gouttes qui s'échappent
   - flame  : couronne de flammes en particules qui montent
   - energy : contours électriques qui glissent les uns sur les autres */
const Rings = (() => {
  const TYPES = ["wave", "aura", "flame", "energy"];
  const TAU = Math.PI * 2;
  // Bruit doux : somme de sinus aux fréquences entières (la boucle se referme proprement autour du cercle)
  const noise = (a, t, s) =>
    Math.sin(a * 3 + t * 1.3 + s) * 0.5 + Math.sin(a * 5 - t * 1.7 + s * 2.1) * 0.3 + Math.sin(a * 8 + t * 2.3 + s * 3.7) * 0.2;

  function ensure(tile) {
    let cv = tile.fx;
    if (!cv) {
      cv = tile.fx = document.createElement("canvas");
      cv.className = "fx";
      tile.el.querySelector(".av-wrap").prepend(cv);
      tile.fxParts = [];
      tile.fxSize = 0;
    }
    // Taille de l'avatar à l'écran (sans les transformations 3D), vérifiée de temps en temps
    if (!tile.fxCheck || --tile.fxCheck <= 0) {
      tile.fxCheck = 30;
      const w = cv.parentElement.offsetWidth || 100;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const px = Math.min(720, Math.round(w * 2 * dpr));
      if (px !== tile.fxSize) { cv.width = cv.height = tile.fxSize = px; }
    }
    return cv;
  }

  function path(x, c, R, amp, fn) {
    x.beginPath();
    const n = 120;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const r = R + amp * fn(a);
      const px = c + Math.cos(a) * r, py = c + Math.sin(a) * r;
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.closePath();
  }

  function wave(x, c, R, lvl, t, seed, col) {
    // Trois anneaux translucides décalés, qui ondulent chacun à leur rythme
    const amp = R * (0.03 + lvl * 0.09);
    x.globalCompositeOperation = "lighter";
    [[0, 0.9, 6], [2.1, 0.55, 5], [4.2, 0.35, 7]].forEach(([o, alpha, k], i) => {
      const RR = R * (1.05 + lvl * 0.1 + i * 0.025);
      path(x, c, RR, amp, (a) => Math.sin(a * k + t * (1.6 + i * 0.4) + seed + o) * 0.7 + Math.sin(a * (k - 3) - t * 1.1 + o) * 0.3);
      x.lineWidth = R * (0.11 - i * 0.02);
      x.strokeStyle = i === 1 ? col.b : col.a;
      x.globalAlpha = alpha * Math.min(1, lvl * 1.8);
      x.shadowColor = col.a;
      x.shadowBlur = R * 0.25;
      x.stroke();
    });
  }

  function aura(x, c, R, lvl, t, seed, col, tile) {
    // Fils emmêlés : contour sombre épais + cœur clair fin, comme un trait d'encre lumineux
    const strands = 7;
    const amp = R * (0.05 + lvl * 0.16);
    const alpha = Math.min(1, lvl * 2);
    for (let s = 0; s < strands; s++) {
      const so = seed + s * 1.93;
      const RR = R * (1.04 + 0.05 * Math.sin(s * 2.4 + t * 0.7) + lvl * 0.06);
      const fn = (a) => noise(a, t * (0.9 + s * 0.12), so) + 0.35 * Math.sin(a * 11 + t * 3 + so);
      path(x, c, RR, amp, fn);
      x.globalAlpha = alpha * 0.9;
      x.lineWidth = R * 0.075;
      x.strokeStyle = col.a;
      x.shadowColor = col.a;
      x.shadowBlur = R * 0.18;
      x.stroke();
      x.shadowBlur = 0;
      x.lineWidth = R * 0.022;
      x.strokeStyle = col.b;
      x.stroke();
    }
    // Gouttes qui se détachent quand la voix est forte
    const parts = tile.fxParts;
    if (lvl > 0.3 && Math.random() < lvl * 0.35) {
      const a = Math.random() * TAU;
      parts.push({ a, r: R * 1.15, v: R * (0.004 + Math.random() * 0.01), life: 1, s: R * (0.03 + Math.random() * 0.05) });
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.r += p.v * 3; p.life -= 0.025;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      x.globalAlpha = p.life * alpha;
      x.beginPath();
      x.ellipse(c + Math.cos(p.a) * p.r, c + Math.sin(p.a) * p.r, p.s * 1.6, p.s, p.a, 0, TAU);
      x.lineWidth = R * 0.02;
      x.strokeStyle = col.a;
      x.stroke();
    }
  }

  // Petite lueur ronde pré-dessinée (bien plus joli et rapide qu'un carré)
  const sprites = new Map();
  function sprite(color) {
    let sp = sprites.get(color);
    if (sp) return sp;
    sp = document.createElement("canvas");
    sp.width = sp.height = 32;
    const g = sp.getContext("2d"), grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "#fff");
    grad.addColorStop(0.25, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    sprites.set(color, sp);
    return sp;
  }

  function flame(x, c, R, lvl, t, seed, col, tile) {
    // Couronne de flammes : des langues de feu qui lèchent le bord, et des étincelles qui s'envolent
    x.globalCompositeOperation = "lighter";
    const alpha = Math.min(1, 0.25 + lvl * 1.3);
    // Lueur de base
    x.globalAlpha = alpha * 0.8;
    path(x, c, R * 1.04, R * 0.02, (a) => noise(a, t * 2, seed));
    x.lineWidth = R * 0.1;
    x.strokeStyle = col.a;
    x.shadowColor = col.a;
    x.shadowBlur = R * 0.3;
    x.stroke();
    x.shadowBlur = 0;
    // Langues de feu : deux couches (large et colorée, fine et presque blanche)
    const n = 22;
    for (const [wide, color, k] of [[1, col.a, 1], [0.45, col.b, 0.7]]) {
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * TAU + seed + Math.sin(t * 0.7 + i) * 0.05;
        const flick = 0.5 + 0.5 * noise(a0, t * 3.2, seed + i);
        const L = R * (0.12 + lvl * 0.6) * (0.35 + flick) * k;
        const w = (TAU / n) * 0.75 * wide;
        const sway = Math.sin(t * 5 + i * 1.7) * 0.18;
        const r0 = R * 0.99;
        const tipA = a0 + sway * 0.25;
        const bx1 = c + Math.cos(a0 - w) * r0, by1 = c + Math.sin(a0 - w) * r0;
        const bx2 = c + Math.cos(a0 + w) * r0, by2 = c + Math.sin(a0 + w) * r0;
        const tx = c + Math.cos(tipA) * (r0 + L), ty = c + Math.sin(tipA) * (r0 + L);
        const mx = c + Math.cos(a0 + sway) * (r0 + L * 0.55), my = c + Math.sin(a0 + sway) * (r0 + L * 0.55);
        const g = x.createLinearGradient(c + Math.cos(a0) * r0, c + Math.sin(a0) * r0, tx, ty);
        g.addColorStop(0, color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        x.fillStyle = g;
        x.globalAlpha = alpha * (0.55 + 0.45 * flick);
        x.beginPath();
        x.moveTo(bx1, by1);
        x.quadraticCurveTo(mx, my, tx, ty);
        x.quadraticCurveTo(mx, my, bx2, by2);
        x.closePath();
        x.fill();
      }
    }
    // Étincelles : partent du bord, s'éloignent en tourbillonnant et s'éteignent
    const parts = tile.fxParts;
    const spawn = Math.round(lvl * 10);
    for (let i = 0; i < spawn; i++) {
      const a = Math.random() * TAU;
      parts.push({ a, r: R * (1.05 + Math.random() * 0.1), v: R * (0.006 + Math.random() * 0.012) * (0.5 + lvl), spin: (Math.random() - 0.5) * 0.02, life: 1, s: R * (0.025 + Math.random() * 0.05) });
    }
    if (parts.length > 400) parts.splice(0, parts.length - 400);
    const spA = sprite(col.a), spB = sprite(col.b);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.r += p.v; p.a += p.spin; p.life -= 0.03;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      x.globalAlpha = p.life * alpha;
      const sz = p.s * (0.6 + p.life);
      x.drawImage(p.life > 0.6 ? spB : spA, c + Math.cos(p.a) * p.r - sz, c + Math.sin(p.a) * p.r - sz, sz * 2, sz * 2);
    }
  }

  function energy(x, c, R, lvl, t, seed, col) {
    // Contours électriques : quatre fils fins, très lumineux, qui glissent et se croisent
    x.globalCompositeOperation = "lighter";
    const alpha = Math.min(1, lvl * 1.8);
    for (let s = 0; s < 4; s++) {
      const so = seed * 1.7 + s * 2.6;
      const RR = R * (1.02 + s * 0.012 + lvl * 0.05);
      const amp = R * (0.025 + lvl * 0.06);
      path(x, c, RR, amp, (a) => noise(a, t * (0.6 + s * 0.25), so) + 0.25 * Math.sin(a * 17 + t * 6 + so));
      x.globalAlpha = alpha * (s ? 0.6 : 1);
      x.lineWidth = R * 0.05;
      x.strokeStyle = col.a;
      x.shadowColor = col.a;
      x.shadowBlur = R * 0.35;
      x.stroke();
      x.shadowBlur = 0;
      x.lineWidth = R * 0.016;
      x.strokeStyle = "#fff";
      x.stroke();
    }
  }

  const DRAW = { wave, aura, flame, energy };

  // Appelé à chaque image pour chaque avatar
  function draw(tile, type, t, col) {
    if (!TYPES.includes(type)) { if (tile.fx) { tile.fx.remove(); tile.fx = null; } return; }
    const cv = ensure(tile);
    const x = cv.getContext("2d");
    const lvl = tile.lvl;
    // Silence : on efface une fois puis on ne dessine plus rien
    if (lvl < 0.015 && !(tile.fxParts && tile.fxParts.length)) {
      if (tile.fxDirty) { x.clearRect(0, 0, cv.width, cv.height); tile.fxDirty = false; }
      return;
    }
    tile.fxDirty = true;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = "source-over";
    x.globalAlpha = 1;
    x.shadowBlur = 0;
    x.clearRect(0, 0, cv.width, cv.height);
    const c = cv.width / 2, R = cv.width / 4;
    if (type !== tile.fxType) { tile.fxParts = []; tile.fxType = type; }
    DRAW[type](x, c, R, Math.max(0, Math.min(1, lvl)), t / 1000, tile.seed, col, tile);
  }

  return { TYPES, draw };
})();
