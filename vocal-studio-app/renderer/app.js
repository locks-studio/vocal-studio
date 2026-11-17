const $ = (s) => document.querySelector(s);
const stage = $("#stage");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
// Mini-fenêtre : même page, ouverte avec ?mini=1 (seulement les avatars, réglages repris de la grande fenêtre)
const MINI = new URLSearchParams(location.search).has("mini");
// Toute erreur de la page va au journal de Hush (et au serveur si la personne a accepté)
addEventListener("error", (e) => window.studio.report.error({ message: e.message, stack: e.error && e.error.stack }));
addEventListener("unhandledrejection", (e) => window.studio.report.error({ message: String((e.reason && e.reason.message) || e.reason), stack: e.reason && e.reason.stack }));

/* ——— Préférences visuelles ——— */
const SKINS = {
  nuit: { label: "Nuit", a: "#fcbbdd", b: "#ffe3f1", bg: "#000000" },
  aurore: { label: "Aurore", a: "#7c6cff", b: "#ff7ab8", bg: "#0d0b1a" },
  braise: { label: "Braise", a: "#ff6a3d", b: "#ffc14d", bg: "#140b08" },
  glace: { label: "Glace", a: "#4fd6ff", b: "#a6fff0", bg: "#06121a" },
  neon: { label: "Néon", a: "#ff2bd6", b: "#2bf0ff", bg: "#050208" },
  vert: { label: "Halo vert", a: "#2bff4a", b: "#9dff5c", bg: "#050102" },
  papier: { label: "Papier", a: "#3b4cff", b: "#ff5a7a", bg: "#e8eaf1" },
};
const SHAPES = {
  round: { r: "50%", c: "none" },
  squircle: { r: "30%", c: "none" },
};
const DEFAULTS = { skin: "nuit", layout: "strip", shape: "round", bg: "pinkspace", glow: 25, speed: 1, accent: null, names: true, cards: true, hideMuted: false, panel: true, demo: false, players: 99,
  ring: "solid", pixel: false, camera: true, bgImage: null, bgColor: "#fcbbdd", bgColor2: "#9b7bff", bgZoom: 1, ringColor2: "#7c6cff", musicOn: true, musicSource: "pc", volume: 0.8, playerColor: "accent", playerBg: "gradient", playerStyle: "card", zoom: 0.55, tab: "general", chanNames: {}, playerW: null, playerPos: null, autoHide: true, font: "Chomsky", showMe: false, ringColor: null, ringFrom: "origin", voiceMin: 0.4, avShadow: false, bgBlur: 0, blurType: "gaussian", musicTitle: "MADARA-OST", musicCover: null, userPresets: [], notes: {}, userGain: {}, userVol: {}, localMuted: {}, hiddenUsers: [], clipAudio: true, namePos: "top", nameSize: 1, freePos: {}, squash: true, history: [], nameMask: "none", glitch: "off", glitchAmt: 0.5, glitchVoice: true, joinAnim: "pop", avOutline: false, avOutlineAuto: false, nameHover: true, vertNameTop: false, glitchStyle: "rgb", perf: "auto", chanStats: {}, favChans: [], homeSide: "top", homeBg: 1, sbGuests: 7, nameShift: 0, friendColors: {}, camView: "stream", camDevice: "", clipLen: "30", clipSource: "screen", replayAuto: false, reports: false, onboarded: false, adminView: true, avAnim: "db", menuFixed: true,
  // Overlay en jeu : emplacement (coin + décalage, en pixels), taille, écran, et ce qu'il affiche
  ov: { pos: "tl", x: 24, y: 24, w: 280, h: 420, screen: 0, layout: "column", ring: "same", names: true, anim: true, onlyTalk: false, hideMuted: false, opacity: 1 } };
// Anciennes valeurs par défaut : un réglage jamais touché passe une fois aux nouvelles valeurs de base
const OLD_DEFAULTS = { players: 7, zoom: 1, ring: "aura", glow: 70, voiceMin: 0.15, avShadow: true, showMe: true, playerBg: "mosaic" };
let S = { ...DEFAULTS };
let setSearchQ = ""; // recherche en cours dans les paramètres (vide : pages normales)
try {
  const stored = JSON.parse(localStorage.getItem("vocal-studio") || "{}");
  S = { ...DEFAULTS, ...stored };
  if (!("ringFrom" in stored) && stored.ringColor) S.ringFrom = "custom";
} catch {}
// Chaque profil a ses propres listes (jamais partagées avec les valeurs par défaut)
function normS() {
  for (const k of ["notes", "userGain", "userVol", "localMuted", "chanNames", "freePos", "chanStats"]) S[k] = { ...(S[k] || {}) };
  S.favChans = [...(S.favChans || [])];
  S.hiddenUsers = [...(S.hiddenUsers || [])];
  S.userPresets = [...(S.userPresets || [])];
  S.history = [...(S.history || [])];
  S.ov = { ...DEFAULTS.ov, ...(S.ov || {}) };
  if (!S.defaults2) { for (const k in OLD_DEFAULTS) if (S[k] === OLD_DEFAULTS[k]) S[k] = DEFAULTS[k]; S.defaults2 = true; }
  // L'ancien interrupteur « s'aplatit en rythme » devient le choix d'animation
  if (!S.avAnimMig) { if (S.squash === false) S.avAnim = "off"; S.avAnimMig = true; }
  if (!["db", "rhythm", "off"].includes(S.avAnim)) S.avAnim = "db";
  if (!["looks", "general", "avatars", "names", "effets", "anim", "fond", "theme", "sound", "video", "overlay", "account"].includes(S.tab)) S.tab = "general";
  // Réglages retirés : on bascule sur ce qui les remplace
  if (S.layout === "lyrics") S.layout = "strip";
  if (S.joinAnim === "glitch") S.joinAnim = "pop"; // arrivée « glitch » retirée
  if (S.bg === "none") S.bg = "pinkspace"; // fond « Aucun » retiré
  if (!(S.bgZoom > 0)) S.bgZoom = 1;
  // L'ancienne disposition « Verticale » devient la Bande en mode vertical (la mini-fenêtre garde sa colonne)
  if (S.layout === "column" && typeof MINI !== "undefined" && !MINI) { S.layout = "strip"; S.vertical = true; }
  if (S.ring === "energy") S.ring = "aura";
  // Passage au rose pâle : le lecteur prend la couleur d'accent (une seule fois : « Pochette » reste au choix)
  if (!S.playerPink) { S.playerColor = "accent"; S.playerPink = true; }
  if (S.pixel) { S.font = "Minecraft"; S.pixel = false; }
  S.cards = false;
  S.skin = "nuit";
  if (["pulse", "stars", "topo"].includes(S.bg)) S.bg = "space";
  if (S.bg === "auto") S.bg = "profile";
  if (S.blurType === "tilt") S.blurType = "gaussian";
  if (S.musicSource === "manual") S.musicSource = "files";
  S.players = Math.max(1, Math.min(99, S.players || 7));
  // Fonds retirés
  if (["aurora", "particles", "vignette", "grid"].includes(S.bg)) S.bg = "space";
}
normS();

// Quelqu'un parle « vraiment » : Discord le dit, et (si le bot mesure le volume) sa voix dépasse le seuil choisi.
// Une voix trop faible n'allume pas l'anneau et n'attire pas la caméra.
// Le « volume dans Hush » réglé au clic droit multiplie la voix mesurée par le bot.
const lvlOf = (m) => (typeof m.level === "number" ? Math.min(1, m.level * (S.userGain[m.id] ?? 1)) : m.level);
const heard = (m) => !!(m && m.speaking && !(typeof m.level === "number" && lvlOf(m) < S.voiceMin));
const save = () => {
  if (MINI) return; // la mini-fenêtre lit les réglages, elle ne les écrit pas
  try { localStorage.setItem("vocal-studio", JSON.stringify(S)); }
  catch { console.warn("Réglages non enregistrés (image trop lourde ?)"); }
};

/* ——— État de l'appel (vient de Discord, ou de la démo) ——— */
let state = { status: "idle", error: null, me: null, channel: null, members: [], settings: { mute: false, deaf: false } };
const tiles = new Map(); // id → { el, bars, chips, lvl, seed, data }
let editingConfig = false;

function hue(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 3600;
  return (h * 137) % 360;
}

function createTile(m) {
  const el = document.createElement("div");
  el.className = "tile";
  el.dataset.id = m.id;
  el.innerHTML = `<div class="av-wrap"><div class="av-drop"></div><div class="aura"><i></i><i></i><i></i></div><div class="ring"></div><div class="av"></div><div class="cam-badge" title="Caméra allumée"><svg viewBox="0 0 24 24"><rect x="3" y="7" width="12" height="10" rx="2"/><path d="M15 11l6-3v8l-6-3z"/></svg></div><div class="live-badge" title="Stream (partage d'écran)">STREAM</div><div class="mute-badge" title="Muet"><svg class="i-mic" viewBox="0 0 24 24"><path d="M12 4a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M4 4l16 16"/></svg><svg class="i-deaf" viewBox="0 0 24 24"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4" height="6" rx="1.5"/><rect x="16.5" y="14" width="4" height="6" rx="1.5"/><path d="M3 3l18 18"/></svg></div></div>
    <div class="bars">${"<i></i>".repeat(5)}</div>
    <div class="name"><span></span><span class="chips"></span></div>`;
  const t = { el, bars: [...el.querySelectorAll(".bars i")], chips: el.querySelector(".chips"), lvl: 0, seed: Math.random() * 10, ringPhase: tiles.size % 2, data: {} };
  el.querySelector(".av").style.setProperty("--h", hue(m.id));
  return t;
}

// Anneau « Avatar » : deux couleurs vives de la photo de chacun (la principale, puis la plus différente d'elle).
// Sans photo : la couleur de son logo Discord et une voisine.
const avDuos = new Map();
function avatarDuo(m) {
  const key = m.avatar || "h" + hue(m.id);
  if (avDuos.has(key)) return avDuos.get(key);
  const fallback = () => { const h = hue(m.id); return { a: `hsl(${h} 70% 58%)`, b: `hsl(${(h + 55) % 360} 80% 66%)`, duo: true }; };
  const p = !m.avatar ? Promise.resolve(fallback()) : new Promise((res) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 24;
        const x = c.getContext("2d");
        x.drawImage(i, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data;
        // Les pixels par teinte (12 cases), pondérés par leur vivacité
        const bins = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
        for (let k = 0; k < d.length; k += 4) {
          const [r, g, b] = [d[k], d[k + 1], d[k + 2]];
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          const sat = mx ? (mx - mn) / mx : 0, wt = sat * sat * (mx / 255) + 0.01;
          const h = hexHsl("#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")).h;
          const bin = bins[Math.floor(((h % 360) / 360) * 12)];
          bin.w += wt; bin.r += r * wt; bin.g += g * wt; bin.b += b * wt;
        }
        const order = bins.map((b, i) => ({ ...b, i })).filter((b) => b.w > 0).sort((a, b) => b.w - a.w);
        if (!order.length) return res(fallback());
        const first = order[0];
        // Deuxième couleur : assez loin de la première sur le cercle des teintes, sinon une version plus claire
        const far = order.find((b) => Math.min(Math.abs(b.i - first.i), 12 - Math.abs(b.i - first.i)) >= 2 && b.w > first.w * 0.08);
        const css = (b, light) => {
          const hx = "#" + [b.r, b.g, b.b].map((v) => Math.round(v / b.w).toString(16).padStart(2, "0")).join("");
          const k = hexHsl(hx);
          return `hsl(${k.h} ${Math.max(55, k.s)}% ${Math.max(45, Math.min(light ? 75 : 62, k.l + (light ? 18 : 0)))}%)`;
        };
        res({ a: css(first), b: far ? css(far) : css(first, true), duo: true });
      } catch { res(fallback()); }
    };
    i.onerror = () => res(fallback());
    i.src = m.avatar;
  });
  avDuos.set(key, p);
  return p;
}
// Ambilight : les couleurs tout autour du bord de la photo, pour un anneau qui les prolonge
const ambiCache = new Map();
function ambiColors(m) {
  const key = m.avatar || "";
  if (ambiCache.has(key)) return ambiCache.get(key);
  const p = new Promise((res) => {
    if (!m.avatar) return res(null);
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => {
      try {
        const N = 32, c = document.createElement("canvas");
        c.width = c.height = N;
        const x = c.getContext("2d", { willReadFrequently: true });
        x.drawImage(i, 0, 0, N, N);
        const d = x.getImageData(0, 0, N, N).data;
        const stops = [];
        let ar = 0, ag = 0, ab = 0;
        for (let k = 0; k < 16; k++) {
          // Angle CSS : 0° en haut, sens des aiguilles d'une montre
          const ang = (k / 16) * Math.PI * 2;
          let r = 0, g = 0, b = 0, n = 0;
          for (const rad of [12.5, 13.5, 14.5]) {
            const px = Math.round(N / 2 + Math.sin(ang) * rad), py = Math.round(N / 2 - Math.cos(ang) * rad);
            const o = (Math.max(0, Math.min(N - 1, py)) * N + Math.max(0, Math.min(N - 1, px))) * 4;
            r += d[o]; g += d[o + 1]; b += d[o + 2]; n++;
          }
          r /= n; g /= n; b /= n; ar += r; ag += g; ab += b;
          // Un peu plus vif, comme une lumière
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b), boost = mx - mn < 30 ? 1 : 1.25;
          const f = (v) => Math.max(0, Math.min(255, Math.round(mx - (mx - v) * boost + 18)));
          stops.push(`rgb(${f(r)} ${f(g)} ${f(b)})`);
        }
        const hx = (v) => Math.round(v / 16).toString(16).padStart(2, "0");
        const avg = "#" + hx(ar) + hx(ag) + hx(ab);
        res({ conic: `conic-gradient(from 0deg, ${stops.join(", ")}, ${stops[0]})`, a: stops[0], b: stops[8], avg });
      } catch { res(null); }
    };
    i.onerror = () => res(null);
    i.src = m.avatar;
  });
  ambiCache.set(key, p);
  return p;
}
const ringVarsOn = (st, a, b) => {
  st.setProperty("--ring1", a); st.setProperty("--ring2", b);
  st.setProperty("--aura1", `color-mix(in srgb, ${a} 85%, transparent)`);
  st.setProperty("--aura2", `color-mix(in srgb, ${b} 60%, transparent)`);
  st.setProperty("--aura3", `color-mix(in srgb, ${b} 40%, transparent)`);
};
// Pose (ou retire) les couleurs de l'anneau propres à chaque membre
function tileRing(t) {
  const st = t.el.style;
  const clear = () => { t.duo = null; for (const k of ["--ring1", "--ring2", "--aura1", "--aura2", "--aura3", "--ring-conic"]) st.removeProperty(k); };
  if (S.ringFrom === "friends") {
    clear();
    const c = (S.friendColors || {})[t.data.id];
    if (c) { t.duo = { a: c, b: mixWhite(c, 0.45) }; ringVarsOn(st, c, t.duo.b); }
    return;
  }
  if (S.ringFrom === "ambi") {
    ambiColors(t.data).then((c) => {
      if (S.ringFrom !== "ambi" || !t.el.isConnected) return;
      clear();
      if (!c) return;
      t.duo = { a: c.a, b: c.b };
      ringVarsOn(st, c.a, c.b);
      st.setProperty("--ring-conic", c.conic);
    });
    return;
  }
  if (S.ringFrom !== "avatar") return clear();
  avatarDuo(t.data).then((c) => {
    if (S.ringFrom !== "avatar" || !t.el.isConnected) return;
    t.duo = c;
    st.setProperty("--ring1", c.a); st.setProperty("--ring2", c.b);
    st.setProperty("--aura1", `color-mix(in srgb, ${c.a} 85%, transparent)`);
    st.setProperty("--aura2", `color-mix(in srgb, ${c.b} 60%, transparent)`);
    st.setProperty("--aura3", `color-mix(in srgb, ${c.b} 40%, transparent)`);
  });
}

// Couleur dominante d'une photo de profil (la plus vive), pour le contour « couleur de l'avatar »
const avColors = new Map();
function avatarColor(url) {
  if (avColors.has(url)) return avColors.get(url);
  const p = new Promise((res) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 16;
        const x = c.getContext("2d");
        x.drawImage(i, 0, 0, 16, 16);
        const d = x.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0, w = 0;
        for (let k = 0; k < d.length; k += 4) {
          const mx = Math.max(d[k], d[k + 1], d[k + 2]), mn = Math.min(d[k], d[k + 1], d[k + 2]);
          const s = mx ? (mx - mn) / mx : 0, wt = s * s * (mx / 255) + 0.02; // les pixels vifs comptent plus
          r += d[k] * wt; g += d[k + 1] * wt; b += d[k + 2] * wt; w += wt;
        }
        const hx = "#" + [r, g, b].map((v) => Math.round(v / w).toString(16).padStart(2, "0")).join("");
        const h = hexHsl(hx);
        res(`hsl(${h.h} ${Math.max(45, h.s)}% ${Math.max(38, Math.min(62, h.l))}%)`);
      } catch { res(null); }
    };
    i.onerror = () => res(null);
    i.src = url;
  });
  avColors.set(url, p);
  return p;
}

function updateTile(t, m) {
  const av = t.el.querySelector(".av");
  if (t.data.avatar !== m.avatar || t.data.avatarAnim !== m.avatarAnim || t.data.name !== m.name) {
    av.textContent = "";
    const img = document.createElement("img");
    img.alt = "";
    // Sans photo de profil (ou si elle ne charge pas) : logo sur la couleur du joueur
    const fallback = () => { av.classList.add("default"); img.src = "assets/discord-logo.png"; img.onerror = null; };
    if (m.avatar) { av.classList.remove("default"); img.src = m.avatar; img.onerror = fallback; }
    else fallback();
    av.appendChild(img);
    // Avatar animé (GIF) : il ne bouge que quand la personne parle (image fixe le reste du temps)
    if (m.avatarAnim) {
      const anim = document.createElement("img");
      anim.alt = "";
      anim.className = "anim";
      anim.src = m.avatarAnim;
      av.appendChild(anim);
    }
    t.el.querySelector(".name span").textContent = m.name;
    if (m.avatar) avatarColor(m.avatar).then((c) => c && t.el.style.setProperty("--oc-auto", c));
    else t.el.style.setProperty("--oc-auto", `hsl(${hue(m.id)} 62% 54%)`);
    t.data = { ...t.data, id: m.id, avatar: m.avatar };
    tileRing(t);
  }
  t.chips.innerHTML = m.deaf ? `<span class="chip">Sourdine</span>` : m.muted ? `<span class="chip">Muet</span>` : "";
  t.el.classList.toggle("muted", m.muted || m.deaf);
  t.el.classList.toggle("deaf", m.deaf);
  t.el.classList.toggle("me", !!(state.me && m.id === state.me.id));
  t.el.classList.toggle("video", !!m.video);
  t.el.classList.toggle("live", !!m.stream);
  t.el.classList.toggle("ghost", !!m.ghost);
  t.data = { ...m };
}

let tilesReady = false; // le premier affichage du salon ne joue pas l'animation d'arrivée
setTimeout(() => (tilesReady = true), 1500);
const PLAYER_HUES = [235, 8, 150, 45, 285, 192, 330, 100, 25, 260, 170, 350, 60, 210, 305, 125];
let lastOrder = "";
const lastSpoke = new Map();
const peak = new Map(); // id → volume récent le plus fort (décroît doucement)
function syncTiles() {
  const meId = state.me && state.me.id;
  // Toi en premier, puis l'ordre du salon, limité au nombre de joueurs choisi.
  // Ceux qui parlent (ou ont parlé il y a moins de 10 s) passent devant les muets pour avoir leur place.
  const now = Date.now();
  for (const m of state.members) if (heard(m)) lastSpoke.set(m.id, now);
  for (const m of state.members) if (typeof m.level === "number") peak.set(m.id, Math.max(lvlOf(m), (peak.get(m.id) || 0) * 0.97));
  // Membres masqués au clic droit : absents de la scène
  const ordered = state.members.filter((m) => !S.hiddenUsers.includes(m.id)).sort((a, b) => (b.id === meId) - (a.id === meId));
  const recent = (m) => m.id === meId || now - (lastSpoke.get(m.id) || 0) < 10_000;
  // Les plus forts (en dB) d'abord parmi ceux qui viennent de parler, puis les autres
  const loudFirst = ordered.filter(recent).sort((a, b) => (b.id === meId) - (a.id === meId) || (peak.get(b.id) || 0) - (peak.get(a.id) || 0));
  const keep = new Set([...loudFirst, ...ordered.filter((m) => !recent(m))].slice(0, S.players).map((m) => m.id));
  let list = ordered.filter((m) => keep.has(m.id));
  // Overlay « seulement ceux qui parlent » : chacun reste 3 s après sa dernière phrase
  if (MINI && S.ov.onlyTalk) list = list.filter((m) => now - (lastSpoke.get(m.id) || 0) < 3000);
  const ids = new Set(list.map((m) => m.id));
  for (const [id, t] of tiles) {
    if (ids.has(id)) continue;
    tiles.delete(id);
    // Départ : l'avatar se rétracte et s'efface (pas pour un appelé qui décroche : il est remplacé tout de suite)
    if (t.data.ghost || reduced || S.joinAnim === "none") { t.el.remove(); continue; }
    t.el.classList.add("leaving");
    t.el.style.pointerEvents = "none";
    setTimeout(() => t.el.remove(), 650);
  }
  for (const m of list) {
    let t = tiles.get(m.id);
    if (!t) {
      t = createTile(m);
      tiles.set(m.id, t);
      stage.appendChild(t.el);
      // Arrivée (après le premier affichage) : l'avatar surgit avec une onde
      if (tilesReady && !m.ghost && !reduced && S.joinAnim !== "none") { t.el.classList.add("joining"); setTimeout(() => t.el.classList.remove("joining"), 900); }
    }
    updateTile(t, m);
  }
  const order = list.map((m) => m.id).join(",");
  if (order !== lastOrder) { lastOrder = order; list.forEach((m) => stage.appendChild(tiles.get(m.id).el)); }
  // Couleurs bien différentes d'un joueur à l'autre, en partant du bleu Discord pour toi
  list.forEach((m, i) => tiles.get(m.id).el.querySelector(".av").style.setProperty("--h", PLAYER_HUES[i % PLAYER_HUES.length]));
  if (typeof attachLocalMedia === "function") attachLocalMedia();
  // Bouton « Afficher les joueurs masqués »
  const nh = state.members.filter((m) => S.hiddenUsers.includes(m.id)).length;
  $("#showHidden").hidden = !nh || MINI;
  $("#showHidden").textContent = `Afficher ${nh > 1 ? `les ${nh} joueurs masqués` : "le joueur masqué"}`;
  layout();
}

/* ——— En-tête, barre d'appel, écrans ——— */
const STATUS = {
  idle: ["", "Hors ligne"], "needs-config": ["warn", "À configurer"], "needs-login": ["warn", "Connexion requise"], "bot-absent": ["warn", "Bot absent du salon"], connecting: ["warn", "Connexion…"],
  authorizing: ["warn", "Autorisation…"], ready: ["ok", "Connecté à Discord"], disconnected: ["err", "Discord fermé"],
  error: ["err", "Erreur"], demo: ["ok", "Mode démo"],
};
function renderChrome() {
  let [cls, label] = STATUS[state.status] || STATUS.idle;
  if (state.status === "disconnected" && /serveur Hush/i.test(state.error || "")) label = "Serveur Hush injoignable";
  $("#status").innerHTML = `<i class="dot ${cls}"></i> `;
  $("#status").append(label);
  const ch = state.channel;
  if (!$("#chanName").isContentEditable) $("#chanName").textContent = ch ? chanLabel(ch) : "Hush";
  $("#chanName").title = ch ? "Clique pour renommer le salon (visible seulement dans Hush)" : "";
  $("#coreName").textContent = ch ? chanLabel(ch) : "Hush";
  $("#guild").textContent = ch && ch.guild ? ch.guild : "";
  $("#count").textContent = ch ? `${state.members.length} dans le salon` : "";
  if (!MINI) document.title = ch ? `${chanLabel(ch)} · Hush` : "Hush";

  const inCall = !!ch;
  ["#mic", "#deaf", "#leave"].forEach((id) => ($(id).disabled = !inCall));
  // Mode bot : il ne peut pas toucher à ton micro ; « Quitter » fait partir le bot
  const controls = state.controls !== false;
  $("#mic").hidden = $("#deaf").hidden = !controls;
  $("#leave").title = controls ? "Quitter le salon" : "Faire partir le bot du salon";
  $("#leave").setAttribute("aria-label", $("#leave").title);
  const { mute, deaf } = state.settings;
  $("#mic").classList.toggle("off", mute || deaf);
  $("#mic").setAttribute("aria-label", mute ? "Réactiver le micro" : "Couper le micro");
  $("#deaf").classList.toggle("off", deaf);
  $("#deaf").setAttribute("aria-label", deaf ? "Retirer la sourdine" : "Mettre en sourdine");
  $("#demoToggle").textContent = S.demo ? "Quitter le mode démo" : "Mode démo";
  // Onglet Compte : qui est connecté, et comment
  const how = S.demo ? "Mode démo (joueurs fictifs)" : state.mode === "bot" ? "Avec le bot Hush" : "Connexion directe (RPC)";
  $("#accountInfo").textContent = `${how} · ${(STATUS[state.status] || STATUS.idle)[1]}${state.me ? ` · connecté en tant que ${state.me.name}` : ""}`;
  if (typeof renderHome === "function") renderHome();
  renderScreen();
}

// Nom du salon : celui que tu as choisi dans Hush, sinon celui de Discord
function chanLabel(ch) { return (S.chanNames || {})[ch.id] || ch.name; }
$("#chanName").addEventListener("click", () => {
  const ch = state.channel, el = $("#chanName");
  if (!ch || el.isContentEditable) return;
  el.contentEditable = "plaintext-only";
  el.focus();
  document.getSelection().selectAllChildren(el);
  const done = (keep) => {
    el.contentEditable = "false";
    el.onkeydown = el.onblur = null;
    if (keep) {
      const name = el.textContent.trim().slice(0, 60);
      S.chanNames = { ...(S.chanNames || {}) };
      if (!name || name === ch.name) delete S.chanNames[ch.id]; else S.chanNames[ch.id] = name;
      save();
    }
    renderChrome();
  };
  el.onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); done(true); }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); }
  };
  el.onblur = () => done(true);
});

function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  if (text) e.textContent = text;
  return e;
}
function button(label, cls, onClick) {
  const b = el("button", { class: cls, type: "button" }, label);
  b.onclick = onClick;
  return b;
}
function actions(...btns) {
  const d = el("div", { class: "actions" });
  btns.forEach((b) => d.appendChild(b));
  return d;
}

let screenKey = "";
async function renderScreen() {
  const screen = $("#screen"), card = $("#screenCard");
  const s = state.status;
  // L'accueil remplace les écrans « connexion / aucun vocal »
  if (typeof homeWanted === "function" && homeWanted()) { screen.hidden = true; screenKey = ""; return; }
  // Ne redessine que si l'écran change (sinon le formulaire perdrait ce qui est tapé)
  const key = editingConfig || s === "needs-config" ? "setup" : `${s}|${!!state.channel}|${state.error}|${state.canJoin}|${state.mode}`;
  if (key === screenKey) return;
  screenKey = key;
  card.textContent = "";
  if (editingConfig || s === "needs-config") return renderSetup(card, screen);
  if (s === "demo" || (s === "ready" && state.channel)) { screen.hidden = true; return; }
  screen.hidden = false;
  const isBot = state.mode === "bot";
  if (s === "connecting" || s === "idle") {
    card.append(el("div", { class: "spinner" }), el("h3", {}, isBot ? "Connexion au serveur Hush…" : "Connexion à Discord…"),
      el("p", {}, isBot ? "Ça ne prend que quelques secondes." : "Garde l'application Discord ouverte sur ce PC."));
  } else if (s === "needs-login") {
    card.append(el("h3", {}, "Connecte-toi avec Discord"),
      el("p", {}, "Hush a besoin de savoir qui tu es pour trouver ton salon vocal. Il ne voit ni tes messages ni tes serveurs."));
    if (state.error) card.append(el("p", { class: "err" }, state.error));
    card.append(actions(button("Se connecter avec Discord", "cta", () => window.studio.bot.login()),
      button("Modifier la connexion", "ghost", () => { editingConfig = true; renderScreen(); }),
      button("Mode démo", "ghost", () => setDemo(true))));
  } else if (s === "bot-absent") {
    card.append(el("h3", {}, `Hush n'est pas dans « ${state.channel.name} »`));
    if (state.canJoin) {
      card.append(el("p", {}, "Fais venir le bot dans ton salon pour afficher tout le monde. Tu peux aussi taper /hush dans Discord."));
      if (state.error) card.append(el("p", { class: "err" }, state.error));
      card.append(actions(button("Faire venir le bot", "cta", () => window.studio.voice.summon())));
    } else {
      card.append(el("p", {}, "Le bot n'a pas le droit de rejoindre ce salon. Demande à un admin du serveur de lui donner les permissions « Voir le salon » et « Se connecter »."));
    }
  } else if (s === "authorizing") {
    card.append(el("div", { class: "spinner" }), el("h3", {}, isBot ? "Termine dans ton navigateur" : "Regarde dans Discord"),
      el("p", {}, isBot
        ? "Une page Discord s'est ouverte : clique sur « Autoriser ». Hush continue tout seul ensuite."
        : "Une fenêtre te demande d'autoriser Hush à voir ton salon vocal. Clique sur « Autoriser ». Il ne le demandera qu'une fois."));
    if (isBot) card.append(actions(button("Annuler", "ghost", () => window.studio.voice.start())));
  } else if (s === "ready") {
    card.append(el("h3", {}, "Tu n'es dans aucun salon vocal"),
      el("p", {}, isBot
        ? "Rejoins un salon vocal sur un serveur où le bot Hush est invité : il s'affichera ici tout seul."
        : "Rejoins un salon vocal ou un appel dans Discord : il s'affichera ici tout seul."));
  } else if (s === "disconnected") {
    // En connexion directe, l'erreur peut venir du serveur Hush (pas de Discord) : on le dit
    const srv = isBot || /serveur Hush/i.test(state.error || "");
    card.append(el("div", { class: "spinner" }), el("h3", {}, srv ? "Serveur Hush injoignable" : "Discord est fermé"),
      el("p", {}, srv ? "Vérifie ta connexion internet (certains Wi-Fi publics ou d'école le bloquent). Hush réessaie toutes les 5 secondes." : "Ouvre Discord sur ce PC. Hush se reconnecte toutes les 5 secondes."),
      actions(button("Essayer le mode démo", "ghost", () => setDemo(true))));
  } else if (s === "error") {
    card.append(el("h3", {}, "La connexion a échoué"), el("p", { class: "err" }, state.error || "Erreur inconnue"),
      actions(button("Réessayer", "cta", () => window.studio.voice.start()),
        button("Modifier la connexion", "ghost", () => { editingConfig = true; renderScreen(); }),
        button("Mode démo", "ghost", () => setDemo(true))));
  }
}

async function renderSetup(card, screen) {
  screen.hidden = false;
  const cfg = await window.studio.config.get();
  card.textContent = "";
  const form = el("form");
  form.style.cssText = "display:flex;flex-direction:column;gap:14px";
  const f = (label, id, value, extra = {}) => {
    const l = el("label", { for: id }, label);
    const i = el("input", { id, value: value || "", autocomplete: "off", spellcheck: "false", ...extra });
    l.appendChild(i);
    return l;
  };
  let mode = cfg.mode === "local" ? "local" : "bot";
  const seg = el("div", { class: "seg two", role: "group", "aria-label": "Mode de connexion" });
  const segBtn = (v, label) => {
    const b = button(label, "", () => { mode = v; show(); });
    b.dataset.v = v;
    seg.appendChild(b);
  };
  segBtn("bot", "Avec le bot");
  segBtn("local", "Connexion directe (testeurs)");

  // Mode bot : juste l'adresse du serveur Hush
  const botBox = el("div", { class: "setup-box" });
  botBox.append(el("p", {}, "Le bot Hush rejoint ton salon vocal et transmet qui parle. Ça marche pour tout le monde, il suffit que le bot soit invité sur le serveur."),
    f("Adresse du serveur Hush", "cfgServer", cfg.botServer, { placeholder: "https://…" }));

  // Mode direct (RPC) : réservé à toi et à tes testeurs
  const localBox = el("div", { class: "setup-box" });
  // Rien à remplir : Hush lit le Discord ouvert sur ce PC, et le serveur Hush fait l'échange secret.
  // Les identifiants ne servent qu'au propriétaire de l'appli (rangés dans « Avancé »).
  const intro = el("p", {}, "Hush lit directement ton Discord ouvert sur ce PC : il voit tous tes vocaux, sur n'importe quel serveur, et tes appels. Rien à remplir. Il faut juste que le créateur de Hush t'ait ajouté comme testeur de l'appli (tu reçois une invitation Discord à accepter).");
  const adv = el("details", { class: "setup-adv" });
  adv.append(el("summary", {}, "Avancé (créateur de l'appli seulement)"),
    f("Client ID", "cfgId", cfg.clientId, { inputmode: "numeric", placeholder: "Vide = celui du serveur Hush" }),
    f("Client Secret", "cfgSecret", "", { type: "password", placeholder: cfg.hasSecret ? "Déjà enregistré (laisse vide pour le garder)" : "Vide = échange par le serveur Hush" }),
    f("URL de redirection (la même que sur le portail)", "cfgRedirect", cfg.redirectUri));
  localBox.append(intro, adv);

  function show() {
    seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === mode));
    botBox.hidden = mode !== "bot";
    localBox.hidden = mode !== "local";
    $("#cfgServer").required = mode === "bot";

  }

  form.append(el("h3", {}, "Connecter Discord"), seg, botBox, localBox);
  const submit = el("button", { class: "cta", type: "submit" }, "Enregistrer et connecter");
  const row = actions(submit, button("Mode démo", "ghost", () => { editingConfig = false; setDemo(true); }));
  if (cfg.clientId || cfg.botServer) row.appendChild(button("Annuler", "ghost", () => { editingConfig = false; screenKey = ""; renderScreen(); }));
  form.appendChild(row);
  form.onsubmit = async (e) => {
    e.preventDefault();
    editingConfig = false;
    if (S.demo) setDemo(false, true);
    await window.studio.config.save(mode === "bot"
      ? { mode, botServer: $("#cfgServer").value }
      : { mode, clientId: $("#cfgId").value, clientSecret: $("#cfgSecret").value, redirectUri: $("#cfgRedirect").value });
  };
  card.appendChild(form);
  show();
}

/* ——— Source des données : Discord ou démo ——— */
window.studio.voice.onState(onVoiceState);
function onVoiceState(s) {
  if (S.demo) return;
  if (typeof homeOnState === "function" && !MINI) { homeOnState(s); friendsOnState(s); }
  // En mode Personnaliser, on garde le vrai état de côté pour le retrouver en sortant
  if (sandbox) { sandbox.real = s; return; }
  // Hors vocal : on te montre seul dans la scène (le fond flouté de l'accueil)
  if (!s.channel && s.me && !MINI) s = { ...s, members: [{ ...s.me, muted: false, deaf: false, speaking: false }] };
  // Appel privé qui sonne : on montre la personne appelée, en transparence, tant qu'elle n'a pas décroché
  else if (s.channel && s.channel.call && s.channel.callee && s.members.length <= 1 && !s.members.some((m) => m.id === s.channel.callee.id))
    s = { ...s, members: [...s.members, { ...s.channel.callee, ghost: true, muted: false, deaf: false, speaking: false }] };
  state = s;
  syncTiles();
  renderChrome();
  if (window.chatOnState) window.chatOnState();
}

/* ——— Mode Personnaliser (depuis l'accueil) ———
   Un vocal simulé où tu es seul (avec des invités fictifs si tu veux), les paramètres ouverts : on essaie
   toutes les dispositions, anneaux, effets… sans être en vocal. Ta voix est simulée par moments
   (bouton « Je parle »). Rien n'est envoyé à Discord. */
let sandbox = null;
function setSandbox(on, quiet) {
  if (sandbox) clearInterval(sandbox.timer);
  if (on && !sandbox) {
    const me = state.me || { id: "me", name: DEMO_ME, avatar: null }; // pas encore connecté : le pseudo d'exemple
    sandbox = { real: state, talk: true, guests: false, me, phase: 0 };
    state = { status: "demo", error: null, me, channel: { id: "sandbox", name: "Personnalisation", guild: "Hush" },
      members: [{ ...me, muted: false, deaf: false, speaking: false }], settings: { mute: false, deaf: false } };
    sandbox.timer = setInterval(sandboxTick, 380);
    Home.forced = false;
    if (!quiet) { S.panel = true; apply(); dockSettings(); } // paramètres sur le côté : on voit le résultat en direct
  } else if (!on && sandbox) {
    const real = sandbox.real;
    sandbox = null;
    onVoiceState(real);
    window.studio.voice.state().then((s) => { if (!sandbox && !S.demo) onVoiceState(s); }).catch(() => {});
  }
  document.body.classList.toggle("sandbox", !!sandbox);
  $("#sandboxPill").hidden = !sandbox;
  $("#sbGuests").hidden = !sandbox;
  sbGuestsSync();
  syncTiles(); renderChrome();
}
function sandboxTick() {
  const sb = sandbox;
  // Toi : des phrases de 1,5 à 4 s, puis un silence de 1 à 3 s
  const me = state.members[0];
  sb.phase -= 380;
  if (sb.phase <= 0) { me.speaking = sb.talk && !me.speaking; sb.phase = me.speaking ? 1500 + Math.random() * 2500 : 1000 + Math.random() * 2000; }
  if (!sb.talk) me.speaking = false;
  me.level = me.speaking ? Math.max(0.15, Math.min(1, (me.level || 0.5) + (Math.random() - 0.5) * 0.5)) : 0;
  // Invités fictifs : même petit jeu que le mode démo
  // Nombre de personnes : la barre verticale en haut à gauche (propre au mode Personnaliser)
  const want = Math.max(0, Math.min(23, (S.sbGuests || 1) - 1));
  if (state.members.length - 1 !== want) {
    state.members = [me, ...demoMembers().slice(1, 1 + want)];
    syncTiles(); renderChrome();
  }
  const talking = state.members.filter((m) => m.speaking).length;
  for (const m of state.members.slice(1)) {
    if (m.muted || m.deaf) { m.speaking = false; continue; }
    if (m.speaking) { if (Math.random() < 0.22) m.speaking = false; }
    else if (talking < 2 && Math.random() < 0.08) m.speaking = true;
    m.level = m.speaking ? Math.max(0.1, Math.min(1, (m.level || 0.5) + (Math.random() - 0.5) * 0.5)) : 0;
  }
}
$("#sandboxQuit").onclick = () => setSandbox(false);
$("#sandboxTalk").onclick = () => { sandbox.talk = !sandbox.talk; $("#sandboxTalk").classList.toggle("on", sandbox.talk); };
// Barre verticale : combien de personnes dans le vocal simulé (toi compris)
const sbGuestsSync = () => { $("#sbGuestsRange").value = S.sbGuests || 1; $("#sbGuestsOut").textContent = String(S.sbGuests || 1); };
$("#sbGuestsRange").oninput = (e) => { S.sbGuests = +e.target.value; sbGuestsSync(); save(); };

// Pseudos d'exemple : Locks d'abord (c'est « toi » dans la démo), puis la bande, dans l'ordre de priorité
const DEMO_ME = "Locks";
const DEMO_NAMES = ["Imo", "KCM", "Lazy", "Nuraskip", "Disk", "Stryzki", "Youbi", "Luzz", "Elo", "Dreamy", "Marga", "Sanji",
  "Gabinoul", "Nejiraya", "Ayman", "Soso", "Bocchii", "Sofiane", "Reiya", "Emro", "Yussuf", "Raph", "Sei"];
// Joueurs fictifs : toi + autant d'autres que le réglage « Joueurs affichés »
function demoMembers(keep = []) {
  const old = new Map(keep.map((m) => [m.id, m]));
  return [{ id: "me", name: DEMO_ME, avatar: null, muted: false, deaf: false, speaking: false },
    ...DEMO_NAMES.slice(0, Math.max(0, S.players - 1)).map((n, i) => ({ id: "d" + i, name: n, avatar: null, muted: i === 2, deaf: i === 5, speaking: false }))]
    .map((m) => old.get(m.id) || m);
}
let demoTimer = null;
function setDemo(on, silent) {
  S.demo = on; save();
  clearInterval(demoTimer);
  if (on) {
    window.studio.voice.stop();
    editingConfig = false;
    state = {
      status: "demo", error: null, me: { id: "me", name: DEMO_ME },
      channel: { id: "demo", name: "soirée-chill", guild: "Serveur de démo" },
      members: demoMembers(),
      settings: { mute: false, deaf: false },
    };
    demoTimer = setInterval(() => {
      const talking = state.members.filter((m) => m.speaking).length;
      state.members.forEach((m) => {
        if (m.muted || m.deaf) { m.speaking = false; return; }
        if (m.speaking) { if (Math.random() < 0.22) m.speaking = false; }
        else if (talking < 2 && Math.random() < 0.1) m.speaking = true;
        m.level = m.speaking ? Math.max(0.1, Math.min(1, (m.level || 0.5) + (Math.random() - 0.5) * 0.5)) : 0;
      });
    }, 380);
    syncTiles(); renderChrome();
  } else if (!silent) {
    state = { ...state, status: "connecting", channel: null, members: [] };
    syncTiles(); renderChrome();
    window.studio.voice.start();
  }
}
function demoMe() { return state.members.find((m) => m.id === (sandbox ? sandbox.me.id : "me")); }

/* ——— Boutons d'appel ——— */
$("#mic").onclick = () => {
  const { mute, deaf } = state.settings;
  if (S.demo || sandbox) {
    state.settings = deaf ? { mute: false, deaf: false } : { mute: !mute, deaf: false };
    Object.assign(demoMe(), { muted: state.settings.mute, deaf: false });
    syncTiles(); return renderChrome();
  }
  if (deaf) window.studio.voice.deaf(false); else window.studio.voice.mute(!mute);
};
$("#deaf").onclick = () => {
  const deaf = !state.settings.deaf;
  if (S.demo || sandbox) {
    state.settings = { mute: deaf, deaf };
    Object.assign(demoMe(), { muted: deaf, deaf });
    syncTiles(); return renderChrome();
  }
  window.studio.voice.deaf(deaf);
};
$("#leave").onclick = () => {
  if (S.demo) return setDemo(false);
  if (sandbox) return setSandbox(false);
  window.studio.voice.leave();
};

/* ——— Fenêtre ——— */
let pinned = false;
const togglePin = async () => { pinned = await window.studio.win.pin(!pinned); $("#pin").classList.toggle("on", pinned); $("#setPin").setAttribute("aria-checked", pinned); };
$("#pin").onclick = togglePin;
$("#setPin").onclick = togglePin;
$("#setFull").onclick = () => window.studio.win.fullscreen();
document.querySelectorAll("#tabs [data-tab]").forEach((b) => (b.onclick = () => { clearSetSearch(); S.tab = b.dataset.tab; apply(); $(".settings-body").scrollTop = 0; }));

/* ——— Recherche dans les paramètres : chaque bloc de réglages qui contient le mot, toutes catégories confondues ——— */
const fold = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function setSearch(q) {
  setSearchQ = fold(q.trim());
  const panels = [...document.querySelectorAll(".tab-panel")];
  document.body.classList.toggle("set-searching", !!setSearchQ);
  if (!setSearchQ) {
    panels.forEach((p) => p.querySelectorAll(".search-hide").forEach((x) => x.classList.remove("search-hide")));
    $("#setEmpty").hidden = true;
    return apply();
  }
  let found = 0;
  for (const p of panels) {
    let any = false;
    // Un bloc = un .group, ou une ligne isolée dans la page (titre de section exclu)
    for (const el of p.children) {
      if (el.classList.contains("sec")) continue;
      // Le texte affiché, plus les infobulles (les boutons à icône)
      const txt = fold(el.textContent + " " + [...el.querySelectorAll("[title],[aria-label]")].map((x) => x.title + " " + x.getAttribute("aria-label")).join(" "));
      const hit = txt.includes(setSearchQ) || fold(p.dataset.title || "").includes(setSearchQ);
      el.classList.toggle("search-hide", !hit);
      if (hit && !el.hidden) any = true;
    }
    p.querySelectorAll(":scope > .sec").forEach((x) => x.classList.add("search-hide"));
    p.hidden = !any;
    if (any) found++;
  }
  $("#setEmpty").hidden = !!found;
  $("#settingsTitle").textContent = `Résultats pour « ${q.trim()} »`;
  document.querySelectorAll("#tabs [data-tab]").forEach((x) => x.setAttribute("aria-selected", "false"));
  $(".settings-body").scrollTop = 0;
}
function clearSetSearch() {
  if (!setSearchQ && !$("#setSearch").value) return;
  $("#setSearch").value = "";
  setSearch("");
}
// Chaque page porte le nom de sa catégorie : affiché au-dessus des résultats de recherche
document.querySelectorAll(".tab-panel").forEach((p) => {
  const b = document.querySelector(`#tabs [data-tab="${p.dataset.tab}"]`);
  if (b) p.dataset.title = typeof I18N !== "undefined" && I18N.lang !== "fr" ? I18N.tr(b.textContent) : b.textContent;
});
$("#setSearch").addEventListener("input", (e) => setSearch(e.target.value));
$("#setSearch").addEventListener("keydown", (e) => { if (e.key === "Escape" && e.target.value) { e.stopPropagation(); clearSetSearch(); } });
// Ctrl+F dans les paramètres : la recherche
addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && !$("#settingsWrap").hidden) { e.preventDefault(); $("#setSearch").focus(); $("#setSearch").select(); }
});
$("#settingsClose").onclick = () => { S.panel = false; apply(); };
// Dès qu'on touche à un réglage visuel, la fenêtre se range sur le côté pour voir le résultat en direct
$("#panel").addEventListener("input", dockSettings);
$("#panel").addEventListener("click", (e) => { if (e.target.closest(".tab-panel .seg button, .tab-panel .bg-pick button, .tab-panel .switch, .skin, #accentReset")) dockSettings(); });
function dockSettings() { $("#settingsWrap").classList.add("docked"); syncDock(); }
$("#settingsCenter").onclick = () => { $("#settingsWrap").classList.remove("docked"); syncDock(); };
// Paramètres sur le côté : la scène se décale pour rester centrée dans la partie visible
function syncDock() {
  const on = S.panel && $("#settingsWrap").classList.contains("docked");
  if (document.body.classList.contains("panel-docked") === on) return;
  document.body.classList.toggle("panel-docked", on);
  setTimeout(() => { layout(); placeMusic(); }, 320);
}
// Clic à côté de la fenêtre : on la ferme
$("#settingsWrap").addEventListener("pointerdown", (e) => { if (e.target === e.currentTarget) { S.panel = false; apply(); } });
$("#zoomRange").oninput = (e) => setZoom(+e.target.value, true);
$("#logoutBtn").onclick = () => window.studio.config.logout();
$("#min").onclick = () => window.studio.win.minimize();
$("#max").onclick = () => window.studio.win.maximize();
$("#close").onclick = () => window.studio.win.close();
$("#togglePanel").onclick = () => { S.panel = !S.panel; apply(); };
$("#fullscreen").onclick = () => window.studio.win.fullscreen();
addEventListener("keydown", (e) => {
  if (e.key === "F11") { e.preventDefault(); window.studio.win.fullscreen(); }
  if (e.key === "Escape" && S.panel) { S.panel = false; apply(); }
});
$("#openSetup").onclick = () => { editingConfig = true; S.panel = false; apply(); screenKey = ""; renderScreen(); };
$("#demoToggle").onclick = () => setDemo(!S.demo);

/* ——— Disposition ——— */
let focusId = null, focusAt = 0;
let lastL = null;
let L = "strip"; // disposition affichée (la choisie, ou « stream » quand une vidéo est à l'image)
function layout() {
  const feat = featureSource();
  L = feat ? "stream" : camsIn3D() && !MINI ? "film" : S.layout;
  const vert = !!S.vertical && ["strip", "film", "cinema", "grid", "discord"].includes(L);
  stage.className = "stage " + (L === "film" ? "cinema film" : L) + (vert ? " vertical" : "");
  renderFeature(feat);
  mainEl.classList.toggle("cam-move", camLayout());
  if (!camLayout()) { view.lock = null; view.y = 0; }
  const n = Math.max(1, tiles.size);
  const W = stage.clientWidth, H = stage.clientHeight;
  // Grille : on cherche le nombre de colonnes qui donne les plus grands avatars
  let size = 0, bestCols = 1;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    if (vert && cols > rows) break;
    const sz = Math.min((W - (cols - 1) * 14) / cols, (H - (rows - 1) * 14) / rows / 1.35);
    if (sz > size) { size = sz; bestCols = cols; }
  }
  stage.style.gridTemplateColumns = vert && L === "grid" ? `repeat(${bestCols}, var(--tile))` : "";
  if (L === "orbit") size = Math.min(size, (Math.min(W, H) * 2.4) / Math.max(n, 3));
  stage.style.setProperty("--tile", Math.round(Math.max(36, Math.min(size * S.zoom, 320 * S.zoom))) + "px");
  // Disposition Discord classique : tuiles 16:9, on cherche le nombre de colonnes qui les rend les plus grandes
  if (L === "discord") {
    let dw = 0, dcols = 1;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      if (vert && cols > rows) break;
      const w = Math.min((W - (cols - 1) * 8) / cols, ((H - (rows - 1) * 8) / rows) * 16 / 9);
      if (w > dw) { dw = w; dcols = cols; }
    }
    stage.style.setProperty("--dw", Math.round(Math.max(120, dw * Math.min(1, S.zoom))) + "px");
    stage.style.setProperty("--dcols", dcols);
  }
  const ring = $("#ring");
  const list = [...stage.querySelectorAll(".tile")].filter((e) => e.offsetParent !== null || L !== "orbit");
  // Les dispositions animées (bande, cinéma, libre) placent les avatars à chaque image : on ne les remet
  // à zéro que si la disposition change, sinon ils se retrouveraient empilés le temps d'une image
  // (c'était le chevauchement pendant qu'on modifie un réglage)
  const moving = ["strip", "cinema", "film", "free"].includes(L);
  const fresh = L !== lastL;
  lastL = L;
  for (const t of tiles.values()) {
    if (fresh || !moving) t.el.style.left = t.el.style.top = t.el.style.transform = "";
    t.el.classList.toggle("focus", L === "scene" && t.data.id === focusId);
  }
  $("#music").hidden = !(S.musicOn && hasMusic());
  placeMusic();
  $("#lyricsScene").hidden = L !== "lyrics";
  if (fresh || !moving) for (const t of tiles.values()) { t.el.style.filter = t.el.style.zIndex = t.el.style.opacity = t.el.style.visibility = ""; t.vis = 1; }
  if (L === "cinema" || L === "film") {
    // En vertical, on échange largeur et hauteur : les avatars s'alignent en hauteur
    const [a, b] = vert ? [W, H] : [H, W];
    const c = Math.round(Math.max(40, Math.min(a * (n <= 2 ? 0.62 : n <= 4 ? 0.52 : 0.45), b * (n <= 2 ? 0.3 : 0.24), 420) * S.zoom));
    stage.style.setProperty("--ctile", c + "px");
  } else if (L === "free") {
    // Taille pour que la grille de départ ne se chevauche pas (pseudo compris)
    const cols = Math.ceil(Math.sqrt(n * 1.6)), rows = Math.ceil(n / cols);
    const c = Math.round(Math.max(30, Math.min((W * 0.7) / cols * 0.6, (H * 0.6) / rows * 0.62, 240) * S.zoom));
    stage.style.setProperty("--ctile", c + "px");
  } else if (L === "strip") {
    // Caméra active : on vise une personne à la fois, inutile que tout le monde tienne à l'écran
    const fit = S.camera ? Math.min(n, 5) : n;
    const c = Math.round(Math.max(30, (vert ? Math.min(W * 0.5, (H * 0.9) / (fit * 1.5), 400) : Math.min(H * 0.5, (W * 0.9) / (fit * 1.18), 400)) * S.zoom));
    stage.style.setProperty("--ctile", c + "px");
  } else {
    stage.style.removeProperty("--ctile");
  }
  if (L === "column") {
    // Verticale : une colonne d'avatars avec le pseudo à droite, tout le monde tient en hauteur
    const vt = Math.round(Math.max(22, Math.min((H - 8) / (n * 1.22), W * 0.32, 150) * Math.min(1, S.zoom)));
    stage.style.setProperty("--vt", vt + "px");
  }
  if (L === "stream") placeStream();
  if (L !== "orbit" || !list.length) return;
  const w = stage.clientWidth, h = stage.clientHeight;
  const tw = list[0].offsetWidth, th = list[0].offsetHeight;
  // Ellipse : prend toute la largeur disponible au lieu d'un cercle limité par la hauteur
  const ry = Math.max(60, (h - th) / 2 - 4);
  const rx = Math.max(ry, Math.min((w - tw) / 2 - 4, ry * 1.6));
  const cx = w / 2, cy = h / 2;
  ring.style.width = rx * 2 + "px";
  ring.style.height = ry * 2 + "px";
  ring.style.left = cx - rx + "px";
  ring.style.top = cy - ry + "px";
  list.forEach((e, i) => {
    const a = -Math.PI / 2 + i * ((2 * Math.PI) / list.length);
    e.style.left = cx + rx * Math.cos(a) - tw / 2 + "px";
    e.style.top = cy + ry * Math.sin(a) - th / 2 + "px";
  });
}
new ResizeObserver(() => layout()).observe(stage);

/* ——— Vue « stream » : quand une caméra ou un partage d'écran est actif ———
   Le flux en grand à gauche dans un cadre arrondi (qui s'allume en vert quand la personne parle),
   les autres en zigzag sur un panneau sombre en biais à droite. */
// Tout ce qu'on peut regarder : ma caméra, mon écran, et ceux des amis Hush du salon
function feeds() {
  if (typeof Cap === "undefined") return [];
  const me = meTileId(), out = [];
  for (const t of tiles.values()) for (const kind of ["screen", "cam"]) {
    const stream = mediaOf(t.data.id, kind);
    if (stream) out.push({ id: t.data.id, kind, stream, mine: t.data.id === me });
  }
  return out;
}
let featPin = ""; // « id|kind » choisi à la main dans le sélecteur
const camsIn3D = () => S.camView === "film" && feeds().some((f) => f.kind === "cam");
function featureSource() {
  if (MINI || ["discord", "lyrics"].includes(S.layout)) return null;
  const list = feeds().filter((f) => !(S.camView === "film" && f.kind === "cam"));
  // Ordre : le flux choisi, l'écran d'un ami, le mien, la caméra d'un ami, la mienne
  return list.find((f) => `${f.id}|${f.kind}` === featPin) || list.find((f) => f.kind === "screen" && !f.mine)
    || list.find((f) => f.kind === "screen") || list.find((f) => !f.mine) || list[0] || null;
}
let featKey = "", featList = "";
// Plusieurs caméras et aucun écran partagé, rien de verrouillé : elles s'affichent côte à côte
const camGrid = (all) => !featPin && all.length >= 2 && all.every((x) => x.kind === "cam");
// Tout le salon a sa caméra (au moins 2) : on ne montre que les caméras, sans le rang d'avatars
const allCams = (all) => all.length >= 2 && [...tiles.values()].every((t) => all.some((x) => x.kind === "cam" && x.id === t.data.id));
function renderCamGrid(all) {
  const g = $("#featureGrid");
  const key = all.map((x) => x.id).join(",");
  if (g.dataset.key === key && !g.hidden) return;
  g.dataset.key = key;
  g.textContent = "";
  const n = all.length, cols = n <= 2 ? n : n <= 4 ? 2 : 3;
  g.style.setProperty("--cols", cols);
  for (const x of all) {
    const xt = tiles.get(x.id);
    const cell = el("button", { class: "fg-cell", title: "Verrouiller cette caméra en grand" });
    cell.dataset.id = x.id;
    const vid = el("video", {});
    Object.assign(vid, { muted: true, autoplay: true, playsInline: true });
    vid.srcObject = x.stream;
    vid.classList.toggle("mirror", x.mine);
    vid.play().catch(() => {});
    const tag = el("div", { class: "feature-tag" });
    const im = el("img", { alt: "" });
    im.src = (xt && xt.data.avatar) || "assets/discord-logo.png";
    tag.append(im, el("span", {}, x.mine ? "Toi" : xt ? xt.data.name : ""));
    cell.append(vid, tag, el("i", { class: "fg-lock" }, "🔒 Verrouiller"));
    cell.onclick = () => { featPin = `${x.id}|cam`; layout(); };
    g.appendChild(cell);
  }
}
function renderFeature(f) {
  const box = $("#feature");
  box.hidden = !f;
  const all = f ? feeds().filter((x) => !(S.camView === "film" && x.kind === "cam")) : [];
  const grid = !!f && camGrid(all);
  stage.classList.toggle("cams-only", grid && allCams(all));
  $("#featureGrid").hidden = !grid;
  $("#featureBox").hidden = grid;
  if (grid) { renderCamGrid(all); $("#featurePick").hidden = true; featKey = "grid"; featList = ""; return; }
  $("#featureGrid").dataset.key = "";
  const listKey = all.map((x) => `${x.id}|${x.kind}`).join(",");
  const key = f ? `${f.id}|${f.kind}` : "";
  const v = $("#featureVideo");
  if (key === featKey && listKey === featList && (!f || v.srcObject === f.stream)) return;
  featKey = key; featList = listKey;
  if (!f) { v.srcObject = null; return; }
  const t = tiles.get(f.id);
  const name = t ? t.data.name : "";
  $("#featureName").textContent = f.mine ? (f.kind === "screen" ? "Ton écran" : "Toi") : name;
  $("#featureAv").src = (t && t.data.avatar) || "assets/discord-logo.png";
  $("#featureLive").hidden = f.kind !== "screen";
  $("#featureBox").classList.toggle("is-screen", f.kind === "screen");
  if (v.srcObject !== f.stream) { v.srcObject = f.stream; v.play().catch(() => {}); }
  v.classList.toggle("mirror", f.kind === "cam" && f.mine);
  // Plusieurs flux : petites pastilles pour choisir lequel est en grand
  const pick = $("#featurePick");
  pick.textContent = "";
  pick.hidden = all.length < 2;
  // Une caméra verrouillée : « Toutes » revient aux caméras côte à côte
  if (featPin && all.filter((x) => x.kind === "cam").length >= 2 && all.every((x) => x.kind === "cam")) {
    const back = el("button", { class: "fp grid-back", title: "Revoir toutes les caméras côte à côte" }, "▦ Toutes");
    back.onclick = () => { featPin = ""; layout(); };
    pick.appendChild(back);
  }
  for (const x of all) {
    const xt = tiles.get(x.id);
    const b = el("button", { class: "fp" + (x === f || (x.id === f.id && x.kind === f.kind) ? " on" : ""), role: "tab", title: x.kind === "screen" ? "Écran" : "Caméra" });
    const img = el("img", { alt: "" });
    img.src = (xt && xt.data.avatar) || "assets/discord-logo.png";
    b.append(img, el("span", {}, x.mine ? "Toi" : xt ? xt.data.name : ""), el("small", {}, x.kind === "screen" ? "Écran" : "Caméra"));
    b.onclick = () => { featPin = `${x.id}|${x.kind}`; layout(); };
    pick.appendChild(b);
  }
}
$("#featureFull").onclick = () => (document.fullscreenElement ? document.exitFullscreen() : $("#featureBox").requestFullscreen().catch(() => {}));
$("#featureBox").ondblclick = () => $("#featureFull").onclick();
function placeStream() {
  const W = stage.clientWidth, H = stage.clientHeight;
  const list = [...tiles.values()];
  const n = Math.max(1, list.length);
  // Les avatars en un rang centré sous le cadre (pseudo dessous), le cadre prend tout le reste
  const gap = 18;
  const size = Math.round(Math.max(30, Math.min(H * 0.13, (W * 0.92 - (n - 1) * gap) / n, 96 * Math.max(0.6, S.zoom))));
  const nameH = Math.max(14, size * 0.2) + 6;
  const rowY = H - nameH - size - Math.max(10, H * 0.025);
  stage.style.setProperty("--st", size + "px");
  stage.style.setProperty("--feat-h", Math.max(120, rowY - Math.max(12, H * 0.03) - 16) + "px");
  const total = n * size + (n - 1) * gap;
  list.forEach((t, i) => {
    t.el.style.left = (W - total) / 2 + i * (size + gap) + "px";
    t.el.style.top = rowY + "px";
  });
}

/* ——— Panneau de réglages ——— */
const skinsEl = $("#skins");
Object.entries(SKINS).forEach(([k, v]) => {
  const b = el("button", { class: "skin", "aria-label": "Ambiance " + v.label });
  b.dataset.v = k;
  b.style.background = `radial-gradient(circle at 30% 30%, ${v.a}, transparent 60%), radial-gradient(circle at 75% 75%, ${v.b}, transparent 55%), ${v.bg}`;
  b.appendChild(el("span", {}, v.label));
  b.onclick = () => { S.skin = k; S.accent = null; apply(); };
  skinsEl.appendChild(b);
});
const SEGS = [["#namePosSeg", "namePos"], ["#layoutSeg", "layout"], ["#shapeSeg", "shape"], ["#ringSeg", "ring"], ["#ringFromSeg", "ringFrom"], ["#blurTypeSeg", "blurType"], ["#bgSeg", "bg"], ["#musicSrcSeg", "musicSource"], ["#playerColorSeg", "playerColor"], ["#playerBgSeg", "playerBg"], ["#playerStyleSeg", "playerStyle"], ["#nameMaskSeg", "nameMask"], ["#glitchSeg", "glitch"], ["#joinAnimSeg", "joinAnim"], ["#glitchStyleSeg", "glitchStyle"], ["#perfSeg", "perf"], ["#avAnimSeg", "avAnim"], ["#camViewSeg", "camView"]];
SEGS.forEach(([id, key]) =>
  $(id).querySelectorAll("button").forEach((b) => (b.onclick = () => {
    if (key === "bg" && b.dataset.v === "we") return openWe();
    // Changer de style de lecteur : il revient à sa taille par défaut, en bas à droite
    if (key === "playerStyle" && S.playerStyle !== b.dataset.v) { S.playerW = null; S.playerPos = null; requestAnimationFrame(() => placeMusic()); }
    S[key] = b.dataset.v;
    apply();
    if (key === "bg" && S.bg === "image" && (!S.bgImage || isWeBg())) pickBg();
  })));
const isWeBg = () => S.bg === "image" && /^vsmedia:\/\/we\//.test(S.bgImage || "");

/* ——— Musique en cours : Ce PC (Deezer…), compte Spotify ou saisie à la main ——— */
let music = { status: "off", error: null, track: null }, sentSource = null;
// Démarre la bonne source côté application quand la carte ou la source change
function syncMusicSource() {
  if (MINI) return;
  const want = S.musicOn ? S.musicSource : "manual";
  if (want === sentSource) return;
  sentSource = want;
  if (want !== "files") stopSounds();
  music = { status: "off", error: null, track: null };
  window.studio.music.source(want);
}
function liveTrack() {
  if (S.musicSource === "files") return localTrack();
  return S.musicSource !== "manual" ? music.track : null;
}
function hasMusic() {
  if (S.musicSource === "files") return Sounds.list.length > 0;
  return S.musicSource === "manual" || !!music.track;
}
function updateMusicCard() {
  const t = liveTrack();
  $("#musicTitle").textContent = t ? t.title : S.musicSource === "manual" ? S.musicTitle : "";
  $("#musicArtist").textContent = t ? t.artist || "" : "";
  const cover = t ? t.cover || fallbackCover(t) : S.musicSource === "manual" ? S.musicCover : null;
  $("#musicCover").style.backgroundImage = cover ? `url("${cover}")` : "";
  $("#musicLabel").style.backgroundImage = cover ? `url("${cover}")` : "";
  $("#musicBrand").textContent = sourceLabel(t);
  cardLook(cover || null);
  ringCoverColors(cover || null);
  const card = $("#music");
  card.classList.toggle("playing", t ? !!t.playing : S.musicSource === "manual");
  card.classList.toggle("passive", S.musicSource === "manual");
  // Petite ligne d'état sous le choix de la source
  const st = $("#musicStatus");
  if (S.musicSource === "manual") st.textContent = "";
  else if (S.musicSource === "files") st.textContent = t ? `♪ ${t.title}${t.playing ? "" : " (en pause)"}` : Sounds.list.length ? "Choisis un son dans la liste." : "";
  else if (music.error) st.textContent = "⚠ " + music.error;
  else if (music.status === "needs-config") st.textContent = "Colle le Client ID de ton appli Spotify.";
  else if (music.status === "disconnected") st.textContent = "Spotify n'est pas connecté.";
  else if (music.status === "authorizing") st.textContent = "Termine la connexion dans ton navigateur…";
  else if (t) st.textContent = `♪ ${t.title}${t.artist ? " · " + t.artist : ""}${t.playing ? "" : " (en pause)"}`;
  else st.textContent = "Rien en lecture pour l'instant.";
  $("#music").hidden = !(S.musicOn && hasMusic());
  placeMusicSoon();
}
// Placement du lecteur : une fois par image au plus (il mesure la page, ce qui coûte quand on règle un curseur)
let placeMusicRaf = 0;
function placeMusicSoon() {
  if (placeMusicRaf) return;
  placeMusicRaf = requestAnimationFrame(() => { placeMusicRaf = 0; placeMusic(); });
}
// Pochette trouvée en ligne pour un morceau qui n'en a pas (vidéo YouTube dans un navigateur…)
const foundCovers = new Map();
function fallbackCover(t) {
  // Un enregistrement perso sans artiste n'a aucune chance d'être dans le catalogue
  if (S.musicSource === "files" && !t.artist) return null;
  const key = `${t.artist}|${t.title}`;
  if (foundCovers.has(key)) return foundCovers.get(key);
  foundCovers.set(key, null);
  window.studio.cover.find({ title: t.title, artist: t.artist }).then((url) => {
    if (!url) return foundCovers.delete(key); // réessaiera plus tard
    foundCovers.set(key, url);
    updateMusicCard();
  });
  return null;
}
function fmtTime(sec) { sec = Math.max(0, Math.floor(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; }
window.studio.music.onState((s) => {
  if (s.source !== (S.musicOn ? S.musicSource : "manual")) return;
  music = s;
  updateMusicCard();
});

async function refreshSpotify() {
  const sp = await window.studio.spotify.get();
  if (document.activeElement !== $("#spotifyId")) $("#spotifyId").value = sp.clientId;
  $("#spotifyLogin").textContent = sp.connected ? "Reconnecter Spotify" : "Connecter Spotify";
  $("#spotifyLogout").hidden = !sp.connected;
  $("#spotifyHelp").textContent = `Sur developer.spotify.com, crée une appli et ajoute l'URL de redirection ${sp.redirect}`;
}
$("#spotifyId").onchange = async (e) => { await window.studio.spotify.save(e.target.value); refreshSpotify(); };
$("#spotifyLogin").onclick = async () => { await window.studio.spotify.save($("#spotifyId").value); await window.studio.spotify.login(); refreshSpotify(); };
$("#spotifyLogout").onclick = async () => { await window.studio.spotify.logout(); refreshSpotify(); };

// Images choisies par l'utilisateur : réduites puis gardées en data URL avec les réglages
function readImage(file, maxSide, done) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    done(c.toDataURL("image/jpeg", 0.85));
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}
let bgImg = null;
// Le fond image est un vrai élément de la page (pas dessiné dans le canvas) : pleine résolution,
// GIF animés et vidéos qui bougent. Il zoome très lentement (effet Ken Burns).
let bgMediaSrc = null;
function loadBgImg() {
  bgImg = null;
  const box = $("#bgMedia");
  const src = S.bg === "image" ? S.bgImage : null;
  box.hidden = !src;
  if (src === bgMediaSrc) return;
  bgMediaSrc = src;
  box.textContent = "";
  if (!src) return;
  const video = S.bgKind === "video";
  const m = document.createElement(video ? "video" : "img");
  if (video) Object.assign(m, { muted: true, loop: true, autoplay: true, playsInline: true });
  m.alt = "";
  m.src = src;
  box.appendChild(m);
  if (video) m.play().catch(() => {});
}
async function pickBg() {
  const r = await window.studio.bg.pick();
  if (!r) return;
  S.bgImage = r.url; S.bgKind = r.kind; S.bg = "image";
  apply();
}
$("#bgPick").onclick = pickBg;

// ——— Wallpaper Engine : la galerie des fonds déjà téléchargés (Windows) ———
let weItems = [];
async function weCheck() {
  if (!window.studio.bg.wallpaperEngine) return;
  const r = await window.studio.bg.wallpaperEngine().catch(() => null);
  weItems = (r && r.items) || [];
  $("#wePick").dataset.ok = r && r.available ? "1" : "";
  syncWePick();
}
function syncWePick() { $("#bgWe").hidden = !$("#wePick").dataset.ok; $("#wePick").hidden = !isWeBg() || !$("#wePick").dataset.ok; }
function weRender() {
  const q = $("#weSearch").value.trim().toLowerCase();
  const grid = $("#weGrid");
  grid.textContent = "";
  const list = weItems.filter((it) => !q || it.title.toLowerCase().includes(q));
  if (!list.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = weItems.length ? "Aucun fond ne correspond." : "Aucun fond trouvé. Abonne-toi à des fonds dans Wallpaper Engine (Workshop), puis rouvre cette fenêtre.";
    grid.appendChild(p);
    return;
  }
  for (const it of list) {
    const b = document.createElement("button");
    b.className = "share-src" + (S.bgImage === it.url ? " on" : "");
    b.title = it.title;
    if (it.preview) {
      const img = document.createElement("img");
      img.loading = "lazy"; img.alt = ""; img.src = it.preview;
      b.appendChild(img);
    } else {
      const d = document.createElement("div"); d.className = "we-noprev"; b.appendChild(d);
    }
    const badge = document.createElement("i");
    badge.className = "we-badge" + (it.kind === "video" ? " anim" : "");
    badge.textContent = it.kind === "video" ? "Vidéo animée" : it.animated ? "Aperçu animé" : "Aperçu";
    b.appendChild(badge);
    const t = document.createElement("span"); t.textContent = it.title; b.appendChild(t);
    // Le fond change tout de suite derrière ; la galerie reste ouverte pour en essayer d'autres
    b.onclick = () => {
      S.bgImage = it.url; S.bgKind = it.kind; S.bg = "image"; S.bgWePreview = it.preview || null;
      apply();
      grid.querySelectorAll(".share-src.on").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
    };
    grid.appendChild(b);
  }
}
// La galerie s'ouvre à gauche, au-dessus de tout ; les paramètres passent sur le côté droit le temps du choix
document.body.appendChild($("#wePanel"));
let weUndock = false;
async function openWe() {
  await weCheck();
  $("#weSearch").value = "";
  weRender();
  if (S.panel && !$("#settingsWrap").classList.contains("docked")) { dockSettings(); weUndock = true; }
  $("#wePanel").hidden = false;
  $("#weSearch").focus();
}
function closeWe() {
  $("#wePanel").hidden = true;
  if (weUndock) { weUndock = false; $("#settingsWrap").classList.remove("docked"); syncDock(); }
}
$("#wePick").onclick = openWe;
$("#weSearch").oninput = weRender;
$("#weClose").onclick = closeWe;
addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#wePanel").hidden) { e.stopPropagation(); closeWe(); } }, true);
weCheck();

$("#musicPick").onclick = () => $("#musicFile").click();
$("#musicFile").onchange = (e) => { const f = e.target.files[0]; if (f) readImage(f, 600, (d) => { S.musicCover = d; apply(); }); };
$("#musicTitleIn").oninput = (e) => { S.musicTitle = e.target.value; apply(); };
$("#musicOn").onclick = () => { S.musicOn = !S.musicOn; apply(); };
// Mes sons : lecteur intégré. Ce PC / Spotify : on pilote l'appli qui joue (Deezer, Spotify, navigateur…)
function musicCmd(cmd) {
  if (S.musicSource === "files") return cmd === "toggle" ? togglePlay() : nextSound(cmd === "next" ? 1 : -1);
  if (S.musicSource === "manual") return;
  window.studio.music.control(cmd);
  if (cmd === "toggle" && music.track) {
    // On affiche le changement tout de suite, sans attendre la prochaine nouvelle de Windows/Spotify
    const tr = music.track, pos = tr.progress + (tr.playing ? Date.now() - tr.at : 0);
    music.track = { ...tr, playing: !tr.playing, progress: pos, at: Date.now() };
    updateMusicCard();
  }
}
$("#mPlay").onclick = () => musicCmd("toggle");
$("#mPrev").onclick = () => musicCmd("prev");
$("#mNext").onclick = () => musicCmd("next");
// Espace : pause / lecture (sauf quand on écrit quelque chose)
addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || S.panel) return;
  if (e.target.closest && e.target.closest("input, textarea, [contenteditable='plaintext-only'], button")) return;
  e.preventDefault();
  musicCmd("toggle");
});

// ——— 3. Lecteur : on le déplace en le faisant glisser, on le redimensionne avec l'arc du coin en bas à droite ———
// La position est gardée en distance au bord droit / au bas de la fenêtre (le lecteur reste collé à son coin).
// Largeur prise par les paramètres rangés sur le côté : le lecteur se pousse pour rester visible
const dockW = () => (document.body.classList.contains("panel-docked") ? Math.min(560, innerWidth) + 28 : 0);
function placeMusic() {
  const card = $("#music"), grab = $("#musicGrab");
  const D = dockW(), W = mainEl.clientWidth - D, H = mainEl.clientHeight;
  if (S.playerPos) {
    const w = card.offsetWidth, h = card.offsetHeight;
    card.style.right = D + Math.max(0, Math.min(W - w, S.playerPos.r)) + "px";
    card.style.bottom = Math.max(0, Math.min(H - h, S.playerPos.b)) + "px";
  } else { card.style.right = D ? D + 16 + "px" : ""; card.style.bottom = ""; }
  grab.hidden = card.hidden;
  if (card.hidden) return;
  // Centre de l'arrondi du coin (rayon 22 px) : l'arc est dessiné autour, juste à l'extérieur
  grab.style.left = card.offsetLeft + card.offsetWidth - 22 + "px";
  grab.style.top = card.offsetTop + card.offsetHeight - 22 + "px";
}
addEventListener("resize", () => placeMusic());
(() => {
  const card = $("#music"), grab = $("#musicGrab");
  let drag = null;
  grab.addEventListener("pointerdown", (e) => {
    e.preventDefault(); e.stopPropagation();
    try { grab.setPointerCapture(e.pointerId); } catch {}
    drag = { x: e.clientX, y: e.clientY, w: card.offsetWidth, left: card.offsetLeft, top: card.offsetTop };
    card.classList.add("resizing"); grab.classList.add("active");
  });
  grab.addEventListener("pointermove", (e) => {
    if (!drag) return;
    // Le coin en haut à gauche reste en place : tirer vers le bas/la droite agrandit, l'inverse rapetisse
    const ar = card.offsetWidth / Math.max(1, card.offsetHeight); // 1,9 en carte, moins en mini-vinyle
    const grow = Math.abs(e.clientX - drag.x) > Math.abs(e.clientY - drag.y) * ar ? e.clientX - drag.x : (e.clientY - drag.y) * ar;
    const max = Math.min(680, mainEl.clientWidth - dockW() - drag.left, (mainEl.clientHeight - drag.top) * ar);
    S.playerW = Math.round(Math.max(140, Math.min(max, drag.w + grow)));
    card.style.width = S.playerW + "px";
    S.playerPos = { r: mainEl.clientWidth - dockW() - drag.left - card.offsetWidth, b: mainEl.clientHeight - drag.top - card.offsetHeight };
    placeMusic();
  });
  const end = () => { if (!drag) return; drag = null; card.classList.remove("resizing"); grab.classList.remove("active"); save(); syncPlayerSize(); };
  grab.addEventListener("pointerup", end);
  grab.addEventListener("pointercancel", end);
  grab.addEventListener("dblclick", () => { S.playerW = null; apply(); requestAnimationFrame(placeMusic); });
  // Assez petite, la carte devient un mini-vinyle : la pochette, le disque qui dépasse et le bras, le titre dessous
  // Carte ou mini-vinyle : c'est le réglage « Style » (Paramètres › Musique), plus la taille de la fenêtre

  // Déplacer : glisser la carte (pas ses boutons). Un simple clic reste un clic.
  let move = null;
  card.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button, input, label")) return;
    move = { x: e.clientX, y: e.clientY, r: mainEl.clientWidth - dockW() - card.offsetLeft - card.offsetWidth, b: mainEl.clientHeight - card.offsetTop - card.offsetHeight, on: false, id: e.pointerId };
  });
  card.addEventListener("pointermove", (e) => {
    if (!move) return;
    const dx = e.clientX - move.x, dy = e.clientY - move.y;
    if (!move.on && Math.hypot(dx, dy) < 5) return;
    if (!move.on) { move.on = true; try { card.setPointerCapture(move.id); } catch {} card.classList.add("moving"); }
    S.playerPos = { r: move.r - dx, b: move.b - dy };
    placeMusic();
  });
  const stop = () => { if (!move) return; if (move.on) { card.classList.remove("moving"); save(); } move = null; };
  card.addEventListener("pointerup", stop);
  card.addEventListener("pointercancel", stop);
  card.addEventListener("dblclick", (e) => { if (e.target.closest("button, input, label")) return; S.playerPos = null; placeMusic(); save(); });
})();

// ——— 4. Interface masquée quand la souris ne bouge plus (désactivable) ———
const HUD_IDLE_MS = 3000;
let hudTimer = null;
function wakeHud() {
  document.body.classList.remove("hud-hidden");
  clearTimeout(hudTimer);
  hudTimer = setTimeout(sleepHud, HUD_IDLE_MS);
}
function sleepHud() {
  // Jamais pendant qu'on règle quelque chose ou qu'un écran demande une action
  if (!S.autoHide || S.panel || !$("#screen").hidden || document.querySelector(".dock:hover, .titlebar:hover, .mp.resizing, .mp.moving")) {
    hudTimer = setTimeout(sleepHud, HUD_IDLE_MS);
    return;
  }
  document.body.classList.add("hud-hidden");
}
["pointermove", "pointerdown", "keydown", "wheel"].forEach((ev) => addEventListener(ev, wakeHud, { passive: true }));
document.addEventListener("mouseleave", () => { clearTimeout(hudTimer); hudTimer = setTimeout(sleepHud, 800); });
wakeHud();
$("#musicSeek").onclick = (e) => {
  const lt = localTrack();
  if (S.musicSource !== "files" || !lt) return;
  const r = e.currentTarget.getBoundingClientRect();
  soundsAudio().currentTime = ((e.clientX - r.left) / r.width) * (lt.duration / 1000);
};
const addSounds = async () => {
  Sounds.list = await window.studio.sounds.add();
  S.musicSource = "files"; S.musicOn = true; S.panel = true; S.tab = "sound";
  apply();
  renderSoundList();
};
$("#soundsAdd").onclick = addSounds;
$("#recBtn").onclick = () => toggleRecording();
$("#musicAdd").onclick = addSounds;
let lastConsent = null;
$("#diagCopy").onclick = async () => { await window.studio.report.copy(); showToast("Diagnostic copié : colle-le dans un message"); };
// Volume de la musique : le lecteur intégré, ou l'appli qui joue (Deezer, Spotify…), sans envoyer chaque cran du curseur
let volTimer = 0;
function setVolume(v) {
  S.volume = v;
  if (Sounds.audio) Sounds.audio.volume = v;
  apply();
  if (S.musicSource === "pc" || S.musicSource === "spotify") {
    clearTimeout(volTimer);
    volTimer = setTimeout(() => window.studio.music.volume(S.volume), 120);
  }
}
$("#volume").oninput = (e) => setVolume(+e.target.value);
$("#mpVol").oninput = (e) => setVolume(+e.target.value);
$("#mpHide").onclick = () => { S.musicOn = false; apply(); showToast("Musique cachée : remets-la dans Paramètres › Musique"); };
// Look de base : tout le visuel revient aux réglages d'origine de Hush
$("#presetBase").onclick = () => { applyLook({}); showToast("Look de base appliqué"); };
$("#glow").oninput = (e) => { S.glow = +e.target.value; apply(); };
$("#players").oninput = (e) => {
  S.players = +e.target.value;
  if (S.demo) state.members = demoMembers(state.members);
  apply();
  syncTiles();
  renderChrome();
};
$("#speed").oninput = (e) => { S.speed = +e.target.value; apply(); };
$("#accent").oninput = (e) => { S.accent = e.target.value; apply(); };
$("#accentReset").onclick = () => { S.accent = null; apply(); };
$("#ringColor").oninput = (e) => { S.ringColor = e.target.value; if (S.ringFrom !== "duo") S.ringFrom = "custom"; apply(); };
$("#nameSize").oninput = (e) => { S.nameSize = +e.target.value; apply(); };
$("#nameShift").oninput = (e) => { S.nameShift = +e.target.value; apply(); };
$("#nameShift").ondblclick = () => { S.nameShift = 0; apply(); };
// Couleur d'anneau choisie pour un ami (mode « Couleur de mes amis »)
function setFriendColor(id, color) {
  S.friendColors = { ...(S.friendColors || {}) };
  if (color) S.friendColors[id] = color; else delete S.friendColors[id];
  save();
  for (const t of tiles.values()) if (t.data.id === id) tileRing(t);
  drawFriendColors();
}
// Dans les paramètres : les personnes du salon, chacune avec sa couleur
function drawFriendColors() {
  const box = $("#friendColors");
  box.hidden = S.ringFrom !== "friends";
  if (box.hidden) return;
  const meId = state.me && state.me.id;
  const ppl = (state.members || []).filter((m) => m.id !== meId && !m.ghost);
  const sig = S.ringFrom + JSON.stringify(ppl.map((m) => m.id)) + JSON.stringify(S.friendColors || {});
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.textContent = "";
  if (!ppl.length) { box.append(Object.assign(document.createElement("p"), { className: "hint", textContent: "Les personnes de ton vocal s'afficheront ici, avec leur couleur." })); return; }
  for (const m of ppl.slice(0, 24)) {
    const row = document.createElement("label");
    row.className = "row fc-row";
    const im = Object.assign(document.createElement("img"), { alt: "", src: m.avatar || "assets/discord-logo.png" });
    const n = Object.assign(document.createElement("span"), { textContent: m.name });
    const inp = Object.assign(document.createElement("input"), { type: "color", value: (S.friendColors || {})[m.id] || "#ff8cc6" });
    inp.oninput = () => setFriendColor(m.id, inp.value);
    row.append(im, n, inp);
    if ((S.friendColors || {})[m.id]) { const x = Object.assign(document.createElement("button"), { type: "button", className: "linkbtn", textContent: "Retirer" }); x.onclick = (e) => { e.preventDefault(); setFriendColor(m.id, null); }; row.append(x); }
    box.append(row);
  }
}
$("#voiceMin").oninput = (e) => { S.voiceMin = +e.target.value; apply(); };
$("#ringColor2").oninput = (e) => { S.ringColor2 = e.target.value; S.ringFrom = "duo"; apply(); };
$("#bgColor").oninput = (e) => { S.bgColor = e.target.value; apply(); };
$("#bgColor2").oninput = (e) => { S.bgColor2 = e.target.value; apply(); };
$("#bgZoom").oninput = (e) => { S.bgZoom = +e.target.value; apply(); };
// Accueil : opacité du fond (1 = fond bien visible, 0 = fond caché derrière un voile)
$("#homeVeil").oninput = (e) => { S.homeBg = +e.target.value; apply(); };
// Taille du lecteur musique : fixe (300 px par défaut), quelle que soit la taille de la fenêtre
const PLAYER_W = 300;
// Mini-vinyle : taille moyenne par défaut ; carte : 300 px
const playerDefault = () => (S.playerStyle === "vinyl" ? 190 : PLAYER_W);
function syncPlayerSize() { const w = S.playerW || playerDefault(); $("#playerSize").value = w; $("#playerSizeOut").textContent = w + " px"; }
$("#playerSize").oninput = (e) => { S.playerW = +e.target.value; apply(); requestAnimationFrame(placeMusic); };
$("#bgZoomReset").onclick = () => { S.bgZoom = 1; apply(); };
$("#bgBlur").oninput = (e) => { S.bgBlur = +e.target.value; apply(); };
$("#glitchAmt").oninput = (e) => { S.glitchAmt = +e.target.value; apply(); };
const SWITCHES = ["camera", "names", "showMe", "hideMuted", "autoHide", "avShadow", "clipAudio", "replayAuto", "vertical", "glitchVoice", "avOutline", "avOutlineAuto", "nameHover", "vertNameTop", "reports", "adminView", "menuFixed"];
// Polices proposées (Google Fonts), chargées à la demande
// Polices des pseudos : livrées avec Hush (assets/fonts), rien à télécharger
const FONTS = ["Chomsky", "Alhambra", "Super Whales", "Super Mario 256", "Jersey 75", "Tropi Land", "Fat Kat", "Minecraft", "Kiwi Soda", "TypoSlab Irregular", "JoJo"];
const fontSel = $("#fontSel");
FONTS.forEach((f) => { const o = document.createElement("option"); o.value = o.textContent = f; o.style.fontFamily = `"${f}"`; fontSel.appendChild(o); });
fontSel.onchange = () => { S.font = fontSel.value; apply(); };
function loadFont(f) {
  // Police livrée avec Hush : déjà déclarée par assets/fonts/fonts.css, on attend juste qu'elle soit prête
  if (!f || FONTS.includes(f)) { if (f && document.fonts) document.fonts.load(`20px "${f}"`).then(() => requestAnimationFrame(layout)).catch(() => {}); return; }
  if (document.querySelector(`link[data-font="${f}"]`)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.dataset.font = f;
  l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;600;700;800&display=swap`;
  document.head.appendChild(l);
  l.onload = () => requestAnimationFrame(layout);
}
SWITCHES.forEach((k) => ($("#" + k).onclick = () => { S[k] = !S[k]; apply(); }));
// En arrière-plan : réglages gardés par le programme principal (pas dans S : ils servent avant même l'interface)
if (!MINI && window.studio.bg) {
  const BG = { bgKeep: "keepRunning", bgAuto: "autostart", bgSpeed: "fullSpeed" };
  const showBg = (c) => { for (const [id, k] of Object.entries(BG)) $("#" + id).setAttribute("aria-checked", !!c[k]); };
  window.studio.background.get().then((c) => { showBg(c); $("#bgAutoRow").hidden = !c.canAutostart; });
  window.studio.background.onChanged(showBg);
  for (const [id, k] of Object.entries(BG)) $("#" + id).onclick = async () => showBg(await window.studio.background.set({ [k]: $("#" + id).getAttribute("aria-checked") !== "true" }));
}

// Couleurs d'origine des anneaux dessinés (vert comme la vidéo pour l'Aura et les Vagues, bleu pour le feu et l'énergie)
// L'interface (boutons, onglets, interrupteurs) reste lisible avec n'importe quel accent :
// trop sombre, on l'éclaircit ; et le texte posé dessus est noir ou blanc selon sa clarté.
function uiColors() {
  const b = document.body;
  // L'accent par défaut vient du thème (SKINS) : on ne relit pas le style calculé, ce qui forçait à recalculer
  // tout le style de la page à chaque réglage (c'était le lag des paramètres)
  const acc = S.accent || (SKINS[S.skin] && SKINS[S.skin].a) || "#ffffff";
  const m = /^#?([0-9a-f]{6})$/i.exec(acc);
  if (!m) return;
  let rgb = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const lum = (c) => { const [r, g, bl] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  // Sur le fond sombre de l'interface (~#14161e), il faut un contraste d'au moins 3:1
  let k = 0;
  while (lum(rgb) < 0.13 && k < 1) { k += 0.1; rgb = rgb.map((v) => Math.round(v + (255 - v) * 0.12)); }
  const hex = "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
  b.style.setProperty("--ui", hex);
  b.style.setProperty("--on-ui", lum(rgb) > 0.45 ? "#111318" : "#ffffff");
  // Le verre de l'interface (paramètres, barre d'appel, tchat, fenêtres) prend la couleur d'accent ; rose pâle par défaut.
  // Accent clair : verre clair et texte foncé de la même teinte. Accent sombre : verre sombre et texte blanc.
  const base = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const h = hexHsl(acc), light = lum(base) > 0.3, sat = Math.max(h.s, 12);
  const white = (k) => base.map((v) => Math.round(v + (255 - v) * k)).join(",");
  const set = (k, v) => b.style.setProperty(k, v);
  b.classList.toggle("glass-dark", !light);
  set("--tint", base.join(","));
  set("--tint-l", white(light ? 0.55 : 0.14));
  set("--sh", hslRgb(h.h, Math.min(sat, 60), 25).join(","));
  set("--rim", hslRgb(h.h, Math.min(sat + 30, 85), 64).join(","));
  set("--ink", light ? `hsl(${h.h} ${Math.min(sat, 55)}% 15%)` : "#ffffff");
  set("--ink-soft", light ? `hsl(${h.h} ${Math.min(sat, 30)}% 37%)` : "rgba(255,255,255,.72)");
  // Boutons sélectionnés posés sur ce verre : une version bien contrastée de l'accent
  set("--ui-deep", light ? `hsl(${h.h} ${h.s < 8 ? 0 : Math.max(h.s, 65)}% ${h.s < 8 ? 25 : Math.min(h.l, 52)}%)` : `hsl(${h.h} ${h.s}% 80%)`);
  set("--on-ui-deep", light ? "#ffffff" : "#111318");
}
function hslRgb(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l), f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return [f(0), f(8), f(4)];
}

// Aperçu de chaque fond dans son cercle (les fonds animés sont dessinés une fois, à l'identique)
function drawBgPicks() {
  document.querySelectorAll("#bgSeg button").forEach((btn) => {
    const dot = btn.querySelector(".bg-dot"), v = btn.dataset.v, col = S.bgColor || "#fcbbdd";
    if (v === "pinkspace" || v === "space") {
      if (dot.firstChild) return;
      const c = document.createElement("canvas");
      c.width = c.height = 120;
      window.Patterns.draw(v, c.getContext("2d"), 120, 120, 0, 0, 0);
      dot.appendChild(c);
    } else if (v === "solid") dot.style.background = col;
    else if (v === "duo") dot.style.background = `linear-gradient(135deg,${S.bgColor || "#fcbbdd"},${S.bgColor2 || "#9b7bff"})`;
    else if (v === "gradient") {
      const k = hexHsl(col);
      if (k.l > 70) k.s *= 0.65;
      dot.style.background = `radial-gradient(circle,hsl(${k.h} ${k.s}% ${Math.min(100, k.l + 8)}%),hsl(${k.h} ${k.s}% ${k.l * 0.72}%) 55%,hsl(${k.h} ${k.s}% ${k.l * 0.45}%))`;
    } else if (v === "profile") {
      const a = state.me && state.me.avatar;
      dot.style.background = a ? `center/cover url("${a}")` : "#5865f2";
    } else if (v === "image") {
      const own = S.bgImage && !/^vsmedia:\/\/we\//.test(S.bgImage) && S.bgKind !== "video";
      dot.style.background = own ? `center/cover url("${S.bgImage}")` : "";
      dot.classList.toggle("empty", !own);
    } else if (v === "we") {
      // L'aperçu du fond Wallpaper Engine choisi, sinon le logo « WE »
      dot.style.background = S.bgWePreview ? `center/cover url("${S.bgWePreview}")` : "";
      dot.classList.toggle("we-logo", !S.bgWePreview);
    }
  });
}

// Couleur d'origine de tous les anneaux : le vert de Discord quand quelqu'un parle
const DISCORD_GREEN = ["#23a559", "#8af0b0"];
const RING_ORIGIN = { aura: DISCORD_GREEN, wave: DISCORD_GREEN, flame: DISCORD_GREEN, energy: DISCORD_GREEN, gradient: DISCORD_GREEN, solid: DISCORD_GREEN };
let ringCol = { a: "#5cff6e", b: "#b8ffd0" };
// Mélange une couleur #rrggbb avec du blanc (k = part de blanc)
function mixWhite(hex, k) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  return "#" + [0, 2, 4].map((i) => Math.round(parseInt(m[1].slice(i, i + 2), 16) * (1 - k) + 255 * k).toString(16).padStart(2, "0")).join("");
}
// Couleur de l'anneau : d'origine, choisie, ou celle de la pochette en cours. Indépendante du fond et de l'accent.
function applyRing() {
  const b = document.body;
  let pal = null;
  if (S.ringFrom === "cover" && coverRing) pal = coverRing;
  else if (S.ringFrom === "custom" && S.ringColor) pal = { a: S.ringColor, b: mixWhite(S.ringColor, 0.55) };
  // Dégradé de deux couleurs choisies (option bonus)
  else if (S.ringFrom === "duo") pal = { a: S.ringColor || "#ff8cc6", b: S.ringColor2 || "#7c6cff", duo: true };
  else if (RING_ORIGIN[S.ring]) pal = { a: RING_ORIGIN[S.ring][0], b: RING_ORIGIN[S.ring][1] };
  const vars = pal ? {
    "--ring1": pal.a, "--ring2": pal.b,
    "--aura1": `color-mix(in srgb, ${pal.a} 85%, transparent)`,
    "--aura2": `color-mix(in srgb, ${pal.b} 60%, transparent)`,
    "--aura3": `color-mix(in srgb, ${pal.b} 40%, transparent)`,
  } : {};
  for (const k of ["--ring1", "--ring2", "--aura1", "--aura2", "--aura3"]) {
    if (vars[k]) b.style.setProperty(k, vars[k]); else b.style.removeProperty(k);
  }
  if (pal) ringCol = pal;
  else {
    const sk = SKINS[S.skin] || {};
    ringCol = { a: S.accent || sk.a || "#fff", b: sk.b || "#fff" };
  }
  // Mode « Avatar de chacun » activé ou coupé : chaque tuile prend (ou perd) ses propres couleurs
  if (applyRing.mode !== S.ringFrom) { applyRing.mode = S.ringFrom; for (const t of tiles.values()) tileRing(t); }
}

let colors = null;
function apply() {
  const b = document.body;
  b.dataset.skin = S.skin;
  b.style.setProperty("--glow", S.glow / 100);
  b.style.setProperty("--radius", SHAPES[S.shape].r);
  b.style.setProperty("--clip", SHAPES[S.shape].c);
  b.dataset.shape = S.shape;
  if (S.accent) b.style.setProperty("--accent", S.accent); else b.style.removeProperty("--accent");
  uiColors();
  drawBgPicks();
  applyRing();
  $("#ringColor").value = S.ringColor || (RING_ORIGIN[S.ring] ? RING_ORIGIN[S.ring][0] : S.accent || SKINS[S.skin].a);
  $("#ringCoverHint").hidden = S.ringFrom !== "cover";
  $("#ringColor2Row").hidden = S.ringFrom !== "duo";
  $("#ringColorLabel").textContent = S.ringFrom === "duo" ? "Couleur 1" : "Ma couleur";
  $("#ringColor2").value = S.ringColor2 || "#7c6cff";
  $("#voiceMin").value = S.voiceMin; $("#voiceMinOut").textContent = S.voiceMin ? Math.round(S.voiceMin * 100) + " %" : "aucune";
  // Flou du fond
  const blur = S.bgBlur;
  $("#bgBlur").value = blur; $("#bgBlurOut").textContent = blur ? blur + " px" : "aucun";
  $("#motionBlurStd").setAttribute("stdDeviation", `${blur * 1.6} 0`);
  cv.style.filter = !blur || S.blurType === "tilt" ? "" : S.blurType === "motion" ? "url(#motionBlur)" : S.blurType === "frost" ? `blur(${blur}px) saturate(1.25) brightness(.9)` : `blur(${blur}px)`;
  cv.classList.toggle("blurred", !!blur && S.blurType !== "tilt");
  $("#bgTilt").style.backdropFilter = `blur(${blur}px)`;
  b.classList.toggle("blur-tilt", !!blur && S.blurType === "tilt");
  b.classList.toggle("blur-frost", !!blur && S.blurType === "frost");
  b.classList.toggle("av-shadow", S.avShadow);
  for (const m of ["hide", "blur", "glitch", "snow"]) b.classList.toggle("nm-" + m, S.nameMask === m);
  b.classList.toggle("nm-hover", !!S.nameHover && S.nameMask === "blur");
  $("#nameHoverRow").hidden = S.nameMask !== "blur";
  $("#vertNameRow").hidden = !S.vertical;
  b.classList.toggle("vname-top", !!S.vertNameTop);
  b.classList.toggle("av-outline", !!S.avOutline);
  b.classList.toggle("av-outline-auto", !!S.avOutline && !!S.avOutlineAuto);
  $("#avOutlineAutoRow").hidden = !S.avOutline;
  b.classList.toggle("glitch-snow", S.glitchStyle === "snow");
  // Mode économie : mêmes fonctions, rendu plus léger (voir ECO)
  ECO = S.perf === "eco" || (S.perf !== "max" && AUTO_ECO);
  window.HUSH_ECO = ECO;
  b.classList.toggle("eco", ECO);
  $("#perfHint").dataset.on = ECO ? "1" : "0";
  if (bgScale() !== bgScaleNow) sizeCanvas();
  for (const m of ["pop", "fade", "glitch", "none"]) b.classList.toggle("join-" + m, (S.joinAnim || "pop") === m);
  $("#glitchAmt").value = S.glitchAmt; $("#glitchAmtOut").textContent = Math.round(S.glitchAmt * 100) + " %";
  $("#glitchAmt").disabled = $("#glitchVoice").disabled = S.glitch === "off";
  b.classList.toggle("no-names", !S.names);
  b.classList.toggle("cards", S.cards);
  b.classList.toggle("hide-muted", S.hideMuted);
  $("#settingsWrap").hidden = !S.panel;
  if (!S.panel) $("#settingsWrap").classList.remove("docked");
  if (!SHAPES[S.shape]) S.shape = "round";
  if (!FONTS.includes(S.font)) S.font = FONTS[0]; // ancienne police (ou préréglage partagé) : plus proposée
  loadFont(S.font);
  document.body.style.setProperty("--f-user", `"${S.font}"`);
  fontSel.value = S.font;
  b.classList.toggle("hide-me", !S.showMe);
  $("#music").style.width = (S.playerW || playerDefault()) + "px";
  $("#music").classList.toggle("mp-mini", S.playerStyle === "vinyl");
  syncPlayerSize();
  syncDock();
  if (!S.autoHide) document.body.classList.remove("hud-hidden");
  document.querySelectorAll("#tabs [data-tab]").forEach((x) => x.setAttribute("aria-selected", x.dataset.tab === S.tab));
  if (!setSearchQ) document.querySelectorAll(".tab-panel").forEach((x) => (x.hidden = x.dataset.tab !== S.tab));
  const tabBtn = document.querySelector(`#tabs [data-tab="${S.tab}"]`);
  if (!setSearchQ && tabBtn) $("#settingsTitle").textContent = tabBtn.textContent;
  $("#zoomRange").value = S.zoom; $("#zoomOut").textContent = Math.round(S.zoom * 100) + " %";
  $("#setPin").setAttribute("aria-checked", pinned);
  b.classList.toggle("ring-solid", S.ring === "solid");
  b.classList.toggle("ring-two", S.ringFrom === "avatar" || S.ringFrom === "duo");
  b.classList.toggle("ring-ambi", S.ringFrom === "ambi");
  b.style.setProperty("--name-shift", String(S.nameShift || 0));
  $("#nameShift").value = S.nameShift || 0;
  $("#nameShiftOut").textContent = (S.nameShift > 0 ? "+" : "") + (S.nameShift || 0) + " px";
  drawFriendColors(); // anneau plein en dégradé de deux couleurs
  b.classList.toggle("ring-aura", S.ring === "aura");
  b.classList.toggle("ring-canvas", Rings.TYPES.includes(S.ring));
  $("#togglePanel").classList.toggle("on", S.panel);
  $("#bgPick").hidden = S.bg !== "image";
  if (typeof syncWePick === "function") syncWePick();
  $("#bgColorRow").hidden = !["solid", "gradient", "duo"].includes(S.bg);
  $("#bgColor").value = S.bgColor || "#fcbbdd";
  $("#bgColorLabel").textContent = S.bg === "duo" ? "Couleur 1" : "Couleur du fond";
  $("#bgColor2Row").hidden = S.bg !== "duo";
  $("#bgColor2").value = S.bgColor2 || "#9b7bff";
  // Zoom de l'image de fond (image fixe : rendu net, sans le lent zoom automatique qui la floutait)
  $("#bgZoomGroup").hidden = S.bg !== "image" || !S.bgImage;
  $("#homeVeil").value = S.homeBg ?? 1;
  document.body.style.setProperty("--home-veil", String(1 - (S.homeBg ?? 1)));
  $("#bgZoom").value = S.bgZoom; $("#bgZoomOut").textContent = Math.round(S.bgZoom * 100) + " %";
  $("#bgMedia").style.setProperty("--bg-zoom", S.bgZoom);
  $("#freeHint").hidden = S.layout !== "free";
  $("#bgPick").textContent = S.bgImage ? "Changer le fond (image, GIF, vidéo)" : "Choisir un fond (image, GIF, vidéo)";
  loadBgImg();
  $("#bgMedia").style.filter = cv.style.filter;
  $("#musicOn").setAttribute("aria-checked", S.musicOn);
  $("#musicFields").hidden = !S.musicOn;
  if ($("#musicTitleIn").value !== S.musicTitle) $("#musicTitleIn").value = S.musicTitle;
  document.querySelectorAll(".music-fields[data-src]").forEach((x) => (x.hidden = x.dataset.src !== S.musicSource));
  syncMusicSource();
  updateMusicCard();
  skinsEl.querySelectorAll(".skin").forEach((x) => x.setAttribute("aria-pressed", x.dataset.v === S.skin));
  SEGS.forEach(([id, k]) =>
    $(id).querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x.dataset.v === S[k])));
  // Fond Wallpaper Engine : c'est son propre rond qui est allumé, pas « Image / GIF »
  if (isWeBg()) { $('#bgSeg [data-v="image"]').setAttribute("aria-pressed", false); $("#bgWe").setAttribute("aria-pressed", true); }
  $("#glow").value = S.glow; $("#glowOut").textContent = S.glow + " %";
  $("#volume").value = S.volume; $("#volumeOut").textContent = Math.round(S.volume * 100) + " %";
  $("#mpVol").value = S.volume;
  if (lastConsent !== !!S.reports) { lastConsent = !!S.reports; window.studio.report.consent(lastConsent); }
  $("#mpVolWrap").hidden = S.musicSource === "manual";
  $("#players").value = S.players; $("#playersOut").textContent = String(S.players);
  $("#speed").value = S.speed; $("#speedOut").textContent = S.speed.toFixed(1).replace(".0", "") + "×";
  $("#accent").value = S.accent || SKINS[S.skin].a;
  SWITCHES.forEach((k) => $("#" + k).setAttribute("aria-checked", S[k]));
  ovUi();
  // Pseudos : en haut ou en bas de l'avatar, et leur taille
  b.classList.toggle("name-top", S.namePos !== "bottom");
  b.classList.toggle("name-bottom", S.namePos === "bottom");
  b.style.setProperty("--nk", S.nameSize);
  b.classList.toggle("font-pixel", S.font === "Minecraft");
  $("#nameSize").value = S.nameSize; $("#nameSizeOut").textContent = Math.round(S.nameSize * 100) + " %";
  colors = null;
  if (typeof ColorWheel !== "undefined") ColorWheel.sync();
  save();
  requestAnimationFrame(layout);
}

/* ——— Fond animé ——— */
/* ——— Économie ———
   Auto : sous Linux (souvent une puce graphique intégrée) et sur les petites machines.
   Rien n'est retiré : le verre passe en simple flou (sans la déformation SVG, très coûteuse), le fond est dessiné
   une image sur deux et moins fin (et en demi-résolution quand il est flouté, ça ne se voit pas), les anneaux et
   l'onde du lecteur une image sur deux, sans le zoom lent des fonds en image. */
const AUTO_ECO = /Linux/.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
let ECO = AUTO_ECO, frameN = 0, bgScaleNow = 0;
const cv = $("#bg"), ctx = cv.getContext("2d");
// Résolution du fond : pleine (écran HD/retina), 1 en économie, moitié si le fond est bien flouté (invisible à l'œil)
function bgScale() {
  const d = ECO ? 1 : Math.min(devicePixelRatio || 1, 2);
  return (S.bgBlur || 0) >= 10 && S.blurType !== "tilt" ? d * 0.5 : d;
}
function sizeCanvas() {
  const d = (bgScaleNow = bgScale());
  cv.width = Math.max(1, Math.round(cv.clientWidth * d)); cv.height = Math.max(1, Math.round(cv.clientHeight * d));
  ctx.setTransform(d, 0, 0, d, 0, 0);
}
// Carte graphique saturée (fond GIF lourd, puce Intel…) : le canvas du fond peut être « perdu » et rester noir.
// On le récupère dès que possible au lieu de garder un fond noir.
cv.addEventListener("contextlost", (e) => e.preventDefault());
cv.addEventListener("contextrestored", () => { colors = null; sizeCanvas(); });
addEventListener("resize", sizeCanvas);
// Contexte perdu plus de 2 s (il ne revient pas tout seul) : on remet un canvas neuf à la place
let lostSince = 0;
function bgLost() {
  if (!lostSince) lostSince = performance.now();
  if (performance.now() - lostSince < 2000) return;
  lostSince = 0;
  // Une seule fois par lancement : si la carte graphique perd encore le fond, on ne boucle pas
  try { if (sessionStorage.getItem("hush-bg-reloaded")) return; sessionStorage.setItem("hush-bg-reloaded", "1"); } catch { return; }
  console.warn("Hush : fond perdu par la carte graphique, rechargement de l'affichage");
  window.studio.win.reload(); // tout le rendu repart proprement (les réglages sont gardés)
}
function drawBg(t, energy) {
  const w = cv.clientWidth, h = cv.clientHeight;
  if (w && Math.abs(cv.width - Math.round(w * bgScaleNow)) > 1) sizeCanvas();
  if (!colors) {
    const cs = getComputedStyle(document.body);
    colors = { a: cs.getPropertyValue("--accent").trim(), b: cs.getPropertyValue("--accent2").trim() };
  }
  ctx.clearRect(0, 0, w, h);
  if (S.bg === "duo") {
    // Double dégradé : les deux couleurs choisies, en biais, avec une lueur douce qui respire avec les voix
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, S.bgColor || "#fcbbdd");
    g.addColorStop(1, S.bgColor2 || "#9b7bff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const r = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) * 0.5);
    r.addColorStop(0, `rgba(255,255,255,${0.14 + energy * 0.1})`);
    r.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, w, h);
  } else if (S.bg === "gradient") {
    // Dégradé sans motif : clair au centre, plus sombre sur les bords, dans la couleur choisie (comme le fond Uni)
    const c = hexHsl(S.bgColor || "#fcbbdd");
    if (c.l > 70) c.s *= 0.65; // couleur pâle : le dégradé reste doux au lieu de virer au fluo sur les bords
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) * 0.55);
    const L = (v) => Math.max(0, Math.min(100, v));
    g.addColorStop(0, `hsl(${c.h} ${c.s}% ${L(c.l + 8 + energy * 4)}%)`);
    g.addColorStop(0.55, `hsl(${c.h} ${c.s}% ${L(c.l * 0.72)}%)`);
    g.addColorStop(1, `hsl(${c.h} ${c.s}% ${L(c.l * 0.45)}%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } else if (S.bg === "solid") {
    // Fond uni, de la couleur choisie
    ctx.fillStyle = S.bgColor || "#fcbbdd";
    ctx.fillRect(0, 0, w, h);
  } else if (["space", "pinkspace", "stars", "topo", "auto"].includes(S.bg)) {
    window.Patterns.draw(S.bg, ctx, w, h, t, energy, reduced ? 0 : S.speed);
  } else if (S.bg === "profile") {
    drawProfileBg(t, w, h, energy);
  } else if (S.bg === "image") {
    // L'image est affichée par #bgMedia ; ici, juste un léger assombrissement des bords
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.8);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.45)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
  }
}

/* ——— Fond « Profil » : la photo de profil de celui qui parle, en grand, très floutée ———
   Pré-floutée une fois dans une petite image, puis agrandie (doux et pas coûteux). Fondu à chaque changement. */
const profBg = { url: null, cur: null, prev: null, at: 0, cache: new Map() };
function blurredAvatar(url) {
  if (profBg.cache.has(url)) return profBg.cache.get(url);
  const entry = { ready: false, cv: document.createElement("canvas") };
  profBg.cache.set(url, entry);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    entry.cv.width = 160; entry.cv.height = 90;
    const x = entry.cv.getContext("2d");
    x.filter = "blur(5px) saturate(1.35)";
    const k = Math.max(160 / img.width, 90 / img.height) * 1.25;
    x.drawImage(img, (160 - img.width * k) / 2, (90 - img.height * k) / 2, img.width * k, img.height * k);
    entry.ready = true;
  };
  img.src = url;
  return entry;
}
function drawProfileBg(t, w, h, energy) {
  const ft = tiles.get(focusId);
  const url = (ft && (ft.data.avatar || null)) || (state.me && state.me.avatar) || null;
  if (url !== profBg.url) { profBg.prev = profBg.cur; profBg.cur = url ? blurredAvatar(url) : null; profBg.url = url; profBg.at = t; }
  const fade = Math.min(1, (t - profBg.at) / 700);
  const z = 1.08 + 0.03 * Math.sin(t * 0.00015 * S.speed) + energy * 0.03;
  const draw = (e, a) => {
    if (!e || !e.ready || a <= 0) return;
    ctx.globalAlpha = a;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(e.cv, (w - w * z) / 2, (h - h * z) / 2, w * z, h * z);
  };
  draw(profBg.prev, 1 - fade);
  draw(profBg.cur, fade);
  ctx.globalAlpha = 1;
  // Voile sombre pour que les avatars et les pseudos ressortent
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, "rgba(0,0,0,.35)"); v.addColorStop(1, "rgba(0,0,0,.75)");
  ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
}

/* ——— Fond « Son » : un cercle de barres qui suit le son, et des ondes qui partent à chaque coup fort ———
   Il écoute la musique jouée dans Hush (Mes sons) quand il y en a, sinon les voix du salon (et une
   respiration lente pour qu'il ne soit jamais figé). */
const pulse = { lvl: 0, avg: 0, waves: [], bars: new Float32Array(72) };
function drawPulse(t, w, h, energy) {
  const music = audioLevel();
  const spectrum = music !== null ? Sounds.data : null;
  const target = Math.min(1, Math.max(energy, music !== null ? music * 1.6 : 0));
  pulse.lvl += (target - pulse.lvl) * 0.25;
  pulse.avg += (pulse.lvl - pulse.avg) * 0.03;
  // Un coup (la voix ou la basse monte d'un coup) : une onde part du centre
  if (pulse.lvl > pulse.avg + 0.12 && (!pulse.waves.length || t - pulse.waves[pulse.waves.length - 1].t > 180)) pulse.waves.push({ t, k: pulse.lvl });
  // Couleurs de l'anneau (vert Discord par défaut, ou ta couleur / la pochette)
  const c = ringCol.a, c2 = ringCol.b;
  const cx = w / 2, cy = h / 2, base = Math.min(w, h) * (0.22 + pulse.lvl * 0.03);
  // Halo central
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
  g.addColorStop(0, hexA(c, 0.10 + pulse.lvl * 0.25));
  g.addColorStop(0.5, hexA(c2, 0.04 + pulse.lvl * 0.06));
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // Ondes
  pulse.waves = pulse.waves.filter((wv) => t - wv.t < 2200);
  for (const wv of pulse.waves) {
    const p = (t - wv.t) / 2200;
    ctx.beginPath();
    ctx.arc(cx, cy, base + p * Math.max(w, h) * 0.6, 0, Math.PI * 2);
    ctx.strokeStyle = hexA(c, (1 - p) * 0.5 * wv.k);
    ctx.lineWidth = 2 + (1 - p) * 10 * wv.k;
    ctx.stroke();
  }
  // Barres en cercle
  const n = pulse.bars.length;
  ctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const half = i < n / 2 ? i : n - 1 - i; // symétrique, comme un miroir
    let v;
    if (spectrum) v = spectrum[Math.floor((half / (n / 2)) * 40)] / 255;
    else v = pulse.lvl * (0.45 + 0.55 * Math.abs(Math.sin(t * 0.004 * S.speed + half * 0.7) * Math.sin(t * 0.0023 * S.speed + half * 1.9)));
    v = Math.max(v, 0.04 + 0.02 * Math.sin(t * 0.001 + i));
    pulse.bars[i] += (v - pulse.bars[i]) * 0.3;
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const len = pulse.bars[i] * Math.min(w, h) * 0.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * base, cy + Math.sin(a) * base);
    ctx.lineTo(cx + Math.cos(a) * (base + len), cy + Math.sin(a) * (base + len));
    ctx.strokeStyle = hexA(i % 2 ? c2 : c, 0.35 + pulse.bars[i] * 0.6);
    ctx.lineWidth = Math.max(2, (Math.PI * 2 * base) / n * 0.45);
    ctx.stroke();
  }
  ctx.restore();
}
// Couleur #rrggbb (ou autre) avec une transparence
function hexA(col, a) {
  // Le canvas convertit n'importe quelle couleur CSS opaque (hsl…) en #rrggbb
  if (!/^#[0-9a-f]{6}$/i.test(col)) { ctx.fillStyle = col; col = ctx.fillStyle; }
  const m = /^#?([0-9a-f]{6})$/i.exec(String(col).trim());
  if (!m) return col;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

/* ——— Disposition « Libre » ———
   Chaque membre est posé où tu veux (glisser-déposer), sur un plan en 3D.
   La caméra fonctionne comme en Cinéma 3D : elle glisse et zoome vers celui qui parle, le plan pivote un peu. */
const freeCam = { x: 0, y: 0, z: 1 };
let freeDrag = null;
function freePosOf(id, i, n) {
  if (S.freePos[id]) return S.freePos[id];
  // Pas encore placé : en grille au centre (chacun déplace ensuite qui il veut)
  const cols = Math.ceil(Math.sqrt(Math.max(1, n) * 1.6)), rows = Math.ceil(n / cols);
  const r = Math.floor(i / cols), inRow = r === rows - 1 ? n - r * cols : cols, c = i % cols;
  return { x: inRow <= 1 ? 0 : (c / (inRow - 1) - 0.5) * 0.66 * (inRow / cols), y: rows <= 1 ? 0.06 : (r / (rows - 1) - 0.5) * 0.4 + 0.08 };
}
function free(t) {
  const W = stage.clientWidth, H = stage.clientHeight;
  const list = [...tiles.values()].filter((x) => !(S.hideMuted && x.el.classList.contains("muted") && !x.el.classList.contains("me")));
  const cam = S.camera && !reduced && !freeDrag;
  // Cible : le membre verrouillé (Ctrl+clic) ou celui qui parle ; personne : tout le monde au centre
  const n = list.length;
  const pos = new Map(list.map((x, i) => [x.data.id, freePosOf(x.data.id, i, n)]));
  const speaking = Date.now() - (lastSpoke.get(focusId) || 0) < 2500;
  const aimId = view.lock || (speaking ? focusId : null);
  // La caméra se rapproche de celui qui parle sans perdre tout le groupe de vue (60 % du chemin)
  const tp = cam && aimId && pos.get(aimId);
  const aim = tp ? { x: tp.x * 0.6, y: tp.y * 0.6 } : { x: 0, y: 0 };
  const zAim = cam && aimId ? 1.15 : 1;
  const k = reduced ? 1 : 0.04 * S.speed;
  if (!freeDrag) {
    freeCam.x += (aim.x - freeCam.x) * k;
    freeCam.y += (aim.y - freeCam.y) * k;
    freeCam.z += (zAim - freeCam.z) * k;
  }
  const sp = reduced ? 0 : S.speed;
  // Le plan pivote vers celui qu'on regarde, comme une caméra qui se tourne, plus une respiration lente
  const yaw = cam ? -freeCam.x * 28 + 4 * Math.sin(t * 0.0003 * sp) : 0;
  const pitch = cam ? freeCam.y * 18 + 3 * Math.sin(t * 0.00023 * sp) : 0;
  for (const x of list) {
    const p = pos.get(x.data.id);
    const px = (p.x - freeCam.x) * W * freeCam.z;
    const py = (p.y - freeCam.y) * H * freeCam.z;
    const bob = 5 * Math.sin(t * 0.001 * sp + x.seed);
    x.el.style.transform = `rotateX(${pitch.toFixed(2)}deg) rotateY(${yaw.toFixed(2)}deg) translate3d(${px.toFixed(1)}px, ${(py + bob).toFixed(1)}px, 0) scale(${freeCam.z.toFixed(3)})`;
    x.el.style.zIndex = x === (freeDrag && freeDrag.tile) ? "50" : "";
  }
  // Comme ailleurs : aucun avatar coupé par le bord (il s'efface, et réapparaît en entier)
  if (!freeDrag) hideClipped(list);
}
// Glisser un membre pour le placer
stage.addEventListener("pointerdown", (e) => {
  if (L !== "free" || e.button !== 0 || e.ctrlKey || e.metaKey) return;
  const el = e.target.closest(".tile");
  const tile = el && [...tiles.values()].find((x) => x.el === el);
  if (!tile) return;
  e.preventDefault(); e.stopPropagation();
  const list = [...tiles.values()];
  const p = { ...freePosOf(tile.data.id, list.indexOf(tile), list.length) };
  freeDrag = { tile, x: e.clientX, y: e.clientY, p };
  el.setPointerCapture(e.pointerId);
  el.classList.add("dragging");
});
stage.addEventListener("pointermove", (e) => {
  if (!freeDrag) return;
  const W = stage.clientWidth, H = stage.clientHeight;
  const p = {
    x: Math.max(-0.48, Math.min(0.48, freeDrag.p.x + (e.clientX - freeDrag.x) / (W * freeCam.z))),
    y: Math.max(-0.45, Math.min(0.45, freeDrag.p.y + (e.clientY - freeDrag.y) / (H * freeCam.z))),
  };
  S.freePos[freeDrag.tile.data.id] = p;
});
const endFreeDrag = () => {
  if (!freeDrag) return;
  freeDrag.tile.el.classList.remove("dragging");
  freeDrag = null;
  save();
};
stage.addEventListener("pointerup", endFreeDrag);
stage.addEventListener("pointercancel", endFreeDrag);
$("#freeReset").onclick = () => { S.freePos = {}; save(); };

/* ——— Cinéma 3D : une caméra qui « réalise » ———
   Comme au montage : plan large sur tout le salon quand personne ne parle, plan moyen sur celui qui prend
   la parole, gros plan s'il parle longtemps ou fort, plan à deux quand deux personnes se répondent.
   Les zooms suivent le débit (volume moyen récent de celui qu'on filme) : la caméra pousse doucement vers
   quelqu'un qui s'emballe et recule quand ça se calme. Mouvements amortis, travelling et orbite lents. */
const film = { x: 0, z: 1, vx: 0, vz: 0, yaw: 0, pitch: 8, energy: 0, shot: "wide", since: 0, lastFocus: null };
function filmFrame(t) {
  const c = parseFloat(stage.style.getPropertyValue("--ctile")) || 200;
  const items = [...tiles.values()].filter((x) => !(S.hideMuted && x.el.classList.contains("muted") && !x.el.classList.contains("me")));
  const n = items.length;
  if (!n) return;
  const vert = !!S.vertical;
  const span = vert ? stage.clientHeight : stage.clientWidth, other = vert ? stage.clientWidth : stage.clientHeight;
  const gap = c * 1.5;
  const now = Date.now();
  const talking = items.map((x, i) => (now - (lastSpoke.get(x.data.id) || 0) < 2500 ? i : -1)).filter((i) => i >= 0);
  const fi = items.findIndex((x) => x.data.id === focusId);
  const lockI = items.findIndex((x) => x.data.id === view.lock);
  const cam = S.camera && !reduced;
  // Débit : le volume moyen de celui qu'on filme, lissé sur quelques secondes
  const subject = lockI >= 0 ? items[lockI] : fi >= 0 ? items[fi] : null;
  film.energy += ((subject ? subject.lvl : 0) - film.energy) * 0.025;
  // Choix du plan
  let shot;
  if (!cam) shot = "wide";
  else if (lockI >= 0) shot = film.energy > 0.35 ? "close" : "medium";
  else if (talking.length >= 2) shot = "two";
  else if (talking.length === 1) {
    if (film.lastFocus !== focusId) { film.lastFocus = focusId; film.since = t; }
    shot = (t - film.since > 4000 && film.energy > 0.2) || film.energy > 0.5 ? "close" : "medium";
  } else shot = "wide";
  film.shot = shot;
  let aim, zAim;
  const fitAll = Math.min(1.1, (span * 0.86) / (n * gap));
  if (shot === "wide") { aim = (n - 1) / 2; zAim = fitAll; }
  else if (shot === "two") {
    const a = Math.min(...talking), b = Math.max(...talking);
    aim = (a + b) / 2; zAim = Math.min(1.3, (span * 0.72) / ((b - a + 1) * gap));
  } else {
    aim = lockI >= 0 ? lockI : Math.max(0, fi);
    zAim = shot === "close" ? 1.7 + film.energy * 0.4 : 1.15 + film.energy * 0.3;
  }
  // Jamais plus gros que l'écran, jamais minuscule
  zAim = Math.max(0.22, Math.min(zAim, (other * 0.72) / c));
  // Ressorts amortis : le cadrage glisse (plus vite pour suivre quelqu'un, très lentement en plan large)
  if (viewFree() && view.x !== null) { film.x = view.x; film.vx = 0; }
  else {
    const kx = (shot === "wide" ? 0.006 : shot === "two" ? 0.01 : 0.016) * S.speed;
    film.vx += (aim - film.x) * kx; film.vx *= 1 - 2 * Math.sqrt(kx); film.x += film.vx;
  }
  const kz = 0.006 * S.speed;
  film.vz += (zAim - film.z) * kz; film.vz *= 1 - 2 * Math.sqrt(kz); film.z += film.vz;
  // Mouvements : travelling lent, orbite qui suit le cadrage, plongée plus forte en plan large
  const sp = reduced ? 0 : S.speed;
  const drift = cam ? Math.sin(t * 0.00011 * sp) * 0.22 : 0;
  const yawAim = cam ? (aim - film.x) * -7 + Math.sin(t * 0.00016 * sp) * 8 + (shot === "close" ? -5 : 0) : 0;
  const pitchAim = cam ? (shot === "wide" ? 11 : shot === "close" ? 3 : 7) + Math.sin(t * 0.0002 * sp) * 2 : 0;
  film.yaw += (yawAim - film.yaw) * 0.03;
  film.pitch += (pitchAim - film.pitch) * 0.03;
  const roll = cam && shot === "close" ? Math.sin(t * 0.0003 * sp) * 1.2 : 0;
  view.slotPx = gap * film.z;
  items.forEach((it, i) => {
    const d = i - film.x - drift;
    const along = d * gap * film.z;
    const depth = cam ? -Math.abs(d) * c * 0.35 * film.z : 0; // ceux qui sont loin du cadre reculent
    const bob = 6 * Math.sin(t * 0.0009 * sp + it.seed);
    it.el.style.transform = vert
      ? `rotateZ(${roll.toFixed(2)}deg) rotateX(${(-film.yaw).toFixed(2)}deg) rotateY(${(film.pitch * 0.4).toFixed(2)}deg) translate3d(${bob.toFixed(1)}px, ${along.toFixed(1)}px, ${depth.toFixed(1)}px) scale(${film.z.toFixed(3)})`
      : `rotateZ(${roll.toFixed(2)}deg) rotateX(${film.pitch.toFixed(2)}deg) rotateY(${film.yaw.toFixed(2)}deg) translate3d(${along.toFixed(1)}px, ${bob.toFixed(1)}px, ${depth.toFixed(1)}px) scale(${film.z.toFixed(3)})`;
    it.el.style.zIndex = String(100 - Math.round(Math.abs(d) * 4));
  });
  hideClipped(items);
}

/* ——— Caméra du mode Dynamique (l'ancien Cinéma 3D) ———
   Les avatars sont posés sur un plan ; la caméra glisse vers celui qui parle,
   le plan pivote doucement (lacet + roulis) et avance/recule comme un travelling. */
let camX = 0;
function cinema(t) {
  const c = parseFloat(stage.style.getPropertyValue("--ctile")) || 200;
  const items = [...tiles.values()]
    .filter((x) => !(S.hideMuted && x.el.classList.contains("muted") && !x.el.classList.contains("me")))
    .map((x) => ({ el: x.el, id: x.data.id, seed: x.seed, tile: x }));
  const cam = S.camera;
  const total = items.length;
  // Caméra désactivée : on cadre tout le salon (le plan est réduit pour que tout rentre)
  const fi = cam ? Math.max(0, items.findIndex((x) => x.id === focusId)) : -1;
  const aim = cam ? fi : (total - 1) / 2;
  const vert = !!S.vertical;
  const k = cam ? 1 : Math.min(1, ((vert ? stage.clientHeight : stage.clientWidth) * 0.92) / (total * c * 1.25));
  // Caméra verrouillée sur quelqu'un (Ctrl+clic) ou déplacée à la main (clic-glisser)
  const lockI = items.findIndex((x) => x.id === view.lock);
  const target = lockI >= 0 ? lockI : aim;
  if (viewFree() && view.x !== null) camX = view.x;
  else camX += (target - camX) * (reduced ? 1 : 0.035);
  const sp = reduced ? 0 : S.speed;
  const yaw = cam ? 12 * Math.sin(t * 0.00031 * sp) + 10 + (fi - camX) * 4 : 8;
  const roll = cam ? 3 * Math.sin(t * 0.00023 * sp) : 0;
  const dolly = cam ? 50 * Math.sin(t * 0.00027 * sp) : 0;
  // Celui qui parle est placé un peu à gauche du centre, les autres filent vers la droite
  const shift = 0;
  const gap = cam ? 1.65 : 1.25;
  view.slotPx = c * gap * k;
  items.forEach((it, i) => {
    const target = i;
    it.tile.slot = it.tile.slot === undefined || reduced ? target : it.tile.slot + (target - it.tile.slot) * 0.06;
    const d = it.tile.slot - camX;
    const near = cam ? Math.max(0, 1 - Math.abs(d)) : 0;
    const x = (d * c * gap + shift) * k;
    const z = cam ? near * c * 0.3 - Math.abs(d) * c * 0.2 + dolly : 0;
    const y = 8 * Math.sin(t * 0.0009 * sp + it.seed);
    it.el.style.transform = vert
      ? `rotateZ(${roll}deg) rotateX(${-yaw}deg) translate3d(${y}px, ${x}px, ${z}px) scale(${k})`
      : `rotateZ(${roll}deg) rotateY(${yaw}deg) translate3d(${x}px, ${y}px, ${z}px) scale(${k})`;
  });
  hideClipped(items.map((it) => it.tile));
}

// Aucun avatar coupé : celui qui ne tient pas ENTIÈREMENT dans l'image (avatar + pseudo) s'efface en douceur,
// et réapparaît dès qu'il rentre en entier. S'il parle, il est montré dans une loupe à la place.
function hideClipped(list) {
  const sr = stage.getBoundingClientRect();
  for (const x of list) {
    const r = x.el.getBoundingClientRect();
    const inside = r.left >= sr.left + 2 && r.right <= sr.right - 2 && r.top >= sr.top + 2 && r.bottom <= sr.bottom - 2;
    x.vis = (x.vis ?? 1) + ((inside ? 1 : 0) - (x.vis ?? 1)) * (reduced ? 1 : 0.25);
    x.el.style.opacity = x.vis > 0.98 ? "" : x.vis.toFixed(3);
    x.el.style.visibility = x.vis < 0.02 ? "hidden" : "";
  }
}

/* ——— Changement de plan (nouvelle personne qui parle) ——— */
function onCut() {
  if (S.bg === "auto") window.Patterns.cut();
  if (L === "strip" && S.camera) { zoomKick = 1; newShot(); }
  if (S.bg === "auto" && !reduced) flashLvl = 0.35;
}

/* ——— Caméra du mode Bande ———
   Règle d'or : celui qui parle est TOUJOURS au centre de l'image, quel que soit l'angle de la caméra.
   - La caméra glisse vers lui sans à-coup (amortie, sans dépasser) et la rangée est un plan 3D
     légèrement plongeant, qui s'enfonce du côté où il reste le plus de monde.
   - Après chaque image, on mesure où il est vraiment affiché et on corrige l'écart : il reste centré
     même pendant les rotations.
   - Si plusieurs personnes parlent, on centre le groupe et on dézoome juste assez pour les voir en entier. */
let stripX = null, stripV = 0, zoomKick = 0, zoom = 1, groupZoom = 1, flashLvl = 0;
const MIN_GROUP_ZOOM = 0.45; // en dessous, les avatars deviennent trop petits : on passe aux loupes
const frameFix = { x: 0, y: 0 };
const shot = { yaw: 0, pitch: 12, curYaw: 0, curPitch: 12 };
function newShot() { shot.pitch = 9 + Math.random() * 7; }

function strip(t) {
  const c = parseFloat(stage.style.getPropertyValue("--ctile")) || 160;
  const list = [...tiles.values()].filter((x) => !(S.hideMuted && x.el.classList.contains("muted") && !x.el.classList.contains("me")));
  if (!list.length) return;
  const cam = S.camera && !reduced;
  const gap = c * 1.4;
  // Ceux qui ont parlé dans les 3,5 dernières secondes : le groupe ne change pas à chaque respiration,
  // donc la caméra reste posée et dézoome au lieu de sauter d'une personne à l'autre
  const nowMs = Date.now();
  const talking = list.map((x, i) => (nowMs - (lastSpoke.get(x.data.id) || 0) < 3500 ? i : -1)).filter((i) => i >= 0);
  const fi = Math.max(0, list.findIndex((x) => x.data.id === focusId));

  // Cible : verrou (Ctrl+clic) > groupe qui parle > celui qui parle ; caméra coupée : tout le salon
  const lockI = list.findIndex((x) => x.data.id === view.lock);
  // Groupe trop étalé pour tenir à l'écran même dézoomé : on garde les deux plus forts, les autres passent en loupe
  // On garde, du plus fort au moins fort, ceux qui tiennent ensemble à l'écran sans descendre sous 45 % de zoom
  let group = null;
  if (lockI < 0 && talking.length >= 2) {
    const maxSpan = (((S.vertical ? stage.clientHeight : stage.clientWidth) * 0.75) / MIN_GROUP_ZOOM - c * 1.5) / gap;
    const kept = [];
    for (const i of [...talking].sort((a, b) => list[b].lvl - list[a].lvl)) {
      const span = Math.max(i, ...kept) - Math.min(i, ...kept);
      if (!kept.length || span <= maxSpan) kept.push(i);
    }
    group = kept.length >= 2 ? kept.sort((a, b) => a - b) : null;
  }
  const loudest = talking.length ? [...talking].sort((a, b) => list[b].lvl - list[a].lvl)[0] : fi;
  const aim = lockI >= 0 ? lockI : !cam ? (list.length - 1) / 2 : group ? (Math.min(...group) + Math.max(...group)) / 2 : talking.length ? loudest : fi;
  const vert = !!S.vertical;
  const k = cam ? 1 : Math.min(1, ((vert ? stage.clientHeight : stage.clientWidth) * 0.94) / (list.length * c * (vert ? 1.5 : 1.26)));

  if (stripX === null) { stripX = aim; stripV = 0; }
  if (viewFree() && view.x !== null) { stripX = view.x; stripV = 0; }
  else {
    // Ressort amorti : rapide au départ, arrive en douceur, sans dépasser la cible
    const spring = (group ? 0.006 : 0.012) * S.speed;
    stripV += (aim - stripX) * spring;
    stripV *= 1 - 2 * Math.sqrt(spring);
    stripX += stripV;
  }
  zoomKick = cam && !group ? zoomKick * 0.94 : 0;
  zoom += (1 + zoomKick * 0.12 - zoom) * 0.12;
  if (!group) groupZoom += (1 - groupZoom) * 0.05;
  const z = zoom * (cam ? groupZoom : 1);
  view.slotPx = gap * z;

  // Angle : la rangée s'enfonce du côté où il reste le plus de monde, avec une plongée légère
  const center = Math.round(stripX);
  const balance = (list.length - 1 - center - center) / Math.max(1, list.length - 1); // >0 : plus de monde à droite
  shot.yaw = cam ? Math.max(-1, Math.min(1, balance * 1.6)) * 24 : 0;
  shot.curYaw += (shot.yaw - shot.curYaw) * 0.04 * S.speed;
  shot.curPitch += ((cam ? shot.pitch : 0) - shot.curPitch) * 0.04 * S.speed;
  const plunge = shot.curPitch + (cam ? 2 * Math.sin(t * 0.00025 * S.speed) : 0);
  const roll = cam ? 0.8 * Math.sin(t * 0.0003 * S.speed) : 0;
  const blur = cam ? Math.min(3, Math.abs(stripV) * 25) : 0;

  list.forEach((x, i) => {
    const isTalk = talking.includes(i) || x.data.id === focusId;
    x.fs = (x.fs ?? 1) + ((isTalk ? (cam ? 1.22 : 1.1) : 1) - (x.fs ?? 1)) * 0.12;
    const y = 4 * Math.sin(t * 0.001 * S.speed + x.seed);
    if (cam) {
      const px = (i - stripX) * gap * z;
      // Correction mesurée (frameFix) en premier : elle s'applique à l'écran, après toute la 3D
      // En vertical, la rangée devient une colonne : on échange les axes (et les rotations avec)
      x.el.style.transform = vert
        ? `translate(${frameFix.x.toFixed(1)}px, ${frameFix.y.toFixed(1)}px) rotate(${roll.toFixed(2)}deg) ` +
          `rotateY(${plunge.toFixed(2)}deg) rotateX(${(-shot.curYaw).toFixed(2)}deg) ` +
          `translate3d(${y.toFixed(1)}px, ${px.toFixed(1)}px, 0) rotateX(${(shot.curYaw * 0.7).toFixed(2)}deg) rotateY(${(-plunge * 0.8).toFixed(2)}deg) ` +
          `scale(${(x.fs * z).toFixed(3)})`
        : `translate(${frameFix.x.toFixed(1)}px, ${frameFix.y.toFixed(1)}px) rotate(${roll.toFixed(2)}deg) ` +
          `rotateX(${(-plunge).toFixed(2)}deg) rotateY(${shot.curYaw.toFixed(2)}deg) ` +
          `translate3d(${px.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotateY(${(-shot.curYaw * 0.7).toFixed(2)}deg) rotateX(${(plunge * 0.8).toFixed(2)}deg) ` +
          `scale(${(x.fs * z).toFixed(3)})`;
    } else {
      const px = (i - stripX) * c * (vert ? 1.5 : 1.26) * k;
      x.el.style.transform = vert ? `translate(${y}px, ${px}px) scale(${x.fs * k})` : `translate(${px}px, ${y}px) scale(${x.fs * k})`;
    }
    x.el.style.filter = blur > 1.2 ? `blur(${blur.toFixed(1)}px)` : "";
    x.el.style.zIndex = String(100 - Math.round(Math.abs(i - stripX) * 2));
  });

  hideClipped(list);
  // Mesure : où sont vraiment affichés ceux qu'on veut voir ? On recentre et on ajuste le dézoom.
  if (!cam) { frameFix.x = frameFix.y = 0; return; }
  const targets = (lockI >= 0 ? [lockI] : group || [talking.length ? loudest : fi]).map((i) => list[i].el.querySelector(".av-wrap").getBoundingClientRect());
  const sr = stage.getBoundingClientRect();
  const box = {
    l: Math.min(...targets.map((r) => r.left)), r: Math.max(...targets.map((r) => r.right)),
    t: Math.min(...targets.map((r) => r.top)), b: Math.max(...targets.map((r) => r.bottom)),
  };
  if (!viewFree()) {
    frameFix.x += (sr.left + sr.width / 2 - (box.l + box.r) / 2) * 0.2;
    frameFix.y += (sr.top + sr.height * 0.52 - (box.t + box.b) / 2) * 0.2;
  }
  if (group) {
    // Le groupe doit tenir dans 75 % de la largeur et 70 % de la hauteur, avec une marge pour les pseudos
    const fill = vert
      ? Math.max((box.b - box.t) / (sr.height * 0.75), (box.r - box.l + c * 0.6) / (sr.width * 0.7))
      : Math.max((box.r - box.l) / (sr.width * 0.75), (box.b - box.t + c * 0.4) / (sr.height * 0.7));
    groupZoom = Math.max(MIN_GROUP_ZOOM, Math.min(1, groupZoom * (1 + (1 - fill) * 0.04)));
  }
}

/* ——— Verre liquide : le reflet suit la souris ——— */
addEventListener("pointermove", (e) => {
  for (const g of document.querySelectorAll(".glass")) {
    const r = g.getBoundingClientRect();
    if (!r.width) continue;
    g.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
    g.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
  }
}, { passive: true });

/* ——— Loupes ———
   Ceux qui parlent mais que la caméra ne montre pas (trop loin dans la rangée, ou hors champ)
   apparaissent dans de petites bulles en bas, avec leur anneau. */
const loupes = new Map();
function updateLoupes() {
  const box = $("#loupes");
  const now = Date.now();
  const wanted = new Set();
  if (camLayout() && S.camera) {
    const sr = stage.getBoundingClientRect();
    for (const t of tiles.values()) {
      if (now - (lastSpoke.get(t.data.id) || 0) > 2500) continue;
      const r = t.el.querySelector(".av-wrap").getBoundingClientRect();
      const op = parseFloat(t.el.style.opacity || "1");
      const out = r.right < sr.left + 4 || r.left > sr.right - 4 || r.bottom < sr.top + 4 || r.top > sr.bottom - 4 || op < 0.3;
      if (out) wanted.add(t.data.id);
    }
  }
  for (const [id, el] of loupes) if (!wanted.has(id)) { el.remove(); loupes.delete(id); }
  for (const id of wanted) {
    const t = tiles.get(id);
    let el = loupes.get(id);
    if (!el) {
      el = document.createElement("div");
      el.className = "loupe";
      el.innerHTML = `<div class="loupe-av"><div class="aura"><i></i><i></i><i></i></div></div><span></span>`;
      el.querySelector(".loupe-av").appendChild(t.el.querySelector(".av").cloneNode(true));
      el.querySelector("span").textContent = t.data.name;
      box.appendChild(el);
      loupes.set(id, el);
    }
    el.style.setProperty("--lvl", t.lvl.toFixed(3));
    el.classList.toggle("speaking", t.el.classList.contains("speaking"));
  }
  box.hidden = !loupes.size;
}

/* ——— Caméra libre ———
   Clic-glisser : déplace la caméra. Molette : zoom. Ctrl+clic sur quelqu'un : verrouille la caméra sur lui
   (Ctrl+clic à nouveau, ou sur le fond, pour libérer). Sans action pendant 2,5 s, la caméra repart toute seule. */
const FREE_MS = 2500;
const view = { dragging: false, px: 0, py: 0, until: 0, x: null, y: 0, zoom: 1, lock: null, slotPx: 200 };
const camLayout = () => L === "strip" || L === "cinema" || L === "film";
const viewFree = () => view.dragging || performance.now() < view.until;
const mainEl = document.querySelector(".main");

function showToast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => (t.hidden = true), 2600);
}

mainEl.addEventListener("pointerdown", (e) => {
  if ((!camLayout() && L !== "free") || e.button !== 0 || e.target.closest(".dock, .mp, .mp-grab, .screen, .chat, .home, .sandbox-pill, .call-banner, .incoming")) return;
  const tileEl = e.target.closest(".tile");
  if (e.ctrlKey || e.metaKey) {
    const t = tileEl && [...tiles.values()].find((x) => x.el === tileEl);
    if (t && view.lock !== t.data.id) {
      view.lock = t.data.id;
      showToast(`Caméra verrouillée sur ${t.data.name} · Ctrl+clic pour libérer`);
    } else if (view.lock) {
      view.lock = null;
      showToast("Caméra libérée : elle suit de nouveau celui qui parle");
    }
    return;
  }
  if (L === "free") return; // en Libre, glisser déplace le membre (voir plus haut)
  e.preventDefault();
  view.dragging = true;
  view.px = e.clientX; view.py = e.clientY;
  view.x = L === "strip" ? stripX : L === "film" ? film.x : camX;
  mainEl.classList.add("grabbing");
});
addEventListener("pointermove", (e) => {
  if (!view.dragging) return;
  view.x -= (e.clientX - view.px) / Math.max(40, view.slotPx);
  view.y = Math.max(-300, Math.min(300, view.y + (e.clientY - view.py)));
  view.px = e.clientX; view.py = e.clientY;
});
addEventListener("pointerup", () => {
  if (!view.dragging) return;
  view.dragging = false;
  view.until = performance.now() + FREE_MS;
  mainEl.classList.remove("grabbing");
});
// Molette : zoom avant / arrière, gardé tel quel (et enregistré) jusqu'à ce que tu le changes. Ctrl+0 : retour à 100 %
function setZoom(z, quiet) {
  S.zoom = Math.round(Math.max(0.3, Math.min(1.8, z)) * 100) / 100;
  save();
  layout();
  $("#zoomRange").value = S.zoom; $("#zoomOut").textContent = Math.round(S.zoom * 100) + " %";
  if (!quiet) showToast(`Zoom ${Math.round(S.zoom * 100)} % · Ctrl+0 pour revenir à 100 %`);
}
// La molette ne zoome que sur la scène : dans le tchat, l'accueil, un panneau ou une liste, elle fait défiler
function wheelScrolls(e) {
  if (!$("#home").hidden) return true;
  if (e.target.closest(".screen, .mp, .mp-grab, .chat, .home, .settings, .glass, .umenu, .share-pick, [role=dialog], input, textarea, select")) return true;
  for (let el = e.target; el && el !== mainEl; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) return true;
  }
  return false;
}
mainEl.addEventListener("wheel", (e) => {
  if (wheelScrolls(e) || L === "lyrics") return;
  e.preventDefault();
  setZoom(S.zoom * (1 - e.deltaY * 0.0012));
}, { passive: false });
addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && (e.key === "0" || e.code === "Numpad0")) { e.preventDefault(); setZoom(1); } });

// Couleur d'accent (#rrggbb) en teinte/saturation/luminosité, avec une saturation minimale pour le dégradé
function hexHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return { h: 210, s: 80, l: 50 };
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return { h: Math.round((h * 60 + 360) % 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/* ——— Boucle d'animation ——— */
function frame(t) {
  let energy = 0, loud = null;
  const live = new Map(state.members.map((m) => [m.id, m]));
  for (const tile of tiles.values()) {
    const m = live.get(tile.data.id);
    const speaking = heard(m);
    if (speaking) lastSpoke.set(tile.data.id, Date.now());
    // Volume réel (bot) si on l'a, sinon une animation qui imite une voix
    let target;
    if (m && typeof m.level === "number") target = speaking ? Math.max(0.12, lvlOf(m)) : 0;
    else {
      const n = 0.55 + 0.45 * Math.sin(t * 0.011 * S.speed + tile.seed) * Math.sin(t * 0.0047 * S.speed + tile.seed * 2);
      target = speaking ? 0.35 + 0.65 * Math.abs(n) : 0;
    }
    tile.lvl += (target - tile.lvl) * (reduced ? 1 : 0.2);
    tile.el.style.setProperty("--lvl", tile.lvl.toFixed(3));
    const wrap = tile.wrap || (tile.wrap = tile.el.querySelector(".av-wrap"));
    // Selon le volume : l'avatar grossit avec la voix et s'étire sur chaque attaque (syllabe, cri, rire)
    tile.fast = (tile.fast || 0) + (target - (tile.fast || 0)) * (target > (tile.fast || 0) ? 0.55 : 0.16);
    if (S.avAnim === "db" && !reduced && tile.fast > 0.01) {
      const punch = Math.max(-0.05, Math.min(0.09, (tile.fast - tile.lvl) * 0.6));
      const s = 1 + tile.fast * 0.12;
      wrap.style.transform = `translateY(${(-tile.fast * 5).toFixed(2)}px) scale(${(s - punch * 0.6).toFixed(4)}, ${(s + punch).toFixed(4)})`;
      tile.squashed = true;
    } else if (S.avAnim === "rhythm" && !reduced && tile.lvl > 0.02) {
      const k = tile.lvl * 0.075 * (Math.sin(t * 0.026 * S.speed + tile.seed) * 0.7 + Math.sin(t * 0.061 * S.speed + tile.seed * 3) * 0.3);
      wrap.style.transform = `scale(${(1 + k).toFixed(4)}, ${(1 - k).toFixed(4)})`;
      tile.squashed = true;
    } else if (tile.squashed) { wrap.style.transform = ""; tile.squashed = false; }
    tile.el.classList.toggle("speaking", speaking);
    tile.bars.forEach((b, i) => {
      const s = tile.lvl * (0.35 + 0.65 * Math.abs(Math.sin(t * 0.018 * S.speed + i * 1.3 + tile.seed)));
      b.style.transform = `scaleY(${Math.max(0.12, s)})`;
    });
    if (L !== "discord" && (!ECO || (frameN + tile.ringPhase) % 2 === 0)) Rings.draw(tile, S.ring, t, tile.duo || ringCol);
    energy += tile.lvl;
    if (speaking && (!loud || tile.lvl > loud.lvl)) loud = tile;
  }
  // Qui est « à l'image » : la voix la plus forte, sans changer plus vite qu'un plan de montage
  if (!focusId || !tiles.has(focusId)) { focusId = tiles.keys().next().value || null; if (L === "scene") layout(); }
  const minShot = L === "strip" ? 900 : 1600;
  if (loud && loud.data.id !== focusId && t - focusAt > minShot) {
    focusId = loud.data.id; focusAt = t;
    if (L === "scene") for (const x of tiles.values()) x.el.classList.toggle("focus", x.data.id === focusId);
    onCut();
  }
  if (L === "stream") {
    const ft = featKey && tiles.get(featKey.split("|")[0]);
    $("#feature").classList.toggle("speaking", !!(ft && ft.el.classList.contains("speaking")));
    for (const c of $("#featureGrid").children) { const ct = tiles.get(c.dataset.id); c.classList.toggle("speaking", !!(ct && ct.el.classList.contains("speaking"))); if (ct) c.style.setProperty("--lvl", ct.lvl.toFixed(3)); }
    if (ft) $("#feature").style.setProperty("--lvl", ft.lvl.toFixed(3));
  }
  if (L === "cinema") cinema(t);
  if (L === "strip") strip(t);
  if (L === "free") free(t);
  if (L === "film") filmFrame(t);
  updateLoupes();
  // 2,5 s sans toucher : le décalage revient en place et la caméra reprend celui qui parle. Le zoom, lui, reste.
  if (!viewFree()) { view.x = null; view.y *= 0.88; }
  stage.style.transform = Math.abs(view.y) > 0.5 ? `translateY(${view.y.toFixed(1)}px)` : "";
  for (const x of tiles.values()) x.el.classList.toggle("locked", x.data.id === view.lock);
  flashLvl *= 0.8;
  $("#flash").style.opacity = flashLvl > 0.01 ? flashLvl.toFixed(3) : "0";
  // Morceau en direct : on avance la position entre deux nouvelles de Deezer/Spotify
  const lt = S.musicOn ? liveTrack() : null;
  let len = 180, pos = (t / 1000) % len;
  if (lt) {
    len = Math.max(1, lt.duration / 1000);
    pos = Math.min(len, (lt.progress + (lt.playing ? Date.now() - lt.at : 0)) / 1000);
  }
  if (S.musicOn && !$("#music").hidden) {
    $("#musicProgress").style.width = (pos / len) * 100 + "%";
    $("#musicNow").textContent = fmtTime(pos);
    $("#musicLen").textContent = "-" + fmtTime(len - pos);
    if (!ECO || frameN % 2 === 0) drawWave(t, lt ? lt.playing : S.musicSource === "manual");
  }
  if (L === "lyrics") lyricsFrame(lt, pos * 1000);
  const names = state.members.filter(heard).map((m) => maskName(m.name));
  $("#talkers").textContent = names.length ? names.slice(0, 3).join(" & ") + (names.length > 1 ? " parlent" : " parle") : "personne ne parle";
  frameN++;
  if (!ECO || frameN % 2 === 0) {
    if (ctx.isContextLost && ctx.isContextLost()) bgLost(); else { drawBg(t, Math.min(1, energy / 2)); glitchFrame(t, Math.min(1, energy / 2)); }
  }
  maskNames(t);
  requestAnimationFrame(frame);
}

/* ——— Pseudos cachés ———
   Masqués : remplacés par une barre. Flous : CSS. Glitch : les lettres se mélangent en continu
   (même longueur que le vrai pseudo), avec un décalage rouge/cyan, comme le titre du site Phantom. */
const GLYPHS = "▓▒░█#@%&$¥Ø§¤Ξ01<>/\\|=+*";
const scramble = (s) => [...s].map((c) => (c === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join("");
function maskName(n) {
  if (S.nameMask === "hide") return "•••";
  if (S.nameMask === "glitch" || S.nameMask === "snow") return scramble(n);
  return n;
}
let lastScramble = 0;
// Neige télé : le mélange accélère puis ralentit en boucle (de 35 ms à ~450 ms entre deux changements) ;
// au plus lent, quelques vraies lettres apparaissent, comme un signal qui accroche
function snowName(name, slow) {
  return [...name].map((c) => (c === " " ? " " : Math.random() < slow * 0.35 ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join("");
}
function maskNames(t) {
  const glitch = S.nameMask === "glitch", snow = S.nameMask === "snow";
  if (snow) {
    for (const tile of tiles.values()) {
      const span = tile.nameSpan || (tile.nameSpan = tile.el.querySelector(".name span"));
      const slow = Math.pow(0.5 + 0.5 * Math.sin((t / 2400) * Math.PI * 2 + tile.seed), 2);
      if (t < (tile.snowNext || 0)) continue;
      tile.snowNext = t + 35 + 420 * slow;
      span.textContent = snowName(tile.data.name, slow);
      tile.scrambled = true;
    }
  } else {
    if (glitch && t - lastScramble < 70) return;
    lastScramble = t;
    for (const tile of tiles.values()) {
      const span = tile.nameSpan || (tile.nameSpan = tile.el.querySelector(".name span"));
      if (glitch) { span.textContent = Math.random() < 0.15 ? tile.data.name : scramble(tile.data.name); tile.scrambled = true; }
      else if (tile.scrambled) { span.textContent = tile.data.name; tile.scrambled = false; }
    }
  }
  if (snow && t - lastScramble < 70) return;
  lastScramble = t;
  const mixed = glitch || snow;
  for (const [id, el] of loupes) {
    const tile = tiles.get(id), span = el.querySelector("span");
    if (tile && span) span.textContent = mixed ? scramble(tile.data.name) : tile.data.name;
  }
}

/* ——— Glitch (onglet Effets) ———
   Par à-coups : de temps en temps (plus souvent si quelqu'un parle fort), pendant 80 à 300 ms, des bandes
   du fond sautent de côté, des lignes rouge/cyan apparaissent et un peu de neige. Les avatars, eux, ont
   chacun leurs propres coupures courtes (classe .glitching). */
const gl = { until: 0, next: 0, slices: [] };
// Petite texture de neige (gris aléatoires), partagée par le fond, les avatars et les pseudos « neige télé »
let noiseCv = null;
function noiseCanvas() {
  if (noiseCv) return noiseCv;
  noiseCv = document.createElement("canvas");
  noiseCv.width = noiseCv.height = 128;
  const x = noiseCv.getContext("2d"), img = x.createImageData(128, 128);
  for (let k = 0; k < img.data.length; k += 4) { const v = Math.random() < 0.5 ? Math.random() * 90 : 160 + Math.random() * 95; img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255; }
  x.putImageData(img, 0, 0);
  document.body.style.setProperty("--noise", `url(${noiseCv.toDataURL()})`);
  return noiseCv;
}
noiseCanvas();
function glitchFrame(t, energy) {
  const mode = S.glitch || "off";
  if (mode === "off" || reduced) {
    if (gl.on) { gl.on = false; $("#bgSnow").style.opacity = "0"; document.body.classList.remove("glitch-burst"); for (const x of tiles.values()) x.el.classList.remove("glitching"); }
    return;
  }
  const amt = S.glitchAmt || 0.5;
  const loud = S.glitchVoice && energy > 0.55;
  if (t > gl.next || (loud && t > gl.until + 250 && Math.random() < 0.08 * amt)) {
    gl.until = t + 80 + Math.random() * 220 * amt;
    gl.next = t + (700 + Math.random() * 3200) / amt;
    gl.slices = [];
  }
  const burst = t < gl.until;
  gl.on = true;
  document.body.classList.toggle("glitch-burst", burst && (mode === "bg" || mode === "both"));
  $("#bgSnow").style.opacity = burst && S.glitchStyle === "snow" && (mode === "bg" || mode === "both") ? (0.3 + 0.45 * amt).toFixed(2) : "0";
  if ((mode === "bg" || mode === "both") && burst) {
    const W = cv.width, H = cv.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Bandes décalées : on garde les mêmes pendant un court instant (ça « accroche » au lieu de trembler)
    if (!gl.slices.length || Math.random() < 0.3) {
      gl.slices = Array.from({ length: 2 + Math.round(6 * amt) }, () => ({
        y: Math.random() * H, h: H * (0.008 + Math.random() * 0.07), dx: (Math.random() - 0.5) * W * 0.12 * amt,
      }));
    }
    for (const s of gl.slices) ctx.drawImage(cv, 0, s.y, W, s.h, s.dx, s.y, W, s.h);
    if (S.glitchStyle === "snow") {
      // La neige elle-même est sur un calque à part (#bgSnow), au-dessus du flou : elle reste nette
      ctx.restore();
    } else {
    ctx.globalCompositeOperation = "screen";
    for (const s of gl.slices.slice(0, 3)) {
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,40,110,.28)" : "rgba(40,230,255,.24)";
      ctx.fillRect(0, s.y + s.h * 0.4, W, Math.max(1, s.h * 0.12));
    }
    ctx.globalCompositeOperation = "source-over";
    // Neige
    ctx.fillStyle = "rgba(255,255,255,.5)";
    for (let i = 0; i < 160 * amt; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1);
    ctx.restore();
    }
  }
  const avOn = mode === "avatars" || mode === "both";
  for (const x of tiles.values()) {
    if (!avOn) { x.el.classList.remove("glitching"); continue; }
    if (!x.gNext) x.gNext = t + Math.random() * 3000 / amt;
    const kick = loud && x.lvl > 0.5 && Math.random() < 0.04 * amt;
    if (t > x.gNext || kick) { x.gUntil = t + 120 + Math.random() * 220; x.gNext = t + (900 + Math.random() * 4000) / amt; }
    x.el.classList.toggle("glitching", t < (x.gUntil || 0));
  }
}

/* ——— Mini-fenêtre ——— */
const miniGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const miniSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
function miniLook() {
  // L'overlay montre TOUT le salon, sans caméra qui file : personne ne sort de la fenêtre.
  // Son apparence se règle dans Paramètres › Overlay (la souris passe à travers : il ne se touche pas)
  const o = S.ov, vertical = o.layout !== "strip";
  S.layout = vertical ? "column" : "strip";
  S.players = 99; S.camera = false; S.zoom = 1;
  S.panel = false; S.musicOn = false;
  if (o.ring !== "same") S.ring = o.ring;
  S.names = !!o.names; S.hideMuted = !!o.hideMuted;
  if (!o.anim) S.avAnim = "off";
  document.body.style.opacity = Math.max(0.2, Math.min(1, +o.opacity || 1));
  const clear = true; // l'overlay est toujours entièrement transparent : seuls les avatars et les pseudos
  document.body.classList.toggle("mini-clear", clear);
  $("#miniClear").classList.toggle("on", clear);
  $("#miniLayout").classList.toggle("on", vertical);
  $("#miniLayout").title = vertical ? "Passer en bande (horizontal)" : "Passer en colonne (vertical)";
}
// Ctrl+O : overlay transparent ou non (dans la mini-fenêtre comme dans la grande)
function toggleMiniClear() {
  miniSet("hush-mini-clear", miniGet("hush-mini-clear") === "1" ? "0" : "1");
  if (MINI) { miniLook(); return; }
  if (!$("#miniBtn").classList.contains("on")) openMini();
  showToast(miniGet("hush-mini-clear") === "1" ? "Overlay transparent (Ctrl+O)" : "Overlay avec fond (Ctrl+O)");
}
addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "o") { e.preventDefault(); toggleMiniClear(); }
});
let ovPreviewT = 0;
function setupMini() {
  document.body.classList.add("mini");
  miniLook();
  apply();
  // Seulement ceux qui parlent : on retire ceux qui se sont tus depuis 3 s
  setInterval(() => { if (S.ov.onlyTalk) syncTiles(); }, 1000);
  let lastOv = JSON.stringify(S.ov);
  // La grande fenêtre change un réglage : on le reprend ici
  addEventListener("storage", (e) => {
    if (e.key === "hush-mini-clear" || e.key === "hush-mini-layout") { miniLook(); apply(); syncTiles(); return; }
    if (e.key !== "vocal-studio") return;
    try { S = { ...DEFAULTS, ...JSON.parse(e.newValue || "{}") }; } catch { return; }
    normS();
    // On règle l'overlay : son cadre s'affiche quelques secondes pour voir où il est
    const ov = JSON.stringify(S.ov);
    if (ov !== lastOv) {
      lastOv = ov;
      document.body.classList.add("ov-preview");
      clearTimeout(ovPreviewT);
      ovPreviewT = setTimeout(() => document.body.classList.remove("ov-preview"), 2500);
    }
    miniLook();
    apply();
    loadBgImg();
    syncTiles();
  });
  $("#miniClear").onclick = toggleMiniClear;
  $("#miniLayout").onclick = () => {
    miniSet("hush-mini-layout", miniGet("hush-mini-layout") === "strip" ? "column" : "strip");
    miniLook(); apply(); syncTiles();
  };
  // Déplacer / redimensionner à la main : la fenêtre peut sortir de l'écran, comme une fenêtre normale
  const drag = (el, mode) => el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || (mode === "move" && e.target.closest("button, .mini-grip"))) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    window.studio.win.drag("start", mode);
    const mv = () => window.studio.win.drag("move");
    const up = () => { window.studio.win.drag("end"); el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); };
    el.addEventListener("pointermove", mv);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  });
  drag($("#app"), "move");
  drag($("#miniGrip"), "size");
  // Marge transparente autour de l'overlay (pour les lueurs) : la page la laisse vide
  const pad = Number(new URLSearchParams(location.search).get("pad")) || 0;
  document.documentElement.style.setProperty("--mpad", pad + "px");
  // Mode « Déplacer » : glisser pour la place, molette pour la taille, Échap / clic droit / Terminé pour finir
  const editing = () => document.body.classList.contains("mini-editing");
  window.studio.win.onMiniEdit((on) => { document.body.classList.toggle("mini-editing", on); $("#miniEdit").hidden = !on; });
  $("#miniEditDone").addEventListener("pointerdown", (e) => e.stopPropagation());
  $("#miniEditDone").onclick = () => window.studio.win.overlayDone();
  addEventListener("keydown", (e) => { if (e.key === "Escape" && editing()) window.studio.win.overlayDone(); });
  addEventListener("contextmenu", (e) => { if (editing()) { e.preventDefault(); window.studio.win.overlayDone(); } });
  addEventListener("wheel", (e) => { if (editing()) { e.preventDefault(); window.studio.win.overlayResize(e.deltaY < 0 ? 1.06 : 1 / 1.06); } }, { passive: false });
  $("#miniHome").onclick = () => window.studio.win.focusMain();
  $("#miniClose").onclick = () => window.studio.win.close();
}
const openMini = async () => {
  const open = await window.studio.win.mini();
  syncOvBtn(open);
  $("#miniBtn").classList.toggle("on", open);
  $("#setMini").textContent = open ? "Fermer" : "Ouvrir";
};
$("#miniBtn").onclick = openMini;
$("#showHidden").onclick = () => { S.hiddenUsers = []; save(); syncTiles(); };
$("#setMini").onclick = openMini;
const syncOvBtn = (open) => { $("#homeOverlay").setAttribute("aria-checked", String(!!open)); $("#homeOverlay").querySelector("span").textContent = open ? "Overlay activé" : "Overlay désactivé"; };
window.studio.win.onMini((open) => { $("#miniBtn").classList.toggle("on", open); $("#setMini").textContent = open ? "Fermer" : "Ouvrir"; syncOvBtn(open); });
$("#homeOverlay").onclick = async () => { await openMini(); syncOvBtn($("#miniBtn").classList.contains("on")); };
$("#homeDiscord").onclick = () => window.open("discord://-/channels/@me");
// Bouton « Hush » accroché à Discord (Windows) : on/off dans Vidéo et fenêtre
if (!MINI) window.studio.win.discordBtn().then((c) => {
  if (!c || !c.supported) return;
  $("#discordBtnRow").hidden = false;
  $("#discordBtn").setAttribute("aria-checked", String(c.on));
  $("#discordBtn").onclick = async () => { const on = await window.studio.win.discordBtn($("#discordBtn").getAttribute("aria-checked") !== "true"); $("#discordBtn").setAttribute("aria-checked", String(on)); };
}).catch(() => {});
syncOvBtn(false);

/* ——— Linux (overlay layer-shell) : déplacer l'overlay à la souris, glisser pour la place, molette pour la taille.
   Le bouton n'apparaît que dans ce mode : rien ne change sous Windows et Mac. ——— */
if (!MINI) {
  const setEdit = (on) => {
    $("#ovEdit").textContent = on ? "Terminé" : "Déplacer";
    $("#ovEdit").classList.toggle("on", on);
    $("#ovEditHint").hidden = !on;
  };
  const showEdit = async (open) => {
    const can = open && (await window.studio.win.overlayCanEdit());
    $("#ovEditRow").hidden = !can;
    if (!can) setEdit(false);
  };
  $("#ovEdit").onclick = async () => setEdit(await window.studio.win.overlayEdit(!$("#ovEdit").classList.contains("on")));
  window.studio.win.onMini(showEdit);
  new MutationObserver(() => showEdit($("#miniBtn").classList.contains("on"))).observe($("#miniBtn"), { attributes: true, attributeFilter: ["class"] });
  window.studio.win.onOverlayEdit(setEdit);
  // L'overlay a été déplacé ou agrandi à la souris : on garde sa nouvelle place (coin haut gauche + écart)
  window.studio.win.onOverlayMoved((p) => {
    S.ov = { ...S.ov, pos: p.pos, x: p.x, y: p.y, w: p.w, h: p.h, screen: p.screen ?? S.ov.screen };
    apply();
  });
}

/* ——— Panneau Overlay : emplacement et affichage ——— */
const OV_SWITCHES = { ovNames: "names", ovAnim: "anim", ovOnlyTalk: "onlyTalk", ovHideMuted: "hideMuted" };
const OV_SEGS = { ovPos: "pos", ovLayout: "layout", ovRing: "ring" };
const OV_RANGES = { ovX: ["x", (v) => v + " px"], ovY: ["y", (v) => v + " px"], ovW: ["w", (v) => v + " px"], ovH: ["h", (v) => v + " px"], ovOpacity: ["opacity", (v) => Math.round(v * 100) + " %"] };
const setOv = (k, v) => { S.ov = { ...S.ov, [k]: v }; apply(); };
let ovSent = "";
function ovUi() {
  if (window.linuxRuleRefresh) linuxRuleRefresh();
  if (MINI) return;
  const o = S.ov;
  for (const [id, k] of Object.entries(OV_SWITCHES)) $("#" + id).setAttribute("aria-checked", !!o[k]);
  for (const [id, k] of Object.entries(OV_SEGS)) $("#" + id).querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x.dataset.v === o[k]));
  for (const [id, [k, fmt]] of Object.entries(OV_RANGES)) { $("#" + id).value = o[k]; $("#" + id + "Out").textContent = fmt(+o[k]); }
  // Au centre, le décalage n'a pas de sens dans ce sens-là
  $("#ovXRow").hidden = o.pos[1] === "c"; $("#ovYRow").hidden = o.pos[0] === "m";
  if ($("#ovScreen").value !== String(o.screen)) $("#ovScreen").value = String(o.screen);
  const sent = JSON.stringify([o.pos, o.x, o.y, o.w, o.h, o.screen]);
  if (sent !== ovSent) { ovSent = sent; window.studio.win.overlay({ pos: o.pos, x: o.x, y: o.y, w: o.w, h: o.h, screen: o.screen }); }
}
if (!MINI) {
  for (const [id, k] of Object.entries(OV_SWITCHES)) $("#" + id).onclick = () => setOv(k, !S.ov[k]);
  for (const [id, k] of Object.entries(OV_SEGS)) $("#" + id).querySelectorAll("button").forEach((b) => (b.onclick = () => setOv(k, b.dataset.v)));
  for (const [id, [k]] of Object.entries(OV_RANGES)) $("#" + id).oninput = (e) => setOv(k, +e.target.value);
  $("#ovScreen").onchange = (e) => setOv("screen", +e.target.value);
  // Liste des écrans branchés (le principal en premier si un seul)
  window.studio.win.screens().then((list) => {
    const sel = $("#ovScreen");
    sel.textContent = "";
    (list || []).forEach((d) => { const op = document.createElement("option"); op.value = String(d.i); op.textContent = d.label; sel.appendChild(op); });
    $("#ovScreenRow").hidden = (list || []).length < 2;
    if (S.ov.screen >= (list || []).length) S.ov = { ...S.ov, screen: 0 };
    ovSent = ""; ovUi();
  });
}


/* ——— Linux : mode d'affichage et règle de fenêtre pour l'overlay ———
   Sous Wayland, une appli ne peut pas se placer elle-même au-dessus des autres ni choisir sa position :
   c'est le gestionnaire de fenêtres qui décide. On donne donc la bonne règle pour le bureau détecté. */
const LINUX_RULES = {
  niri: {
    file: "~/.config/niri/config.kdl",
    // Sous niri, c'est la règle qui place l'overlay : elle reprend le coin, l'écart et la taille de l'onglet Overlay
    get text() {
      const o = (S && S.ov) || {};
      const rel = { tl: "top-left", tc: "top", tr: "top-right", ml: "left", mr: "right", bl: "bottom-left", bc: "bottom", br: "bottom-right" }[o.pos || "tl"];
      const x = o.pos && o.pos[1] === "c" ? 0 : o.x ?? 24, y = o.pos && o.pos[0] === "m" ? 0 : o.y ?? 24;
      return `// Hush : l'overlay flotte au-dessus des fenêtres, sans fond ni bordure, sans prendre le clavier
// (place et taille reprises de Hush › Paramètres › Overlay en jeu : recopie la règle si tu les changes)
window-rule {
    match title="^Hush · mini$"
    open-floating true
    open-focused false${rel ? `
    default-floating-position x=${x} y=${y} relative-to="${rel}"` : ""}
    default-column-width { fixed ${o.w || 280}; }
    default-window-height { fixed ${o.h || 420}; }
    draw-border-with-background false
    focus-ring { off; }
    border { off; }
    shadow { off; }
    // Pas de flou derrière l'overlay, même si une autre règle floute toutes les fenêtres (niri 26.04 ou plus récent)
    background-effect { blur false; }
}`;
    },
    tip: "Avec cette règle, l'overlay flotte au-dessus des fenêtres, et Hush le fait suivre sur chaque bureau où tu vas. Pour le déplacer : Mod + glisser.",
  },
  hyprland: {
    file: "~/.config/hypr/hyprland.conf",
    text: `# Hush : l'overlay flotte, reste au-dessus sur tous les bureaux, sans bordure ni flou
windowrulev2 = float, title:^(Hush · mini)$
windowrulev2 = pin, title:^(Hush · mini)$
windowrulev2 = noborder, title:^(Hush · mini)$
windowrulev2 = noblur, title:^(Hush · mini)$
windowrulev2 = noshadow, title:^(Hush · mini)$`,
    tip: "Pour la déplacer : Super + glisser.",
  },
  sway: {
    file: "~/.config/sway/config",
    text: `# Hush : l'overlay flotte et reste visible sur tous les bureaux
for_window [title="^Hush · mini$"] floating enable, sticky enable, border none`,
    tip: "Pour la déplacer : Mod + glisser.",
  },
};
(async () => {
  const info = await window.studio.linux.info();
  if (!info || MINI) return;
  $("#linuxGroup").hidden = false;
  const seg = $("#linuxModeSeg");
  const show = (m) => seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === m));
  show(info.mode);
  seg.querySelectorAll("button").forEach((b) => (b.onclick = async () => {
    await window.studio.linux.setMode(b.dataset.v);
    show(b.dataset.v);
    showToast("Changement pris en compte au prochain lancement (lancer-hush.sh)");
  }));
  // X11 sur un bureau Wayland (niri, Hyprland, Sway passent alors par XWayland) : la transparence devient du noir.
  // On le dit clairement, avec un bouton pour passer en Wayland.
  const wl = ["niri", "hyprland", "sway"].includes(info.desktop);
  if (wl && info.mode !== "wayland") {
    $("#linuxWarn").hidden = false;
    $("#linuxWarnBtn").onclick = async () => { await window.studio.linux.setMode("wayland"); show("wayland"); $("#linuxWarn").hidden = true; showToast("Wayland choisi : relance Hush pour l'appliquer"); };
  }
  const rule = LINUX_RULES[info.desktop];
  if (rule) {
    $("#linuxRuleLabel").textContent = `Règle pour l'overlay · ${info.desktop} (à ajouter dans ${rule.file})`;
    $("#linuxRule").textContent = rule.text;
    $("#linuxRuleHint").textContent = rule.tip;
    $("#linuxCopy").onclick = () => { $("#linuxRule").textContent = rule.text; window.studio.voice.copy(rule.text); showToast("Règle copiée : colle-la dans " + rule.file); };
    // La place de l'overlay change dans l'onglet Overlay : la règle affichée suit
    window.linuxRuleRefresh = () => { $("#linuxRule").textContent = rule.text; };
  } else {
    $("#linuxRule").hidden = $("#linuxCopy").hidden = true;
    $("#linuxRuleLabel").textContent = `Bureau : ${info.desktop}`;
    $("#linuxRuleHint").textContent = "Sur KDE et GNOME, l'overlay reste au-dessus tout seul (bouton épingle).";
  }
})();

/* ——— Démarrage ——— */
I18N.start();
// Mac : les raccourcis se font avec Cmd (Ctrl+clic y ouvre le menu du clic droit). Les textes suivent,
// après la traduction (sinon l'anglais ne retrouverait plus ses phrases).
if (/Mac/.test(navigator.platform || navigator.userAgent)) {
  const cmd = (n) => {
    if (n.nodeType === 3) { if (/\bCtrl\+/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/\bCtrl\+/g, "Cmd+"); }
    else if (n.nodeType === 1 && !/^(SCRIPT|STYLE)$/.test(n.tagName)) {
      for (const a of ["title", "aria-label"]) { const v = n.getAttribute(a); if (v && /\bCtrl\+/.test(v)) n.setAttribute(a, v.replace(/\bCtrl\+/g, "Cmd+")); }
      n.childNodes.forEach(cmd);
    }
  };
  cmd(document.body);
  new MutationObserver((list) => { for (const m of list) m.type === "childList" ? m.addedNodes.forEach(cmd) : cmd(m.target); })
    .observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["title", "aria-label"] });
}
document.querySelectorAll("#langSeg button").forEach((b) => {
  b.setAttribute("aria-pressed", b.dataset.l === I18N.chosen);
  b.onclick = () => { I18N.set(b.dataset.l); window.studio.win.reload(); };
});
$("#privacyOpen").onclick = () => window.studio.account.privacy();
// Suppression du compte : deux clics, puis plus rien sur le serveur
$("#deleteData").onclick = async (e) => {
  const b = e.currentTarget;
  if (!b.dataset.sure) {
    b.dataset.sure = "1";
    showToast("Clique encore pour tout supprimer. C'est définitif.");
    setTimeout(() => delete b.dataset.sure, 5000);
    return;
  }
  delete b.dataset.sure;
  const r = await window.studio.account.remove();
  showToast(r.error || "Tes données sont supprimées.");
};
if (!MINI) {
  Lens.pill(document.querySelector(".hs-tabs"), "aria-pressed");
  // (les onglets du bas sont maintenant du texte, sans rond de verre)
  // (les salons de l'accueil ne sont plus dans un rond de verre)
}
$("#gfonts").media = "all"; // polices chargées sans bloquer le premier affichage
S.panel = false; // les paramètres s'ouvrent avec l'engrenage
loadBgImg();
apply();
refreshSpotify();
loadSounds();
sizeCanvas();
if (MINI) setupMini();
if (S.demo) setDemo(true);
else if (MINI) window.studio.voice.state().then((s) => { if (!S.demo) { state = s; syncTiles(); renderChrome(); } });
else window.studio.voice.start();
renderChrome();
document.fonts && document.fonts.ready.then(layout);
requestAnimationFrame(frame);
