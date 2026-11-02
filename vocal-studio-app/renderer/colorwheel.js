/* ——— Roue de couleurs ———
   Remplace les petits carrés de couleur des paramètres par une pastille qui ouvre une roue :
   teinte tout autour, saturation du centre vers le bord, luminosité en dessous, code hexadécimal
   et pipette pour prendre une couleur n'importe où à l'écran.
   Le vrai champ <input type="color"> reste caché : on lui donne la valeur et on déclenche « input »,
   donc le reste de l'appli ne voit aucune différence. */
const ColorWheel = (() => {
  const SIZE = 200;
  const PRESETS = ["#23a559", "#5865f2", "#ffffff", "#ff4d6a", "#ffb547", "#2bf0ff", "#ff2bd6", "#9b59ff", "#000000"];
  let pop = null, target = null, hsv = { h: 0, s: 0, v: 1 };

  // ——— Conversions ———
  const hexRgb = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [255, 255, 255]; };
  const rgbHex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
  function hsvRgb(h, s, v) {
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return [f(5) * 255, f(3) * 255, f(1) * 255];
  }
  function rgbHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx };
  }

  // Pastille à la place de chaque champ couleur
  function enhance(input) {
    if (input.dataset.cw) return;
    input.dataset.cw = "1";
    input.hidden = true;
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "cw-swatch";
    sw.setAttribute("aria-label", "Choisir une couleur");
    sw.onclick = (e) => { e.stopPropagation(); pop && target === input ? close() : open(input, sw); };
    input.after(sw);
    input._sw = sw;
  }
  function sync() {
    document.querySelectorAll("input[type=color][data-cw]").forEach((i) => { if (i._sw) i._sw.style.background = i.value; });
  }

  function build() {
    pop = document.createElement("div");
    pop.className = "cw-pop glass";
    pop.innerHTML = `
      <div class="cw-wheel-box"><canvas class="cw-wheel" width="${SIZE * 2}" height="${SIZE * 2}"></canvas><i class="cw-dot"></i></div>
      <input type="range" class="cw-val" min="0" max="100" aria-label="Luminosité">
      <div class="cw-row"><span class="cw-prev"></span><input class="field cw-hex" maxlength="7" spellcheck="false" aria-label="Code couleur">
        <button type="button" class="ghost cw-drop" title="Pipette : prendre une couleur à l'écran" aria-label="Pipette"><svg viewBox="0 0 24 24"><path d="M14 4l6 6-2 2-6-6zM12 6l-8 8v4h4l8-8"/></svg></button></div>
      <div class="cw-presets"></div>`;
    document.body.appendChild(pop);
    const wheel = pop.querySelector(".cw-wheel");
    // Teinte / saturation : on clique ou on glisse dans la roue
    const pick = (e) => {
      const r = wheel.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
      hsv.h = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      hsv.s = Math.min(1, Math.hypot(x, y) / (r.width / 2));
      if (hsv.v < 0.05) hsv.v = 1;
      commit();
    };
    wheel.addEventListener("pointerdown", (e) => { wheel.setPointerCapture(e.pointerId); pick(e); wheel.onpointermove = pick; });
    wheel.addEventListener("pointerup", () => (wheel.onpointermove = null));
    pop.querySelector(".cw-val").oninput = (e) => { hsv.v = e.target.value / 100; drawWheel(); commit(); };
    pop.querySelector(".cw-hex").onchange = (e) => {
      const v = e.target.value.trim().replace(/^#?/, "#");
      if (/^#[0-9a-f]{6}$/i.test(v)) { hsv = rgbHsv(...hexRgb(v)); drawWheel(); commit(); }
    };
    const drop = pop.querySelector(".cw-drop");
    if (!window.EyeDropper) drop.hidden = true;
    drop.onclick = async () => {
      try {
        const r = await new EyeDropper().open();
        hsv = rgbHsv(...hexRgb(r.sRGBHex));
        drawWheel(); commit();
      } catch { /* annulé avec Échap */ }
    };
    const pr = pop.querySelector(".cw-presets");
    for (const c of PRESETS) {
      const b = document.createElement("button");
      b.type = "button"; b.style.background = c; b.title = c;
      b.onclick = () => { hsv = rgbHsv(...hexRgb(c)); drawWheel(); commit(); };
      pr.appendChild(b);
    }
    pop.addEventListener("pointerdown", (e) => e.stopPropagation());
  }

  function drawWheel() {
    const cv = pop.querySelector(".cw-wheel"), x = cv.getContext("2d");
    const n = cv.width, r = n / 2, img = x.createImageData(n, n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const dx = i - r, dy = j - r, d = Math.hypot(dx, dy) / r;
        const o = (j * n + i) * 4;
        if (d > 1) { img.data[o + 3] = 0; continue; }
        const [cr, cg, cb] = hsvRgb((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, d, hsv.v);
        img.data[o] = cr; img.data[o + 1] = cg; img.data[o + 2] = cb;
        img.data[o + 3] = d > 0.985 ? 255 * (1 - d) / 0.015 : 255; // bord adouci
      }
    }
    x.putImageData(img, 0, 0);
  }

  // Applique la couleur choisie au vrai champ, et met la roue à jour
  function commit() {
    const hex = rgbHex(...hsvRgb(hsv.h, hsv.s, hsv.v));
    const dot = pop.querySelector(".cw-dot");
    const a = hsv.h * Math.PI / 180;
    dot.style.left = 50 + Math.cos(a) * hsv.s * 50 + "%";
    dot.style.top = 50 + Math.sin(a) * hsv.s * 50 + "%";
    dot.style.background = hex;
    pop.querySelector(".cw-val").value = Math.round(hsv.v * 100);
    pop.querySelector(".cw-val").style.background = `linear-gradient(90deg,#000,${rgbHex(...hsvRgb(hsv.h, hsv.s, 1))})`;
    pop.querySelector(".cw-prev").style.background = hex;
    const hx = pop.querySelector(".cw-hex");
    if (document.activeElement !== hx) hx.value = hex;
    if (target && target.value.toLowerCase() !== hex) {
      target.value = hex;
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }
    sync();
  }

  function open(input, sw) {
    if (!pop) build();
    target = input;
    hsv = rgbHsv(...hexRgb(input.value));
    drawWheel();
    commit();
    pop.hidden = false;
    const r = sw.getBoundingClientRect(), pr = pop.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.right - pr.width, innerWidth - pr.width - 8)) + "px";
    pop.style.top = (r.bottom + 8 + pr.height < innerHeight ? r.bottom + 8 : Math.max(8, r.top - pr.height - 8)) + "px";
  }
  function close() { if (pop) pop.hidden = true; target = null; }
  addEventListener("pointerdown", (e) => { if (pop && !pop.hidden && !e.target.closest(".cw-pop, .cw-swatch")) close(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  document.querySelectorAll(".settings input[type=color]").forEach(enhance);
  sync();
  return { sync, close };
})();
