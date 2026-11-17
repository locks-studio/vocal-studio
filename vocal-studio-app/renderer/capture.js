/* ——— Caméra, partage d'écran et clips ———
   Discord ne laisse aucune appli (ni aucun bot) recevoir ou envoyer de la vidéo dans un appel.
   Hush affiche TA caméra et TON partage d'écran dans la scène, et les envoie aux autres utilisateurs
   Hush du salon (rtc.js) : ils voient les tiens, tu vois les leurs. Pour les membres sans Hush,
   il faut toujours activer la caméra / le partage dans Discord. */
const Cap = { cam: null, screen: null, rec: null };

const meTileId = () => (S.demo ? "me" : state.me && state.me.id);

// La caméra / l'écran d'un membre : le mien, ou celui reçu d'un ami Hush
function mediaOf(id, kind) {
  if (id === meTileId()) return Cap[kind];
  return typeof remoteMedia === "function" ? remoteMedia(id, kind) : null;
}

// Appelé après chaque mise à jour des avatars : met la caméra de chacun dans sa tuile
function attachLocalMedia() {
  const me = meTileId();
  for (const t of tiles.values()) {
    const mine = t.data.id === me;
    const cam = mediaOf(t.data.id, "cam"), screen = mediaOf(t.data.id, "screen");
    let v = t.el.querySelector(".av video.tilecam");
    if (cam) {
      if (!v) {
        v = document.createElement("video");
        v.className = "tilecam";
        v.muted = true; v.autoplay = true; v.playsInline = true;
        t.el.querySelector(".av").appendChild(v);
      }
      v.classList.toggle("mirror", mine); // ta caméra en miroir, comme dans Discord
      if (v.srcObject !== cam) { v.srcObject = cam; v.play().catch(() => {}); }
    } else if (v) v.remove();
    t.el.classList.toggle("video", !!cam || !!t.data.video);
    t.el.classList.toggle("live", !!screen || !!t.data.stream);
    t.el.classList.toggle("has-feed", !!(cam || screen));
  }
  $("#camBtn").classList.toggle("on", !!Cap.cam);
  $("#shareBtn").classList.toggle("on", !!Cap.screen);
  // Une vidéo apparaît ou disparaît : la vue « stream » se met en place
  const f = featureSource(), k = f ? `${f.id}|${f.kind}` : "";
  // (aussi quand le nombre de vidéos change sans changer celle en grand : la grille de caméras doit apparaître)
  const lk = feeds().map((x) => `${x.id}|${x.kind}`).join(",");
  if (k !== featKey || lk !== attachLocalMedia.feeds || (f && f.stream !== $("#featureVideo").srcObject)) requestAnimationFrame(layout);
  attachLocalMedia.feeds = lk;
  // Mon partage d'écran : en grand dans la vue stream, sinon dans la petite fenêtre flottante
  $("#screenView").hidden = !Cap.screen || !!(f && f.kind === "screen" && f.id === meTileId());
}

async function toggleCam() {
  if (Cap.cam) {
    Cap.cam.getTracks().forEach((t) => t.stop());
    Cap.cam = null;
    rtcPublish();
    return attachLocalMedia();
  }
  try {
    Cap.cam = await navigator.mediaDevices.getUserMedia({ video: { ...(S.camDevice ? { deviceId: { exact: S.camDevice } } : {}), width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false });
    Cap.cam.getVideoTracks()[0].addEventListener("ended", () => { Cap.cam = null; rtcPublish(); attachLocalMedia(); });
    rtcPublish();
    attachLocalMedia();
    showToast("Caméra allumée : les amis Hush du salon la voient (allume-la aussi dans Discord pour les autres)");
  } catch (e) {
    showToast(e.name === "NotFoundError" ? "Aucune caméra trouvée" : "Caméra indisponible (déjà utilisée par une autre appli ?)");
  }
}

// Choix de la caméra (plusieurs webcams) : la liste se remplit à l'ouverture des paramètres et quand on branche une caméra
async function fillCamDevices() {
  const sel = $("#camDevice");
  let list = [];
  try { list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput"); } catch {}
  sel.textContent = "";
  const add = (v, t) => { const o = document.createElement("option"); o.value = v; o.textContent = t; sel.appendChild(o); };
  add("", "Par défaut");
  list.forEach((d, i) => add(d.deviceId, d.label || `Caméra ${i + 1}`));
  if (S.camDevice && !list.some((d) => d.deviceId === S.camDevice)) add(S.camDevice, "Caméra débranchée");
  sel.value = S.camDevice || "";
}
if (!MINI) {
  fillCamDevices();
  navigator.mediaDevices.addEventListener("devicechange", fillCamDevices);
  $("#camDevice").onchange = async (e) => {
    S.camDevice = e.target.value;
    save();
    // Caméra déjà allumée : on passe tout de suite sur la nouvelle
    if (Cap.cam) { await toggleCam(); await toggleCam(); }
  };
}

/* — Partage d'écran : choix de l'écran ou de la fenêtre, puis affichage dans une fenêtre flottante — */
async function toggleShare() {
  if (Cap.screen) return stopShare();
  const res = await window.studio.capture.sources();
  // Linux Wayland : on passe directement au sélecteur du système
  if (res.portal) return startShare({ id: "portal", name: "Partage d'écran" });
  Share.list = res.list;
  Share.sel = null;
  Share.tab = res.list.some((s) => !s.screen) ? "apps" : "screens";
  drawShare();
  $("#sharePick").hidden = false;
}
// Sélecteur façon Discord : onglets Applications / Écrans, grandes vignettes, qualité, puis « Lancer le stream »
const Share = { list: [], sel: null, tab: "apps" };
function drawShare() {
  $("#shareTabs").querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", b.dataset.st === Share.tab));
  const grid = $("#shareGrid");
  grid.textContent = "";
  const list = Share.list.filter((s) => (Share.tab === "screens") === s.screen);
  if (!list.length) { const p = document.createElement("p"); p.className = "hint"; p.textContent = Share.tab === "screens" ? "Aucun écran trouvé." : "Aucune fenêtre ouverte à partager."; grid.appendChild(p); }
  list.forEach((s, i) => {
    const b = document.createElement("button");
    b.className = "share-src" + (Share.sel === s ? " on" : "");
    const img = document.createElement("img");
    img.src = s.thumb; img.alt = "";
    const cap = document.createElement("div");
    cap.className = "share-cap";
    if (s.icon) { const ic = document.createElement("img"); ic.className = "share-ic"; ic.src = s.icon; ic.alt = ""; cap.appendChild(ic); }
    const span = document.createElement("span");
    span.textContent = s.screen ? `Écran ${i + 1}` : s.name;
    cap.appendChild(span);
    b.append(img, cap);
    b.onclick = () => { Share.sel = s; drawShare(); };
    b.ondblclick = () => { Share.sel = s; goShare(); };
    grid.appendChild(b);
  });
  $("#shareGo").disabled = !Share.sel;
  for (const [id, k] of [["#shareRes", "shareRes"], ["#shareFps", "shareFps"]]) $(id).querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x.dataset.v === String(S[k] || (k === "shareRes" ? "1080" : "30"))));
}
function goShare() { if (Share.sel) startShare(Share.sel); }
$("#shareTabs").querySelectorAll("button").forEach((b) => (b.onclick = () => { Share.tab = b.dataset.st; drawShare(); }));
for (const [id, k] of [["#shareRes", "shareRes"], ["#shareFps", "shareFps"]]) $(id).querySelectorAll("button").forEach((b) => (b.onclick = () => { S[k] = b.dataset.v; save(); drawShare(); }));
$("#shareGo").onclick = goShare;
$("#sharePickClose").onclick = () => ($("#sharePick").hidden = true);

async function startShare(src) {
  $("#sharePick").hidden = true;
  const audio = $("#shareAudio").getAttribute("aria-checked") === "true";
  try {
    await window.studio.capture.pick({ id: src.id, audio });
    // Qualité choisie dans le sélecteur (comme « Résolution » et « Images/s » de Discord)
    const res = String(S.shareRes || "1080"), fps = +(S.shareFps || 30);
    const size = res === "720" ? { width: { max: 1280 }, height: { max: 720 } } : res === "1080" ? { width: { max: 1920 }, height: { max: 1080 } } : {};
    Cap.screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: fps, ...size }, audio });
  } catch {
    window.studio.capture.pick(null);
    return showToast("Partage d'écran impossible");
  }
  // On n'écoute pas le son partagé ici (il joue déjà sur le PC) : il ne sert qu'aux clips
  const v = $("#screenVideo");
  v.srcObject = Cap.screen;
  v.play().catch(() => {});
  $("#screenTitle").textContent = src.name;
  const track = Cap.screen.getVideoTracks()[0];
  track.contentHint = "detail"; // texte net plutôt que fluidité
  track.addEventListener("ended", stopShare);
  rtcPublish();
  attachLocalMedia();
}
function stopShare() {
  if (Cap.screen) Cap.screen.getTracks().forEach((t) => t.stop());
  Cap.screen = null;
  $("#screenVideo").srcObject = null;
  rtcPublish();
  attachLocalMedia();
}
$("#screenStop").onclick = stopShare;

// Fenêtre de partage : on la déplace par son bandeau, on la redimensionne par le coin
(() => {
  const box = $("#screenView"), bar = $("#screenBar");
  let d = null;
  bar.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    e.stopPropagation();
    bar.setPointerCapture(e.pointerId);
    d = { x: e.clientX, y: e.clientY, l: box.offsetLeft, t: box.offsetTop };
  });
  bar.addEventListener("pointermove", (e) => {
    if (!d) return;
    const p = box.offsetParent;
    box.style.left = Math.max(0, Math.min(p.clientWidth - box.offsetWidth, d.l + e.clientX - d.x)) + "px";
    box.style.top = Math.max(0, Math.min(p.clientHeight - box.offsetHeight, d.t + e.clientY - d.y)) + "px";
  });
  bar.addEventListener("pointerup", () => (d = null));
  box.addEventListener("pointerdown", (e) => e.stopPropagation());
})();

/* — Clips (Hush Preview) : comme Medal, Hush enregistre en continu et F9 garde les dernières secondes —
   Le replay tourne en mémoire (rien n'est écrit tant qu'on ne demande pas de clip). F9 marche même en plein jeu
   (raccourci global). Le fichier WebM est écrit dans Vidéos\Hush.
   Comment : un seul enregistreur, un morceau par seconde. Le tout premier morceau contient l'en-tête du fichier ;
   chaque « cluster » WebM commence sur une image clé. Un clip = l'en-tête + les clusters des N dernières secondes. */
const Replay = { rec: null, stream: null, head: null, chunks: [], on: false, saving: false };
const CLUSTER = [0x1f, 0x43, 0xb6, 0x75]; // identifiant d'un cluster WebM
function findCluster(u8, from = 0) {
  for (let i = from; i + 3 < u8.length; i++) if (u8[i] === 0x1f && u8[i + 1] === 0x43 && u8[i + 2] === 0xb6 && u8[i + 3] === 0x75) return i;
  return -1;
}
async function replayStart() {
  if (Replay.on || !window.studio.preview) return;
  const audio = !!S.clipAudio;
  let stream;
  try {
    // Source : tout l'écran principal (le jeu), ou seulement la fenêtre Hush
    let id = "self";
    if (S.clipSource !== "hush") {
      const r = await window.studio.capture.sources();
      const scr = (r.list || []).find((s) => s.screen);
      if (scr) id = scr.id;
    }
    await window.studio.capture.pick({ id, audio });
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 60, width: { max: 1920 }, height: { max: 1080 } }, audio });
  } catch {
    window.studio.capture.pick(null);
    showToast("Replay impossible : la capture d'écran a été refusée");
    return replayUi();
  }
  const type = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
  // Une image clé toutes les secondes : un clip peut commencer presque n'importe quand, sans image cassée au début
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 10_000_000, videoKeyFrameIntervalDuration: 1000 });
  Object.assign(Replay, { rec, stream, head: null, chunks: [], on: true });
  rec.ondataavailable = async (e) => {
    if (!e.data.size) return;
    const u8 = new Uint8Array(await e.data.arrayBuffer());
    const at = Date.now();
    if (!Replay.head) {
      // Premier morceau : tout ce qui précède le premier cluster est l'en-tête (pistes, codecs)
      const c = findCluster(u8);
      Replay.head = c > 0 ? u8.slice(0, c) : u8;
      if (c > 0) Replay.chunks.push({ at, u8: u8.slice(c), cluster: 0 });
    } else Replay.chunks.push({ at, u8, cluster: findCluster(u8) });
    // On garde la durée choisie + 5 s de marge
    const keep = (+S.clipLen || 30) * 1000 + 5000;
    while (Replay.chunks.length && at - Replay.chunks[0].at > keep) Replay.chunks.shift();
  };
  stream.getVideoTracks()[0].addEventListener("ended", replayStop);
  rec.start(1000);
  replayUi();
}
function replayStop() {
  if (!Replay.on) return;
  try { if (Replay.rec.state !== "inactive") Replay.rec.stop(); } catch {}
  Replay.stream.getTracks().forEach((t) => t.stop());
  Object.assign(Replay, { rec: null, stream: null, head: null, chunks: [], on: false });
  replayUi();
}
// F9 / bouton : garde les N dernières secondes
async function saveClip() {
  if (!window.studio.preview) return;
  if (!Replay.on) { await replayStart(); return showToast(`Replay lancé : F9 gardera les ${+S.clipLen || 30} dernières secondes`); }
  if (Replay.saving || !Replay.head) return;
  Replay.saving = true;
  // Le morceau en cours est récupéré tout de suite, pour que le clip aille jusqu'à maintenant
  try { Replay.rec.requestData(); } catch {}
  await new Promise((r) => setTimeout(r, 250));
  const want = Date.now() - (+S.clipLen || 30) * 1000;
  const list = Replay.chunks;
  // On démarre sur le dernier cluster (image clé) d'avant le début voulu
  let i = list.length - 1;
  while (i > 0 && (list[i].at > want || list[i].cluster < 0)) i--;
  while (i < list.length && list[i].cluster < 0) i++;
  if (i >= list.length) { Replay.saving = false; return showToast("Pas encore assez d'images pour un clip"); }
  const id = await window.studio.clip.begin();
  await window.studio.clip.chunk(id, Replay.head.slice().buffer);
  await window.studio.clip.chunk(id, list[i].u8.slice(list[i].cluster).buffer);
  for (let k = i + 1; k < list.length; k++) await window.studio.clip.chunk(id, list[k].u8.slice().buffer);
  const file = await window.studio.clip.end(id);
  Replay.saving = false;
  if (file) {
    Cap.lastClip = file;
    flashClip();
    showToast("Clip enregistré dans Vidéos\\Hush · clique ici pour l'ouvrir");
    $("#toast").onclick = () => window.studio.clip.show(file);
    setTimeout(() => ($("#toast").onclick = null), 6000);
  }
}
function flashClip() { const b = $("#clipBtn"); b.classList.remove("saved"); void b.offsetWidth; b.classList.add("saved"); }
function replayUi() {
  $("#clipBtn").classList.toggle("rec", Replay.on);
  $("#clipBtn").title = Replay.on ? `Clip (F9) : garde les ${+S.clipLen || 30} dernières secondes` : "Clip (F9) : lance le replay";
  $("#replayOn").setAttribute("aria-checked", Replay.on);
}

$("#camBtn").onclick = toggleCam;
$("#shareBtn").onclick = toggleShare;
$("#clipBtn").onclick = saveClip;
$("#shareAudio").onclick = (e) => e.currentTarget.setAttribute("aria-checked", e.currentTarget.getAttribute("aria-checked") !== "true");
$("#openClips").onclick = () => window.studio.clip.show(Cap.lastClip || "");
// Clips : seulement dans Hush Preview (pour les autres, le bouton et les réglages disparaissent)
if (!window.studio.preview) document.body.classList.add("no-clips");
else if (!MINI) {
  // Petite étiquette PREVIEW dans la barre du haut : on sait toujours quelle version est ouverte
  const pv = document.createElement("i"); pv.className = "pv-badge"; pv.textContent = "PREVIEW"; document.querySelector(".titlebar .chan").appendChild(pv);
  window.studio.clip.onHotkey(saveClip);
  $("#replayOn").onclick = () => (Replay.on ? replayStop() : replayStart());
  for (const [id, k] of [["#clipLenSeg", "clipLen"], ["#clipSrcSeg", "clipSource"]]) $(id).querySelectorAll("button").forEach((b) => (b.onclick = () => { S[k] = b.dataset.v; save(); clipSegs(); if (k === "clipSource" && Replay.on) { replayStop(); replayStart(); } }));
  const clipSegs = () => { for (const [id, k, d] of [["#clipLenSeg", "clipLen", "30"], ["#clipSrcSeg", "clipSource", "screen"]]) $(id).querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x.dataset.v === String(S[k] || d))); };
  clipSegs();
  replayUi();
  if (S.replayAuto) replayStart();
}
