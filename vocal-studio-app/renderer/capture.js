/* ——— Caméra, partage d'écran et clips ———
   Discord ne laisse aucune appli (ni aucun bot) recevoir ou envoyer de la vidéo dans un appel.
   Hush affiche donc TA caméra et TON partage d'écran chez toi, dans la scène : parfait pour un stream
   ou une vidéo (OBS capture la fenêtre Hush). Pour que le salon Discord les voie, il faut toujours
   activer la caméra / le partage dans Discord. */
const Cap = { cam: null, screen: null, rec: null };

const meTileId = () => (S.demo ? "me" : state.me && state.me.id);

// Appelé après chaque mise à jour des avatars : remet la vidéo de la caméra dans ta tuile
function attachLocalMedia() {
  const id = meTileId();
  for (const t of tiles.values()) {
    const mine = t.data.id === id;
    let v = t.el.querySelector(".av video.selfcam");
    if (mine && Cap.cam) {
      if (!v) {
        v = document.createElement("video");
        v.className = "selfcam";
        v.muted = true; v.autoplay = true; v.playsInline = true;
        t.el.querySelector(".av").appendChild(v);
      }
      if (v.srcObject !== Cap.cam) { v.srcObject = Cap.cam; v.play().catch(() => {}); }
    } else if (v) v.remove();
    if (mine) {
      t.el.classList.toggle("video", !!Cap.cam || !!t.data.video);
      t.el.classList.toggle("live", !!Cap.screen || !!t.data.stream);
    }
  }
  $("#camBtn").classList.toggle("on", !!Cap.cam);
  $("#shareBtn").classList.toggle("on", !!Cap.screen);
}

async function toggleCam() {
  if (Cap.cam) {
    Cap.cam.getTracks().forEach((t) => t.stop());
    Cap.cam = null;
    return attachLocalMedia();
  }
  try {
    Cap.cam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false });
    Cap.cam.getVideoTracks()[0].addEventListener("ended", () => { Cap.cam = null; attachLocalMedia(); });
    attachLocalMedia();
    showToast("Caméra allumée dans Hush (allume-la aussi dans Discord pour que le salon te voie)");
  } catch (e) {
    showToast(e.name === "NotFoundError" ? "Aucune caméra trouvée" : "Caméra indisponible (déjà utilisée par une autre appli ?)");
  }
}

/* — Partage d'écran : choix de l'écran ou de la fenêtre, puis affichage dans une fenêtre flottante — */
async function toggleShare() {
  if (Cap.screen) return stopShare();
  const pick = $("#sharePick");
  const grid = $("#shareGrid");
  grid.textContent = "Recherche des écrans et des fenêtres…";
  pick.hidden = false;
  const list = await window.studio.capture.sources();
  grid.textContent = "";
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
  $("#screenView").hidden = false;
  Cap.screen.getVideoTracks()[0].addEventListener("ended", stopShare);
  attachLocalMedia();
}
function stopShare() {
  if (Cap.screen) Cap.screen.getTracks().forEach((t) => t.stop());
  Cap.screen = null;
  $("#screenVideo").srcObject = null;
  $("#screenView").hidden = true;
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
