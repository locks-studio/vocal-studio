// Hush Studio : fenêtre principale, fichiers (import Craig, projets, images) et analyse du son avec ffmpeg.
// La scène affichée est le vrai rendu de Hush (dossier renderer de Hush), piloté par la timeline.
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
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
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { pathToFileURL } = require("url");
const { analyze, probe } = require("./audio");
const { importZip } = require("./craig");

// Rendu identique d'un PC à l'autre : pas de mise à l'échelle Windows dans la scène exportée
app.commandLine.appendSwitch("force-color-profile", "srgb");

if (process.env.HS_TEST_DATA) app.setPath("userData", process.env.HS_TEST_DATA);
const SCENE_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "scene")
  : path.join(__dirname, "..", "..", "vocal-studio-app", "renderer");
const DATA = app.getPath("userData");
const CACHE = path.join(DATA, "cache");
const IMPORTS = path.join(DATA, "imports");
const AUTOSAVE = path.join(DATA, "autosave.hushstudio");
fs.mkdirSync(CACHE, { recursive: true });

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#09090d",
    title: "Hush Studio",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      webviewTag: true,
      spellcheck: false,
    },
  });
  win.removeMenu();
  if (process.env.HS_TEST_SHOT) win.webContents.on("console-message", (_e, level, msg, line, src) => console.log(`[page ${level}] ${msg} (${path.basename(src || "")}:${line})`));
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  // Liens externes : dans le navigateur, jamais dans l'appli
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) safeOpen(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  // Fermeture avec des modifications non enregistrées : la page décide (elle a la sauvegarde auto)
  win.on("close", (e) => {
    if (win.forceClose) return;
    e.preventDefault();
    win.webContents.send("app:closing");
  });
}

// La scène (webview) ne charge que le rendu de Hush et notre faux « Discord »
app.on("web-contents-created", (_e, wc) => {
  wc.on("will-attach-webview", (_ev, prefs, params) => {
    prefs.preload = path.join(__dirname, "scene-preload.js");
    prefs.contextIsolation = true;
    prefs.nodeIntegration = false;
    prefs.sandbox = false; // le preload partage son faux Discord avec l'export (fake-studio.js)
    if (!params.src.startsWith(pathToFileURL(SCENE_DIR).href)) _ev.preventDefault();
  });
});

const AUDIO_EXT = ["flac", "wav", "mp3", "ogg", "opus", "m4a", "aac", "webm", "wma", "aiff", "aif"];

/* ——— Fichiers ——— */
ipcMain.handle("scene:info", () => ({ url: pathToFileURL(path.join(SCENE_DIR, "index.html")).href }));

ipcMain.handle("files:pickAudio", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "Importer des pistes audio ou un enregistrement Craig",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Audio, zip Craig ou photos de profil", extensions: [...AUDIO_EXT, "zip", "png", "jpg", "jpeg", "gif", "webp"] }, { name: "Tous les fichiers", extensions: ["*"] }],
  });
  return r.canceled ? [] : r.filePaths;
});

// Import : un zip Craig devient une piste par personne (avec pseudo et ID Discord), le reste est pris tel quel
ipcMain.handle("files:import", async (_e, paths) => {
  const out = { people: [], files: [], avatars: [], errors: [] };
  for (const p of paths) {
    try {
      if (p.toLowerCase().endsWith(".zip")) {
        const r = await importZip(p, IMPORTS);
        out.people.push(...r.people);
        out.files.push(...r.files);
        out.avatars.push(...(r.avatars || []));
        if (r.info && (r.people.length || r.files.length)) out.info = r.info;
      } else if (AUDIO_EXT.includes(path.extname(p).slice(1).toLowerCase())) {
        out.files.push({ file: p, name: path.basename(p).replace(/\.[^.]+$/, "") });
      } else if (/\.(png|jpe?g|gif|webp)$/i.test(p) && fs.statSync(p).size < 15e6) {
        const m = /^(\d+)-(.+)$/.exec(path.basename(p).replace(/\.[^.]+$/, ""));
        const ext = path.extname(p).slice(1).toLowerCase().replace("jpg", "jpeg");
        out.avatars.push({ n: m ? +m[1] : null, name: m ? m[2] : path.basename(p).replace(/\.[^.]+$/, ""), data: `data:image/${ext};base64,${fs.readFileSync(p).toString("base64")}` });
      } else out.errors.push(`${path.basename(p)} : ce n'est pas un fichier audio`);
    } catch (e) {
      out.errors.push(`${path.basename(p)} : ${e.message}`);
    }
  }
  return out;
});

// Analyse du volume (mise en cache : une piste de 2 h n'est analysée qu'une fois)
ipcMain.handle("audio:analyze", async (_e, file) => {
  const st = fs.statSync(file);
  const key = crypto.createHash("sha1").update(`${file}|${st.size}|${st.mtimeMs}|v1`).digest("hex");
  const cached = path.join(CACHE, key + ".json");
  if (fs.existsSync(cached)) {
    try { return JSON.parse(fs.readFileSync(cached, "utf8")); } catch {}
  }
  const r = await analyze(file, (pct) => win && win.webContents.send("audio:progress", { file, pct }));
  fs.writeFileSync(cached, JSON.stringify(r));
  return r;
});
ipcMain.handle("audio:probe", (_e, file) => probe(file));
ipcMain.handle("files:exists", (_e, list) => list.map((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } }));

// Image de profil : redimensionnée côté page, ici on lit juste le fichier
ipcMain.handle("files:pickImage", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "Choisir une photo de profil",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
  });
  if (r.canceled) return null;
  const f = r.filePaths[0];
  const ext = path.extname(f).slice(1).toLowerCase().replace("jpg", "jpeg");
  return `data:image/${ext};base64,${fs.readFileSync(f).toString("base64")}`;
});

// Préréglage Hush (.hush) : le même fichier que « Exporter » dans les préréglages de Hush
ipcMain.handle("files:pickPreset", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Importer un préréglage Hush", properties: ["openFile"], filters: [{ name: "Préréglage Hush", extensions: ["hush", "json"] }] });
  if (r.canceled) return null;
  const j = JSON.parse(fs.readFileSync(r.filePaths[0], "utf8"));
  if (!j || typeof j.data !== "object") throw new Error("Ce fichier n'est pas un préréglage Hush");
  return { name: j.name || path.basename(r.filePaths[0], ".hush"), data: j.data };
});

/* ——— Projets ——— */
ipcMain.handle("project:open", async (_e, file) => {
  if (!file) {
    const r = await dialog.showOpenDialog(win, { title: "Ouvrir un projet", properties: ["openFile"], filters: [{ name: "Projet Hush Studio", extensions: ["hushstudio"] }] });
    if (r.canceled) return null;
    file = r.filePaths[0];
  }
  return { file, data: JSON.parse(fs.readFileSync(file, "utf8")) };
});
ipcMain.handle("project:save", async (_e, data, file, saveAs) => {
  if (!file || saveAs) {
    const r = await dialog.showSaveDialog(win, { title: "Enregistrer le projet", defaultPath: (data.name || "Mon vocal") + ".hushstudio", filters: [{ name: "Projet Hush Studio", extensions: ["hushstudio"] }] });
    if (r.canceled) return null;
    file = r.filePath;
  }
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
  return file;
});
ipcMain.handle("project:autosave", (_e, data) => {
  fs.writeFileSync(AUTOSAVE + ".tmp", JSON.stringify(data));
  fs.renameSync(AUTOSAVE + ".tmp", AUTOSAVE);
});
ipcMain.handle("project:recover", () => {
  try { return JSON.parse(fs.readFileSync(AUTOSAVE, "utf8")); } catch { return null; }
});
ipcMain.handle("project:locate", async (_e, name) => {
  const r = await dialog.showOpenDialog(win, { title: `Où est « ${name} » ?`, properties: ["openFile"], filters: [{ name: "Audio", extensions: AUDIO_EXT }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("app:confirmClose", () => { win.forceClose = true; win.close(); });

// Mode test (développement) : HS_TEST_IMPORT=fichier, HS_TEST_SHOT=capture.png, HS_TEST_AT=secondes
ipcMain.handle("test:info", () => (process.env.HS_TEST_SHOT ? { import: process.env.HS_TEST_IMPORT || null, shot: process.env.HS_TEST_SHOT, at: +(process.env.HS_TEST_AT || 0), play: !!process.env.HS_TEST_PLAY, exportOut: process.env.HS_TEST_EXPORT || null, exportLen: +(process.env.HS_TEST_EXPORT_LEN || 5) } : null));
ipcMain.handle("test:shot", async (_e, name) => {
  const img = await win.webContents.capturePage();
  const f = name ? process.env.HS_TEST_SHOT.replace(/\.png$/, `-${name}.png`) : process.env.HS_TEST_SHOT;
  fs.writeFileSync(f, img.toPNG());
  return f;
});
ipcMain.handle("test:log", (_e, msg) => fs.appendFileSync(process.env.HS_TEST_SHOT.replace(/\.png$/, ".log"), msg + "\n"));
ipcMain.handle("test:quit", () => { win.forceClose = true; app.quit(); });
ipcMain.handle("app:version", () => app.getVersion());

require("./export").setup(() => win, SCENE_DIR);

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());

module.exports = { SCENE_DIR };
