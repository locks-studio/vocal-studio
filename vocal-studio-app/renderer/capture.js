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
  if (k !== featKey || (f && f.stream !== $("#featureVideo").srcObject)) requestAnimationFrame(layout);
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
    Cap.cam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false });
    Cap.cam.getVideoTracks()[0].addEventListener("ended", () => { Cap.cam = null; rtcPublish(); attachLocalMedia(); });
    rtcPublish();
    attachLocalMedia();
    showToast("Caméra allumée : les amis Hush du salon la voient (allume-la aussi dans Discord pour les autres)");
  } catch (e) {
    showToast(e.name === "NotFoundError" ? "Aucune caméra trouvée" : "Caméra indisponible (déjà utilisée par une autre appli ?)");
  }
}

/* — Partage d'écran : choix de l'écran ou de la fenêtre, puis affichage dans une fenêtre flottante — */
async function toggleShare() {
  if (Cap.screen) return stopShare();
  const res = await window.studio.capture.sources();
  // Linux Wayland : on passe directement au sélecteur du système
  if (res.portal) return startShare({ id: "portal", name: "Partage d'écran" });
  const pick = $("#sharePick");
  const grid = $("#shareGrid");
  pick.hidden = false;
  const list = res.list;
  grid.textContent = list.length ? "" : "Aucun écran ni fenêtre trouvé.";
  for (const s of list) {
    const b = document.createElement("button");
    b.className = "share-src";
    const img = document.createElement("img");
    img.src = s.thumb; img.alt = "";
    const span = document.createElement("span");
    span.textContent = s.screen ? "🖥 " + s.name : s.name;
    b.append(img, span);
    b.onclick = () => startShare(s);
    grid.appendChild(b);
  }
}
$("#sharePickClose").onclick = () => ($("#sharePick").hidden = true);

async function startShare(src) {
  $("#sharePick").hidden = true;
  const audio = $("#shareAudio").getAttribute("aria-checked") === "true";
  try {
    await window.studio.capture.pick({ id: src.id, audio });
    Cap.screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio });
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

/* — Clips : enregistre la fenêtre Hush (avec le son du PC si on veut) dans Vidéos\Hush — */
async function toggleClip() {
  if (Cap.rec) return stopClip();
  const audio = S.clipAudio;
  let stream;
  try {
    await window.studio.capture.pick({ id: "self", audio });
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 60 }, audio });
  } catch {
    window.studio.capture.pick(null);
    return showToast("Enregistrement impossible");
  }
  const type = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12_000_000 });
  const id = await window.studio.clip.begin();
  let writing = Promise.resolve();
  rec.ondataavailable = (e) => {
    if (!e.data.size) return;
    // Les morceaux sont écrits dans l'ordre, au fil de l'eau
    writing = writing.then(() => e.data.arrayBuffer()).then((buf) => window.studio.clip.chunk(id, buf));
  };
  rec.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    await writing;
    const file = await window.studio.clip.end(id);
    Cap.rec = null;
    clipUi();
    if (file) {
      Cap.lastClip = file;
      showToast("Clip enregistré dans Vidéos\\Hush · clique ici pour l'ouvrir");
      $("#toast").onclick = () => window.studio.clip.show(file);
      setTimeout(() => ($("#toast").onclick = null), 6000);
    }
  };
  stream.getVideoTracks()[0].addEventListener("ended", () => rec.state !== "inactive" && rec.stop());
  rec.start(1000);
  Cap.rec = { rec, at: Date.now() };
  clipUi();
  // Pas de clip sans fin : arrêt automatique au bout de 15 minutes
  Cap.rec.limit = setTimeout(() => Cap.rec && stopClip(), 15 * 60_000);
}
function stopClip() {
  if (!Cap.rec) return;
  clearTimeout(Cap.rec.limit);
  if (Cap.rec.rec.state !== "inactive") Cap.rec.rec.stop();
}
let clipTimer = null;
function clipUi() {
  const on = !!Cap.rec;
  $("#clipBtn").classList.toggle("rec", on);
  $("#clipTime").hidden = !on;
  clearInterval(clipTimer);
  if (on) {
    const tick = () => { const s = Math.floor((Date.now() - Cap.rec.at) / 1000); $("#clipTime").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
    tick();
    clipTimer = setInterval(tick, 500);
  }
}

$("#camBtn").onclick = toggleCam;
$("#shareBtn").onclick = toggleShare;
$("#clipBtn").onclick = toggleClip;
$("#shareAudio").onclick = (e) => e.currentTarget.setAttribute("aria-checked", e.currentTarget.getAttribute("aria-checked") !== "true");
$("#openClips").onclick = () => window.studio.clip.show(Cap.lastClip || "");
// F9 : démarrer / arrêter un clip
addEventListener("keydown", (e) => {
  if (e.key !== "F9" || e.repeat || MINI) return;
  e.preventDefault();
  toggleClip();
});
