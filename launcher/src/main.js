// 1999 : le launcher. Lit le catalogue publié sur le site, installe / met à jour / lance les logiciels.
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { Installer, PLATFORM } = require("./installer");

const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf8"));
// Pour tester sans le site : --catalog=file:///C:/chemin/catalog.json (ou la variable CATALOG_1999)
const arg = process.argv.find((a) => a.startsWith("--catalog="));
const CATALOG_URL = (arg && arg.slice(10)) || process.env.CATALOG_1999 || CONFIG.catalogUrl;

// Une seule fenêtre de launcher à la fois
if (!app.requestSingleInstanceLock()) app.quit();
if (process.platform === "win32") app.setAppUserModelId("fr.locks.launcher1999");
// Linux : même chose pour le launcher lui-même (sinon il ne s'ouvre pas sur Ubuntu 24.04+)
if (process.platform === "linux") {
  app.commandLine.appendSwitch("no-sandbox");
  // Transparence de la fenêtre : Wayland natif si dispo, et les « visuels transparents » sous X11 / XWayland
  app.commandLine.appendSwitch("ozone-platform-hint", "auto");
  app.commandLine.appendSwitch("enable-transparent-visuals");
}

let win, installer;
const cacheFile = () => path.join(app.getPath("userData"), "catalog-cache.json");
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
    const cat = JSON.parse(await fetchText(CATALOG_URL));
    if (!cat || !Array.isArray(cat.apps)) throw new Error("catalogue invalide");
    fs.writeFileSync(cacheFile(), JSON.stringify(cat));
    return { catalog: cat, online: true };
  } catch (e) {
    try { return { catalog: JSON.parse(fs.readFileSync(cacheFile(), "utf8")), online: false, error: e.message }; }
    catch { return { catalog: { apps: [] }, online: false, error: e.message }; }
  }
}

function createWindow() {
  // Fenêtre transparente : le bureau se voit NET derrière (aucun flou du système), seuls les panneaux de verre
  // sont dessinés par la page — comme l'overlay transparent de Hush.
  const glass = { transparent: true, backgroundColor: "#00000000", hasShadow: false };
  win = new BrowserWindow({
    width: 1180, height: 720, minWidth: 900, minHeight: 560,
    frame: false, title: "1999", ...glass,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
}

app.whenReady().then(() => {
  installer = new Installer(app.getPath("userData"));
  createWindow();
});
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on("window-all-closed", () => app.quit());

// ——— Échanges avec l'interface ———
ipcMain.handle("catalog:get", async () => {
  const r = await getCatalog();
  return { ...r, platform: PLATFORM, launcherVersion: app.getVersion(), installed: installer.state };
});
ipcMain.handle("app:install", async (_e, entry) => {
  // On ne fait confiance qu'au catalogue officiel : on retrouve l'entrée par son id
  const { catalog } = await getCatalog();
  const a = catalog.apps.find((x) => x.id === entry.id);
  if (!a) throw new Error("Logiciel inconnu.");
  await installer.install(a, (step) => send("app:progress", { id: a.id, ...step }));
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
ipcMain.handle("app:launch", (_e, id) => { installer.launch(id); return true; });
ipcMain.handle("app:uninstall", (_e, id) => { installer.uninstall(id); return installer.state; });
ipcMain.handle("app:folder", (_e, id) => { const s = installer.installed(id); shell.openPath(s ? s.dir : installer.appsDir); });
ipcMain.handle("open:url", (_e, url) => { if (/^https:\/\//.test(String(url))) shell.openExternal(url); });
ipcMain.handle("win:minimize", () => win.minimize());
ipcMain.handle("win:maximize", () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
ipcMain.handle("win:close", () => win.close());
