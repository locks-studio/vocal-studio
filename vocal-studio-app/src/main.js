const { app, BrowserWindow, ipcMain, safeStorage, shell, clipboard, desktopCapturer, screen } = require("electron");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { VoiceSession } = require("./voice");
const { BotLink } = require("./botlink");
const { SpotifySession, REDIRECT: SPOTIFY_REDIRECT } = require("./spotify");
const { registerScheme, SoundLibrary } = require("./sounds");
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
  }),
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

// ——— Mini-fenêtre : coins arrondis, toujours au premier plan, se déplace en la faisant glisser.
// Créée transparente pour le mode « avatars seuls » (Windows ne permet pas de changer ça après coup).
function toggleMini() {
  if (mini && !mini.isDestroyed()) { mini.close(); return false; }
  mini = new BrowserWindow({
    width: 300, height: 420, minWidth: 160, minHeight: 90,
    frame: false, transparent: true, backgroundColor: "#00000000", hasShadow: false,
    alwaysOnTop: true, title: "Hush · mini", icon: ICON,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mini.setAlwaysOnTop(true, "floating");
  // Titre fixe « Hush · mini » : sous Linux, les règles des gestionnaires de fenêtres (niri, Hyprland, Sway) le ciblent
  mini.on("page-title-updated", (e) => e.preventDefault());
  mini.loadFile(path.join(__dirname, "..", "renderer", "index.html"), { query: { mini: "1" } });
  mini.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mini.webContents.on("will-navigate", (e) => e.preventDefault());
  mini.once("ready-to-show", () => {
    if (!mini) return;
    mini.setBackgroundColor("#00000000");
    if (process.platform === "win32" && mini.setBackgroundMaterial) mini.setBackgroundMaterial("none"); // jamais d'Acrylic derrière
  });
  mini.on("closed", () => { mini = null; send("win:mini", false); });
  return true;
}
// Fenêtre qui a envoyé la demande (principale ou mini)
const winOf = (e) => BrowserWindow.fromWebContents(e.sender) || win;

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 420,
    minHeight: 520,
    frame: false,
    backgroundColor: "#0d0b1a",
    title: "Hush",
    // Icône de la fenêtre et de la barre des tâches (sinon Windows montre celle d'Electron)
    icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://discord.com/") || url.startsWith("https://developer.spotify.com/")) shell.openExternal(url);
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
app.on("second-instance", () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
});

app.whenReady().then(() => {
  if (!gotLock) return;
  load();
  loadUsage();
  setInterval(tickUsage, 60_000);
  sounds = new SoundLibrary(path.join(app.getPath("userData"), "sounds"));
  sounds.serve();
  localSession = new VoiceSession(store, (state) => { if (session === localSession) send("voice:state", state); });
  botLink = new BotLink(botStore, (url) => shell.openExternal(url), (state) => { if (session === botLink) send("voice:state", state); });
  botLink.onChat = (m) => send("chat:message", m);
  botLink.onFriends = () => send("friends:changed");
  useMode(data.mode);
  spotify = new SpotifySession(spotifyStore, (url) => shell.openExternal(url), (s) => {
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
      const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
      const src = sources.find((s) => s.id === p.id) || { id: p.id, name: "Hush" };
      // « loopback » : le son du PC (voix Discord, musique…) sous Windows
      cb(p.audio && process.platform === "win32" ? { video: src, audio: "loopback" } : { video: src });
    } catch { cb({}); }
  });
  createWindow();
});
app.on("window-all-closed", () => {
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
  shell.openExternal(`discord://-/channels/${g || "@me"}/${c}`);
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
ipcMain.on("friends:presence", (_e, voice) => { if (botLink) botLink.presence(voice); });
ipcMain.handle("chat:send", (_e, text) => chatCall("send", String(text || "").slice(0, 1900)));
ipcMain.handle("voice:home", () => (botLink.ws ? botLink.home().catch(() => null) : null));
ipcMain.handle("bot:info", async () => {
  const i = await botLink.info();
  return i && { ...i, linked: !!(botLink.ws && botLink.ws.readyState === 1) };
});
ipcMain.handle("discord:channel", (_e, g, c) => { if (/^\d{5,25}$/.test(String(g)) && /^\d{5,25}$/.test(String(c))) shell.openExternal(`discord://-/channels/${g}/${c}`); });
ipcMain.handle("discord:user", (_e, id) => { if (/^\d{5,25}$/.test(String(id))) shell.openExternal(`discord://-/users/${id}`); });
ipcMain.handle("clip:write", (_e, text) => clipboard.writeText(String(text).slice(0, 200)));

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
ipcMain.handle("sounds:add", () => sounds.add(win));
ipcMain.handle("sounds:lrc", (_e, id) => sounds.attachLrc(win, id));
ipcMain.handle("sounds:remove", (_e, id) => sounds.remove(id));
ipcMain.handle("sounds:cover", (_e, id) => sounds.setCover(win, id));
ipcMain.handle("sounds:record", (_e, data, duration) => sounds.addRecording(data, duration));
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
ipcMain.handle("win:reload", (e) => e.sender.reload()); // location.reload est bloqué par la protection will-navigate
ipcMain.handle("win:fullscreen", (e) => { const w = winOf(e); w.setFullScreen(!w.isFullScreen()); });
ipcMain.handle("win:pin", (e, on) => { const w = winOf(e); w.setAlwaysOnTop(!!on, "floating"); return w.isAlwaysOnTop(); });
ipcMain.handle("win:mini", () => toggleMini());

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
ipcMain.handle("capture:sources", async () => {
  const own = [win, mini].filter((w) => w && !w.isDestroyed()).map((w) => w.getMediaSourceId());
  const list = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 320, height: 180 } });
  return list.filter((s) => !own.includes(s.id)).map((s) => ({ id: s.id, name: s.name, screen: s.id.startsWith("screen:"), thumb: s.thumbnail.toDataURL() }));
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
