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
  // Canal de test
  $("#tbTest").hidden = !data.testing;
  $("#testForm").hidden = !!data.testing;
  $("#testOn").hidden = !data.testing;
  $("#aboutVer").textContent = `Version ${data.launcherVersion} · ${PLATFORM_NAMES[data.platform] || data.platform}`;
  // Nouvelle version du launcher lui-même : elle se télécharge toute seule (voir selfUpdateUi)
  const lv = data.catalog.launcher;
  if (lv && lv.version && newer(lv.version, data.launcherVersion)) selfUpdateUi(lastSelfUpdate.status === "idle" ? { status: "downloading", version: lv.version } : lastSelfUpdate);
  const apps = data.catalog.apps || [];
  $("#empty").hidden = apps.length > 0;
  $("#page").hidden = !apps.length;
  if (!apps.length) $("#emptyText").textContent = `Vérifie ta connexion internet, puis réessaie.${data.error ? " (" + data.error + ")" : ""}`;
  if (!current || !apps.some((a) => a.id === current)) current = apps[0] && apps[0].id;
  renderRail();
  render();
  autoUpdate();
}

// Mise à jour du launcher : téléchargement en arrière-plan, puis « clique pour redémarrer ».
// Si elle ne peut pas se faire toute seule (ancienne version installée en zip, dossier protégé), lien vers le site.
let lastSelfUpdate = { status: "idle" };
function selfUpdateUi(s) {
  lastSelfUpdate = s;
  const el = $("#netStatus");
  const lv = data.catalog && data.catalog.launcher;
  el.onclick = null;
  el.classList.remove("link");
  if (s.status === "downloading") {
    const pct = s.total ? ` ${Math.round((s.done / s.total) * 100)} %` : "";
    el.textContent = `Mise à jour du launcher (${s.version}) en cours…${pct}`;
  } else if (s.status === "ready") {
    el.textContent = `Launcher ${s.version} prêt : clique pour redémarrer`;
    el.classList.add("link");
    el.onclick = () => { el.textContent = "Redémarrage…"; L.selfUpdate.apply(); };
  } else if (s.status === "manual") {
    el.textContent = `Nouvelle version du launcher (${s.version}) : clique pour la télécharger`;
    el.classList.add("link");
    el.onclick = () => lv && lv.page && L.openUrl(lv.page);
  }
}
if (L.selfUpdate) {
  L.selfUpdate.on(selfUpdateUi);
  L.selfUpdate.state().then((s) => s && s.status !== "idle" && selfUpdateUi(s)).catch(() => {});
}

// Mises à jour automatiques : un logiciel installé dont le catalogue a une version plus récente (une tentative par version)
const autoTried = new Set(), updateFailed = new Set();
function autoUpdate() {
  if (!prefs.autoUpdate || !data.online) return;
  for (const a of data.catalog.apps || []) {
    const inst = data.installed[a.id], key = a.id + "@" + a.version;
    if (!inst || !fileFor(a) || a.version === inst.version || busy.has(a.id) || autoTried.has(key)) continue;
    autoTried.add(key);
    toast(`Mise à jour de ${a.name} vers la ${a.version}…`);
    installApp(a, `${a.name} est à jour (${a.version}).`);
  }
}

function renderRail() {
  const rail = $("#rail");
  rail.textContent = "";
  for (const a of data.catalog.apps) {
    const b = document.createElement("button");
    b.className = "rail-app" + (a.id === current ? " active" : "");
    const inst = data.installed[a.id];
    if (inst && a.version !== inst.version) b.classList.add("update");
    b.title = a.name;
    b.setAttribute("aria-label", a.name);
    const img = document.createElement("img");
    img.alt = "";
    img.src = a.icon || "../build/icon.png";
    img.onerror = () => { img.onerror = null; img.src = "../build/icon.png"; }; // site injoignable : icône du launcher
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
  if (!a.banner && a.icon) { const i = document.createElement("img"); i.src = a.icon; i.alt = ""; i.onerror = () => i.remove(); art.appendChild(i); }

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
  $("#repairBtn").hidden = !inst || !file;
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
  } else if (inst && (a.version === inst.version || updateFailed.has(a.id + "@" + a.version))) {
    // Une mise à jour ratée ne bloque jamais le logiciel : la version installée reste lançable
    btn.classList.add("launch");
    $("#playLabel").textContent = "Lancer";
    $("#statusLine").textContent = a.version === inst.version ? `${a.name} ${inst.version} est prêt.` : `Mise à jour impossible pour l'instant : tu gardes la ${inst.version}.`;
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
  if (inst && (a.version === inst.version || updateFailed.has(a.id + "@" + a.version))) {
    try { await L.launch(a.id); toast(`${a.name} se lance…`); }
    catch (e) { toast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "")); }
    return;
  }
  installApp(a);
};
async function installApp(a, done) {
  busy.set(a.id, { phase: "download", done: 0, total: (fileFor(a) || {}).size || 0 });
  render();
  try {
    data.installed = await L.install(a.id);
    busy.delete(a.id);
    updateFailed.delete(a.id + "@" + a.version);
    toast(done || `${a.name} ${a.version} est installé.`);
  } catch (e) {
    busy.delete(a.id);
    const msg = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
    if (msg !== "Annulé" && data.installed[a.id]) { updateFailed.add(a.id + "@" + a.version); render(); toast(msg); return; }
    render();
    $("#statusLine").textContent = msg === "Annulé" ? "Téléchargement annulé." : msg;
    $("#statusLine").classList.toggle("err", msg !== "Annulé");
    return;
  }
  renderRail();
  render();
}
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

/* ——— Verre liquide : le fond d'écran pile derrière la fenêtre ———
   La fenêtre est transparente ; on y affiche le fond d'écran du bureau à sa vraie place (il ne bouge pas quand on
   déplace la fenêtre), et c'est lui que la dalle (#slab) et chaque panneau (#lens) réfractent. */
let prefs = { glass: "acrylic", onLaunch: "stay", autoUpdate: true, startup: false };
let lastBounds = null, wp = null, placing = 0;
function placeDesk(b) {
  if (b) lastBounds = b;
  if (placing || !lastBounds) return;
  placing = requestAnimationFrame(() => {
    placing = 0;
    const s = $("#deskImg").style, k = lastBounds;
    s.left = k.dx - k.x + "px"; s.top = k.dy - k.y + "px";
    s.width = k.dw + "px"; s.height = k.dh + "px";
    document.body.classList.toggle("maxed", !!k.max);
  });
}
// Le verre : d'abord le rendu WebGL (fluide) ; s'il n'est pas possible, l'ancien rendu (filtres SVG)
async function loadWallpaper() {
  let mode = prefs.glass;
  if (mode === "live" && !/Windows|Macintosh/.test(navigator.userAgent)) mode = "wallpaper";
  if (mode === "live" && (await Liquid.live())) return setGlassClasses("live");
  if (mode === "live") mode = "wallpaper"; // capture refusée : le fond d'écran
  if (mode === "wallpaper") {
    const w = await L.desk.wallpaper();
    if (w && (await Liquid.image(w.url, w.style))) return setGlassClasses("wallpaper");
    if (!w) mode = "scene";
  }
  if (mode === "scene" && Liquid.scene()) return setGlassClasses("scene");
  Liquid.stop();
  const want = mode === "wallpaper";
  wp = want ? await L.desk.wallpaper() : null;
  const img = $("#deskImg");
  if (wp) {
    if (img.dataset.url !== wp.url) { img.style.backgroundImage = `url("${wp.url}")`; img.dataset.url = wp.url; }
    img.dataset.fit = wp.style;
  }
  document.body.classList.toggle("glass-wallpaper", !!wp);
  document.body.classList.toggle("glass-scene", !wp && prefs.glass !== "clear" && prefs.glass !== "acrylic");
  // Acrylic / Vibrancy : la matière floutée vient du système ; la page ne dessine aucun fond (sinon elle la cache)
  document.body.classList.toggle("glass-acrylic", prefs.glass === "acrylic" && /Windows|Macintosh/.test(navigator.userAgent));
  document.body.classList.toggle("glass-clear", prefs.glass === "clear");
  refreshGlass();
}
function setGlassClasses(m) {
  for (const c of ["glass-wallpaper", "glass-scene", "glass-acrylic", "glass-clear", "glass-live"]) document.body.classList.remove(c);
  document.body.classList.add("glass-" + m);
  refreshGlass(); // retire les filtres SVG : le WebGL dessine tout
}
/* ——— La lentille : un filtre SVG par verre, à sa taille exacte ———
   Une carte de déplacement (rouge = décalage horizontal, vert = vertical, gris = aucun) : neutre au centre,
   elle pousse sur une bande le long des bords, arrondie comme le panneau. Le fond se courbe donc sur les bords
   comme à travers une goutte de verre, avec une légère dispersion (rouge, vert et bleu décalés un peu
   différemment : le liseré irisé). Taille en vrais pixels : une carte en pourcentages ne s'applique pas. */
const SVGNS = "http://www.w3.org/2000/svg";
const fxRoot = document.querySelector("svg");
function edgeMap(w, h, band, r) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><defs>` +
    `<linearGradient id='r' x1='0' x2='1' y1='0' y2='0'><stop offset='0' stop-color='#ff0000'/><stop offset='1' stop-color='#000000'/></linearGradient>` +
    `<linearGradient id='g' x1='0' x2='0' y1='0' y2='1'><stop offset='0' stop-color='#00ff00'/><stop offset='1' stop-color='#000000'/></linearGradient>` +
    `<filter id='b' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='${(band / 2.4).toFixed(1)}'/></filter></defs>` +
    `<rect width='${w}' height='${h}' fill='url(#r)'/><rect width='${w}' height='${h}' fill='url(#g)' style='mix-blend-mode:screen'/>` +
    `<rect x='${band}' y='${band}' width='${Math.max(1, w - 2 * band)}' height='${Math.max(1, h - 2 * band)}' rx='${r}' fill='#808080' filter='url(#b)'/></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
function lensFilter(id, w, h, band, r, scale) {
  let f = document.getElementById(id);
  if (!f) {
    f = document.createElementNS(SVGNS, "filter");
    f.id = id;
    f.setAttribute("color-interpolation-filters", "sRGB");
    f.setAttribute("filterUnits", "userSpaceOnUse");
    f.innerHTML = `<feImage result="map" preserveAspectRatio="none" x="0" y="0"/>` +
      ["R", "G", "B"].map((c, i) => `<feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G" result="d${c}"/>`).join("") +
      `<feColorMatrix in="dR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cR"/>` +
      `<feColorMatrix in="dG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cG"/>` +
      `<feColorMatrix in="dB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="cB"/>` +
      `<feBlend in="cR" in2="cG" mode="screen" result="rg"/><feBlend in="rg" in2="cB" mode="screen"/>`;
    fxRoot.appendChild(f);
  }
  for (const [k, v] of [["x", 0], ["y", 0], ["width", w], ["height", h]]) f.setAttribute(k, v);
  const img = f.querySelector("feImage");
  img.setAttribute("width", w); img.setAttribute("height", h);
  img.setAttribute("href", edgeMap(w, h, band, r));
  f.querySelectorAll("feDisplacementMap").forEach((d, i) => d.setAttribute("scale", (scale * [1, 0.93, 0.86][i]).toFixed(1)));
}
const lensed = new Map(); // élément → id de son filtre
let lensN = 0;
function glassFx(el) {
  const on = !document.body.classList.contains("liquid-on") && (document.body.classList.contains("glass-wallpaper") || document.body.classList.contains("glass-scene"));
  const isDesk = el.id === "desk";
  const prop = isDesk ? "filter" : "backdropFilter";
  if (!on) { el.style[prop] = ""; if (!isDesk) el.style.webkitBackdropFilter = ""; return; }
  const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  if (!w || !h) return;
  let id = lensed.get(el);
  if (!id) { id = "lens" + ++lensN; lensed.set(el, id); }
  const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 16;
  // La fenêtre : une plaque épaisse (bande large, forte courbure) ; les panneaux : des gouttes plus fines
  if (isDesk) lensFilter(id, w, h, 38, r + 10, 90);
  else lensFilter(id, w, h, Math.min(24, Math.min(w, h) / 4), r, 46);
  const extra = isDesk ? "saturate(1.25) brightness(1.03)" : "blur(6px) saturate(1.8) brightness(1.08)";
  el.style[prop] = `url(#${id}) ${extra}`;
  if (!isDesk) el.style.webkitBackdropFilter = el.style.backdropFilter;
}
const glassRO = new ResizeObserver((entries) => entries.forEach((e) => glassFx(e.target)));
function refreshGlass() {
  for (const el of [$("#desk"), ...document.querySelectorAll(".glass")]) { glassRO.observe(el); glassFx(el); }
}
// Écran changé (fenêtre glissée sur un autre moniteur) : on recapture celui-là
let lastDid = null;
L.desk.onBounds((b) => {
  placeDesk(b);
  Liquid.setDisplay(b);
  if (lastDid && b.did !== lastDid && document.body.classList.contains("glass-live")) Liquid.live();
  lastDid = b.did;
});
L.desk.bounds().then((b) => { Liquid.setDisplay(b); lastDid = b.did; });
L.desk.onFocus((on) => {
  Liquid.rate(on ? 60 : 20);
  if (on && prefs.glass !== "live") loadWallpaper(); // fond d'écran changé pendant que le launcher était ouvert
});
document.addEventListener("visibilitychange", () => {
  if (!document.body.classList.contains("glass-live")) return;
  if (document.hidden) Liquid.pause(); else loadWallpaper();
});
L.desk.bounds().then(placeDesk);

/* ——— Compte Discord : demandé dès l'arrivée ———
   Sans compte, l'écran de connexion reste devant le launcher. Seule exception : le serveur de connexion est
   injoignable. Là on laisse passer, sinon personne ne pourrait plus ni installer ni lancer ses logiciels. */
function showUser(a) {
  const u = a && a.user;
  $("#tbUser").hidden = !a || !a.signedIn;
  $("#tbName").textContent = u ? u.name : "Connecté";
  $("#tbAvatar").hidden = !(u && u.avatar);
  if (u && u.avatar) $("#tbAvatar").src = u.avatar;
  $("#setAccount").textContent = a && a.signedIn ? (u ? u.name : "Connecté") : "Pas connecté";
  $("#setLogout").textContent = a && a.signedIn ? "Se déconnecter" : "Se connecter";
}
function gateState(busy, error) {
  $("#gateLogin").disabled = busy;
  $("#gateLabel").textContent = busy ? "Autorise dans ton navigateur…" : "Se connecter avec Discord";
  $("#gateCancel").hidden = !busy;
  $("#gateError").hidden = !error;
  $("#gateError").textContent = error || "";
}
function openGate() { gateState(false); $("#gateSkip").hidden = true; $("#gate").hidden = false; document.body.classList.add("gated"); }
function closeGate() { $("#gate").hidden = true; document.body.classList.remove("gated"); }
$("#gateLogin").onclick = async () => {
  gateState(true);
  const r = await L.account.login();
  if (r.ok) { closeGate(); showUser(r); gateState(false); return; }
  if (r.error === "cancelled") return gateState(false);
  if (r.error === "offline") { gateState(false, "Le serveur de connexion ne répond pas pour l'instant. Réessaie dans un moment."); $("#gateSkip").hidden = false; return; }
  gateState(false, r.error);
};
$("#gateCancel").onclick = () => L.account.cancel();
$("#gateSkip").onclick = closeGate;
$("#setLogout").onclick = async () => {
  const a = await L.account.get();
  if (a.signedIn) await L.account.logout();
  showUser({ signedIn: false });
  $("#settings").hidden = true;
  openGate();
};
L.account.get().then((a) => { showUser(a); if (!a.signedIn) openGate(); });

// Canal de test : le catalogue change, et le logiciel passe à la version du canal (dans les deux sens)
$("#testForm").onsubmit = async (e) => {
  e.preventDefault();
  $("#testError").hidden = true;
  const r = await L.test.join($("#testCode").value);
  if (r.error) { $("#testError").textContent = r.error; $("#testError").hidden = false; return; }
  $("#testCode").value = "";
  toast("Tu reçois maintenant les versions de test.");
  load();
};
$("#testLeave").onclick = async () => { await L.test.leave(); toast("Retour à la version normale."); load(); };
$("#inviteBtn").onclick = () => L.invite();
$("#gatePrivacy").onclick = () => L.privacy();
document.querySelectorAll("#setLang button").forEach((b) => {
  b.setAttribute("aria-pressed", b.dataset.l === I18N.chosen);
  b.onclick = () => { I18N.set(b.dataset.l); L.reload(); };
});
I18N.start();

/* ——— Réglages ——— */
const segs = { glass: "#setGlass", onLaunch: "#setLaunch" };
function drawSettings(s) {
  for (const [k, sel] of Object.entries(segs)) document.querySelectorAll(sel + " button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === s[k]));
  $("#setAuto").setAttribute("aria-checked", !!s.autoUpdate);
  $("#setStartup").setAttribute("aria-checked", !!s.startup);
  $("#setStartupRow").hidden = !s.canStartup;
  $("#setDir").textContent = s.appsDir || "";
}
async function setPref(patch) {
  prefs = { ...prefs, ...(await L.settings.set(patch)) };
  drawSettings({ ...prefs, ...(await L.settings.get()) });
  if ("glass" in patch) loadWallpaper();
}
for (const [k, sel] of Object.entries(segs)) document.querySelectorAll(sel + " button").forEach((b) => (b.onclick = () => setPref({ [k]: b.dataset.v })));
$("#setAuto").onclick = () => setPref({ autoUpdate: !prefs.autoUpdate });
$("#setStartup").onclick = () => setPref({ startup: !prefs.startup });
$("#setDirOpen").onclick = () => L.folder("");
$("#settingsBtn").onclick = async () => { drawSettings(await L.settings.get()); $("#settings").hidden = false; };
$("#settingsClose").onclick = () => ($("#settings").hidden = true);
L.settings.get().then((s) => { prefs = { ...prefs, ...s }; loadWallpaper(); });

/* ——— Réparer : retélécharge la version et la vérifie (fichiers abîmés, logiciel qui ne démarre plus) ——— */
$("#repairBtn").onclick = () => {
  const a = data.catalog.apps.find((x) => x.id === current);
  if (a && !busy.has(a.id)) installApp(a, `${a.name} est réparé.`);
};
$("#aboutBtn").onclick = () => ($("#about").hidden = false);
$("#aboutClose").onclick = () => ($("#about").hidden = true);
$("#min").onclick = () => L.win.minimize();
$("#max").onclick = () => L.win.maximize();
$("#close").onclick = () => L.win.close();
addEventListener("keydown", (e) => {
  if (e.key === "Escape") { $("#about").hidden = true; $("#settings").hidden = true; }
  // Entrée : le gros bouton (sauf si une fenêtre est ouverte ou qu'un bouton a le focus)
  if (e.key === "Enter" && $("#gate").hidden && $("#about").hidden && $("#settings").hidden && !(document.activeElement && document.activeElement.closest("button"))) $("#playBtn").click();
});
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
