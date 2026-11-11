// Installation des logiciels du catalogue : téléchargement (avec progression), vérification SHA-256,
// décompression, et suivi des versions installées. Un logiciel = un dossier par version dans « apps ».
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const { spawn } = require("child_process");
const os = require("os");
const extract = require("extract-zip");

// Une erreur système en phrase compréhensible
function friendly(e, name) {
  const c = e && e.code, m = String((e && e.message) || e);
  if (c === "ENOSPC") return "Plus assez de place sur le disque.";
  if (c === "EBUSY" || c === "EPERM" || c === "EACCES") return `${name} est sans doute ouvert : ferme-le, puis réessaie.`;
  if (c === "ENOTFOUND" || c === "EAI_AGAIN") return "Pas de connexion internet, ou le site est injoignable.";
  if (c === "ECONNRESET" || c === "ETIMEDOUT" || c === "ECONNREFUSED") return "La connexion au site a été coupée. Réessaie.";
  return m;
}

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
    this.cleanOld();
  }

  // Restes d'une ancienne version qu'on n'a pas pu effacer parce qu'elle tournait, téléchargements interrompus
  cleanOld() {
    process.noAsar = true;
    try {
      for (const [id, s] of Object.entries(this.state)) {
        const dir = path.join(this.appsDir, id);
        for (const v of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
          const p = path.join(dir, v);
          if (p !== s.dir) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} }
        }
      }
      fs.rmSync(this.tmpDir, { recursive: true, force: true });
    } catch {} finally { process.noAsar = false; }
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
  download(url, dest, onProgress, signal, hops = 0) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      if (hops > 5) return reject(new Error("Trop de redirections sur le lien de téléchargement."));
      if (u.protocol === "file:") {
        fs.copyFileSync(decodeURIComponent(u.pathname.replace(/^\/([A-Za-z]:)/, "$1")), dest);
        onProgress(1, 1);
        return resolve();
      }
      if (u.protocol !== "https:") return reject(new Error("Lien de téléchargement non sécurisé (https obligatoire)."));
      const req = https.get(url, { headers: { "User-Agent": "1999-launcher" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(this.download(new URL(res.headers.location, url).toString(), dest, onProgress, signal, hops + 1));
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Le serveur a répondu ${res.statusCode}.`)); }
        const total = Number(res.headers["content-length"]) || 0;
        let got = 0;
        const out = fs.createWriteStream(dest);
        res.on("data", (c) => { got += c.length; onProgress(got, total); });
        res.pipe(out);
        // Connexion coupée en route : le fichier serait incomplet
        res.on("aborted", () => { out.destroy(); reject(new Error("La connexion a été coupée pendant le téléchargement. Réessaie.")); });
        out.on("finish", () => (total && got !== total ? reject(new Error("Le téléchargement est incomplet. Réessaie.")) : resolve()));
        out.on("error", reject);
        res.on("error", reject);
      });
      // Plus rien ne passe depuis 30 s : on arrête plutôt que d'attendre pour rien
      req.setTimeout(30_000, () => req.destroy(new Error("La connexion ne répond plus. Réessaie.")));
      req.on("error", reject);
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
    // Assez de place : l'archive plus la version décompressée (environ trois fois sa taille)
    try {
      const st = await fs.promises.statfs(this.root);
      if (file.size && st.bavail * st.bsize < file.size * 3.5) { this.busy.delete(app.id); process.noAsar = false; throw Object.assign(new Error("place"), { code: "ENOSPC" }); }
    } catch (e) { if (e.code === "ENOSPC") throw new Error(friendly(e, app.name)); }
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
      // Réparation de la version en place : on l'écarte d'abord. Si le logiciel tourne, ça échoue ici sans rien abîmer.
      const aside = target + ".old";
      if (fs.existsSync(target)) { fs.rmSync(aside, { recursive: true, force: true }); fs.renameSync(target, aside); }
      fs.renameSync(staging, target);
      fs.rmSync(aside, { recursive: true, force: true });
      const exec = path.join(target, file.exec);
      // Linux : un zip fabriqué sous Windows perd les droits « exécutable » ; on les remet au programme
      // et à ses programmes d'aide (chrome_crashpad_handler, chrome-sandbox…) qui sont à la racine
      if (process.platform === "linux") {
        for (const f of fs.readdirSync(target)) {
          const p = path.join(target, f);
          if (fs.statSync(p).isFile() && (p === exec || !path.extname(f) || f.endsWith(".so") || /\.so\./.test(f))) fs.chmodSync(p, 0o755);
        }
      }
      // Mac : rien ne doit rester marqué « téléchargé d'internet », sinon macOS bloquerait l'ouverture
      if (process.platform === "darwin") await new Promise((r) => { const c = spawn("xattr", ["-dr", "com.apple.quarantine", target], { stdio: "ignore" }); c.on("exit", r); c.on("error", r); });
      // 4. On garde seulement la nouvelle version
      const old = this.state[app.id];
      this.state[app.id] = { version: app.version, dir: target, exec, installedAt: Date.now() };
      this.save();
      // L'ancienne version tourne encore ? Elle sera effacée au prochain lancement du launcher
      if (old && old.dir !== target) { try { fs.rmSync(old.dir, { recursive: true, force: true }); } catch {} }
      onStep({ phase: "done" });
      return this.state[app.id];
    } catch (e) {
      throw new Error(friendly(e, app.name));
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
  launch(id, session) {
    const s = this.installed(id);
    if (!s) throw new Error("Pas installé.");
    if (!fs.existsSync(s.exec)) throw new Error("Des fichiers manquent : clique sur Réparer.");
    let child;
    // La session passe par l'environnement du programme : invisible dans la liste des processus, contrairement aux arguments
    const env = session ? { ...process.env, HUSH_SESSION: session } : process.env;
    // Mac : on lance le programme qui est dans l'appli (Hush.app/Contents/MacOS/Hush). « open » ne transmettrait pas
    // la session, et il faudrait se reconnecter à chaque lancement.
    if (process.platform === "darwin" && s.exec.endsWith(".app")) {
      const bin = macBinary(s.exec);
      if (!bin) throw new Error("Des fichiers manquent : clique sur Réparer.");
      child = spawn(bin, [], { detached: true, stdio: "ignore", env });
    }
    // Linux : Ubuntu 24.04+ bloque le bac à sable de Chromium pour les applis non installées par le système,
    // les applis Electron plantent au démarrage sans --no-sandbox
    else child = spawn(s.exec, process.platform === "linux" ? linuxArgs() : [], { detached: true, stdio: "ignore", cwd: path.dirname(s.exec), env });
    child.on("error", () => {});
    child.unref();
  }
}

// Le programme d'une appli Mac : son nom est écrit dans Contents/Info.plist (CFBundleExecutable)
function macBinary(appPath) {
  const dir = path.join(appPath, "Contents", "MacOS");
  try {
    const plist = fs.readFileSync(path.join(appPath, "Contents", "Info.plist"), "utf8");
    const name = (/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/.exec(plist) || [])[1];
    if (name && fs.existsSync(path.join(dir, name))) return path.join(dir, name);
  } catch {}
  const guess = path.join(dir, path.basename(appPath, ".app"));
  if (fs.existsSync(guess)) return guess;
  try { const f = fs.readdirSync(dir)[0]; return f ? path.join(dir, f) : null; } catch { return null; }
}

// Linux : mêmes options que lancer-hush.sh (affichage choisi dans Hush, Wayland si le bureau l'est, carte graphique)
function linuxArgs() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  let mode = "";
  for (const d of ["Hush", "vocal-studio"]) { try { mode = mode || fs.readFileSync(path.join(base, d, "linux-display"), "utf8").trim(); } catch {} }
  if (!mode) mode = process.env.WAYLAND_DISPLAY ? "wayland" : "x11";
  const gpu = ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--enable-zero-copy"];
  if (mode === "wayland") return ["--no-sandbox", "--ozone-platform=wayland", ...gpu];
  if (mode === "nogpu") return ["--no-sandbox", "--ozone-platform=x11", "--disable-gpu", "--enable-transparent-visuals"];
  return ["--no-sandbox", "--ozone-platform=x11", "--enable-transparent-visuals", ...gpu];
}

module.exports = { Installer, PLATFORM };
