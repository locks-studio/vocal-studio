const { app, BrowserWindow, ipcMain, safeStorage, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { VoiceSession } = require("./voice");
const { BotLink } = require("./botlink");
const { SpotifySession, REDIRECT: SPOTIFY_REDIRECT } = require("./spotify");
const { registerScheme, SoundLibrary } = require("./sounds");

registerScheme();
let sounds;

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
  }),
  getToken: () => unseal(data.token),
  setToken: (t) => { data.token = seal(t); persist(); },
};

// Mode bot : adresse du serveur Vocal Studio et session de l'appli sur ce serveur
const botStore = {
  getServer: () => data.botServer || "",
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
function stopPcMedia() { if (mediaProc) mediaProc.kill(); mediaProc = null; }

function setMusicSource(src) {
  musicSource = src;
  stopPcMedia();
  spotify.stop();
  if (src === "pc") {
    if (process.platform === "win32") startPcMedia();
    else sendMusic({ status: "error", error: "La lecture de « Ce PC » ne marche que sous Windows.", track: null });
  } else if (src === "spotify") spotify.start();
  // « Mes sons » et « À la main » sont gérés directement par l'interface
  else sendMusic({ status: "off", error: null, track: null });
}

// ——— Fenêtre ———
// « session » est la source active : le bot (par défaut) ou la connexion directe RPC
let win, session, localSession, botLink;
function useMode(mode) {
  if (session) session.stop();
  data.mode = mode === "local" ? "local" : "bot";
  session = data.mode === "local" ? localSession : botLink;
}
function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 420,
    minHeight: 520,
    frame: false,
    backgroundColor: "#0d0b1a",
    title: "Vocal Studio",
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
}

app.whenReady().then(() => {
  load();
  sounds = new SoundLibrary(path.join(app.getPath("userData"), "sounds"));
  sounds.serve();
  localSession = new VoiceSession(store, (state) => { if (session === localSession) send("voice:state", state); });
  botLink = new BotLink(botStore, (url) => shell.openExternal(url), (state) => { if (session === botLink) send("voice:state", state); });
  useMode(data.mode);
  spotify = new SpotifySession(spotifyStore, (url) => shell.openExternal(url), (s) => {
    if (musicSource === "spotify") sendMusic(s);
  });
  // Seul le micro peut être demandé (pour enregistrer un son), jamais la caméra ni l'écran
  const { session: electronSession } = require("electron");
  electronSession.defaultSession.setPermissionRequestHandler((_wc, permission, cb, details) => {
    cb(permission === "media" && (details.mediaTypes || []).every((t) => t === "audio"));
  });
  electronSession.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === "media");
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
ipcMain.handle("voice:summon", () => session.summon && session.summon());

ipcMain.handle("voice:start", () => { session.stop(); session.start(); });
ipcMain.handle("voice:stop", () => session.stop());
ipcMain.handle("voice:state", () => session.snapshot());
ipcMain.handle("voice:mute", (_e, v) => session.setMute(!!v));
ipcMain.handle("voice:deaf", (_e, v) => session.setDeaf(!!v));
ipcMain.handle("voice:leave", () => session.leave());

ipcMain.handle("music:source", (_e, src) => setMusicSource(src));
ipcMain.handle("sounds:list", () => sounds.list());
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

ipcMain.handle("win:minimize", () => win.minimize());
ipcMain.handle("win:maximize", () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
ipcMain.handle("win:close", () => win.close());
ipcMain.handle("win:fullscreen", () => win.setFullScreen(!win.isFullScreen()));
ipcMain.handle("win:pin", (_e, on) => { win.setAlwaysOnTop(!!on, "floating"); return win.isAlwaysOnTop(); });
