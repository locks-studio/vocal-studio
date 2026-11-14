/* ——— Export vidéo : fenêtre de réglage, puis rendu image par image avec progression ——— */
const FPS = 60;

function parseTime(s) {
  const p = String(s).trim().split(":").map(Number);
  if (p.some((x) => isNaN(x))) return null;
  return p.reduce((a, b) => a * 60 + b, 0);
}

// Le son de la vidéo : chaque bloc audio coupé à la partie exportée, avec ses volumes (muet / solo respectés)
function audioPlan(rs, re) {
  const out = [];
  for (const c of P.clips) {
    if (c.kind !== "audio") continue;
    const g = rowGain(c.row) * (c.gain ?? 1);
    if (g <= 0.001) continue;
    const s = Math.max(c.start, rs), e = Math.min(c.start + c.dur, re);
    if (e - s < 0.01) continue;
    out.push({ file: c.file, in: c.in + (s - c.start), dur: e - s, delay: s - rs, gain: g });
  }
  return out;
}

window.startExport = function () {
  if (!P.clips.length) return toast("Importe d'abord de l'audio");
  pause();
  const total = duration();
  let mode = "all";
  const from = h("input", { type: "text", value: fmt(Math.min(now(), Math.max(0, total - 1)), false), style: "width:90px" });
  const to = h("input", { type: "text", value: fmt(Math.min(total, now() + 60), false), style: "width:90px" });
  const est = h("p", { class: "note" });
  const updEst = () => {
    const [rs, re] = range();
    const secs = Math.max(0, re - rs);
    // Environ 25 images par seconde de calcul sur un PC moyen
    est.textContent = `${fmt(secs, false)} de vidéo · ${Math.round(secs * FPS).toLocaleString("fr-FR")} images · environ ${fmt((secs * FPS) / 25, false)} de calcul`;
  };
  const range = () => (mode === "all" ? [0, total] : [Math.max(0, parseTime(from.value) ?? 0), Math.min(total, parseTime(to.value) ?? total)]);
  const segBox = h("div");
  const drawSeg = () => {
    segBox.textContent = "";
    segBox.append(seg([["all", `Tout (${fmt(total, false)})`], ["part", "Une partie"]], mode, (v) => { mode = v; drawSeg(); updEst(); }, "seg"));
    if (mode === "part") segBox.append(h("div", { class: "row", style: "margin-top:10px;justify-content:flex-start" }, "De", from, "à", to));
  };
  from.oninput = to.oninput = updEst;
  drawSeg(); updEst();
  const close = modal((card) => {
    card.append(h("h2", {}, "Exporter la vidéo"),
      h("p", {}, `MP4 ${P.format === "9:16" ? "vertical 1080 × 1920" : "1920 × 1080"} · 60 images par seconde · son mélangé de toutes les pistes.`),
      segBox, est,
      h("p", { class: "note" }, "La vidéo est calculée image par image : elle sera parfaitement fluide même si ton PC rame. Tu peux continuer à utiliser ton PC pendant ce temps."),
      h("div", { class: "row" },
        h("button", { class: "ghost", onclick: () => close() }, "Annuler"),
        h("button", { class: "cta", onclick: async () => {
          const [rs, re] = range();
          if (!(re - rs > 0.2)) return toast("La partie à exporter est trop courte");
          const out = await window.hs.exp.pick(P.name);
          if (!out) return;
          close();
          runExport(rs, re, out);
        } }, "Exporter")));
  });
};

async function runExport(rs, re, out, quiet = false) {
  let cancelled = false;
  let bar, txt;
  const close = modal((card) => {
    bar = h("i"); txt = h("p", { class: "note" }, "Préparation du son…");
    card.append(h("h2", {}, "Export en cours"), h("p", {}, baseName(out)), h("div", { class: "progress" }, bar), txt,
      h("div", { class: "row" }, h("button", { class: "danger", onclick: () => { cancelled = true; window.hs.exp.cancel(); } }, "Annuler l'export")));
  });
  const vert = P.format === "9:16";
  const W = vert ? 1080 : 1920, H = vert ? 1920 : 1080;
  const N = Math.ceil((re - rs) * FPS);
  const t0 = performance.now();
  try {
    await prepareStills();
    await window.hs.exp.begin({ W, H, fps: FPS, out, clips: audioPlan(rs, re), length: re - rs });
    txt.textContent = "Mise en place de la scène…";
    let lastLook = "";
    const lookAt = (t) => {
      const look = { ...sceneAt(t).look, vertical: vert };
      const k = JSON.stringify(look);
      if (k === lastLook) return null;
      lastLook = k;
      return look;
    };
    // Une seconde de mise en route avant le début : les anneaux et la caméra sont déjà en place à la 1re image
    for (let i = -FPS; i < 0; i++) {
      const t = Math.max(0, rs + i / FPS);
      await window.hs.exp.frame(sceneState(t), lookAt(t), 1000 / FPS, true);
      if (cancelled) throw new Error("annulé");
    }
    const tStart = performance.now();
    for (let i = 0; i < N; i++) {
      if (cancelled) throw new Error("annulé");
      const t = rs + i / FPS;
      await window.hs.exp.frame(sceneState(t), lookAt(t), 1000 / FPS, false);
      if (i % 10 === 0 || i === N - 1) {
        const el = (performance.now() - tStart) / 1000;
        const fps = (i + 1) / Math.max(0.001, el);
        bar.style.width = ((i + 1) / N) * 100 + "%";
        txt.textContent = `${Math.floor(((i + 1) / N) * 100)} % · image ${i + 1} / ${N} · ${fps.toFixed(0)} images/s · reste environ ${fmt((N - i - 1) / fps, false)}`;
      }
    }
    txt.textContent = "Finalisation du fichier…";
    const file = await window.hs.exp.end();
    close();
    const secs = (performance.now() - t0) / 1000;
    if (quiet) return file;
    const r = await ask("Vidéo prête !", `${baseName(file)} · calculée en ${fmt(secs, false)}.`, [["show", "Ouvrir le dossier", "cta"], [null, "Fermer", "ghost"]]);
    if (r === "show") window.hs.exp.show(file);
    return file;
  } catch (e) {
    close();
    if (cancelled || /annulé/.test(e.message)) toast("Export annulé");
    else { window.hs.exp.cancel(); await ask("L'export a échoué", e.message, [[1, "OK", "cta"]]); }
    return null;
  }
}
