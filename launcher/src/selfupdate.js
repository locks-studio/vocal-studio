// Mise à jour du launcher lui-même, comme les autres launchers : dès qu'une nouvelle version est dans le catalogue,
// il la télécharge en arrière-plan, vérifie qu'elle est exactement celle publiée (SHA-256), puis l'installe
// quand on clique « Redémarrer », ou tout seul à la fermeture.
//   Windows : l'installeur .exe, lancé en silencieux (il remplace l'ancienne version et relance 1999).
//   Mac : l'appli 1999.app (zip), mise à la place de l'ancienne.
//   Linux : le dossier 1999 (tar.gz), mis à la place de l'ancien.
// Si quelque chose bloque (dossier protégé, ancienne version en zip…), on revient au lien vers le site.
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const newer = (a, b) => {
  const p = (v) => String(v).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const x = p(a), y = p(b);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

class SelfUpdate {
  constructor({ app, installer, platform, send, log }) {
    Object.assign(this, { app, installer, platform, send, log });
    this.state = { status: "idle" }; // idle | downloading | ready | manual
    this.dir = path.join(app.getPath("userData"), "launcher-update");
    this.cleanOld();
  }

  // Restes d'une mise à jour précédente (ancienne version mise de côté)
  cleanOld() {
    try { fs.rmSync(this.dir, { recursive: true, force: true }); } catch {}
    const old = this.oldPath();
    if (old) { try { fs.rmSync(old, { recursive: true, force: true }); } catch {} }
  }

  // Où est installé ce launcher, selon le système
  root() {
    const exe = process.execPath;
    if (process.platform === "darwin") return path.resolve(exe, "..", "..", ".."); // …/1999.app
    if (process.platform === "linux") return path.dirname(exe); // …/1999
    return path.dirname(exe);
  }
  oldPath() { return process.platform === "win32" ? null : this.root() + ".ancienne"; }

  set(s) { this.state = s; this.send(s); }

  // Appelé à chaque lecture du catalogue
  async check(launcher) {
    if (!this.app.isPackaged || !launcher || !launcher.version || !newer(launcher.version, this.app.getVersion())) return;
    if (this.state.status === "downloading" || (this.state.status === "ready" && this.state.version === launcher.version)) return;
    const file = (launcher.updates || {})[this.platform];
    if (!file || !this.supported()) return this.set({ status: "manual", version: launcher.version });
    try {
      this.set({ status: "downloading", version: launcher.version, done: 0, total: file.size || 0 });
      fs.rmSync(this.dir, { recursive: true, force: true });
      fs.mkdirSync(this.dir, { recursive: true });
      const dest = path.join(this.dir, path.basename(new URL(file.url).pathname));
      let last = 0;
      await this.installer.download(file.url, dest, (done, total) => {
        if (Date.now() - last > 400) { last = Date.now(); this.set({ status: "downloading", version: launcher.version, done, total }); }
      }, {});
      const h = await this.installer.sha256(dest);
      if (file.sha256 && h.toLowerCase() !== String(file.sha256).toLowerCase()) throw new Error("fichier abîmé");
      this.ready = { version: launcher.version, file: dest, prepared: await this.prepare(dest) };
      this.set({ status: "ready", version: launcher.version });
    } catch (e) {
      this.log("mise à jour du launcher", e);
      this.set({ status: "manual", version: launcher.version });
    }
  }

  // Windows : seulement si 1999 a été installé avec l'installeur (sinon l'ancienne version en zip resterait à côté).
  // Mac et Linux : il faut pouvoir écrire à côté de l'appli.
  supported() {
    try {
      if (process.platform === "win32") return fs.readdirSync(this.root()).some((f) => /^Uninstall .*\.exe$/i.test(f));
      fs.accessSync(path.dirname(this.root()), fs.constants.W_OK);
      return true;
    } catch { return false; }
  }

  // Mac / Linux : la nouvelle version est décompressée à l'avance, juste à côté de l'ancienne
  async prepare(file) {
    if (process.platform === "win32") return null;
    const target = this.root() + ".nouvelle";
    fs.rmSync(target, { recursive: true, force: true });
    const tmp = path.join(path.dirname(this.root()), ".1999-maj");
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    const r = process.platform === "darwin"
      ? spawnSync("ditto", ["-x", "-k", file, tmp])
      : spawnSync("tar", ["-xzf", file, "-C", tmp]);
    if (r.status !== 0) throw new Error(`décompression impossible (${r.status})`);
    // Le zip Mac contient 1999.app ; le tar.gz Linux contient un dossier 1999
    const inner = fs.readdirSync(tmp).find((f) => (process.platform === "darwin" ? f.endsWith(".app") : fs.statSync(path.join(tmp, f)).isDirectory()));
    if (!inner) throw new Error("archive inattendue");
    fs.renameSync(path.join(tmp, inner), target);
    fs.rmSync(tmp, { recursive: true, force: true });
    if (process.platform === "darwin") spawnSync("xattr", ["-dr", "com.apple.quarantine", target]);
    return target;
  }

  // Installe la version prête. relaunch : relancer 1999 tout de suite après.
  apply(relaunch = true) {
    const r = this.ready;
    if (!r) return false;
    this.ready = null;
    try {
      if (process.platform === "win32") {
        // Installeur en silencieux ; --force-run relance 1999 à la fin. On le détache avant de quitter.
        spawn(r.file, ["/S", ...(relaunch ? ["--force-run"] : [])], { detached: true, stdio: "ignore" }).unref();
        this.app.exit(0);
        return true;
      }
      // Mac / Linux : on échange les dossiers (possible même pendant que l'ancienne version tourne)
      const root = this.root(), old = this.oldPath();
      fs.rmSync(old, { recursive: true, force: true });
      fs.renameSync(root, old);
      try { fs.renameSync(r.prepared, root); }
      catch (e) { fs.renameSync(old, root); throw e; }
      if (relaunch) this.app.relaunch({ execPath: process.execPath, args: process.argv.slice(1).filter((a) => a !== "--no-sandbox") });
      this.app.exit(0);
      return true;
    } catch (e) {
      this.log("installation de la mise à jour du launcher", e);
      this.set({ status: "manual", version: r.version });
      return false;
    }
  }
}

module.exports = { SelfUpdate, newer };
