// 1999 : le launcher. Lit le catalogue publié sur le site, installe / met à jour / lance les logiciels.
const { app, BrowserWindow, ipcMain, shell, screen, nativeImage, session, desktopCapturer, safeStorage, Menu } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const https = require("https");
const { Installer, PLATFORM } = require("./installer");
const { Account } = require("./account");
const { SelfUpdate } = require("./selfupdate");
const shortcuts = require("./shortcuts");
// Raccourci « Hush » (et des prochains logiciels) : 1999 --lancer=hush ouvre le logiciel sans montrer le launcher,
// vérifie les mises à jour en arrière-plan, puis se ferme
const lancerArg = (argv) => { const a = argv.find((x) => x.startsWith("--lancer=")); return a ? a.slice(9).replace(/[^\w-]/g, "") : null; };
const startLancer = lancerArg(process.argv);

const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf8"));
// Pour tester sans le site : --catalog=file:///C:/chemin/catalog.json (ou la variable CATALOG_1999)
const arg = process.argv.find((a) => a.startsWith("--catalog="));
const CATALOG_URL = (arg && arg.slice(10)) || process.env.CATALOG_1999 || CONFIG.catalogUrl;

// Linux : --no-sandbox doit être sur la ligne de commande dès le départ. Ajouté ici, il arrive trop tard : Chromium a déjà
// démarré sa base sandboxée, et les pages plantent sur /dev/shm (« No such process »). On relance donc une fois, avec l'option.
if (process.platform === "linux" && !process.argv.includes("--no-sandbox")) {
  spawn(process.execPath, [...process.argv.slice(1), "--no-sandbox"], { detached: true, stdio: "inherit" }).unref();
  process.exit(0);
}

// Une seule fenêtre de launcher à la fois
if (!app.requestSingleInstanceLock()) app.quit();
if (process.platform === "win32") app.setAppUserModelId("fr.locks.launcher1999");
if (process.platform === "linux") {
  // Transparence de la fenêtre : Wayland natif si dispo, et les « visuels transparents » sous X11 / XWayland
  app.commandLine.appendSwitch("ozone-platform-hint", "auto");
  app.commandLine.appendSwitch("enable-transparent-visuals");
}

let win, installer, account, selfUpdate;
// Plantages : gardés dans launcher.log (dossier de données), le launcher reste ouvert
const logFile = () => path.join(app.getPath("userData"), "launcher.log");
function logError(where, e) {
  try {
    const line = `${new Date().toISOString()} ${where} v${app.getVersion()} ${process.platform} : ${(e && e.stack) || e}\n`;
    fs.appendFileSync(logFile(), line);
    if (fs.statSync(logFile()).size > 200_000) fs.writeFileSync(logFile(), fs.readFileSync(logFile(), "utf8").slice(-100_000));
  } catch {}
}
process.on("uncaughtException", (e) => logError("principal", e));
process.on("unhandledRejection", (e) => logError("principal", e));
// Agrandir à la main : Windows ne sait pas agrandir proprement une fenêtre transparente
let restoreBounds = null;
function toggleMax() {
  if (restoreBounds) { win.setBounds(restoreBounds); restoreBounds = null; }
  else { restoreBounds = win.getBounds(); win.setBounds(screen.getDisplayMatching(restoreBounds).workArea); }
  send("win:bounds", bounds());
}

// ——— Réglages du launcher (settings.json dans son dossier de données) ———
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
// Fond par défaut : le vrai flou du système (Acrylic sur Windows 11, Vibrancy sur Mac). Linux n'en a pas
// (c'est le compositeur qui décide, et niri ne floute pas) : le verre sur le fond d'écran à la place.
// Par défaut : le verre sur l'écran en direct (Windows / Mac). Linux ne sait pas exclure une fenêtre de sa propre
// capture (elle se verrait elle-même) : le verre sur le fond d'écran.
// Mac : le verre natif (vibrancy) d'office ; le verre « en direct » filme l'écran, et macOS demanderait
// l'autorisation d'enregistrer l'écran dès le premier lancement
const DEFAULT_SETTINGS = { glass: process.platform === "linux" ? "wallpaper" : process.platform === "darwin" ? "acrylic" : "live", onLaunch: "stay", autoUpdate: true, startup: false };
let settings = { ...DEFAULT_SETTINGS };
function loadSettings() { try { settings = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsFile(), "utf8")) }; } catch {} }
const CHOICES = { glass: ["live", "acrylic", "wallpaper", "scene", "clear"], onLaunch: ["stay", "minimize", "close"] };
// En direct : la fenêtre est retirée des captures d'écran (Windows 10 2004+, Mac) ; la page capture alors l'écran
// et voit exactement ce qu'il y a derrière elle, sans se voir elle-même.
const applyCapture = () => { if (win && process.platform !== "linux") win.setContentProtection(settings.glass === "live"); };

// ——— Verre liquide : le fond d'écran du bureau ———
// La page l'affiche exactement là où il est derrière la fenêtre (elle « voit » donc le bureau), puis le verre le
// réfracte. Windows : la copie que Windows garde du fond. Mac : celui du bureau courant. Linux : swww (niri,
// Hyprland), GNOME, ou le réglage de Noctalia. Introuvable : la page dessine son propre fond rose.
function wallpaperPath() {
  try {
    if (process.platform === "win32") {
      const t = path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Themes", "TranscodedWallpaper");
      return fs.existsSync(t) ? t : null;
    }
    if (process.platform === "darwin") {
      const r = spawnSync("osascript", ["-e", 'tell application "System Events" to get picture of current desktop'], { encoding: "utf8", timeout: 2000 });
      const p = (r.stdout || "").trim();
      return p && fs.existsSync(p) ? p : null;
    }
    const sw = spawnSync("swww", ["query"], { encoding: "utf8", timeout: 1500 });
    const m = /image: (.+)$/m.exec(sw.stdout || "");
    if (m && fs.existsSync(m[1].trim())) return m[1].trim();
    for (const key of ["picture-uri-dark", "picture-uri"]) {
      const g = spawnSync("gsettings", ["get", "org.gnome.desktop.background", key], { encoding: "utf8", timeout: 1500 });
      const u = (g.stdout || "").trim().replace(/^'|'$/g, "");
      if (u.startsWith("file://")) { const p = decodeURIComponent(u.slice(7)); if (fs.existsSync(p)) return p; }
    }
    const home = os.homedir();
    for (const f of [".config/noctalia/settings.json", ".cache/noctalia/wallpapers.json"]) {
      try {
        const s = fs.readFileSync(path.join(home, f), "utf8");
        for (const mm of s.matchAll(/"((?:~|\/)[^"]+\.(?:jpe?g|png))"/gi)) { const p = mm[1].replace(/^~/, home); if (fs.existsSync(p)) return p; }
      } catch {}
    }
  } catch {}
  return null;
}
// Comment Windows place le fond : remplir (cover), ajuster, étirer, centrer, étendre
function wallpaperStyle() {
  if (process.platform !== "win32") return "cover";
  try {
    const r = spawnSync("reg", ["query", "HKCU\\Control Panel\\Desktop", "/v", "WallpaperStyle"], { encoding: "utf8", timeout: 1500 });
    const v = Number((/WallpaperStyle\s+REG_SZ\s+(\d+)/.exec(r.stdout || "") || [])[1]);
    return { 6: "contain", 2: "stretch", 0: "center", 22: "span" }[v] || "cover";
  } catch { return "cover"; }
}
let wpCache = null;
function wallpaper() {
  const p = wallpaperPath();
  if (!p) return null;
  let mtime = 0;
  try { mtime = fs.statSync(p).mtimeMs; } catch { return null; }
  if (wpCache && wpCache.p === p && wpCache.mtime === mtime) return wpCache.out;
  const img = nativeImage.createFromBuffer(fs.readFileSync(p));
  if (img.isEmpty()) return null;
  // Assez grand pour l'écran, pas plus (un fond 6K encodé à chaque fois serait lent)
  const d = screen.getDisplayMatching(win ? win.getBounds() : { x: 0, y: 0, width: 1, height: 1 });
  const maxW = Math.round(d.size.width * d.scaleFactor);
  const small = img.getSize().width > maxW ? img.resize({ width: maxW, quality: "good" }) : img;
  const out = { url: "data:image/jpeg;base64," + small.toJPEG(88).toString("base64"), style: wallpaperStyle() };
  wpCache = { p, mtime, out };
  return out;
}
// Où est la fenêtre, et sur quel écran : pour placer le fond pile derrière elle
function bounds() {
  const b = win.getBounds(), disp = screen.getDisplayMatching(b), d = disp.bounds;
  return { x: b.x, y: b.y, w: b.width, h: b.height, dx: d.x, dy: d.y, dw: d.width, dh: d.height, did: String(disp.id), max: !!restoreBounds };
}
const cacheFile = () => path.join(app.getPath("userData"), settings.testCode ? "catalog-cache-test.json" : "catalog-cache.json");
// Canal de test : même site, dans un dossier dont le nom contient le code. Sans code, on reste sur la version normale.
const testUrl = (code) => CATALOG_URL.replace(/catalog\.json$/, `test-${code}/catalog.json`);
const catalogUrl = () => (settings.testCode ? testUrl(settings.testCode) : CATALOG_URL);
const saveSettings = () => { try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch {} };
const send = (ch, p) => { if (win && !win.isDestroyed()) win.webContents.send(ch, p); };

function fetchText(url, hops = 0) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    if (u.protocol === "file:") {
      try { return resolve(fs.readFileSync(decodeURIComponent(u.pathname.replace(/^\/([A-Za-z]:)/, "$1")), "utf8")); }
      catch (e) { return reject(e); }
    }
    if (u.protocol !== "https:") return reject(new Error("Le catalogue doit être en https."));
    const req = https.get(url, { headers: { "User-Agent": "1999-launcher", "Cache-Control": "no-cache" }, timeout: 10_000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5) { res.resume(); return resolve(fetchText(new URL(res.headers.location, url).toString(), hops + 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      let s = "";
      res.setEncoding("utf8");
      res.on("data", (d) => (s += d));
      res.on("end", () => resolve(s));
    });
    req.on("timeout", () => req.destroy(new Error("délai dépassé")));
    req.on("error", reject);
  });
}

// Catalogue : en ligne si possible, sinon la dernière copie connue (le launcher marche hors ligne pour lancer)
async function getCatalog() {
  try {
    const cat = JSON.parse(await fetchText(catalogUrl()));
    if (!cat || !Array.isArray(cat.apps)) throw new Error("catalogue invalide");
    fs.writeFileSync(cacheFile(), JSON.stringify(cat));
    if (selfUpdate && !settings.testCode) selfUpdate.check(cat.launcher); // nouvelle version du launcher : téléchargée en arrière-plan
    return { catalog: cat, online: true };
  } catch (e) {
    try { return { catalog: JSON.parse(fs.readFileSync(cacheFile(), "utf8")), online: false, error: e.message }; }
    catch { return { catalog: { apps: [] }, online: false, error: e.message }; }
  }
}

// Options de fenêtre selon le fond choisi.
// Acrylic : c'est Windows (le compositeur DWM) qui floute ce qu'il y a derrière la fenêtre — bureau ET autres
// fenêtres — en temps réel. Une page web ne peut pas le faire elle-même : backdrop-filter ne floute que le contenu
// de la page, jamais l'écran derrière. La fenêtre ne doit pas être « transparent » (sinon pas de matière), et la
// page doit laisser son fond vide pour qu'on voie la matière. Windows arrondit alors les coins tout seul.
function windowGlass(mode) {
  if (mode === "acrylic" && process.platform === "win32") return { backgroundMaterial: "acrylic", backgroundColor: "#00000000" };
  if (mode === "acrylic" && process.platform === "darwin") return { vibrancy: "under-window", visualEffectState: "active", transparent: true, backgroundColor: "#00000000" };
  return { transparent: true, backgroundColor: "#00000000", hasShadow: false };
}
function createWindow(prev) {
  win = new BrowserWindow({
    ...(prev ? prev.getBounds() : { width: 1180, height: 720 }), minWidth: 900, minHeight: 560,
    frame: false, title: "1999", ...windowGlass(settings.glass), show: !prev && !startLancer,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  // Changement de fond (Acrylic ↔ transparent) : Windows ne permet pas de basculer « transparent » sur une fenêtre
  // ouverte ; on en ouvre une nouvelle au même endroit, puis on ferme l'ancienne quand la nouvelle est prête.
  if (prev) win.once("ready-to-show", () => { win.show(); if (!prev.isDestroyed()) prev.destroy(); });
  applyCapture();
  const sendBounds = () => send("win:bounds", bounds());
  for (const ev of ["move", "resize", "maximize", "unmaximize"]) win.on(ev, sendBounds);
  win.on("focus", () => send("win:focus", true));
  win.on("blur", () => send("win:focus", false));
  win.webContents.on("render-process-gone", (_e, d) => { logError("page", d.reason); if (d.reason !== "clean-exit" && !win.isDestroyed()) win.webContents.reload(); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
}

app.whenReady().then(() => {
  // Mac : barre de menus minimale (Cmd+C / Cmd+V dans les champs, Cmd+Q pour quitter)
  if (process.platform === "darwin") Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]));
  installer = new Installer(app.getPath("userData"));
  selfUpdate = new SelfUpdate({ app, installer, platform: PLATFORM, send: (s) => send("launcher:update", s), log: logError });
  loadSettings();
  account = new Account({
    file: path.join(app.getPath("userData"), "account.json"), server: CONFIG.authServer,
    openUrl: (u) => shell.openExternal(u),
    seal: (t) => (safeStorage.isEncryptionAvailable() ? "e:" + safeStorage.encryptString(t).toString("base64") : "p:" + t),
    unseal: (b) => (b.startsWith("e:") ? safeStorage.decryptString(Buffer.from(b.slice(2), "base64")) : b.slice(2)),
  });
  // La capture demandée par la page : l'écran où se trouve la fenêtre, sans fenêtre de choix
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
    try {
      const d = screen.getDisplayMatching(win.getBounds());
      const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } });
      const s = sources.find((x) => String(x.display_id) === String(d.id)) || sources[0];
      cb(s ? { video: s } : {});
    } catch { cb({}); }
  });
  createWindow();
  // Raccourcis : le launcher (Linux) et les logiciels déjà installés (mis à jour à chaque démarrage)
  shortcuts.forLauncher();
  for (const id of Object.keys(installer.state)) shortcuts.forApp(appEntry(id), installer.installed(id));
  if (startLancer) {
    if (launchApp(startLancer)) quietExit();
    else showWin(); // pas encore installé : on montre le launcher
  }
});
// Nom affiché d'un logiciel du catalogue (pour ses raccourcis), même hors ligne
function appEntry(id) {
  try { const c = JSON.parse(fs.readFileSync(cacheFile(), "utf8")); const a = (c.apps || []).find((x) => x.id === id); if (a) return a; } catch {}
  return { id, name: id.charAt(0).toUpperCase() + id.slice(1) };
}
// Ouvre un logiciel installé (Hush reprend le compte du launcher). false s'il n'est pas installé.
function launchApp(id) {
  if (!installer.installed(id)) return false;
  try { installer.launch(id, id === "hush" ? account.token() : null); return true; } catch (e) { logError("lancement " + id, e); return false; }
}
function showWin() { if (!win) return; quietUntil = 0; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
app.on("second-instance", (_e, argv) => {
  const id = lancerArg(argv);
  if (id && launchApp(id)) return; // raccourci Hush pendant que 1999 tourne : on ouvre Hush, rien d'autre
  showWin();
});
// Lancé par un raccourci : le launcher reste caché, fait ses mises à jour, puis se ferme quand il n'a plus rien à faire
let quietUntil = 0;
function quietExit() {
  quietUntil = Date.now() + 30_000;
  const tick = setInterval(() => {
    if (!quietUntil) return clearInterval(tick); // quelqu'un a ouvert la fenêtre entre-temps
    if (Date.now() < quietUntil || installer.busy.size || (selfUpdate && selfUpdate.state.status === "downloading")) return;
    clearInterval(tick);
    app.quit();
  }, 5000);
}
app.on("window-all-closed", () => app.quit());
// Une mise à jour du launcher est prête : elle s'installe à la fermeture, sans le relancer
app.on("before-quit", () => { if (selfUpdate && selfUpdate.ready) selfUpdate.apply(false); });
ipcMain.handle("launcher:update", () => (selfUpdate ? selfUpdate.state : { status: "idle" }));
ipcMain.handle("launcher:apply", () => selfUpdate && selfUpdate.apply(true));

// ——— Échanges avec l'interface ———
ipcMain.handle("catalog:get", async () => {
  const r = await getCatalog();
  return { ...r, platform: PLATFORM, launcherVersion: app.getVersion(), installed: installer.state, testing: !!settings.testCode };
});
ipcMain.handle("app:install", async (_e, entry) => {
  // On ne fait confiance qu'au catalogue officiel : on retrouve l'entrée par son id
  const { catalog } = await getCatalog();
  const a = catalog.apps.find((x) => x.id === entry.id);
  if (!a) throw new Error("Logiciel inconnu.");
  await installer.install(a, (step) => send("app:progress", { id: a.id, ...step }));
  shortcuts.forApp(a, installer.installed(a.id)); // raccourci sur le bureau et dans le menu (créé ou mis à jour)
  return installer.state;
});
ipcMain.handle("app:cancel", (_e, id) => installer.cancel(id));
// Temps d'utilisation d'un logiciel : il l'écrit lui-même dans son dossier de données (usage.json)
ipcMain.handle("app:usage", (_e, entry) => {
  const dirs = [].concat((entry && entry.usageDir) || []).map(String).filter((d) => /^[\w .-]+$/.test(d));
  for (const d of dirs) {
    try { return JSON.parse(fs.readFileSync(path.join(app.getPath("appData"), d, "usage.json"), "utf8")); } catch {}
  }
  return null;
});
// Rejoindre le canal de test : le code n'est gardé que si son catalogue existe vraiment
ipcMain.handle("test:join", async (_e, raw) => {
  const code = String(raw || "").trim().toLowerCase();
  if (!/^[a-z0-9]{4,40}$/.test(code)) return { error: "Ce code n'est pas valide." };
  try {
    const cat = JSON.parse(await fetchText(testUrl(code)));
    if (!cat || !Array.isArray(cat.apps)) throw new Error("catalogue");
  } catch { return { error: "Ce code n'est pas valide." }; }
  settings.testCode = code;
  saveSettings();
  return { ok: true };
});
ipcMain.handle("test:leave", () => { delete settings.testCode; saveSettings(); return { ok: true }; });
ipcMain.handle("account:get", () => account.refresh());
ipcMain.handle("open:invite", () => shell.openExternal(CONFIG.inviteUrl));
ipcMain.handle("open:privacy", () => shell.openExternal(CONFIG.privacyUrl));
ipcMain.handle("win:reload", () => win.webContents.reload());
ipcMain.handle("account:login", () => account.login());
ipcMain.handle("account:cancel", () => account.cancel());
ipcMain.handle("account:logout", () => account.logout());
ipcMain.handle("app:launch", (_e, id) => {
  // Hush reprend le compte du launcher : pas de deuxième connexion
  installer.launch(id, id === "hush" ? account.token() : null);
  // Réglage « au lancement d'un logiciel » : rester ouvert, se réduire, ou se fermer
  if (settings.onLaunch === "minimize") setTimeout(() => win && win.minimize(), 600);
  if (settings.onLaunch === "close") setTimeout(() => app.quit(), 1500);
  return true;
});
ipcMain.handle("desk:wallpaper", () => { try { return wallpaper(); } catch { return null; } });
ipcMain.handle("win:bounds", () => bounds());
ipcMain.handle("settings:get", () => ({ ...settings, canStartup: process.platform !== "linux", appsDir: installer.appsDir, version: app.getVersion() }));
let wasGlass = null;
ipcMain.handle("settings:set", (_e, patch) => {
  if (wasGlass === null) wasGlass = settings.glass === "acrylic";
  for (const [k, v] of Object.entries(patch || {})) {
    if (CHOICES[k] ? CHOICES[k].includes(v) : k === "autoUpdate" || k === "startup" ? typeof v === "boolean" : false) settings[k] = v;
  }
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch {}
  // Version de développement : Windows lancerait electron.exe seul (une fenêtre vide au démarrage du PC)
  if ("startup" in (patch || {}) && process.platform !== "linux" && app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!settings.startup });
  // Passer d'un fond « matière du système » à un fond transparent (ou l'inverse) : nouvelle fenêtre
  if (patch && "glass" in patch && wasGlass !== (settings.glass === "acrylic")) setTimeout(() => createWindow(win), 50);
  wasGlass = settings.glass === "acrylic";
  applyCapture();
  return settings;
});
ipcMain.handle("app:uninstall", (_e, id) => { installer.uninstall(id); shortcuts.removeApp(appEntry(id)); return installer.state; });
ipcMain.handle("app:folder", (_e, id) => { const s = installer.installed(id); shell.openPath(s ? s.dir : installer.appsDir); });
ipcMain.handle("open:url", (_e, url) => { if (/^https:\/\//.test(String(url))) shell.openExternal(url); });
ipcMain.handle("win:minimize", () => win.minimize());
ipcMain.handle("win:maximize", () => toggleMax());
ipcMain.handle("win:close", () => win.close());
