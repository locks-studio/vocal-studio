// Raccourcis : « Hush » (et les prochains logiciels) sur le bureau et dans le menu des applis, et « 1999 » sous Linux.
// Le raccourci d'un logiciel lance le launcher avec --lancer=<id> : le launcher ouvre la version installée, vérifie
// les mises à jour sans se montrer, puis se ferme. Le raccourci reste donc bon après chaque mise à jour.
//   Windows : .lnk sur le bureau et dans le menu Démarrer (icône .ico tirée de l'appli)
//   Linux   : fichier .desktop dans le menu des applis (et sur le bureau s'il existe)
//   Mac     : lien dans ~/Applications (1999 est déjà dans Applications grâce au .dmg)
const { app, nativeImage, shell } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const iconsDir = () => path.join(app.getPath("userData"), "icons");

// Une icône .ico (Windows) qui contient l'image en PNG à plusieurs tailles
function icoFromPng(png) {
  const img = nativeImage.createFromBuffer(png);
  const parts = [16, 32, 48, 256].map((s) => [s, img.resize({ width: s, height: s, quality: "best" }).toPNG()]);
  const head = Buffer.alloc(6 + 16 * parts.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(parts.length, 4);
  let off = head.length;
  parts.forEach(([s, b], i) => {
    const o = 6 + i * 16;
    head.writeUInt8(s >= 256 ? 0 : s, o); head.writeUInt8(s >= 256 ? 0 : s, o + 1);
    head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(b.length, o + 8); head.writeUInt32LE(off, o + 12); off += b.length;
  });
  return Buffer.concat([head, ...parts.map((p) => p[1])]);
}

// L'icône d'une appli installée : son build/icon.png, dans son app.asar (lisible par Electron)
function appIconPng(installDir, exec) {
  const res = process.platform === "darwin" ? path.join(installDir, exec, "Contents", "Resources") : path.join(installDir, "resources");
  for (const p of [path.join(res, "app.asar", "build", "icon.png"), path.join(res, "app", "build", "icon.png")]) {
    try { return fs.readFileSync(p); } catch {}
  }
  return null;
}

function writeIcons(name, png) {
  if (!png) return {};
  fs.mkdirSync(iconsDir(), { recursive: true });
  const out = { png: path.join(iconsDir(), name + ".png") };
  fs.writeFileSync(out.png, png);
  if (process.platform === "win32") { out.ico = path.join(iconsDir(), name + ".ico"); fs.writeFileSync(out.ico, icoFromPng(png)); }
  return out;
}

function desktopDir() {
  if (process.platform === "linux") {
    const r = spawnSync("xdg-user-dir", ["DESKTOP"], { encoding: "utf8" });
    const d = (r.stdout || "").trim();
    if (d && d !== os.homedir() && fs.existsSync(d)) return d;
  }
  const d = path.join(os.homedir(), "Desktop");
  return fs.existsSync(d) ? d : null;
}

function linuxEntry({ name, comment, exec, icon, id }) {
  return `[Desktop Entry]\nType=Application\nName=${name}\nComment=${comment}\nExec=${exec}\nIcon=${icon || ""}\nTerminal=false\nCategories=Network;Utility;\nStartupWMClass=${id}\n`;
}
const quote = (p) => `"${p.replace(/(["\\$`])/g, "\\$1")}"`;

// Raccourcis d'un logiciel installé (id, nom), appelé après chaque installation ou mise à jour, et au démarrage
function forApp(entry, state) {
  if (!app.isPackaged || !state) return;
  const id = entry.id, name = entry.name || id;
  try {
    if (process.platform === "darwin") {
      // ~/Applications/Hush.app → la version installée (mis à jour à chaque installation)
      const dir = path.join(os.homedir(), "Applications");
      fs.mkdirSync(dir, { recursive: true });
      const link = path.join(dir, `${name}.app`);
      try { if (fs.lstatSync(link).isSymbolicLink()) fs.unlinkSync(link); else return; } catch {}
      fs.symlinkSync(state.exec, link);
      return;
    }
    const icons = writeIcons(id, appIconPng(state.dir, path.basename(state.exec)));
    if (process.platform === "win32") {
      const opts = { target: process.execPath, args: `--lancer=${id}`, description: `Lancer ${name}`, icon: icons.ico || state.exec, iconIndex: 0, cwd: path.dirname(process.execPath) };
      const places = [path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs"), desktopDir()].filter(Boolean);
      for (const dir of places) {
        const lnk = path.join(dir, `${name}.lnk`);
        shell.writeShortcutLink(lnk, fs.existsSync(lnk) ? "replace" : "create", opts);
      }
      return;
    }
    // Linux
    const text = linuxEntry({ name, comment: entry.tagline || name, exec: `${quote(process.execPath)} --lancer=${id}`, icon: icons.png, id: `${id}-1999` });
    const apps = path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "applications");
    fs.mkdirSync(apps, { recursive: true });
    for (const f of [path.join(apps, `fr.locks.${id}.desktop`), desktopDir() && path.join(desktopDir(), `${name}.desktop`)].filter(Boolean)) {
      fs.writeFileSync(f, text);
      fs.chmodSync(f, 0o755);
    }
    // GNOME : un raccourci du bureau doit être marqué « de confiance » pour se lancer d'un double-clic
    const d = desktopDir();
    if (d) spawnSync("gio", ["set", path.join(d, `${name}.desktop`), "metadata::trusted", "true"], { stdio: "ignore" });
  } catch {}
}

function removeApp(entry) {
  const name = entry.name || entry.id;
  const files = process.platform === "darwin" ? [path.join(os.homedir(), "Applications", `${name}.app`)]
    : process.platform === "win32" ? [path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", `${name}.lnk`), desktopDir() && path.join(desktopDir(), `${name}.lnk`)]
    : [path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "applications", `fr.locks.${entry.id}.desktop`), desktopDir() && path.join(desktopDir(), `${name}.desktop`)];
  for (const f of files.filter(Boolean)) { try { fs.rmSync(f, { force: true }); } catch {} }
}

// Linux : le launcher lui-même (le .tar.gz n'installe rien dans le menu)
function forLauncher() {
  if (!app.isPackaged || process.platform !== "linux") return;
  try {
    const png = fs.readFileSync(path.join(__dirname, "..", "build", "icon.png"));
    const icons = writeIcons("1999", png);
    const text = linuxEntry({ name: "1999", comment: "Installe, met à jour et lance Hush", exec: quote(process.execPath), icon: icons.png, id: "launcher-1999" });
    const apps = path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "applications");
    fs.mkdirSync(apps, { recursive: true });
    const f = path.join(apps, "fr.locks.launcher1999.desktop");
    fs.writeFileSync(f, text);
    fs.chmodSync(f, 0o755);
    const d = desktopDir();
    if (d) {
      const df = path.join(d, "1999.desktop");
      if (!fs.existsSync(df)) { fs.writeFileSync(df, text); fs.chmodSync(df, 0o755); spawnSync("gio", ["set", df, "metadata::trusted", "true"], { stdio: "ignore" }); }
    }
  } catch {}
}

module.exports = { forApp, removeApp, forLauncher };
