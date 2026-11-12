// Fonds « montage » dessinés en direct : damier étoilé, vagues découpées, grille néon.
// Chaque prise de parole peut changer de motif et de couleur, comme un cut au montage.
(function () {
  const PALETTES = [
    { base: "#c9a227", light: "#e8c74a", dark: "#9c7c12" }, // or
    { base: "#2fb3d3", light: "#6fdcf0", dark: "#1a83a0" }, // cyan
    { base: "#8f55ef", light: "#b892ff", dark: "#6431c4" }, // violet
    { base: "#e3364f", light: "#ff7088", dark: "#a8172e" }, // rouge
    { base: "#8b8b8b", light: "#bdbdbd", dark: "#5d5d5d" }, // gris
    { base: "#4d78ee", light: "#86a6ff", dark: "#2c51c2" }, // bleu
    { base: "#a49a2c", light: "#cfc456", dark: "#766f14" }, // olive
  ];
  const KINDS = ["stars", "topo", "space"];

  const stars = Array.from({ length: 22 }, () => ({
    x: Math.random(), y: Math.random(), r: 14 + Math.random() * 46,
    a: Math.random() * 6, va: (Math.random() - 0.5) * 0.0012, vy: 0.00003 + Math.random() * 0.00006,
  }));

  function star(ctx, x, y, r, a) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r;
      const an = a + (i * Math.PI) / 5 - Math.PI / 2;
      ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr);
    }
    ctx.closePath();
  }

  function drawStars(ctx, w, h, t, p, energy, sp) {
    ctx.fillStyle = p.base;
    ctx.fillRect(0, 0, w, h);
    // Damier qui défile en diagonale
    const s = 64, off = (t * 0.02 * sp) % (s * 2);
    ctx.fillStyle = "rgba(255,255,255,.14)";
    for (let y = -s * 2; y < h + s * 2; y += s) {
      for (let x = -s * 2; x < w + s * 2; x += s) {
        if (((x + y) / s) % 2 === 0) ctx.fillRect(x + off, y + off, s, s);
      }
    }
    // Étoiles contourées de blanc, qui flottent et tournent
    ctx.lineJoin = "round";
    for (const st of stars) {
      st.y -= st.vy * 16 * sp * (1 + energy * 2);
      st.a += st.va * 16 * sp;
      if (st.y < -0.15) { st.y = 1.15; st.x = Math.random(); }
      star(ctx, st.x * w, st.y * h, st.r, st.a);
      ctx.fillStyle = p.light;
      ctx.shadowColor = "rgba(255,255,255,.9)";
      ctx.shadowBlur = 14;
      ctx.lineWidth = Math.max(3, st.r * 0.12);
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fill();
    }
  }

  function drawTopo(ctx, w, h, t, p, energy, sp) {
    ctx.fillStyle = p.dark;
    ctx.fillRect(0, 0, w, h);
    const layers = 7;
    const shades = [p.dark, p.base, p.light];
    for (let k = 0; k < layers; k++) {
      const baseY = h * (k / layers) - h * 0.08;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w + 20; x += 20) {
        const y = baseY
          + Math.sin(x * 0.004 + t * 0.0004 * sp + k * 1.7) * h * 0.06
          + Math.sin(x * 0.011 - t * 0.0003 * sp + k) * h * 0.025 * (1 + energy);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.shadowColor = "rgba(0,0,0,.28)";
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = -6;
      ctx.fillStyle = shades[k % 3];
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  function drawGrid(ctx, w, h, t, p, energy, sp) {
    ctx.fillStyle = "#14041f";
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
    g.addColorStop(0, p.dark + "aa");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const s = 56, off = (t * 0.015 * sp) % s;
    ctx.strokeStyle = p.light;
    ctx.lineWidth = 2;
    ctx.shadowColor = p.light;
    ctx.shadowBlur = 10 + energy * 10;
    ctx.beginPath();
    for (let x = -s + off; x < w + s; x += s) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = -s + off; y < h + s; y += s) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    ctx.shadowBlur = 0;
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,.7)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  // Espace : poussière d'étoiles qui scintille, quelques étoiles à 4 branches, étoiles filantes
  const dust = Array.from({ length: 260 }, () => ({
    x: Math.random(), y: Math.random(), r: Math.random() < 0.85 ? 0.4 + Math.random() * 0.7 : 1 + Math.random() * 0.8,
    b: 0.25 + Math.random() * 0.6, tw: 0.0006 + Math.random() * 0.002, ph: Math.random() * 7,
  }));
  const sparkles = Array.from({ length: 9 }, () => ({
    x: Math.random(), y: Math.random(), r: 4 + Math.random() * 7, ph: Math.random() * 7, tw: 0.0008 + Math.random() * 0.001,
  }));
  let meteors = [], nextMeteor = 0;

  function sparkle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
  }

  // pink : variante « Espace rose » (fond rose pâle, étoiles blanches qui brillent)
  function drawSpace(ctx, w, h, t, p, energy, sp, pink) {
    if (pink) {
      // Ciel rose : plus clair au centre, un peu plus profond sur les bords
      const sky = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
      sky.addColorStop(0, `rgb(255,${222 + Math.round(energy * 8)},238)`);
      sky.addColorStop(0.55, "#fcbbdd");
      sky.addColorStop(1, "#f29cc8");
      ctx.fillStyle = sky;
    } else ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    // Léger halo au centre, qui respire avec les voix
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.55);
    g.addColorStop(0, pink ? `rgba(255,255,255,${0.25 + energy * 0.15})` : `rgba(40,44,54,${0.55 + energy * 0.15})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Sur le rose, les étoiles blanches ont une petite lueur pour bien ressortir
    if (pink) { ctx.shadowColor = "rgba(255,255,255,1)"; ctx.shadowBlur = 10; }
    for (const s of dust) {
      const a = s.b * (0.55 + 0.45 * Math.sin(t * s.tw * Math.max(sp, 0.3) + s.ph));
      ctx.fillStyle = pink ? `rgba(255,255,255,${Math.min(1, a * 1.5)})` : `rgba(235,238,245,${a})`;
      ctx.fillRect(s.x * w, s.y * h, s.r * (pink ? 2.2 : 1), s.r * (pink ? 2.2 : 1));
    }
    for (const s of sparkles) {
      const a = 0.35 + 0.5 * Math.abs(Math.sin(t * s.tw * Math.max(sp, 0.3) + s.ph));
      ctx.fillStyle = pink ? `rgba(255,255,255,${Math.min(1, a + 0.3)})` : `rgba(230,233,240,${a})`;
      sparkle(ctx, s.x * w, s.y * h, s.r * (0.8 + 0.3 * a) * (pink ? 1.6 : 1));
    }
    ctx.shadowBlur = 0;

    // Étoile filante de temps en temps (toutes les 3 à 9 secondes)
    if (sp > 0 && t > nextMeteor) {
      nextMeteor = t + (3000 + Math.random() * 6000) / sp;
      // Descend en diagonale, vers la droite ou vers la gauche
      const down = Math.PI * (0.12 + Math.random() * 0.12);
      const ang = Math.random() < 0.5 ? down : Math.PI - down;
      meteors.push({ x: Math.random() * w, y: Math.random() * h * 0.5, ang, born: t, life: 900 + Math.random() * 600, len: 120 + Math.random() * 140 });
    }
    meteors = meteors.filter((m) => t - m.born < m.life);
    for (const m of meteors) {
      const k = (t - m.born) / m.life;
      const dist = k * Math.max(w, h) * 0.45;
      const hx = m.x + Math.cos(m.ang) * dist, hy = m.y + Math.sin(m.ang) * dist;
      const tx = hx - Math.cos(m.ang) * m.len, ty = hy - Math.sin(m.ang) * m.len;
      const fade = Math.sin(k * Math.PI);
      const tail = ctx.createLinearGradient(hx, hy, tx, ty);
      tail.addColorStop(0, `rgba(255,255,255,${0.9 * fade})`);
      tail.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = tail;
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${fade})`;
      ctx.beginPath(); ctx.arc(hx, hy, 1.6, 0, 7); ctx.fill();
    }
  }

  const DRAW = { stars: drawStars, topo: drawTopo, grid: drawGrid, space: drawSpace,
    pinkspace: (ctx, w, h, t, p, energy, sp) => drawSpace(ctx, w, h, t, p, energy, sp, true) };
  let current = { kind: "stars", pal: PALETTES[0] };

  window.Patterns = {
    // Nouveau « plan » : motif et couleur différents du précédent
    cut() {
      const kinds = KINDS.filter((k) => k !== current.kind || Math.random() < 0.3);
      const pals = PALETTES.filter((p) => p !== current.pal);
      current = { kind: kinds[(Math.random() * kinds.length) | 0], pal: pals[(Math.random() * pals.length) | 0] };
    },
    draw(kind, ctx, w, h, t, energy, sp) {
      const k = kind === "auto" ? current.kind : kind;
      const pal = kind === "auto" ? current.pal : PALETTES[{ stars: 2, topo: 5, grid: 2, space: 4 }[k]];
      DRAW[k](ctx, w, h, t, pal, energy, sp);
    },
  };
})();
