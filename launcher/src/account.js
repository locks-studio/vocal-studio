// Compte Discord du launcher : même connexion que Hush, par le serveur du bot.
// Le navigateur s'ouvre sur Discord, le serveur reçoit la réponse et le launcher vient chercher la session.
// La session est chiffrée sur le disque quand le système le permet (seal / unseal).
const crypto = require("crypto");
const fs = require("fs");

const POLL_MS = 2000, TIMEOUT_MS = 5 * 60_000;

class Account {
  constructor({ file, server, openUrl, seal, unseal }) {
    Object.assign(this, { file, server: String(server).replace(/\/$/, ""), openUrl, seal, unseal });
    this.loginId = 0;
    try { this.data = JSON.parse(fs.readFileSync(file, "utf8")); } catch { this.data = {}; }
  }

  save() { fs.writeFileSync(this.file, JSON.stringify(this.data)); }
  token() { try { return this.data.session ? this.unseal(this.data.session) : null; } catch { return null; } }
  info() { return { signedIn: !!this.token(), user: this.data.user || null }; }

  async serverUp() {
    try { return (await fetch(this.server + "/", { signal: AbortSignal.timeout(4000) })).ok; } catch { return false; }
  }

  // Pseudo et photo : à jour à chaque ouverture. Une session refusée par le serveur est oubliée.
  async refresh() {
    const t = this.token();
    if (!t) return this.info();
    try {
      const r = await fetch(`${this.server}/auth/me`, { headers: { Authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(5000) });
      if (r.status === 401) { this.logout(); return this.info(); }
      if (r.ok) { this.data.user = await r.json(); this.save(); }
    } catch { /* serveur éteint : on garde ce qu'on sait */ }
    return this.info();
  }

  async login() {
    const id = ++this.loginId;
    if (!(await this.serverUp())) return { error: "offline" };
    const state = crypto.randomBytes(18).toString("base64url");
    this.openUrl(`${this.server}/auth/login?state=${state}`);
    const started = Date.now();
    while (Date.now() - started < TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (id !== this.loginId) return { error: "cancelled" };
      try {
        const r = await fetch(`${this.server}/auth/poll?state=${state}`, { signal: AbortSignal.timeout(8000) }).then((x) => x.json());
        if (r.token) {
          this.data.session = this.seal(r.token);
          this.save();
          return { ok: true, ...(await this.refresh()) };
        }
        if (r.error) return { error: r.error };
      } catch { /* coupure passagère : on réessaie */ }
    }
    return { error: "La connexion a pris trop de temps. Réessaie." };
  }

  cancel() { this.loginId++; }
  logout() { this.loginId++; this.data = {}; this.save(); }
}

module.exports = { Account };
