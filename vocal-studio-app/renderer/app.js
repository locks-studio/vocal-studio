const $ = (s) => document.querySelector(s);
const stage = $("#stage");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ——— Préférences visuelles ——— */
const SKINS = {
  nuit: { label: "Nuit", a: "#ffffff", b: "#9aa3b8", bg: "#000000" },
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
  hex: { r: "0", c: "polygon(25% 3%,75% 3%,100% 50%,75% 97%,25% 97%,0 50%)" },
};
const DEFAULTS = { skin: "nuit", layout: "strip", shape: "round", bg: "space", glow: 70, speed: 1, accent: null, names: true, cards: true, hideMuted: false, panel: true, demo: false, players: 7,
  ring: "gradient", pixel: false, camera: true, bgImage: null, musicOn: true, musicSource: "pc", volume: 0.8, playerColor: "cover", playerBg: "mosaic", zoom: 1, tab: "general", musicTitle: "MADARA-OST", musicCover: null };
let S = { ...DEFAULTS };
try { S = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("vocal-studio") || "{}") }; } catch {}
const save = () => {
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
  el.innerHTML = `<div class="av-wrap"><div class="ring"></div><div class="av"></div><div class="mute-badge"><svg viewBox="0 0 24 24"><path d="M12 4a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M4 4l16 16"/></svg></div></div>
    <div class="bars">${"<i></i>".repeat(5)}</div>
    <div class="name"><span></span><span class="chips"></span></div>`;
  const t = { el, bars: [...el.querySelectorAll(".bars i")], chips: el.querySelector(".chips"), lvl: 0, seed: Math.random() * 10, data: {} };
  el.querySelector(".av").style.setProperty("--h", hue(m.id));
  return t;
}

function updateTile(t, m) {
  const av = t.el.querySelector(".av");
  if (t.data.avatar !== m.avatar || t.data.name !== m.name) {
    av.textContent = "";
    const img = document.createElement("img");
    img.alt = "";
    // Sans photo de profil (ou si elle ne charge pas) : logo sur la couleur du joueur
    const fallback = () => { av.classList.add("default"); img.src = "assets/discord-logo.png"; img.onerror = null; };
    if (m.avatar) { av.classList.remove("default"); img.src = m.avatar; img.onerror = fallback; }
    else fallback();
    av.appendChild(img);
    t.el.querySelector(".name span").textContent = m.name;
    t.el.title = m.name;
  }
  t.chips.innerHTML = m.deaf ? `<span class="chip">Sourdine</span>` : m.muted ? `<span class="chip">Muet</span>` : "";
  t.el.classList.toggle("muted", m.muted || m.deaf);
  t.el.classList.toggle("deaf", m.deaf);
  t.el.classList.toggle("me", !!(state.me && m.id === state.me.id));
  t.data = { ...m };
}

const PLAYER_HUES = [235, 8, 150, 45, 285, 192, 330, 100, 25, 260, 170, 350, 60, 210, 305, 125];
let lastOrder = "";
const lastSpoke = new Map();
function syncTiles() {
  const meId = state.me && state.me.id;
  // Toi en premier, puis l'ordre du salon, limité au nombre de joueurs choisi.
  // Ceux qui parlent (ou ont parlé il y a moins de 10 s) passent devant les muets pour avoir leur place.
  const now = Date.now();
  for (const m of state.members) if (m.speaking) lastSpoke.set(m.id, now);
  const ordered = [...state.members].sort((a, b) => (b.id === meId) - (a.id === meId));
  const recent = (m) => m.id === meId || now - (lastSpoke.get(m.id) || 0) < 10_000;
  const keep = new Set([...ordered.filter(recent), ...ordered.filter((m) => !recent(m))].slice(0, S.players).map((m) => m.id));
  const list = ordered.filter((m) => keep.has(m.id));
  const ids = new Set(list.map((m) => m.id));
  for (const [id, t] of tiles) if (!ids.has(id)) { t.el.remove(); tiles.delete(id); }
  for (const m of list) {
    let t = tiles.get(m.id);
    if (!t) { t = createTile(m); tiles.set(m.id, t); stage.appendChild(t.el); }
    updateTile(t, m);
  }
  const order = list.map((m) => m.id).join(",");
  if (order !== lastOrder) { lastOrder = order; list.forEach((m) => stage.appendChild(tiles.get(m.id).el)); }
  // Couleurs bien différentes d'un joueur à l'autre, en partant du bleu Discord pour toi
  list.forEach((m, i) => tiles.get(m.id).el.querySelector(".av").style.setProperty("--h", PLAYER_HUES[i % PLAYER_HUES.length]));
  layout();
}

/* ——— En-tête, barre d'appel, écrans ——— */
const STATUS = {
  idle: ["", "Hors ligne"], "needs-config": ["warn", "À configurer"], "needs-login": ["warn", "Connexion requise"], "bot-absent": ["warn", "Bot absent du salon"], connecting: ["warn", "Connexion…"],
  authorizing: ["warn", "Autorisation…"], ready: ["ok", "Connecté à Discord"], disconnected: ["err", "Discord fermé"],
  error: ["err", "Erreur"], demo: ["ok", "Mode démo"],
};
function renderChrome() {
  const [cls, label] = STATUS[state.status] || STATUS.idle;
  $("#status").innerHTML = `<i class="dot ${cls}"></i> `;
  $("#status").append(label);
  const ch = state.channel;
  $("#chanName").textContent = ch ? ch.name : "Hush";
  $("#coreName").textContent = ch ? ch.name : "Hush";
  $("#guild").textContent = ch && ch.guild ? ch.guild : "";
  $("#count").textContent = ch ? `${state.members.length} dans le salon` : "";
  document.title = ch ? `${ch.name} · Hush` : "Hush";

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
  renderScreen();
}

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
    card.append(el("div", { class: "spinner" }), el("h3", {}, isBot ? "Serveur Hush injoignable" : "Discord est fermé"),
      el("p", {}, isBot ? "Vérifie ta connexion internet. Hush réessaie toutes les 5 secondes." : "Ouvre Discord sur ce PC. Hush se reconnecte toutes les 5 secondes."),
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
  segBtn("local", "Connexion directe");

  // Mode bot : juste l'adresse du serveur Hush
  const botBox = el("div", { class: "setup-box" });
  botBox.append(el("p", {}, "Le bot Hush rejoint ton salon vocal et transmet qui parle. Ça marche pour tout le monde, il suffit que le bot soit invité sur le serveur."),
    f("Adresse du serveur Hush", "cfgServer", cfg.botServer || "http://localhost:8787", { placeholder: "https://…" }));

  // Mode direct (RPC) : réservé à toi et à tes testeurs
  const localBox = el("div", { class: "setup-box" });
  const intro = el("p");
  intro.append("Réservé au propriétaire de l'appli Discord et à ses testeurs. Colle les identifiants de la page OAuth2 du ");
  intro.append(el("a", { href: "https://discord.com/developers/applications", target: "_blank" }, "portail développeur Discord"), ".");
  localBox.append(intro,
    f("Client ID", "cfgId", cfg.clientId, { inputmode: "numeric", placeholder: "123456789012345678" }),
    f("Client Secret", "cfgSecret", "", { type: "password", placeholder: cfg.hasSecret ? "Déjà enregistré (laisse vide pour le garder)" : "Colle le secret ici" }),
    f("URL de redirection (la même que sur le portail)", "cfgRedirect", cfg.redirectUri));

  function show() {
    seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === mode));
    botBox.hidden = mode !== "bot";
    localBox.hidden = mode !== "local";
    $("#cfgServer").required = mode === "bot";
    $("#cfgId").required = mode === "local";
    $("#cfgSecret").required = mode === "local" && !cfg.hasSecret;
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
window.studio.voice.onState((s) => {
  if (S.demo) return;
  state = s;
  syncTiles();
  renderChrome();
});

const DEMO_NAMES = ["Nova", "Kenji", "Sasha", "Milo", "Inès", "Rayan", "Luzz", "Imo", "Sanji", "Elo", "Nura", "Maroa", "Kaze", "Yuna", "Orel"];
// Joueurs fictifs : toi + autant d'autres que le réglage « Joueurs affichés »
function demoMembers(keep = []) {
  const old = new Map(keep.map((m) => [m.id, m]));
  return [{ id: "me", name: "Toi", avatar: null, muted: false, deaf: false, speaking: false },
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
      status: "demo", error: null, me: { id: "me", name: "Toi" },
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
      });
    }, 380);
    syncTiles(); renderChrome();
  } else if (!silent) {
    state = { ...state, status: "connecting", channel: null, members: [] };
    syncTiles(); renderChrome();
    window.studio.voice.start();
  }
}
function demoMe() { return state.members.find((m) => m.id === "me"); }

/* ——— Boutons d'appel ——— */
$("#mic").onclick = () => {
  const { mute, deaf } = state.settings;
  if (S.demo) {
    state.settings = deaf ? { mute: false, deaf: false } : { mute: !mute, deaf: false };
    Object.assign(demoMe(), { muted: state.settings.mute, deaf: false });
    syncTiles(); return renderChrome();
  }
  if (deaf) window.studio.voice.deaf(false); else window.studio.voice.mute(!mute);
};
$("#deaf").onclick = () => {
  const deaf = !state.settings.deaf;
  if (S.demo) {
    state.settings = { mute: deaf, deaf };
    Object.assign(demoMe(), { muted: deaf, deaf });
    syncTiles(); return renderChrome();
  }
  window.studio.voice.deaf(deaf);
};
$("#leave").onclick = () => {
  if (S.demo) return setDemo(false);
  window.studio.voice.leave();
};

/* ——— Fenêtre ——— */
let pinned = false;
const togglePin = async () => { pinned = await window.studio.win.pin(!pinned); $("#pin").classList.toggle("on", pinned); $("#setPin").setAttribute("aria-checked", pinned); };
$("#pin").onclick = togglePin;
$("#setPin").onclick = togglePin;
$("#setFull").onclick = () => window.studio.win.fullscreen();
document.querySelectorAll("#tabs [data-tab]").forEach((b) => (b.onclick = () => { S.tab = b.dataset.tab; apply(); }));
$("#settingsClose").onclick = () => { S.panel = false; apply(); };
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
function layout() {
  stage.className = "stage " + S.layout;
  mainEl.classList.toggle("cam-move", camLayout());
  if (!camLayout()) { view.lock = null; view.y = 0; }
  const n = Math.max(1, tiles.size);
  const W = stage.clientWidth, H = stage.clientHeight;
  // Grille : on cherche le nombre de colonnes qui donne les plus grands avatars
  let size = 0;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    size = Math.max(size, Math.min((W - (cols - 1) * 14) / cols, (H - (rows - 1) * 14) / rows / 1.35));
  }
  if (S.layout === "orbit") size = Math.min(size, (Math.min(W, H) * 2.4) / Math.max(n, 3));
  stage.style.setProperty("--tile", Math.round(Math.max(60, Math.min(size * S.zoom, 320 * S.zoom))) + "px");
  const ring = $("#ring");
  const list = [...stage.querySelectorAll(".tile")].filter((e) => e.offsetParent !== null || S.layout !== "orbit");
  for (const t of tiles.values()) {
    t.el.style.left = t.el.style.top = t.el.style.transform = "";
    t.el.classList.toggle("focus", S.layout === "scene" && t.data.id === focusId);
  }
  $("#music").hidden = !(S.musicOn && hasMusic());
  $("#lyricsScene").hidden = S.layout !== "lyrics";
  for (const t of tiles.values()) t.el.style.filter = t.el.style.zIndex = t.el.style.opacity = "";
  if (S.layout === "cinema") {
    const c = Math.round(Math.max(80, Math.min(H * (n <= 2 ? 0.62 : n <= 4 ? 0.52 : 0.45), W * (n <= 2 ? 0.3 : 0.24), 420) * S.zoom));
    stage.style.setProperty("--ctile", c + "px");
  } else if (S.layout === "strip") {
    // Caméra active : on vise une personne à la fois, inutile que tout le monde tienne à l'écran
    const fit = S.camera ? Math.min(n, 5) : n;
    const c = Math.round(Math.max(60, Math.min(H * 0.5, (W * 0.9) / (fit * 1.18), 400) * S.zoom));
    stage.style.setProperty("--ctile", c + "px");
  } else {
    stage.style.removeProperty("--ctile");
  }
  if (S.layout !== "orbit" || !list.length) return;
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
const SEGS = [["#layoutSeg", "layout"], ["#shapeSeg", "shape"], ["#ringSeg", "ring"], ["#bgSeg", "bg"], ["#musicSrcSeg", "musicSource"], ["#playerColorSeg", "playerColor"], ["#playerBgSeg", "playerBg"]];
SEGS.forEach(([id, key]) =>
  $(id).querySelectorAll("button").forEach((b) => (b.onclick = () => {
    S[key] = b.dataset.v;
    apply();
    if (key === "bg" && S.bg === "image" && !S.bgImage) $("#bgFile").click();
  })));

/* ——— Musique en cours : Ce PC (Deezer…), compte Spotify ou saisie à la main ——— */
let music = { status: "off", error: null, track: null }, sentSource = null;
// Démarre la bonne source côté application quand la carte ou la source change
function syncMusicSource() {
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
  const card = $("#music");
  card.classList.toggle("playing", t ? !!t.playing : S.musicSource === "manual");
  card.classList.toggle("passive", S.musicSource !== "files");
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
function loadBgImg() {
  bgImg = null;
  if (!S.bgImage) return;
  const i = new Image();
  i.onload = () => { bgImg = i; };
  i.src = S.bgImage;
}
$("#bgPick").onclick = () => $("#bgFile").click();
$("#bgFile").onchange = (e) => { const f = e.target.files[0]; if (f) readImage(f, 1920, (d) => { S.bgImage = d; S.bg = "image"; loadBgImg(); apply(); }); };
$("#musicPick").onclick = () => $("#musicFile").click();
$("#musicFile").onchange = (e) => { const f = e.target.files[0]; if (f) readImage(f, 600, (d) => { S.musicCover = d; apply(); }); };
$("#musicTitleIn").oninput = (e) => { S.musicTitle = e.target.value; apply(); };
$("#musicOn").onclick = () => { S.musicOn = !S.musicOn; apply(); };
$("#mPlay").onclick = () => togglePlay();
$("#mPrev").onclick = () => nextSound(-1);
$("#mNext").onclick = () => nextSound(1);
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
$("#volume").oninput = (e) => { S.volume = +e.target.value; if (Sounds.audio) Sounds.audio.volume = S.volume; apply(); };
$("#presetMontage").onclick = () => {
  Object.assign(S, { skin: "vert", accent: null, layout: "cinema", shape: "round", ring: "solid", bg: "vignette", glow: 85, names: false, cards: false, musicOn: true });
  apply();
};
$("#presetBase").onclick = () => {
  Object.assign(S, { skin: "nuit", accent: null, layout: "strip", shape: "round", ring: "solid", bg: "space", glow: 70, names: true, pixel: false, cards: false, camera: true, musicOn: true });
  apply();
};
$("#presetBande").onclick = () => {
  Object.assign(S, { skin: "vert", accent: null, layout: "strip", shape: "round", ring: "solid", bg: "auto", glow: 75, names: true, pixel: true, cards: false, musicOn: false });
  apply();
};
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
const SWITCHES = ["camera", "names", "pixel", "cards", "hideMuted"];
SWITCHES.forEach((k) => ($("#" + k).onclick = () => { S[k] = !S[k]; apply(); }));

let colors = null;
function apply() {
  const b = document.body;
  b.dataset.skin = S.skin;
  b.style.setProperty("--glow", S.glow / 100);
  b.style.setProperty("--radius", SHAPES[S.shape].r);
  b.style.setProperty("--clip", SHAPES[S.shape].c);
  if (S.accent) b.style.setProperty("--accent", S.accent); else b.style.removeProperty("--accent");
  b.classList.toggle("no-names", !S.names);
  b.classList.toggle("cards", S.cards);
  b.classList.toggle("hide-muted", S.hideMuted);
  $("#settingsWrap").hidden = !S.panel;
  document.querySelectorAll("#tabs [data-tab]").forEach((x) => x.setAttribute("aria-selected", x.dataset.tab === S.tab));
  document.querySelectorAll(".tab-panel").forEach((x) => (x.hidden = x.dataset.tab !== S.tab));
  $("#zoomRange").value = S.zoom; $("#zoomOut").textContent = Math.round(S.zoom * 100) + " %";
  $("#setPin").setAttribute("aria-checked", pinned);
  b.classList.toggle("ring-solid", S.ring === "solid");
  $("#togglePanel").classList.toggle("on", S.panel);
  $("#bgPick").hidden = S.bg !== "image";
  $("#bgPick").textContent = S.bgImage ? "Changer l'image de fond" : "Choisir une image de fond";
  $("#musicOn").setAttribute("aria-checked", S.musicOn);
  $("#musicFields").hidden = !S.musicOn;
  if ($("#musicTitleIn").value !== S.musicTitle) $("#musicTitleIn").value = S.musicTitle;
  document.querySelectorAll(".music-fields[data-src]").forEach((x) => (x.hidden = x.dataset.src !== S.musicSource));
  syncMusicSource();
  updateMusicCard();
  skinsEl.querySelectorAll(".skin").forEach((x) => x.setAttribute("aria-pressed", x.dataset.v === S.skin));
  SEGS.forEach(([id, k]) =>
    $(id).querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x.dataset.v === S[k])));
  $("#glow").value = S.glow; $("#glowOut").textContent = S.glow + " %";
  $("#volume").value = S.volume; $("#volumeOut").textContent = Math.round(S.volume * 100) + " %";
  $("#players").value = S.players; $("#playersOut").textContent = String(S.players);
  $("#speed").value = S.speed; $("#speedOut").textContent = S.speed.toFixed(1).replace(".0", "") + "×";
  $("#accent").value = S.accent || SKINS[S.skin].a;
  SWITCHES.forEach((k) => $("#" + k).setAttribute("aria-checked", S[k]));
  b.classList.toggle("pixel", S.pixel);
  colors = null;
  save();
  requestAnimationFrame(layout);
}

/* ——— Fond animé ——— */
const cv = $("#bg"), ctx = cv.getContext("2d");
const dots = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 2 + 0.6, v: Math.random() * 0.4 + 0.1 }));
function sizeCanvas() {
  const d = Math.min(devicePixelRatio || 1, 2);
  cv.width = cv.clientWidth * d; cv.height = cv.clientHeight * d;
  ctx.setTransform(d, 0, 0, d, 0, 0);
}
addEventListener("resize", sizeCanvas);
function drawBg(t, energy) {
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!colors) {
    const cs = getComputedStyle(document.body);
    colors = { a: cs.getPropertyValue("--accent").trim(), b: cs.getPropertyValue("--accent2").trim() };
  }
  ctx.clearRect(0, 0, w, h);
  if (S.bg === "gradient") {
    // Dégradé sans motif : clair au centre, sombre sur les bords, dans la couleur d'accent
    const c = hexHsl(colors.a);
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) * 0.55);
    g.addColorStop(0, `hsl(${c.h} ${c.s}% ${Math.min(62, 40 + c.l * 0.12 + energy * 4)}%)`);
    g.addColorStop(0.55, `hsl(${c.h} ${c.s}% 26%)`);
    g.addColorStop(1, `hsl(${c.h} ${Math.min(c.s, 80)}% 11%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } else if (["space", "stars", "topo", "grid", "auto"].includes(S.bg)) {
    window.Patterns.draw(S.bg, ctx, w, h, t, energy, reduced ? 0 : S.speed);
  } else if (S.bg === "vignette" || (S.bg === "image" && bgImg)) {
    if (S.bg === "image") {
      // Image de fond qui zoome très lentement (effet Ken Burns)
      const z = 1.06 + 0.04 * Math.sin(t * 0.00012 * S.speed) + energy * 0.02;
      const k = Math.max(w / bgImg.width, h / bgImg.height) * z;
      const iw = bgImg.width * k, ih = bgImg.height * k;
      ctx.drawImage(bgImg, (w - iw) / 2 + 20 * Math.sin(t * 0.0001 * S.speed), (h - ih) / 2, iw, ih);
    } else {
      // Fond sombre teinté de rouge, qui respire avec les voix
      const g = ctx.createRadialGradient(w * 0.38, h * 0.5, 0, w * 0.38, h * 0.5, Math.max(w, h) * 0.75);
      g.addColorStop(0, `rgba(70,4,10,${0.55 + energy * 0.2})`);
      g.addColorStop(0.6, "rgba(25,2,4,.6)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.8);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.75)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
  } else if (S.bg === "aurora") {
    ctx.globalCompositeOperation = "lighter";
    [[colors.a, 0.3, 0.35, 0], [colors.b, 0.75, 0.65, 2], [colors.a, 0.6, 0.2, 4]].forEach(([c, x, y, o]) => {
      const px = w * (x + 0.12 * Math.sin(t * 0.00013 * S.speed + o)), py = h * (y + 0.1 * Math.cos(t * 0.00011 * S.speed + o));
      const rad = Math.max(w, h) * (0.38 + energy * 0.08);
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, c + "44"); g.addColorStop(1, c + "00");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
    ctx.globalCompositeOperation = "source-over";
  } else if (S.bg === "particles") {
    dots.forEach((d, i) => {
      if (!reduced) { d.y -= d.v * 0.0009 * S.speed * (1 + energy * 3); if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); } }
      ctx.beginPath(); ctx.arc(d.x * w, d.y * h, d.r * (1 + energy * 0.6), 0, 7);
      ctx.fillStyle = (i % 2 ? colors.a : colors.b) + "99"; ctx.fill();
    });
  }
}

/* ——— Caméra du mode Cinéma 3D ———
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
  const k = cam ? 1 : Math.min(1, (stage.clientWidth * 0.92) / (total * c * 1.25));
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
    it.el.style.transform = `rotateZ(${roll}deg) rotateY(${yaw}deg) translate3d(${x}px, ${y}px, ${z}px) scale(${k})`;
  });
}

/* ——— Changement de plan (nouvelle personne qui parle) ——— */
function onCut() {
  if (S.bg === "auto") window.Patterns.cut();
  if (S.layout === "strip" && S.camera) { zoomKick = 1; newShot(); }
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
const frameFix = { x: 0, y: 0 };
const shot = { yaw: 0, pitch: 12, curYaw: 0, curPitch: 12 };
function newShot() { shot.pitch = 9 + Math.random() * 7; }

function strip(t) {
  const c = parseFloat(stage.style.getPropertyValue("--ctile")) || 160;
  const list = [...tiles.values()].filter((x) => !(S.hideMuted && x.el.classList.contains("muted") && !x.el.classList.contains("me")));
  if (!list.length) return;
  const cam = S.camera && !reduced;
  const gap = c * 1.4;
  const live = new Map(state.members.map((m) => [m.id, m]));
  const talking = list.map((x, i) => ((live.get(x.data.id) || {}).speaking ? i : -1)).filter((i) => i >= 0);
  const fi = Math.max(0, list.findIndex((x) => x.data.id === focusId));

  // Cible : verrou (Ctrl+clic) > groupe qui parle > celui qui parle ; caméra coupée : tout le salon
  const lockI = list.findIndex((x) => x.data.id === view.lock);
  const group = lockI < 0 && talking.length >= 2 ? talking : null;
  const aim = lockI >= 0 ? lockI : !cam ? (list.length - 1) / 2 : group ? (Math.min(...group) + Math.max(...group)) / 2 : fi;
  const k = cam ? 1 : Math.min(1, (stage.clientWidth * 0.94) / (list.length * c * 1.26));

  if (stripX === null) { stripX = aim; stripV = 0; }
  if (viewFree() && view.x !== null) { stripX = view.x; stripV = 0; }
  else {
    // Ressort amorti : rapide au départ, arrive en douceur, sans dépasser la cible
    const spring = 0.012 * S.speed;
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
      x.el.style.transform =
        `translate(${frameFix.x.toFixed(1)}px, ${frameFix.y.toFixed(1)}px) rotate(${roll.toFixed(2)}deg) ` +
        `rotateX(${(-plunge).toFixed(2)}deg) rotateY(${shot.curYaw.toFixed(2)}deg) ` +
        `translate3d(${px.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotateY(${(-shot.curYaw * 0.7).toFixed(2)}deg) rotateX(${(plunge * 0.8).toFixed(2)}deg) ` +
        `scale(${(x.fs * z).toFixed(3)})`;
    } else {
      const px = (i - stripX) * c * 1.26 * k;
      x.el.style.transform = `translate(${px}px, ${y}px) scale(${x.fs * k})`;
    }
    x.el.style.opacity = "";
    x.el.style.filter = blur > 1.2 ? `blur(${blur.toFixed(1)}px)` : "";
    x.el.style.zIndex = String(100 - Math.round(Math.abs(i - stripX) * 2));
  });

  // Mesure : où sont vraiment affichés ceux qu'on veut voir ? On recentre et on ajuste le dézoom.
  if (!cam) { frameFix.x = frameFix.y = 0; return; }
  const targets = (lockI >= 0 ? [lockI] : group || [fi]).map((i) => list[i].el.querySelector(".av-wrap").getBoundingClientRect());
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
    const fill = Math.max((box.r - box.l) / (sr.width * 0.75), (box.b - box.t + c * 0.4) / (sr.height * 0.7));
    groupZoom = Math.max(0.45, Math.min(1, groupZoom * (1 + (1 - fill) * 0.06)));
  }
}

/* ——— Caméra libre ———
   Clic-glisser : déplace la caméra. Molette : zoom. Ctrl+clic sur quelqu'un : verrouille la caméra sur lui
   (Ctrl+clic à nouveau, ou sur le fond, pour libérer). Sans action pendant 2,5 s, la caméra repart toute seule. */
const FREE_MS = 2500;
const view = { dragging: false, px: 0, py: 0, until: 0, x: null, y: 0, zoom: 1, lock: null, slotPx: 200 };
const camLayout = () => S.layout === "strip" || S.layout === "cinema";
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
  if (!camLayout() || e.button !== 0 || e.target.closest(".dock, .mp, .screen")) return;
  const tileEl = e.target.closest(".tile");
  if (e.ctrlKey) {
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
  e.preventDefault();
  view.dragging = true;
  view.px = e.clientX; view.py = e.clientY;
  view.x = S.layout === "strip" ? stripX : camX;
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
  S.zoom = Math.round(Math.max(0.6, Math.min(1.8, z)) * 100) / 100;
  save();
  layout();
  $("#zoomRange").value = S.zoom; $("#zoomOut").textContent = Math.round(S.zoom * 100) + " %";
  if (!quiet) showToast(`Zoom ${Math.round(S.zoom * 100)} % · Ctrl+0 pour revenir à 100 %`);
}
mainEl.addEventListener("wheel", (e) => {
  if (e.target.closest(".screen, .mp") || S.layout === "lyrics") return;
  e.preventDefault();
  setZoom(S.zoom * (1 - e.deltaY * 0.0012));
}, { passive: false });
addEventListener("keydown", (e) => { if (e.ctrlKey && (e.key === "0" || e.code === "Numpad0")) { e.preventDefault(); setZoom(1); } });

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
    const speaking = !!(m && m.speaking);
    const n = 0.55 + 0.45 * Math.sin(t * 0.011 * S.speed + tile.seed) * Math.sin(t * 0.0047 * S.speed + tile.seed * 2);
    const target = speaking ? 0.35 + 0.65 * Math.abs(n) : 0;
    tile.lvl += (target - tile.lvl) * (reduced ? 1 : 0.2);
    tile.el.style.setProperty("--lvl", tile.lvl.toFixed(3));
    tile.el.classList.toggle("speaking", speaking);
    tile.bars.forEach((b, i) => {
      const s = tile.lvl * (0.35 + 0.65 * Math.abs(Math.sin(t * 0.018 * S.speed + i * 1.3 + tile.seed)));
      b.style.transform = `scaleY(${Math.max(0.12, s)})`;
    });
    energy += tile.lvl;
    if (speaking && (!loud || tile.lvl > loud.lvl)) loud = tile;
  }
  // Qui est « à l'image » : la voix la plus forte, sans changer plus vite qu'un plan de montage
  if (!focusId || !tiles.has(focusId)) { focusId = tiles.keys().next().value || null; if (S.layout === "scene") layout(); }
  const minShot = S.layout === "strip" ? 900 : 1600;
  if (loud && loud.data.id !== focusId && t - focusAt > minShot) {
    focusId = loud.data.id; focusAt = t;
    if (S.layout === "scene") for (const x of tiles.values()) x.el.classList.toggle("focus", x.data.id === focusId);
    onCut();
  }
  if (S.layout === "cinema") cinema(t);
  if (S.layout === "strip") strip(t);
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
    drawWave(t, lt ? lt.playing : S.musicSource === "manual");
  }
  if (S.layout === "lyrics") lyricsFrame(lt, pos * 1000);
  const names = state.members.filter((m) => m.speaking).map((m) => m.name);
  $("#talkers").textContent = names.length ? names.slice(0, 3).join(" & ") + (names.length > 1 ? " parlent" : " parle") : "personne ne parle";
  drawBg(t, Math.min(1, energy / 2));
  requestAnimationFrame(frame);
}

/* ——— Démarrage ——— */
S.panel = false; // les paramètres s'ouvrent avec l'engrenage
loadBgImg();
apply();
refreshSpotify();
loadSounds();
sizeCanvas();
if (S.demo) setDemo(true);
else window.studio.voice.start();
renderChrome();
document.fonts && document.fonts.ready.then(layout);
requestAnimationFrame(frame);
