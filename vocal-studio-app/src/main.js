const { app, BrowserWindow, ipcMain, safeStorage, shell, clipboard, desktopCapturer, screen, globalShortcut, Menu, Tray, nativeImage, Notification } = require("electron");
// ——— Sécurité : liens externes et pages ———
// Liens ouverts hors de l'appli : seulement https:// et discord:// (jamais file:, ms-settings:, javascript:…),
// même si une page ou un serveur piraté essayait d'en faire ouvrir un autre.
function safeOpen(url) {
  let u;
  try { u = new URL(String(url)); } catch { return; }
  if (u.protocol === "https:" || u.protocol === "discord:") shell.openExternal(u.toString());
}
// Toute page créée (fenêtres, overlay, pages cachées) : jamais de <webview>, jamais de nouvelle fenêtre, jamais de
// navigation vers un autre site, et seuls les fichiers créés par l'appli elle-même (blob:, data:) se téléchargent
const guardedSessions = new WeakSet();
app.on("web-contents-created", (_e, wc) => {
  wc.on("will-attach-webview", (e) => e.preventDefault());
  wc.on("will-navigate", (e, url) => { if (!url.startsWith("file://")) e.preventDefault(); });
  wc.setWindowOpenHandler(({ url }) => { safeOpen(url); return { action: "deny" }; });
  if (!guardedSessions.has(wc.session)) {
    guardedSessions.add(wc.session);
    wc.session.on("will-download", (e, item) => { if (!/^(blob|data):/.test(item.getURL())) e.preventDefault(); });
  }
});

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { VoiceSession } = require("./voice");
const { BotLink } = require("./botlink");
const { SpotifySession, REDIRECT: SPOTIFY_REDIRECT } = require("./spotify");
const { registerScheme, SoundLibrary } = require("./sounds");
const { WallpaperEngine } = require("./wallpaper-engine");
const wallpaperEngine = new WallpaperEngine();
const { UnixMedia } = require("./media-unix");

registerScheme();
const ICON = path.join(__dirname, "..", "build", "icon.png");
// Windows regroupe les fenêtres sous cet identifiant (et sous l'icône de Hush) dans la barre des tâches
if (process.platform === "win32") app.setAppUserModelId("fr.locks.hush");
let sounds;

// Le logiciel s'appelait « Vocal Studio » : si son dossier existe, Hush continue de l'utiliser
// (réglages, sons importés, connexions), sinon tout serait perdu avec le changement de nom
try {
  const oldDir = path.join(app.getPath("appData"), "vocal-studio");
  if (fs.existsSync(oldDir) && !process.argv.some((a) => a.startsWith("--user-data-dir="))) app.setPath("userData", oldDir);
} catch {}

// ——— Réglages enregistrés (le secret et le jeton sont chiffrés par Windows quand c'est possible) ———
const file = () => path.join(app.getPath("userData"), "config.json");
let data = {};
function load() {
  try { data = JSON.parse(fs.readFileSync(file(), "utf8")); } catch { data = {}; }
}
function persist() {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(data, null, 2));
}
function seal(value) {
  const s = JSON.stringify(value);
  if (safeStorage.isEncryptionAvailable()) return { enc: safeStorage.encryptString(s).toString("base64") };
  return { plain: s };
}
function unseal(box) {
  if (!box) return null;
  try {
    if (box.enc) return JSON.parse(safeStorage.decryptString(Buffer.from(box.enc, "base64")));
    if (box.plain) return JSON.parse(box.plain);
  } catch {}
  return null;
}

const store = {
  getConfig: () => ({
    clientId: data.clientId || "",
    clientSecret: unseal(data.clientSecret) || "",
    redirectUri: data.redirectUri || "http://localhost",
    // Sans Client Secret, la connexion directe passe par le serveur du bot pour l'échange du code (cas des amis)
    botServer: data.botServer || DEFAULT_BOT_SERVER,
    serverClientId: data.serverClientId || "",
  }),
  // Identifiant de l'appli Hush donné par le serveur : gardé pour se reconnecter même si le serveur est injoignable
  setServerClientId: (id) => { if (id && id !== data.serverClientId) { data.serverClientId = id; persist(); } },
  getToken: () => unseal(data.token),
  setToken: (t) => { data.token = seal(t); persist(); },
};

// Mode bot : adresse du serveur Hush et session de l'appli sur ce serveur
// Par défaut : le bot qui tourne sur le PC du créateur, ouvert à internet par un tunnel Tailscale,
// pour qu'un ami qui installe Hush n'ait rien à régler (plus tard : un VPS)
const DEFAULT_BOT_SERVER = "https://laptop-gl25nhmh.tail048932.ts.net";
const botStore = {
  getServer: () => data.botServer || DEFAULT_BOT_SERVER,
  getToken: () => unseal(data.botToken),
  setToken: (t) => { if (t) data.botToken = seal(t); else delete data.botToken; persist(); },
};

const spotifyStore = {
  getClientId: () => data.spotifyClientId || "",
  getToken: () => unseal(data.spotifyToken),
  setToken: (t) => { if (t) data.spotifyToken = seal(t); else delete data.spotifyToken; persist(); },
};

// ——— Musique : saisie manuelle, ce PC (Deezer, Spotify… via Windows) ou compte Spotify ———
let musicSource = "manual", mediaProc = null, spotify;
function sendMusic(patch) { send("music:state", { source: musicSource, ...patch }); }

function startPcMedia() {
  const script = path.join(__dirname, "media.ps1").replace("app.asar", "app.asar.unpacked");
  mediaProc = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Prefer", "deezer", "-ParentPid", String(process.pid)], { windowsHide: true });
  sendMusic({ status: "connected", error: null, track: null });
  let buf = "";
  mediaProc.stdout.setEncoding("utf8");
  mediaProc.stdout.on("data", (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        const m = JSON.parse(line);
        if (m.error) { sendMusic({ status: "connected", error: m.error }); continue; }
        const t = m.track;
        sendMusic({ status: "connected", error: null, track: t && t.title ? { ...t, at: t.updated || Date.now() } : null });
      } catch {}
    }
  });
  mediaProc.on("exit", () => { mediaProc = null; });
}
function stopPcMedia() {
  if (mediaProc) mediaProc.kill();
  mediaProc = null;
  if (unixMedia) unixMedia.stop();
  unixMedia = null;
}
// Linux et Mac : même source « Ce PC », lue autrement (MPRIS sous Linux, Spotify / Musique sous Mac)
let unixMedia = null;
function startUnixMedia() {
  sendMusic({ status: "connected", error: null, track: null });
  unixMedia = new UnixMedia((r) => {
    if (r.error) return sendMusic({ status: "connected", error: r.error, track: null });
    const t = r.track;
    sendMusic({ status: "connected", error: null, track: t && t.title ? { ...t, at: t.updated || Date.now() } : null });
  });
  unixMedia.start();
}

function setMusicSource(src) {
  musicSource = src;
  stopPcMedia();
  spotify.stop();
  if (src === "pc") {
    if (process.platform === "win32") startPcMedia();
    else startUnixMedia();
  } else if (src === "spotify") spotify.start();
  // « Mes sons » et « À la main » sont gérés directement par l'interface
  else sendMusic({ status: "off", error: null, track: null });
}

// ——— Fenêtre ———
// « session » est la source active : le bot (par défaut) ou la connexion directe RPC
let win, mini = null, session, localSession, botLink;
function useMode(mode) {
  if (session) session.stop();
  data.mode = mode === "local" ? "local" : "bot";
  session = data.mode === "local" ? localSession : botLink;
  // En connexion directe, on garde quand même le lien avec le bot si ton compte y est lié :
  // il sert au menu clic droit (pseudo, rôles, déplacer, muet serveur…) et à la page d'accueil
  if (session === localSession && botStore.getServer() && botStore.getToken()) botLink.start();
}
// Les nouvelles (salon, musique) vont à la fenêtre principale et à la mini-fenêtre si elle est ouverte
function send(channel, payload) {
  for (const w of [win, mini]) if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
}

// ——— Overlay (mini-fenêtre) : comme celui de Discord, au premier plan mais la souris passe à travers.
// Il ne prend jamais le clavier ni la souris au jeu ; sa place se règle dans Paramètres › Overlay.
// Créé transparent pour le mode « avatars seuls » (Windows ne permet pas de changer ça après coup).
let ovCfg = { pos: "tl", x: 24, y: 24, w: 280, h: 420, screen: 0 };
// niri : l'overlay suit tous les bureaux (voir niri.js)
const { NiriSticky } = require("./niri");
const niriSticky = new NiriSticky("Hush · mini");
function ovBounds() {
  const all = screen.getAllDisplays();
  const d = all[ovCfg.screen] || screen.getPrimaryDisplay();
  const a = d.bounds; // tout l'écran : un jeu en plein écran recouvre aussi la barre des tâches
  const w = Math.round(Math.min(a.width, Math.max(120, ovCfg.w))), h = Math.round(Math.min(a.height, Math.max(80, ovCfg.h)));
  const [row, col] = [ovCfg.pos[0], ovCfg.pos[1]];
  const fit = (v, lo, hi) => Math.round(Math.max(lo, Math.min(hi, v)));
  const x = col === "l" ? a.x + ovCfg.x : col === "r" ? a.x + a.width - w - ovCfg.x : a.x + (a.width - w) / 2;
  const y = row === "t" ? a.y + ovCfg.y : row === "b" ? a.y + a.height - h - ovCfg.y : a.y + (a.height - h) / 2;
  return { x: fit(x, a.x, a.x + a.width - w), y: fit(y, a.y, a.y + a.height - h), width: w, height: h };
}
// Marge transparente autour de l'overlay (Windows, Mac, Linux X11) : les lueurs des anneaux débordent sans être coupées
// par le bord de la fenêtre. La souris passe à travers, la marge ne gêne donc jamais.
const OV_PAD = 40;
const padded = (b) => ({ x: b.x - OV_PAD, y: b.y - OV_PAD, width: b.width + 2 * OV_PAD, height: b.height + 2 * OV_PAD });
// Linux Wayland : l'overlay sur la couche « overlay » du bureau, devant même le plein écran (voir layer-overlay.js)
const { LayerOverlay, layerSupported } = require("./layer-overlay");
let layerOv = null;
const placeMini = () => {
  if (!mini || mini.isDestroyed()) return;
  const b = ovBounds();
  if (!layerOv) return mini.setBounds(padded(b));
  mini.setContentSize(b.width, b.height);
  layerOv.place(b, screen.getDisplayMatching(b).bounds);
};
ipcMain.handle("overlay:set", (_e, c) => {
  if (!c || typeof c !== "object") return;
  const n = (v, d) => (Number.isFinite(+v) ? Math.max(0, Math.min(4000, Math.round(+v))) : d);
  ovCfg = {
    pos: /^[tmb][lcr]$/.test(c.pos) ? c.pos : "tl",
    x: n(c.x, 24), y: n(c.y, 24), w: n(c.w, 280), h: n(c.h, 420), screen: n(c.screen, 0),
  };
  placeMini();
});
const sendMain = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };
// Mode « Déplacer » (Linux, overlay layer-shell seulement) : l'overlay prend la souris le temps de le placer
// (glisser) et de régler sa taille (molette). Windows et Mac ne sont pas concernés : le bouton n'y apparaît pas.
ipcMain.handle("overlay:canEdit", () => !!(mini && !mini.isDestroyed()));
ipcMain.handle("overlay:edit", (_e, on) => {
  if (layerOv) { layerOv.edit(on); return !!on; }
  return miniEdit(!!on);
});
// Windows, Mac, Linux X11 : pendant « Déplacer », l'overlay prend la souris. On le glisse, la molette change sa taille,
// Échap / clic droit / « Terminé » finit. Sa nouvelle place est ensuite enregistrée dans les réglages.
let miniEditing = false;
function miniEdit(on) {
  if (!mini || mini.isDestroyed()) return false;
  miniEditing = on;
  mini.setIgnoreMouseEvents(!on);
  mini.setFocusable(on);
  if (on) mini.focus();
  mini.webContents.send("mini:edit", on);
  if (!on) {
    const b = mini.getBounds();
    const c = { x: b.x + OV_PAD, y: b.y + OV_PAD, width: b.width - 2 * OV_PAD, height: b.height - 2 * OV_PAD };
    const all = screen.getAllDisplays(), d = screen.getDisplayMatching(c);
    const i = Math.max(0, all.findIndex((x) => x.id === d.id));
    const place = { pos: "tl", x: Math.max(0, c.x - d.bounds.x), y: Math.max(0, c.y - d.bounds.y), w: c.width, h: c.height, screen: i };
    ovCfg = { ...ovCfg, ...place };
    sendMain("overlay:moved", place);
    sendMain("overlay:edit", false);
    placeMini();
  }
  return on;
}
ipcMain.handle("overlay:done", () => miniEdit(false));
// Molette pendant « Déplacer » : plus grand / plus petit, autour du centre
ipcMain.handle("overlay:resize", (_e, f) => {
  if (!miniEditing || !mini || mini.isDestroyed() || !Number.isFinite(+f)) return;
  const b = mini.getBounds(), k = Math.max(0.8, Math.min(1.25, +f));
  const w = Math.round(b.width - 2 * OV_PAD), h = Math.round(b.height - 2 * OV_PAD);
  const nw = Math.max(120, Math.min(2400, Math.round(w * k))), nh = Math.max(80, Math.min(1600, Math.round(h * k)));
  mini.setBounds({ x: Math.round(b.x - (nw - w) / 2), y: Math.round(b.y - (nh - h) / 2), width: nw + 2 * OV_PAD, height: nh + 2 * OV_PAD });
});
ipcMain.handle("overlay:screens", () => {
  const prim = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({ i, label: `Écran ${i + 1}${d.id === prim ? " (principal)" : ""} · ${d.size.width}×${d.size.height}` }));
});
// Ouverture / fermeture voulue par la personne (bouton, Ctrl+Maj+H, menu de l'icône) : on s'en souvient
function userToggleMini() {
  const open = toggleMini();
  data.overlayOpen = open; persist();
  send("win:mini", open);
  refreshTray();
  return open;
}
function toggleMini() {
  if (mini && !mini.isDestroyed()) { mini.close(); return false; }
  if (layerSupported()) { openLayerMini(); return true; }
  mini = new BrowserWindow({
    ...padded(ovBounds()), show: false, resizable: false, movable: false, focusable: false, skipTaskbar: true,
    frame: false, transparent: true, backgroundColor: "#00000000", hasShadow: false,
    alwaysOnTop: true, title: "Hush · mini", icon: ICON,
    // Mac : une fenêtre « panneau » flotte aussi au-dessus des jeux et des applis en plein écran
    ...(process.platform === "darwin" ? { type: "panel", fullscreenable: false } : {}),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // Au-dessus des jeux en « fenêtré sans bordure », et la souris passe à travers
  mini.setAlwaysOnTop(true, "screen-saver");
  mini.setIgnoreMouseEvents(true);
  // skipTransformProcessType : sans lui, l'icône de Hush disparaîtrait du Dock sur Mac
  if (process.platform !== "win32") mini.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  // Titre fixe « Hush · mini » : sous Linux, les règles des gestionnaires de fenêtres (niri, Hyprland, Sway) le ciblent
  mini.on("page-title-updated", (e) => e.preventDefault());
  mini.loadFile(path.join(__dirname, "..", "renderer", "index.html"), { query: { mini: "1", pad: String(OV_PAD) } });
  mini.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mini.webContents.on("will-navigate", (e) => e.preventDefault());
  mini.once("ready-to-show", () => {
    if (!mini) return;
    mini.setBackgroundColor("#00000000");
    if (process.platform === "win32" && mini.setBackgroundMaterial) mini.setBackgroundMaterial("none"); // jamais d'Acrylic derrière
    mini.showInactive(); // s'affiche sans voler le clavier au jeu
    placeMini();
  });
  mini.on("closed", () => { mini = null; miniEditing = false; niriSticky.stop(); send("win:mini", false); sendMain("overlay:edit", false); });
  niriSticky.start();
  return true;
}
// Version layer-shell : la mini-fenêtre est dessinée hors écran, et chaque image part vers layer-overlay.py.
// Pas besoin de niriSticky : la couche overlay est sur tous les bureaux de son écran.
function openLayerMini() {
  const b = ovBounds();
  mini = new BrowserWindow({
    width: b.width, height: b.height, show: false, frame: false, transparent: true, backgroundColor: "#00000000",
    title: "Hush · mini", useContentSize: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: true },
  });
  const ov = new LayerOverlay();
  layerOv = ov;
  // Le programme s'arrête (fermé par le bureau, plantage) : on ferme l'overlay pour que le bouton reste juste.
  // En mode « Déplacer », il renvoie la place choisie à la souris : la grande fenêtre l'enregistre dans les réglages.
  ov.start(() => { if (layerOv === ov && mini && !mini.isDestroyed()) mini.close(); }, (m) => {
    if (m.edit === false) return sendMain("overlay:edit", false);
    // Glissé vers un autre écran : on retrouve son numéro dans la liste des écrans de Hush
    const all = screen.getAllDisplays();
    const i = m.screen ? all.findIndex((d) => d.bounds.x === m.screen.x && d.bounds.y === m.screen.y) : -1;
    const scr = i >= 0 ? i : ovCfg.screen;
    ovCfg = { ...ovCfg, pos: "tl", x: m.x, y: m.y, w: m.w, h: m.h, screen: scr };
    if (mini && !mini.isDestroyed()) mini.setContentSize(m.w, m.h);
    sendMain("overlay:moved", { pos: "tl", x: m.x, y: m.y, w: m.w, h: m.h, screen: scr });
  });
  mini.webContents.setFrameRate(30);
  mini.webContents.on("paint", (_e, _dirty, image) => ov.frame(image));
  mini.loadFile(path.join(__dirname, "..", "renderer", "index.html"), { query: { mini: "1" } });
  mini.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mini.webContents.on("will-navigate", (e) => e.preventDefault());
  mini.on("closed", () => { mini = null; if (layerOv === ov) layerOv = null; ov.stop(); send("win:mini", false); });
  placeMini();
}
// Fenêtre qui a envoyé la demande (principale ou mini)
const winOf = (e) => BrowserWindow.fromWebContents(e.sender) || win;

function createWindow() {
  // Petit écran (ou zoom Windows à 150 %) : la fenêtre ne dépasse jamais de l'écran
  const wa = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.min(1180, wa.width - 40),
    height: Math.min(760, wa.height - 40),
    center: true,
    minWidth: 420,
    minHeight: 520,
    frame: false,
    backgroundColor: "#0d0b1a",
    title: "Hush",
    // Icône de la fenêtre et de la barre des tâches (sinon Windows montre celle d'Electron)
    icon: ICON,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Hush continue à tourner à pleine vitesse quand un jeu en plein écran le recouvre (réglage « Arrière-plan »)
      backgroundThrottling: !bgCfg().fullSpeed,
    },
  });
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  // Lancé au démarrage du PC : Hush reste dans la zone de notification, la fenêtre ne s'ouvre pas
  win.once("ready-to-show", () => { if (!START_HIDDEN) win.show(); });
  // Fermer la fenêtre : Hush continue en fond (overlay, bot, amis), sauf si on quitte vraiment
  win.on("close", (e) => {
    if (quitting || !bgCfg().keepRunning) return;
    e.preventDefault();
    win.hide();
    if (!data.bgNoticeShown && Notification.isSupported()) {
      data.bgNoticeShown = true; persist();
      new Notification({ title: "Hush continue en fond", body: "L'overlay et tes amis restent actifs. Clique sur l'icône de Hush près de l'horloge pour le rouvrir, ou clic droit › Quitter.", icon: ICON }).show();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://discord.com/") || url.startsWith("https://developer.spotify.com/")) safeOpen(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.on("maximize", () => send("win:state", { maximized: true }));
  win.on("unmaximize", () => send("win:state", { maximized: false }));
  win.on("closed", () => { if (mini && !mini.isDestroyed()) mini.close(); });
}

// ——— Temps d'utilisation ———
// usage.json (dossier de données de Hush) : lu par le launcher 1999 pour afficher le temps passé sur Hush.
// Chaque minute en vocal est aussi signalée au serveur du bot, pour le classement des plus gros utilisateurs.
const usageFile = () => path.join(app.getPath("userData"), "usage.json");
let usage = { appMinutes: 0, voiceMinutes: 0 };
function loadUsage() { try { usage = { ...usage, ...JSON.parse(fs.readFileSync(usageFile(), "utf8")) }; } catch {} }
function reportVoiceMinute() {
  // Lié au bot : par la connexion en direct. Sinon (connexion directe) : avec le jeton Discord, que le serveur vérifie.
  if (botLink && botLink.ws && botLink.ws.readyState === 1) return botLink.send({ type: "beat" });
  const t = store.getToken();
  if (session === localSession && t && t.access_token) {
    fetch(`${botStore.getServer().replace(/\/$/, "")}/usage/beat`, { method: "POST", headers: { Authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(8000) }).catch(() => {});
  }
}
function tickUsage() {
  usage.appMinutes += 1;
  const st = session && session.snapshot();
  if (st && st.status === "ready" && st.channel) { usage.voiceMinutes += 1; reportVoiceMinute(); }
  usage.updated = Date.now();
  try { fs.writeFileSync(usageFile(), JSON.stringify(usage)); } catch {}
}
ipcMain.handle("usage:me", () => usage);
ipcMain.handle("usage:top", async () => {
  try { return await fetch(`${botStore.getServer().replace(/\/$/, "")}/usage/top`, { signal: AbortSignal.timeout(8000) }).then((r) => r.json()); }
  catch { return null; }
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on("second-instance", (_e, argv) => {
  if (argv.includes("--cache")) return; // relancé au démarrage alors qu'il tourne déjà : rien à faire
  showMain();
});

// ——— En fond : zone de notification, démarrage avec le PC ———
// Réglages (config.json) : keepRunning = fermer la fenêtre garde Hush en fond ; autostart = lancé avec le PC ;
// fullSpeed = pas de ralentissement quand un jeu plein écran recouvre la fenêtre.
const START_HIDDEN = process.argv.includes("--cache") || process.env.HUSH_START_HIDDEN === "1";
delete process.env.HUSH_START_HIDDEN;
let quitting = false, tray = null;
app.on("before-quit", () => { quitting = true; });
app.on("activate", () => showMain()); // Mac : clic sur l'icône du Dock
const bgCfg = () => ({ keepRunning: true, autostart: true, fullSpeed: true, ...(data.background || {}) });
function showMain() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}
function refreshTray() {
  if (!tray) return;
  const c = bgCfg(), ovOpen = !!(mini && !mini.isDestroyed());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Ouvrir Hush", click: showMain },
    { label: ovOpen ? "Cacher l'overlay" : "Afficher l'overlay", accelerator: "CommandOrControl+Shift+H", click: () => userToggleMini() },
    { type: "separator" },
    { label: "Lancer Hush au démarrage du PC", type: "checkbox", checked: c.autostart, click: (i) => setBg({ autostart: i.checked }) },
    { label: "Garder Hush en fond quand je ferme la fenêtre", type: "checkbox", checked: c.keepRunning, click: (i) => setBg({ keepRunning: i.checked }) },
    { type: "separator" },
    { label: "Quitter Hush", click: () => { quitting = true; app.quit(); } },
  ]));
}
function createTray() {
  if (tray) return;
  try {
    const img = nativeImage.createFromPath(ICON).resize({ width: process.platform === "darwin" ? 18 : 32, height: process.platform === "darwin" ? 18 : 32, quality: "best" });
    tray = new Tray(img);
    tray.setToolTip("Hush");
    tray.on("click", showMain); // clic : ouvre Hush (clic droit : le menu)
    refreshTray();
  } catch {}
}
// Démarrage avec le PC. Lancé par le launcher 1999 (HUSH_LAUNCHER), c'est lui qu'on démarre : il ouvre toujours
// la dernière version de Hush et la garde à jour. Sinon, Hush lui-même. Toujours en mode caché (--cache).
function launcherPath() {
  const p = process.env.HUSH_LAUNCHER || data.launcherPath;
  if (process.env.HUSH_LAUNCHER && data.launcherPath !== process.env.HUSH_LAUNCHER) { data.launcherPath = process.env.HUSH_LAUNCHER; persist(); }
  return p && fs.existsSync(p) ? p : null;
}
function applyAutostart() {
  if (!app.isPackaged) return; // version de développement : jamais au démarrage du PC
  const on = bgCfg().autostart, l = launcherPath();
  const exe = l || process.execPath, args = l ? ["--lancer=hush", "--cache"] : ["--cache", ...(process.platform === "linux" ? ["--no-sandbox"] : [])];
  try {
    if (process.platform === "linux") {
      const dir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "autostart");
      const f = path.join(dir, "fr.locks.hush.desktop");
      if (!on) { fs.rmSync(f, { force: true }); return; }
      fs.mkdirSync(dir, { recursive: true });
      const q = (x) => `"${x.replace(/(["\\$`])/g, "\\$1")}"`;
      fs.writeFileSync(f, `[Desktop Entry]\nType=Application\nName=Hush\nExec=${[q(exe), ...args].join(" ")}\nIcon=hush\nX-GNOME-Autostart-enabled=true\nNoDisplay=true\n`);
    } else {
      app.setLoginItemSettings({ openAtLogin: on, path: exe, args, name: "Hush" });
    }
  } catch {}
}
function setBg(patch) {
  data.background = { ...bgCfg(), ...patch }; persist();
  if ("autostart" in patch) applyAutostart();
  if ("fullSpeed" in patch && win && !win.isDestroyed()) win.webContents.setBackgroundThrottling(!data.background.fullSpeed);
  refreshTray();
  send("bg:changed", bgCfg());
}
ipcMain.handle("bg:get", () => ({ ...bgCfg(), canAutostart: app.isPackaged }));
ipcMain.handle("bg:set", (_e, patch) => {
  const ok = {};
  for (const k of ["keepRunning", "autostart", "fullSpeed"]) if (patch && typeof patch[k] === "boolean") ok[k] = patch[k];
  setBg(ok);
  return bgCfg();
});

// ——— Erreurs ———
// Toujours notées dans crash.log (dossier de données). Envoyées au serveur seulement si la personne a accepté.
// Le chemin du dossier personnel est retiré, pour ne pas envoyer le nom de la session Windows.
const logPath = () => path.join(app.getPath("userData"), "crash.log");
const scrub = (s) => String(s == null ? "" : s).split(os.homedir()).join("~").replace(/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{20,}/g, "[masqué]");
const seenErr = new Map();
function report(where, e) {
  const message = scrub((e && e.message) || e), stack = scrub(e && e.stack);
  const key = where + message, now = Date.now();
  if (now - (seenErr.get(key) || 0) < 600_000 || seenErr.size > 50) return;
  seenErr.set(key, now);
  try {
    fs.appendFileSync(logPath(), `${new Date().toISOString()} [${where}] ${message}\n${stack ? stack + "\n" : ""}`);
    if (fs.statSync(logPath()).size > 200_000) fs.writeFileSync(logPath(), fs.readFileSync(logPath(), "utf8").slice(-100_000));
  } catch {}
  if (!data.reports) return;
  const r = { where, message, stack, version: app.getVersion(), os: `${process.platform} ${os.release()}` };
  if (botLink && botLink.ws && botLink.ws.readyState === 1) return botLink.send({ type: "report", report: r });
  if (botStore) fetch(`${botStore.getServer().replace(/\/$/, "")}/report`, { method: "POST", body: JSON.stringify(r), signal: AbortSignal.timeout(8000) }).catch(() => {});
}
process.on("uncaughtException", (e) => report("principal", e));
process.on("unhandledRejection", (e) => report("principal", e));
app.on("render-process-gone", (_e, _w, d) => report("page", `La page s'est arrêtée : ${d.reason}`));
app.on("child-process-gone", (_e, d) => { if (d.type === "GPU" && d.reason !== "clean-exit") report("carte graphique", `Processus graphique arrêté : ${d.reason}`); });
ipcMain.on("report:error", (_e, r) => report("page", r));
ipcMain.on("report:consent", (_e, on) => { data.reports = !!on; persist(); });
// Tout ce qu'il faut pour aider quelqu'un à distance, à coller dans un message
ipcMain.handle("report:copy", async () => {
  let gpu = "?", log = "";
  try { gpu = JSON.stringify(app.getGPUFeatureStatus()); } catch {}
  try { log = fs.readFileSync(logPath(), "utf8").slice(-3000); } catch {}
  const st = session && session.snapshot();
  clipboard.writeText(scrub([`Hush ${app.getVersion()} · ${process.platform} ${os.release()} · ${process.arch} · Electron ${process.versions.electron}`,
    `Bureau : ${process.env.XDG_CURRENT_DESKTOP || "-"} ${process.env.XDG_SESSION_TYPE || ""}`, `Connexion : ${data.mode} · ${st ? st.status : "?"} · ${(st && st.error) || "sans erreur"}`,
    `Carte graphique : ${gpu}`, "", "Dernières erreurs :", log || "aucune"].join("\n")));
  return true;
});

// Lancé par le launcher 1999 : il passe le compte déjà connecté. Hush le reprend et passe par le bot.
function launcherSession() {
  const t = process.env.HUSH_SESSION;
  delete process.env.HUSH_SESSION;
  if (!t || !/^[\w-]{20,100}$/.test(t)) return;
  botStore.setToken(t);
  // Le bot est la connexion par défaut. Une connexion directe qui n'a jamais marché (pas testeur) passe au bot ;
  // celle de quelqu'un dont elle fonctionne reste en place.
  if (data.mode === "local" && !store.getToken()) data.mode = "bot";
}

app.whenReady().then(() => {
  if (!gotLock) return;
  // Mac : la barre de menus en haut de l'écran. Sans menu « Édition », Cmd+C / Cmd+V ne marcheraient pas dans
  // les champs ; pas de « Présentation » pour que Cmd+R ou Cmd+0 ne rechargent ni ne dézooment Hush par erreur.
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]));
  }
  // Ctrl+Maj+H : afficher ou cacher l'overlay, même en pleine partie
  try { globalShortcut.register("CommandOrControl+Shift+H", () => userToggleMini()); } catch {}
  screen.on("display-metrics-changed", placeMini);
  screen.on("display-removed", placeMini);
  app.on("will-quit", () => globalShortcut.unregisterAll());
  load();
  loadUsage();
  setInterval(tickUsage, 60_000);
  sounds = new SoundLibrary(path.join(app.getPath("userData"), "sounds"));
  sounds.we = wallpaperEngine;
  sounds.serve();
  localSession = new VoiceSession(store, (state) => { if (session === localSession) send("voice:state", state); });
  launcherSession();
  botLink = new BotLink(botStore, (url) => safeOpen(url), (state) => { if (session === botLink) send("voice:state", state); });
  botLink.meta = { version: app.getVersion(), os: process.platform };
  botLink.onChat = (m) => send("chat:message", m);
  botLink.onFriends = () => send("friends:changed");
  botLink.onVideo = (m) => sendMain("video:signal", m);
  // Un ami t'invite dans son vocal : notification dans Hush (et la fenêtre clignote dans la barre des tâches)
  botLink.onInvite = (inv) => { send("friends:invite", inv); if (win && !win.isDestroyed() && !win.isFocused()) win.flashFrame(true); };
  useMode(data.mode);
  spotify = new SpotifySession(spotifyStore, (url) => safeOpen(url), (s) => {
    if (musicSource === "spotify") sendMusic(s);
  });
  // Micro (enregistrer un son) et caméra (l'afficher dans Hush) : rien d'autre
  const { session: electronSession } = require("electron");
  electronSession.defaultSession.setPermissionRequestHandler((_wc, permission, cb, details) => {
    cb(permission === "media" && (details.mediaTypes || []).every((t) => t === "audio" || t === "video"));
  });
  electronSession.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === "media");
  // Capture d'écran : seulement ce que l'interface vient de choisir (partage d'écran, ou la fenêtre Hush pour un clip)
  electronSession.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
    const p = capturePick;
    capturePick = null;
    if (!p) return cb({});
    try {
      // Wayland : getSources ouvre le sélecteur du système et rend ce que la personne y a choisi
      const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
      const src = p.id === "portal" ? sources[0] : sources.find((s) => s.id === p.id) || { id: p.id, name: "Hush" };
      if (!src) return cb({});
      // « loopback » : le son du PC (voix Discord, musique…) sous Windows
      cb(p.audio && process.platform === "win32" ? { video: src, audio: "loopback" } : { video: src });
    } catch { cb({}); }
  });
  createWindow();
  createTray();
  applyAutostart();
  if (data.overlayOpen) win.webContents.once("did-finish-load", () => { if (!(mini && !mini.isDestroyed())) { toggleMini(); send("win:mini", true); refreshTray(); } });
});
app.on("window-all-closed", () => {
  // Fenêtre fermée mais Hush gardé en fond : on ne quitte pas (la fenêtre est seulement cachée)
  if (!quitting && bgCfg().keepRunning && win && !win.isDestroyed()) return;
  if (localSession) localSession.stop();
  if (botLink) botLink.stop();
  stopPcMedia();
  if (spotify) spotify.stop();
  app.quit();
});

// ——— Échanges avec l'interface ———
ipcMain.handle("config:get", () => {
  const c = store.getConfig();
  return {
    mode: data.mode, botServer: botStore.getServer(), botConnected: !!botStore.getToken(),
    clientId: c.clientId, redirectUri: c.redirectUri, hasSecret: !!c.clientSecret,
  };
});
ipcMain.handle("config:save", (_e, { mode, botServer, clientId, clientSecret, redirectUri }) => {
  if (mode === "local") {
    if (clientId !== data.clientId) delete data.token;
    data.clientId = String(clientId || "").trim();
    data.redirectUri = String(redirectUri || "http://localhost").trim();
    if (clientSecret) data.clientSecret = seal(String(clientSecret).trim());
  } else {
    const server = String(botServer || "").trim().replace(/\/$/, "");
    if (server !== data.botServer) delete data.botToken;
    data.botServer = server;
  }
  useMode(mode);
  persist();
  session.start();
});
ipcMain.handle("config:logout", () => {
  if (session === botLink) return botLink.logout();
  delete data.token;
  persist();
  session.stop();
  session.start();
});
ipcMain.handle("bot:login", () => botLink.login());
// Faire venir le bot : aussi en connexion directe, par le lien au bot (s'il est relié), qui sait dans quel vocal tu es.
// Réponse : { ok } ou { ok: false, error } avec la raison exacte.
ipcMain.handle("voice:summon", async () => {
  if (!botLink || !botLink.ws || botLink.ws.readyState !== 1) return { ok: false, error: "Ton compte n'est pas lié au bot Hush : Accueil › Connexion › « Lier au bot »." };
  try { await botLink.summonWait(); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
});
// Rejoindre un vocal : directement par Discord (connexion directe), sinon on l'ouvre dans Discord
ipcMain.handle("voice:join", async (_e, c, g) => {
  if (!/^\d{5,25}$/.test(String(c)) || (g && !/^\d{5,25}$/.test(String(g)))) return false;
  if (session === localSession && localSession.ipc) { try { await localSession.join(String(c)); return true; } catch {} }
  safeOpen(`discord://-/channels/${g || "@me"}/${c}`);
  return true;
});

ipcMain.handle("voice:start", () => { session.stop(); session.start(); });
ipcMain.handle("voice:stop", () => session.stop());
ipcMain.handle("voice:state", () => session.snapshot());
ipcMain.handle("voice:mute", (_e, v) => session.setMute(!!v));
ipcMain.handle("voice:deaf", (_e, v) => session.setDeaf(!!v));
ipcMain.handle("voice:leave", () => session.leave());
// Menu clic droit sur un membre
ipcMain.handle("voice:user", async (_e, a) => {
  if (!a || !/^\d{5,25}$/.test(String(a.target || ""))) throw new Error("Membre inconnu.");
  // Volume et muet « pour toi » : Discord (connexion directe). Tout le reste : le bot.
  if (session === localSession && (a.action === "volume" || a.action === "localMute")) return localSession.userAction(a);
  return botLink.userAction(a);
});
// Tchat du salon vocal : passe par le lien au bot, aussi en connexion directe
const chatCall = async (op, text) => {
  if (!botLink || !botLink.ws || botLink.ws.readyState !== 1) return { error: "Lie ton compte au bot Hush pour voir le tchat : Accueil › Connexion › « Lier au bot »." };
  try { return { data: await botLink.chat(op, text) }; } catch (e) { return { error: e.message }; }
};
ipcMain.handle("chat:history", () => chatCall("history"));
ipcMain.handle("friends:op", async (_e, op, arg) => {
  if (!botLink || !botLink.ws || botLink.ws.readyState !== 1) return { error: "Lie ton compte au bot Hush : onglet Connexion › « Lier au bot »." };
  try { return { data: await botLink.friends(String(op), arg) }; } catch (e) { return { error: e.message }; }
});
// Vue administrateur : le serveur revérifie à chaque demande
ipcMain.handle("admin:op", async (_e, op) => {
  try { return { data: await botLink.adminOp(String(op)) }; } catch (e) { return { error: e.message }; }
});
ipcMain.on("friends:presence", (_e, voice) => { if (botLink) botLink.presence(voice); });
ipcMain.on("video:state", (_e, v) => { if (botLink) botLink.video(v); });
ipcMain.on("video:rtc", (_e, to, data) => { if (botLink && Number.isInteger(to)) botLink.rtc(to, data); });
ipcMain.handle("chat:send", (_e, text) => chatCall("send", String(text || "").slice(0, 1900)));
ipcMain.handle("account:delete", async () => {
  try { await botLink.friends("delete"); } catch (e) { return { error: e.message }; }
  botLink.logout();
  return { ok: true };
});
ipcMain.handle("voice:home", () => (botLink.ws ? botLink.home().catch(() => null) : null));
ipcMain.handle("bot:info", async () => {
  const i = await botLink.info();
  return i && { ...i, linked: !!(botLink.ws && botLink.ws.readyState === 1), admin: !!botLink.admin };
});
ipcMain.handle("discord:channel", (_e, g, c) => { if (/^\d{5,25}$/.test(String(g)) && /^\d{5,25}$/.test(String(c))) safeOpen(`discord://-/channels/${g}/${c}`); });
ipcMain.handle("discord:user", (_e, id) => { if (/^\d{5,25}$/.test(String(id))) safeOpen(`discord://-/users/${id}`); });
ipcMain.handle("clip:write", (_e, text) => clipboard.writeText(String(text).slice(0, 200)));
// Bouton « Coller » du code ami : seulement un peu de texte
ipcMain.handle("clip:read", () => clipboard.readText().slice(0, 200));

ipcMain.handle("music:source", (_e, src) => setMusicSource(src));
// Commandes du lecteur : toggle (pause/lecture), next, prev
ipcMain.handle("music:control", (_e, cmd) => {
  if (!["toggle", "next", "prev"].includes(cmd)) return;
  if (musicSource === "pc" && mediaProc) mediaProc.stdin.write(cmd + "\n");
  else if (musicSource === "pc" && unixMedia) return unixMedia.control(cmd);
  else if (musicSource === "spotify") return spotify.control(cmd);
});
ipcMain.handle("music:volume", (_e, value) => {
  const v = Math.max(0, Math.min(1, Number(value)));
  if (!Number.isFinite(v)) return;
  if (musicSource === "pc" && mediaProc) mediaProc.stdin.write(`volume ${v.toFixed(2)}\n`);
  else if (musicSource === "pc" && unixMedia) return unixMedia.volume(v);
  else if (musicSource === "spotify") return spotify.volume(v);
});
ipcMain.handle("sounds:list", () => sounds.list());
ipcMain.handle("bg:pick", (e) => sounds.pickBackground(winOf(e)));
// Fonds Wallpaper Engine déjà téléchargés (Windows) : relus à chaque ouverture de la galerie
ipcMain.handle("we:list", () => { try { return wallpaperEngine.list(); } catch { return { available: false, items: [] }; } });
ipcMain.handle("sounds:add", () => sounds.add(win));
ipcMain.handle("sounds:lrc", (_e, id) => sounds.attachLrc(win, id));
ipcMain.handle("sounds:remove", (_e, id) => sounds.remove(id));
ipcMain.handle("sounds:cover", (_e, id) => sounds.setCover(win, id));
// Enregistrement au micro : un vrai fichier son, pas plus de 100 Mo
ipcMain.handle("sounds:record", (_e, data, duration) => {
  const ok = (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) && data.byteLength > 0 && data.byteLength < 100e6;
  return ok ? sounds.addRecording(data, Math.max(0, Math.min(3_600_000, +duration || 0))) : sounds.list();
});
ipcMain.handle("sounds:rename", (_e, id, title) => sounds.rename(id, title));
ipcMain.handle("lyrics:get", (_e, q) => sounds.lyrics(q || {}));
ipcMain.handle("cover:find", (_e, q) => sounds.findCover(q || {}));
ipcMain.handle("spotify:get", () => ({ clientId: spotifyStore.getClientId(), connected: !!spotifyStore.getToken(), redirect: SPOTIFY_REDIRECT }));
ipcMain.handle("spotify:save", (_e, clientId) => {
  const id = String(clientId || "").trim();
  if (id !== data.spotifyClientId) delete data.spotifyToken;
  data.spotifyClientId = id;
  persist();
  if (musicSource === "spotify") spotify.start();
});
ipcMain.handle("spotify:login", () => spotify.login());
ipcMain.handle("spotify:logout", () => spotify.logout());

ipcMain.handle("win:minimize", (e) => winOf(e).minimize());
ipcMain.handle("win:maximize", (e) => { const w = winOf(e); w.isMaximized() ? w.unmaximize() : w.maximize(); });
ipcMain.handle("win:close", (e) => winOf(e).close());
ipcMain.handle("open:privacy", () => safeOpen("https://1999.organisationphantom.fr/confidentialite.html"));
ipcMain.handle("win:reload", (e) => e.sender.reload()); // location.reload est bloqué par la protection will-navigate
ipcMain.handle("win:fullscreen", (e) => { const w = winOf(e); w.setFullScreen(!w.isFullScreen()); });
ipcMain.handle("win:pin", (e, on) => { const w = winOf(e); w.setAlwaysOnTop(!!on, "floating"); return w.isAlwaysOnTop(); });
ipcMain.handle("win:mini", () => userToggleMini());

// ——— Linux : quel bureau, et quel mode d'affichage (lu par lancer-hush.sh au démarrage) ———
const linuxModeFile = () => path.join(app.getPath("userData"), "linux-display");
ipcMain.handle("linux:info", () => {
  if (process.platform !== "linux") return null;
  const e = process.env;
  const desktop = e.NIRI_SOCKET ? "niri" : e.HYPRLAND_INSTANCE_SIGNATURE ? "hyprland" : e.SWAYSOCK ? "sway"
    : /kde/i.test(e.XDG_CURRENT_DESKTOP || "") ? "kde" : /gnome/i.test(e.XDG_CURRENT_DESKTOP || "") ? "gnome" : (e.XDG_CURRENT_DESKTOP || "autre").toLowerCase();
  let mode = "";
  try { mode = fs.readFileSync(linuxModeFile(), "utf8").trim(); } catch {}
  if (!mode) mode = e.WAYLAND_DISPLAY ? "wayland" : "x11"; // même choix que lancer-hush.sh
  return { desktop, session: e.XDG_SESSION_TYPE || "", mode, wayland: !!e.WAYLAND_DISPLAY };
});
ipcMain.handle("linux:mode", (_e, mode) => {
  if (process.platform !== "linux" || !["x11", "wayland", "nogpu"].includes(mode)) return;
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(linuxModeFile(), mode + "\n");
});
// Déplacement / taille à la main (mini-fenêtre) : suit le curseur, et peut sortir de l'écran
let winDrag = null;
ipcMain.on("win:drag", (e, phase, mode) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  const p = screen.getCursorScreenPoint();
  if (phase === "start") { winDrag = { w, mode: mode === "size" ? "size" : "move", x: p.x, y: p.y, b: w.getBounds() }; return; }
  if (!winDrag || winDrag.w !== w) return;
  if (phase === "end") { winDrag = null; return; }
  const dx = p.x - winDrag.x, dy = p.y - winDrag.y, b = winDrag.b;
  if (winDrag.mode === "move") w.setBounds({ x: b.x + dx, y: b.y + dy, width: b.width, height: b.height });
  else w.setBounds({ x: b.x, y: b.y, width: Math.max(160, b.width + dx), height: Math.max(90, b.height + dy) });
});

// ——— Partage d'écran et clips ———
let capturePick = null;
// Linux sous Wayland (niri, GNOME, KDE…) : aucune appli ne peut lister les fenêtres elle-même ;
// c'est le sélecteur du système (portail xdg-desktop-portal / PipeWire) qui demande quoi partager
const WAYLAND_CAPTURE = process.platform === "linux" && !!(process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === "wayland");
ipcMain.handle("capture:sources", async () => {
  if (WAYLAND_CAPTURE) return { portal: true, list: [] };
  const own = [win, mini].filter((w) => w && !w.isDestroyed()).map((w) => w.getMediaSourceId());
  const list = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 320, height: 180 } });
  return { portal: false, list: list.filter((s) => !own.includes(s.id)).map((s) => ({ id: s.id, name: s.name, screen: s.id.startsWith("screen:"), thumb: s.thumbnail.toDataURL() })) };
});
// "self" : la fenêtre Hush qui demande (pour un clip) ; sinon l'écran / la fenêtre choisi
ipcMain.handle("capture:pick", (e, p) => {
  if (!p) { capturePick = null; return; }
  capturePick = { id: p.id === "self" ? winOf(e).getMediaSourceId() : String(p.id), audio: !!p.audio };
});
// Les clips s'écrivent au fur et à mesure dans Vidéos\Hush (pas tout en mémoire)
const clipsDir = () => path.join(app.getPath("videos"), "Hush");
const clips = new Map();
ipcMain.handle("clip:begin", () => {
  fs.mkdirSync(clipsDir(), { recursive: true });
  const d = new Date(), z = (n) => String(n).padStart(2, "0");
  const name = `Hush ${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}-${z(d.getMinutes())}-${z(d.getSeconds())}.webm`;
  const file = path.join(clipsDir(), name);
  const id = String(Date.now());
  clips.set(id, { file, stream: fs.createWriteStream(file) });
  return id;
});
ipcMain.handle("clip:chunk", (_e, id, buf) => { const c = clips.get(id); if (c) c.stream.write(Buffer.from(buf)); });
ipcMain.handle("clip:end", (_e, id) => new Promise((resolve) => {
  const c = clips.get(id);
  if (!c) return resolve(null);
  clips.delete(id);
  c.stream.end(() => resolve(c.file));
}));
ipcMain.handle("clip:show", (_e, file) => {
  const f = path.resolve(String(file || ""));
  if (f.startsWith(clipsDir() + path.sep)) shell.showItemInFolder(f); else shell.openPath(clipsDir());
});
ipcMain.handle("win:main", () => { if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.focus(); } });
