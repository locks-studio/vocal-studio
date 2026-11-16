// Fonds Wallpaper Engine (Windows) : Hush lit les fonds déjà téléchargés dans Wallpaper Engine et les propose en fond.
//  - Vidéo : la vraie vidéo, en boucle (Hush sait déjà afficher une vidéo en fond).
//  - Scène, web, application : seulement leur aperçu (image ou GIF). Une scène a un format propre à Wallpaper Engine,
//    et un fond web exécuterait du code venu d'inconnus : on ne le fait jamais tourner.
// Où : le dossier Steam (registre), chacune de ses bibliothèques (libraryfolders.vdf), puis
//   steamapps/workshop/content/431960/<id>/       ← les fonds du Workshop
//   steamapps/common/wallpaper_engine/projects/{defaultprojects,myprojects}/<nom>/   ← fournis et créés soi-même
// Rien n'est copié ni modifié : Hush lit les fichiers sur place, par le protocole vsmedia://we/<clé>/<fichier>.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const MEDIA = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", gif: "image/gif", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

class WallpaperEngine {
  constructor() { this.items = new Map(); } // clé → { dir, ... }

  steamDirs() {
    const out = new Set();
    if (process.platform !== "win32") return [];
    for (const key of ["HKCU\\Software\\Valve\\Steam", "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam"]) {
      const r = spawnSync("reg", ["query", key, "/v", key.startsWith("HKCU") ? "SteamPath" : "InstallPath"], { encoding: "utf8", windowsHide: true });
      const m = /REG_SZ\s+(.+)$/m.exec(r.stdout || "");
      if (m) out.add(path.normalize(m[1].trim()));
    }
    out.add("C:\\Program Files (x86)\\Steam");
    // Les autres bibliothèques Steam (jeux sur un autre disque)
    for (const s of [...out]) {
      try {
        const vdf = fs.readFileSync(path.join(s, "steamapps", "libraryfolders.vdf"), "utf8");
        for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) out.add(path.normalize(m[1].replace(/\\\\/g, "\\")));
      } catch {}
    }
    // Windows ne distingue pas majuscules et minuscules : « c:\program files » et « C:\Program Files » sont le même dossier
    const seen = new Set();
    return [...out].filter((d) => {
      const k = d.toLowerCase().replace(/[\\/]+$/, "");
      if (seen.has(k)) return false;
      seen.add(k);
      try { return fs.statSync(d).isDirectory(); } catch { return false; }
    });
  }

  // La liste des fonds, pour la galerie de Hush (relue à chaque ouverture : un fond téléchargé entre-temps apparaît)
  list() {
    this.items.clear();
    const found = [];
    const add = (dir, source) => {
      let p;
      try { p = JSON.parse(fs.readFileSync(path.join(dir, "project.json"), "utf8")); } catch { return; }
      const type = String(p.type || "").toLowerCase();
      const file = typeof p.file === "string" ? path.basename(p.file) : "";
      const preview = typeof p.preview === "string" ? path.basename(p.preview) : "";
      const ext = (f) => path.extname(f).slice(1).toLowerCase();
      const isVideo = type === "video" && /^video\//.test(MEDIA[ext(file)] || "") && fs.existsSync(path.join(dir, file));
      const hasPreview = preview && MEDIA[ext(preview)] && fs.existsSync(path.join(dir, preview));
      if (!isVideo && !hasPreview) return;
      const key = `${source}-${path.basename(dir)}`.replace(/[^\w-]/g, "_").slice(0, 80);
      if (this.items.has(key)) return; // même fond vu deux fois
      this.items.set(key, { dir, files: new Set([file, preview].filter(Boolean)) });
      found.push({
        key, type, source, title: String(p.title || path.basename(dir)).slice(0, 80),
        // Vidéo : la vidéo elle-même ; sinon l'aperçu (image fixe ou GIF animé)
        url: isVideo ? `vsmedia://we/${key}/${encodeURIComponent(file)}` : `vsmedia://we/${key}/${encodeURIComponent(preview)}`,
        kind: isVideo ? "video" : "image",
        preview: hasPreview ? `vsmedia://we/${key}/${encodeURIComponent(preview)}` : null,
        animated: isVideo || ext(preview) === "gif",
      });
    };
    for (const s of this.steamDirs()) {
      const ws = path.join(s, "steamapps", "workshop", "content", "431960");
      for (const id of safeList(ws)) add(path.join(ws, id), "workshop");
      const projects = path.join(s, "steamapps", "common", "wallpaper_engine", "projects");
      for (const sub of ["myprojects", "defaultprojects"]) for (const n of safeList(path.join(projects, sub))) add(path.join(projects, sub, n), sub === "myprojects" ? "mine" : "default");
    }
    // Les vidéos d'abord (les vrais fonds animés), puis par nom
    found.sort((a, b) => (b.kind === "video") - (a.kind === "video") || a.title.localeCompare(b.title, "fr"));
    return { available: found.length > 0 || this.steamDirs().some((s) => fs.existsSync(path.join(s, "steamapps", "common", "wallpaper_engine"))), items: found };
  }

  // Le chemin d'un fichier demandé par vsmedia://we/<clé>/<fichier> : seulement un fichier listé, du bon type
  resolve(key, file) {
    if (!this.items.size) this.list(); // après un redémarrage de Hush, le fond choisi doit s'afficher tout de suite
    const it = this.items.get(key);
    const name = path.basename(file || "");
    if (!it || !it.files.has(name) || !MEDIA[path.extname(name).slice(1).toLowerCase()]) return null;
    const full = path.join(it.dir, name);
    return path.dirname(full) === it.dir ? { file: full, type: MEDIA[path.extname(name).slice(1).toLowerCase()] } : null;
  }
}

function safeList(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; }
}

module.exports = { WallpaperEngine };
