// Rapports d'erreur envoyés par Hush (seulement si la personne a accepté).
// Gardés sur disque : les 200 derniers, lisibles uniquement dans la vue administrateur.
const fs = require("fs");

const MAX = 200;
const clean = (s, n) => String(s == null ? "" : s).slice(0, n);

class Reports {
  constructor(file) {
    this.file = file;
    this.timer = null;
    try { this.list = JSON.parse(fs.readFileSync(file, "utf8")); } catch { this.list = []; }
    if (!Array.isArray(this.list)) this.list = [];
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => fs.writeFile(this.file + ".tmp", JSON.stringify(this.list), (e) => { if (!e) fs.rename(this.file + ".tmp", this.file, () => {}); }), 1000);
    if (this.timer.unref) this.timer.unref();
  }

  add(r, user) {
    if (!r || typeof r !== "object" || !r.message) return false;
    this.list.unshift({
      at: Date.now(), user: user ? clean(user.name, 80) : null,
      where: clean(r.where, 30), version: clean(r.version, 20), os: clean(r.os, 30),
      message: clean(r.message, 400), stack: clean(r.stack, 2000),
    });
    this.list.length = Math.min(this.list.length, MAX);
    this.save();
    return true;
  }

  clear() { this.list = []; this.save(); }
}

module.exports = { Reports };
