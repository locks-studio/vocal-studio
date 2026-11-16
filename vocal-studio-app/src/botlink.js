// Mode « bot » : l'appli se connecte au serveur Hush (bot Discord) au lieu du RPC local.
// Même interface que VoiceSession pour que le reste de l'appli n'y voie pas de différence.
const crypto = require("crypto");
const WebSocket = require("ws");

const LOGIN_TIMEOUT_MS = 10 * 60_000;

class BotLink {
  // store : { getServer(), getToken(), setToken(t) } ; openUrl(url) ; onState(etat)
  constructor(store, openUrl, onState) {
    this.store = store;
    this.openUrl = openUrl;
    this.onState = onState;
    this.ws = null;
    this.retry = null;
    this.loginTimer = null;
    this.stopped = true;
    this.state = this.blank("idle");
    this.pending = new Map(); // rid → { resolve, reject } (actions du menu clic droit)
    this.rid = 0;
    this.lastVideo = { cam: false, screen: false };
  }

  blank(status, error = null) {
    return { mode: "bot", controls: false, status, error, me: null, channel: null, members: [], settings: { mute: false, deaf: false } };
  }

  set(state) { this.state = state; this.onState(state); }
  snapshot() { return this.state; }
  server() { return (this.store.getServer() || "").replace(/\/$/, ""); }
  isLocal() { return /^https?:\/\/(localhost|127\.0\.0\.1)/.test(this.server()); }

  start() {
    this.stop();
    this.stopped = false;
    if (!this.server()) return this.set(this.blank("needs-config"));
    if (!this.store.getToken()) return this.set(this.blank("needs-login"));
    this.set({ ...this.blank("connecting"), me: this.state.me });

    const ws = new WebSocket(this.server().replace(/^http/, "ws") + "/ws");
    this.ws = ws;
    ws.on("open", () => ws.send(JSON.stringify({ type: "auth", token: this.store.getToken(), meta: this.meta })));
    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.type === "state") this.set({ ...msg.state, error: null });
      else if (msg.type === "error") this.set({ ...this.state, error: msg.message });
      else if (msg.type === "chat") { if (this.onChat) this.onChat(msg.message); }
      else if (msg.type === "friends-changed") { if (this.onFriends) this.onFriends(); }
      else if (msg.type === "friend-invite") { if (this.onInvite) this.onInvite(msg); }
      else if (msg.type === "hello") { this.admin = !!msg.admin; if (this.lastPresence !== undefined) this.send({ type: "presence", voice: this.lastPresence }); this.send({ type: "video", ...this.lastVideo }); if (this.onFriends) this.onFriends(); }
      else if (msg.type === "video-room" || msg.type === "rtc") { if (this.onVideo) this.onVideo(msg); }
      else if (msg.type === "mod-result") {
        const p = this.pending.get(msg.rid);
        if (!p) return;
        this.pending.delete(msg.rid);
        msg.ok ? p.resolve(msg.data) : p.reject(new Error(msg.error));
      }
    });
    ws.on("close", (code) => {
      if (this.ws !== ws || this.stopped) return;
      if (code === 4001) {
        // Session inconnue du serveur : il faut se reconnecter avec Discord
        this.store.setToken(null);
        return this.set(this.blank("needs-login"));
      }
      this.set(this.blank("disconnected", "Serveur Hush injoignable. Nouvelle tentative dans 5 s."));
      this.retry = setTimeout(() => this.start(), 5000);
    });
    ws.on("error", () => {}); // l'événement « close » suit et gère la suite
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    if (this.ws) { const ws = this.ws; this.ws = null; ws.terminate(); }
  }

  // « Se connecter avec Discord » : ouvre le navigateur, puis attend que le serveur ait reçu la réponse
  async login() {
    if (!this.server()) return this.set(this.blank("needs-config"));
    clearInterval(this.loginTimer);
    // Le serveur du bot doit tourner, sinon le navigateur tomberait sur une page vide et on tournerait en rond
    if (!(await this.serverUp())) {
      const hint = this.isLocal() ? "Lance « Lancer le bot.bat » (dossier vocal-studio-bot), puis réessaie." : "Vérifie ta connexion internet ou réessaie dans un moment.";
      return this.set(this.blank("needs-login", `Le serveur du bot ne répond pas à ${this.server()}. ${hint}`));
    }
    const state = crypto.randomBytes(18).toString("base64url");
    this.openUrl(`${this.server()}/auth/login?state=${state}`);
    this.set(this.blank("authorizing"));
    const started = Date.now();
    let misses = 0;
    this.loginTimer = setInterval(async () => {
      if (Date.now() - started > LOGIN_TIMEOUT_MS) {
        clearInterval(this.loginTimer);
        return this.set(this.blank("needs-login", "La connexion a pris trop de temps. Réessaie."));
      }
      try {
        const r = await fetch(`${this.server()}/auth/poll?state=${state}`).then((x) => x.json());
        misses = 0;
        if (r.token) { clearInterval(this.loginTimer); this.store.setToken(r.token); this.start(); }
        else if (r.error) { clearInterval(this.loginTimer); this.set(this.blank("needs-login", r.error)); }
      } catch {
        // Serveur injoignable plusieurs fois de suite : il a été fermé pendant la connexion
        if (++misses >= 5) {
          clearInterval(this.loginTimer);
          this.set(this.blank("needs-login", this.isLocal() ? "Le serveur du bot s'est arrêté pendant la connexion. Relance « Lancer le bot.bat », puis réessaie." : "Le serveur du bot ne répond plus. Réessaie dans un moment."));
        }
      }
    }, 2000);
  }

  async serverUp() {
    try {
      const r = await fetch(this.server() + "/", { signal: AbortSignal.timeout(3000) });
      return r.ok;
    } catch { return false; }
  }

  logout() {
    clearInterval(this.loginTimer);
    this.stop();
    this.store.setToken(null);
    this.set(this.blank("needs-login"));
  }

  send(msg) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg)); }
  summon() { this.send({ type: "summon" }); }
  // Pareil, mais en attendant la réponse du serveur (raison exacte si le bot ne peut pas venir)
  summonWait() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Pas connecté au bot."));
    const rid = ++this.rid;
    return new Promise((resolve, reject) => {
      this.pending.set(rid, { resolve, reject });
      setTimeout(() => { if (this.pending.delete(rid)) reject(new Error("Le serveur du bot n'a pas répondu (il faut peut-être le redémarrer).")); }, 10_000);
      this.send({ type: "summon", rid });
    });
  }
  dismiss() { this.send({ type: "dismiss" }); }

  // Tchat du salon vocal où tu es : historique ou envoi, réponse du serveur attendue
  chat(op, text) { return this.ask({ type: "chat", op, text }); }
  // Amis : liste, ajout, acceptation… ; presence : le vocal où tu es, gardé pour le renvoyer après une reconnexion
  friends(op, arg) { return this.ask({ type: "friends", op, arg }); }
  adminOp(op) { return this.ask({ type: "admin", op }); }
  // Vidéo entre applis Hush : ce que je montre (caméra / écran), et les messages WebRTC pour un autre membre
  video(v) { this.lastVideo = { cam: !!(v && v.cam), screen: !!(v && v.screen) }; this.send({ type: "video", ...this.lastVideo }); }
  rtc(to, data) { this.send({ type: "rtc", to, data }); }
  presence(voice) { this.lastPresence = voice; this.send({ type: "presence", voice }); }
  ask(msg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Pas connecté au bot."));
    const rid = ++this.rid;
    return new Promise((resolve, reject) => {
      this.pending.set(rid, { resolve, reject });
      setTimeout(() => { if (this.pending.delete(rid)) reject(new Error("Le serveur du bot n'a pas répondu (il faut peut-être le redémarrer).")); }, 10_000);
      this.send({ ...msg, rid });
    });
  }

  // Page d'accueil : vocaux suggérés et membres qui ont Hush
  home() { return this.userAction({ type: "home" }); }
  // Infos publiques du serveur (sans connexion) : bot en ligne ?, nom, lien d'invitation
  async info() {
    if (!this.server()) return null;
    try { return await fetch(this.server() + "/info", { signal: AbortSignal.timeout(3000) }).then((r) => r.json()); }
    catch { return { online: false, unreachable: true }; }
  }

  // Action de modération sur un membre (menu clic droit) : le serveur vérifie tes permissions
  userAction(a) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Pas connecté au bot."));
    const rid = ++this.rid;
    return new Promise((resolve, reject) => {
      this.pending.set(rid, { resolve, reject });
      setTimeout(() => { if (this.pending.delete(rid)) reject(new Error("Le bot n'a pas répondu.")); }, 10_000);
      this.send({ type: "mod", ...a, rid });
    });
  }

  // Le bot ne peut pas toucher à ton micro ni à ta sourdine personnels
  setMute() { return Promise.resolve(); }
  setDeaf() { return Promise.resolve(); }
  leave() { this.dismiss(); return Promise.resolve(); }
}

module.exports = { BotLink };
