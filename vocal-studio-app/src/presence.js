// Rich Presence : « Hush » sur le profil Discord (salon en cours, depuis combien de temps).
// Une petite connexion à Discord à part (le même tube discord-ipc que la connexion directe), qui ne sert qu'à ça.
// Si Discord est fermé, on réessaie tout seul plus tard ; en quittant Hush, la présence disparaît.
const { DiscordIPC } = require("./rpc");

const ICON = "https://raw.githubusercontent.com/locks-studio/vocal-studio/main/vocal-studio-app/build/icon.png";

class Presence {
  constructor(getClientId) {
    this.getClientId = getClientId;
    this.ipc = null;
    this.want = null;
    this.busy = false;
    this.again = false;
    this.retryAt = 0;
    this.timer = setInterval(() => { if (this.want && !this.ipc) this.flush(); }, 60_000);
  }

  set(p) {
    this.want = p && p.details ? p : null;
    this.flush();
  }

  async flush() {
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    try {
      if (!this.ipc) {
        if (!this.want || Date.now() < this.retryAt) return;
        const id = await this.getClientId();
        if (!id) { this.retryAt = Date.now() + 60_000; return; }
        const ipc = new DiscordIPC(id);
        ipc.on("closed", () => { if (this.ipc === ipc) this.ipc = null; });
        await ipc.connect();
        this.ipc = ipc;
      }
      const w = this.want;
      const activity = w ? {
        details: String(w.details).slice(0, 120),
        state: String(w.state || "").slice(0, 120) || undefined,
        timestamps: { start: Math.round((w.since || Date.now()) / 1000) },
        assets: { large_image: ICON, large_text: "Hush" },
        instance: false,
      } : undefined;
      await this.ipc.request("SET_ACTIVITY", { pid: process.pid, activity });
    } catch {
      this.retryAt = Date.now() + 30_000;
      if (this.ipc) { try { this.ipc.close(); } catch {} this.ipc = null; }
    } finally {
      this.busy = false;
      if (this.again) { this.again = false; this.flush(); }
    }
  }

  stop() {
    clearInterval(this.timer);
    if (this.ipc) { try { this.ipc.close(); } catch {} this.ipc = null; }
  }
}

module.exports = { Presence };
