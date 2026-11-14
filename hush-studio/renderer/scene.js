/* ——— La scène : le vrai rendu de Hush, dans une vue intégrée ———
   Hush croit être dans un vocal Discord : on lui envoie, à chaque image, qui est là, qui parle et à quel volume,
   calculé depuis les courbes de volume des pistes à la position de lecture. */
const Scene = { view: null, ready: false, lookKey: "", lastSent: "", w: 1920, h: 1080 };

// Tout ce qui n'est pas la scène est caché : barre de titre, réglages, lecteur de musique, accueil…
const SCENE_CSS = `
.titlebar,.dock,#music,.mp-grab,.loupes,.settings-wrap,.screen,.home,.call-banner,.incoming,#showHidden,#toast,
.mini-bar,.mini-grip,.screen-view,.share-pick,.onboard,#onboard,.chat,.chat-wrap,.set-search,.user-menu,.umenu{display:none!important}
.app{grid-template-rows:1fr!important;border-radius:0!important}
.stage{margin-bottom:0!important}
*{cursor:default!important}
`;

async function initScene() {
  const info = await window.hs.sceneInfo();
  const v = document.createElement("webview");
  v.setAttribute("src", info.url);
  v.setAttribute("partition", "persist:scene");
  v.setAttribute("webpreferences", "backgroundThrottling=no");
  $("#sceneBox").appendChild(v);
  Scene.view = v;
  v.addEventListener("dom-ready", () => {
    v.insertCSS(SCENE_CSS);
    Scene.ready = true;
    Scene.lookKey = "";
    Scene.lastSent = "";
    fitScene();
  });
  v.addEventListener("ipc-message", (e) => { if (e.channel === "scene:error") console.warn("Scène :", e.args[0]); });
  v.addEventListener("console-message", (e) => { if (e.level >= 2) console.warn("Scène :", e.message); });
  new ResizeObserver(fitScene).observe($("#preview"));
}

// L'aperçu garde la taille de la vidéo (1920 × 1080 ou 1080 × 1920) : la page est zoomée pour tenir dans la case
function fitScene() {
  const vert = P.format === "9:16";
  Scene.w = vert ? 1080 : 1920;
  Scene.h = vert ? 1920 : 1080;
  const box = $("#preview");
  const aw = box.clientWidth - 28, ah = box.clientHeight - 28;
  const k = Math.min(aw / Scene.w, ah / Scene.h);
  const sb = $("#sceneBox");
  sb.style.width = Math.floor(Scene.w * k) + "px";
  sb.style.height = Math.floor(Scene.h * k) + "px";
  if (Scene.ready) {
    try { Scene.view.setZoomFactor(Math.floor(Scene.w * k) / Scene.w); } catch {}
  }
}

// Volume d'une personne à l'instant t (0..1), et si elle « parle » (comme Discord : encore 400 ms après la voix)
function voiceAt(p, t) {
  let level = 0, speaking = false, talk = false, present = false, any = false, first = Infinity, last = -Infinity;
  for (const c of P.clips) {
    if (c.row !== p.id) continue;
    any = true;
    first = Math.min(first, c.start);
    last = Math.max(last, c.start + c.dur);
    if (t < c.start || t > c.start + c.dur + 0.4) continue;
    if (c.kind === "talk") { if (t < c.start + c.dur) talk = true; continue; }
    const env = ENV.get(c.file);
    if (!env) continue;
    const at = (x) => {
      if (x < c.start || x >= c.start + c.dur) return 0;
      const i = Math.floor((x - c.start + c.in) / env.step);
      return i >= 0 && i < env.lvl.length ? env.lvl[i] / 255 : 0;
    };
    const g = (c.gain ?? 1) * (p.sens ?? 1);
    level = Math.max(level, Math.min(1, at(t) * g));
    if (!speaking) for (let k = 0; k <= 20; k++) if (at(t - k * env.step) * g > 0.05) { speaking = true; break; }
  }
  // Présente entre son premier et son dernier bloc (comme quelqu'un qui rejoint puis quitte le vocal) ; sans bloc : toujours là
  present = !any || (t >= first - 0.05 && t <= last + 0.05);
  return { level, speaking: speaking || talk, talk, present };
}

function sceneState(t) {
  const members = [];
  for (const p of P.people) {
    const v = voiceAt(p, t);
    if (!v.present) continue;
    const m = { id: p.id, name: p.name, avatar: p.avatar || null, muted: false, deaf: false, speaking: v.speaking };
    // Passage dessiné à la main : pas de volume, Hush imite une voix tout seul
    if (!v.talk) m.level = Math.round(v.level * 100) / 100;
    members.push(m);
  }
  return {
    status: "ready", mode: "bot", error: null,
    me: { id: "__studio__", name: "Hush Studio" },
    channel: { id: "studio", name: P.name, guild: "Hush Studio" },
    members, settings: { mute: false, deaf: false },
  };
}

// Envoie l'état si quelque chose a changé, et le bon « look » (scène visuelle) pour l'instant t
function pushScene(t) {
  if (!Scene.ready) return;
  const s = sceneAt(t);
  const vert = P.format === "9:16";
  const key = s.id + "|" + JSON.stringify(s.look) + "|" + vert;
  if (key !== Scene.lookKey) {
    Scene.lookKey = key;
    const look = { ...s.look, vertical: vert };
    Scene.view.executeJavaScript(`try{applyLook(${JSON.stringify(look)});S.vertical=${vert};apply();requestAnimationFrame(layout)}catch(e){console.error(e)}`).catch(() => {});
  }
  const st = sceneState(t);
  const k = JSON.stringify(st.members);
  if (k === Scene.lastSent) return;
  Scene.lastSent = k;
  Scene.view.send("scene:state", st);
}
