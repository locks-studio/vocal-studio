// Interface du launcher : la liste des logiciels à gauche, la page du logiciel choisi, le gros bouton.
const $ = (s) => document.querySelector(s);
const L = window.launcher;
let data = { catalog: { apps: [] }, installed: {}, platform: "" };
let current = null; // id du logiciel affiché
const busy = new Map(); // id → dernière étape de progression

const fmtSize = (b) => (!b ? "—" : b > 1e9 ? (b / 1e9).toFixed(2) + " Go" : (b / 1e6).toFixed(0) + " Mo");
// Compare deux versions « 1.2.10 » / « 1.2.9 »
function newer(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0; }
  return false;
}
const fileFor = (app) => {
  const d = app.downloads || {};
  return d[data.platform] || (data.platform === "darwin-arm64" ? d["darwin-x64"] : null);
};
const PLATFORM_NAMES = { "win32-x64": "Windows", "darwin-arm64": "Mac (Apple Silicon)", "darwin-x64": "Mac (Intel)", "linux-x64": "Linux" };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 4200);
}

async function load() {
  data = await L.catalog();
  const off = !data.online;
  $("#netStatus").textContent = off ? "Hors ligne : tu peux lancer ce qui est installé" : "";
  $("#netStatus").classList.toggle("off", off);
  $("#aboutVer").textContent = `Version ${data.launcherVersion} · ${PLATFORM_NAMES[data.platform] || data.platform}`;
  // Nouvelle version du launcher lui-même : un lien vers la page de téléchargement
  const lv = data.catalog.launcher;
  if (lv && lv.version && newer(lv.version, data.launcherVersion)) {
    $("#netStatus").textContent = `Nouvelle version du launcher (${lv.version}) : clique pour la télécharger`;
    $("#netStatus").classList.add("link");
    $("#netStatus").onclick = () => lv.page && L.openUrl(lv.page);
  }
  const apps = data.catalog.apps || [];
  $("#empty").hidden = apps.length > 0;
  $("#page").hidden = !apps.length;
  if (!apps.length) $("#emptyText").textContent = `Vérifie ta connexion internet, puis réessaie.${data.error ? " (" + data.error + ")" : ""}`;
  if (!current || !apps.some((a) => a.id === current)) current = apps[0] && apps[0].id;
  renderRail();
  render();
}

function renderRail() {
  const rail = $("#rail");
  rail.textContent = "";
  for (const a of data.catalog.apps) {
    const b = document.createElement("button");
    b.className = "rail-app" + (a.id === current ? " active" : "");
    const inst = data.installed[a.id];
    if (inst && newer(a.version, inst.version)) b.classList.add("update");
    b.title = a.name;
    b.setAttribute("aria-label", a.name);
    const img = document.createElement("img");
    img.alt = "";
    img.src = a.icon || "../build/icon.png";
    b.append(img, Object.assign(document.createElement("i"), { className: "dot" }));
    b.onclick = () => { current = a.id; renderRail(); render(); };
    rail.appendChild(b);
  }
}

function render() {
  const a = data.catalog.apps.find((x) => x.id === current);
  if (!a) return;
  document.body.style.setProperty("--app", a.accent || "#23a559");
  $("#appEyebrow").textContent = a.kind || "Logiciel";
  $("#appName").textContent = a.name;
  $("#appTagline").textContent = a.tagline || "";
  $("#appDesc").textContent = a.description || "";
  // Bannière : celle du catalogue, sinon un fond animé avec l'icône
  const art = $("#heroArt");
  art.textContent = "";
  art.className = "hero-art" + (a.banner ? "" : " gen");
  art.style.backgroundImage = a.banner ? `url("${a.banner}")` : "";
  if (!a.banner && a.icon) { const i = document.createElement("img"); i.src = a.icon; i.alt = ""; art.appendChild(i); }

  const inst = data.installed[a.id];
  const file = fileFor(a);
  $("#notesVer").textContent = a.version ? `Version ${a.version}` : "";
  const notes = $("#notes");
  notes.textContent = "";
  for (const n of a.notes || []) notes.appendChild(Object.assign(document.createElement("li"), { textContent: n }));
  $("#infoVer").textContent = a.version || "—";
  $("#infoInstalled").textContent = inst ? inst.version : "Non";
  $("#infoSize").textContent = file ? fmtSize(file.size) : "—";
  $("#infoPlatform").textContent = PLATFORM_NAMES[data.platform] || data.platform;
  // Temps passé sur ce logiciel (compté par le logiciel lui-même)
  const fmtH = (m) => (m == null ? "—" : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")}`);
  $("#infoUsage").textContent = "—"; $("#infoVoice").textContent = "—";
  if (a.usageDir) L.usage(a).then((u) => { if (current !== a.id || !u) return; $("#infoUsage").textContent = fmtH(u.appMinutes); $("#infoVoice").textContent = fmtH(u.voiceMinutes); });
  $("#folderBtn").hidden = !inst;
  $("#uninstallBtn").hidden = !inst;

  // Le gros bouton
  const btn = $("#playBtn"), st = busy.get(a.id);
  btn.className = "play";
  btn.disabled = false;
  $("#statusLine").classList.remove("err");
  if (st) {
    btn.classList.add("busy");
    $("#playLabel").textContent = st.phase === "download" ? "Annuler" : "Patiente…";
    btn.disabled = st.phase !== "download";
  } else if (inst && !newer(a.version, inst.version)) {
    btn.classList.add("launch");
    $("#playLabel").textContent = "Lancer";
    $("#statusLine").textContent = `${a.name} ${inst.version} est prêt.`;
  } else if (inst) {
    $("#playLabel").textContent = "Mettre à jour";
    $("#statusLine").textContent = `Nouvelle version ${a.version} (tu as la ${inst.version}).`;
  } else if (!file) {
    $("#playLabel").textContent = "Bientôt";
    btn.disabled = true;
    $("#statusLine").textContent = `Pas encore disponible pour ${PLATFORM_NAMES[data.platform] || data.platform}.`;
  } else {
    $("#playLabel").textContent = "Installer";
    $("#statusLine").textContent = file.size ? `${fmtSize(file.size)} à télécharger.` : "";
  }
  renderProgress(a.id);
}

function renderProgress(id) {
  const st = busy.get(id);
  const box = $("#progress");
  box.hidden = !st || id !== current;
  if (box.hidden) return;
  const bar = $("#progBar").parentElement;
  const phases = { download: "Téléchargement", verify: "Vérification du fichier", extract: "Installation", done: "Terminé" };
  $("#progPhase").textContent = phases[st.phase] || "…";
  const pct = st.phase === "download" && st.total ? Math.min(100, (st.done / st.total) * 100) : st.phase === "done" ? 100 : null;
  bar.classList.toggle("indet", pct === null);
  $("#progBar").style.width = pct === null ? "" : pct.toFixed(1) + "%";
  $("#progPct").textContent = pct === null ? "" : Math.floor(pct) + " %";
  $("#progSize").textContent = st.phase === "download" ? `${fmtSize(st.done)} / ${fmtSize(st.total)}` : "";
  $("#progSpeed").textContent = st.phase === "download" && st.speed ? `${(st.speed / 1e6).toFixed(1)} Mo/s` : "";
}

L.onProgress((p) => {
  const prev = busy.get(p.id);
  if (p.phase === "done") busy.delete(p.id); else busy.set(p.id, p);
  if (p.id !== current) return;
  // Même étape : on ne met à jour que la barre ; nouvelle étape : toute la page (le bouton change)
  if (prev && prev.phase === p.phase) renderProgress(p.id); else render();
});

$("#playBtn").onclick = async () => {
  const a = data.catalog.apps.find((x) => x.id === current);
  if (!a) return;
  if (busy.has(a.id)) { L.cancel(a.id); return; }
  const inst = data.installed[a.id];
  if (inst && !newer(a.version, inst.version)) {
    await L.launch(a.id);
    toast(`${a.name} se lance…`);
    return;
  }
  busy.set(a.id, { phase: "download", done: 0, total: (fileFor(a) || {}).size || 0 });
  render();
  try {
    data.installed = await L.install(a.id);
    busy.delete(a.id);
    toast(`${a.name} ${a.version} est installé.`);
  } catch (e) {
    busy.delete(a.id);
    const msg = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
    render();
    $("#statusLine").textContent = msg === "Annulé" ? "Téléchargement annulé." : msg;
    $("#statusLine").classList.toggle("err", msg !== "Annulé");
    return;
  }
  renderRail();
  render();
};
$("#folderBtn").onclick = () => L.folder(current);
$("#uninstallBtn").onclick = async () => {
  const a = data.catalog.apps.find((x) => x.id === current);
  if (!a || busy.has(a.id)) return;
  const b = $("#uninstallBtn");
  // Deux clics pour confirmer (pas de fenêtre « Êtes-vous sûr ? »)
  if (!b.dataset.confirm) {
    b.dataset.confirm = "1";
    toast(`Clique encore sur la corbeille pour désinstaller ${a.name}.`);
    setTimeout(() => delete b.dataset.confirm, 4000);
    return;
  }
  delete b.dataset.confirm;
  data.installed = await L.uninstall(a.id);
  toast(`${a.name} est désinstallé. Tes réglages sont gardés.`);
  renderRail();
  render();
};
$("#retryBtn").onclick = load;
$("#aboutBtn").onclick = () => ($("#about").hidden = false);
$("#aboutClose").onclick = () => ($("#about").hidden = true);
$("#min").onclick = () => L.win.minimize();
$("#max").onclick = () => L.win.maximize();
$("#close").onclick = () => L.win.close();
addEventListener("keydown", (e) => { if (e.key === "Escape") $("#about").hidden = true; });
// Le catalogue est relu toutes les 10 minutes (nouvelles versions)
setInterval(() => { if (!busy.size) load(); }, 10 * 60_000);
// Reflet du verre : il suit la souris
addEventListener("pointermove", (e) => {
  for (const g of document.querySelectorAll(".glass")) {
    const r = g.getBoundingClientRect();
    if (!r.width) continue;
    g.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
    g.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
  }
}, { passive: true });
load();
