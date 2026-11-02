// Installation des logiciels du catalogue : téléchargement (avec progression), vérification SHA-256,
// décompression, et suivi des versions installées. Un logiciel = un dossier par version dans « apps ».
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const { spawn } = require("child_process");
const extract = require("extract-zip");

// Clé de la plateforme dans le catalogue : win32-x64, darwin-arm64, darwin-x64, linux-x64…
const PLATFORM = `${process.platform}-${process.arch}`;

class Installer {
  constructor(root) {
    this.root = root; // dossier d'installation (dans les données de l'utilisateur, pas besoin d'être admin)
    this.appsDir = path.join(root, "apps");
    this.tmpDir = path.join(root, "downloads");
    this.stateFile = path.join(root, "installed.json");
    fs.mkdirSync(this.appsDir, { recursive: true });
    try { this.state = JSON.parse(fs.readFileSync(this.stateFile, "utf8")); } catch { this.state = {}; }
    this.busy = new Map(); // id → { cancel }
  }

  save() { fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2)); }

  // Le fichier à télécharger pour ce PC (sur un Mac Apple Silicon, la version Intel marche aussi grâce à Rosetta)
  static pick(app) {
    const d = app.downloads || {};
    return d[PLATFORM] || (PLATFORM === "darwin-arm64" ? d["darwin-x64"] : null) || null;
  }

  installed(id) {
    const s = this.state[id];
    if (!s || !fs.existsSync(s.dir)) return null;
    return s;
  }

  // Téléchargement : https uniquement (et file:// pour tester en local), avec redirections
  download(url, dest, onProgress, signal) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      if (u.protocol === "file:") {
        fs.copyFileSync(decodeURIComponent(u.pathname.replace(/^\/([A-Za-z]:)/, "$1")), dest);
        onProgress(1, 1);
        return resolve();
      }
      if (u.protocol !== "https:") return reject(new Error("Lien de téléchargement non sécurisé (https obligatoire)."));
      const req = https.get(url, { headers: { "User-Agent": "1999-launcher" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(this.download(new URL(res.headers.location, url).toString(), dest, onProgress, signal));
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Le serveur a répondu ${res.statusCode}.`)); }
        const total = Number(res.headers["content-length"]) || 0;
        let got = 0;
        const out = fs.createWriteStream(dest);
        res.on("data", (c) => { got += c.length; onProgress(got, total); });
        res.pipe(out);
        out.on("finish", () => resolve());
        out.on("error", reject);
        res.on("error", reject);
      });
      req.on("error", (e) => reject(new Error(`Téléchargement impossible : ${e.message}`)));
      signal.cancel = () => { req.destroy(new Error("Annulé")); };
    });
  }

  sha256(file) {
    return new Promise((resolve, reject) => {
      const h = crypto.createHash("sha256");
      fs.createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
    });
  }

  // Installe (ou met à jour) un logiciel du catalogue. onStep({ phase, done, total })
  async install(app, onStep) {
    if (this.busy.has(app.id)) throw new Error("Déjà en cours.");
    // Electron voit les fichiers .asar comme des dossiers : pendant qu'on copie / supprime les logiciels, on le lui interdit
    process.noAsar = true;
    const file = Installer.pick(app);
    if (!file) throw new Error(`${app.name} n'est pas encore disponible pour ce système (${PLATFORM}).`);
    const signal = {};
    this.busy.set(app.id, signal);
    fs.mkdirSync(this.tmpDir, { recursive: true });
    const archive = path.join(this.tmpDir, `${app.id}-${app.version}.zip`);
    const target = path.join(this.appsDir, app.id, app.version);
    const staging = target + ".tmp";
    try {
      // 1. Téléchargement, avec vitesse
      let last = { t: Date.now(), b: 0 }, speed = 0;
      await this.download(file.url, archive, (done, total) => {
        const now = Date.now();
        if (now - last.t > 500) { speed = ((done - last.b) / (now - last.t)) * 1000; last = { t: now, b: done }; }
        onStep({ phase: "download", done, total: total || file.size || 0, speed });
      }, signal);
      // 2. Vérification : le fichier doit être exactement celui publié (rien d'abîmé ni de modifié en route)
      onStep({ phase: "verify" });
      if (file.sha256) {
        const h = await this.sha256(archive);
        if (h.toLowerCase() !== String(file.sha256).toLowerCase()) throw new Error("Le fichier téléchargé est abîmé ou ne correspond pas à la version publiée. Réessaie.");
      }
      // 3. Décompression dans un dossier temporaire, puis bascule d'un coup
      onStep({ phase: "extract" });
      fs.rmSync(staging, { recursive: true, force: true });
      await extract(archive, { dir: staging });
      fs.rmSync(target, { recursive: true, force: true });
      fs.renameSync(staging, target);
      const exec = path.join(target, file.exec);
      // Linux : un zip fabriqué sous Windows perd les droits « exécutable » ; on les remet au programme
      // et à ses programmes d'aide (chrome_crashpad_handler, chrome-sandbox…) qui sont à la racine
      if (process.platform === "linux") {
        for (const f of fs.readdirSync(target)) {
          const p = path.join(target, f);
          if (fs.statSync(p).isFile() && (p === exec || !path.extname(f) || f.endsWith(".so") || /\.so\./.test(f))) fs.chmodSync(p, 0o755);
        }
      }
      // 4. On garde seulement la nouvelle version
      const old = this.state[app.id];
      this.state[app.id] = { version: app.version, dir: target, exec, installedAt: Date.now() };
      this.save();
      if (old && old.dir !== target) fs.rmSync(old.dir, { recursive: true, force: true });
      onStep({ phase: "done" });
      return this.state[app.id];
    } finally {
      process.noAsar = false;
      this.busy.delete(app.id);
      fs.rmSync(archive, { force: true });
      fs.rmSync(staging, { recursive: true, force: true });
    }
  }

  cancel(id) { const s = this.busy.get(id); if (s && s.cancel) s.cancel(); }

  uninstall(id) {
    const s = this.state[id];
    if (!s) return;
    process.noAsar = true;
    try { fs.rmSync(path.join(this.appsDir, id), { recursive: true, force: true }); }
    finally { process.noAsar = false; }
    delete this.state[id];
    this.save();
  }

  // Lance le logiciel installé, séparé du launcher (il continue si on ferme le launcher)
  launch(id) {
    const s = this.installed(id);
    if (!s) throw new Error("Pas installé.");
    let child;
    if (process.platform === "darwin" && s.exec.endsWith(".app")) child = spawn("open", ["-n", s.exec], { detached: true, stdio: "ignore" });
    // Linux : Ubuntu 24.04+ bloque le bac à sable de Chromium pour les applis non installées par le système,
    // les applis Electron plantent au démarrage sans --no-sandbox
    else child = spawn(s.exec, process.platform === "linux" ? ["--no-sandbox"] : [], { detached: true, stdio: "ignore", cwd: path.dirname(s.exec) });
    child.on("error", () => {});
    child.unref();
  }
}

module.exports = { Installer, PLATFORM };
