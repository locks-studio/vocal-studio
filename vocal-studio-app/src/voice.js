// Suit le salon vocal où tu es connecté et envoie l'état à l'interface.
const { DiscordIPC } = require("./rpc");

const SCOPES = ["rpc", "rpc.voice.read", "rpc.voice.write", "identify"];
const CHANNEL_EVENTS = ["VOICE_STATE_CREATE", "VOICE_STATE_UPDATE", "VOICE_STATE_DELETE", "SPEAKING_START", "SPEAKING_STOP"];
const API = "https://discord.com/api/v10";

function toMember(vs) {
  const u = vs.user || {};
  const s = vs.voice_state || {};
  return {
    id: u.id,
    name: vs.nick || u.global_name || u.username || "?",
    avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256` : null,
    // Avatar animé : son identifiant commence par « a_ »
    avatarAnim: u.avatar && u.avatar.startsWith("a_") ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.gif?size=256` : null,
    muted: !!(s.mute || s.self_mute || s.suppress),
    deaf: !!(s.deaf || s.self_deaf),
    speaking: false,
  };
}

class VoiceSession {
  // store : { getConfig(), getToken(), setToken(t) } ; onState(etat) appelé à chaque changement
  constructor(store, onState) {
    this.store = store;
    this.onState = onState;
    this.ipc = null;
    this.stopped = false;
    this.retry = null;
    this.reset();
  }

  reset() {
    this.status = "idle";
    this.error = null;
    this.me = null;
    this.channel = null;
    this.members = new Map();
    this.settings = { mute: false, deaf: false };
  }

  snapshot() {
    return {
      status: this.status,
      error: this.error,
      me: this.me,
      channel: this.channel,
      members: [...this.members.values()],
      settings: this.settings,
    };
  }

  emit() { this.onState(this.snapshot()); }

  setStatus(status, error = null) {
    this.status = status;
    this.error = error;
    this.emit();
  }

  async start() {
    this.stopped = false;
    clearTimeout(this.retry);
    this.reset();
    this.setStatus("connecting");
    // Sans Client ID saisi (un ami), on prend celui de l'appli du serveur Hush
    let clientId;
    try { clientId = await this.clientId(); this.appId = clientId; }
    catch (e) {
      if (this.stopped) return;
      this.setStatus("disconnected", e.message);
      this.retry = setTimeout(() => this.start(), 5000);
      return;
    }
    if (this.stopped) return;
    const ipc = new DiscordIPC(clientId);
    this.ipc = ipc;
    ipc.on("event", (evt, data) => this.onEvent(evt, data));
    ipc.on("closed", (reason) => {
      if (this.ipc !== ipc || this.stopped) return;
      this.setStatus("disconnected", reason);
      this.retry = setTimeout(() => this.start(), 5000);
    });

    try {
      await ipc.connect();
      await this.authenticate();
      await ipc.subscribe("VOICE_CHANNEL_SELECT");
      await ipc.subscribe("VOICE_SETTINGS_UPDATE");
      const vset = await ipc.request("GET_VOICE_SETTINGS");
      this.settings = { mute: !!vset.mute, deaf: !!vset.deaf };
      const sel = await ipc.request("GET_SELECTED_VOICE_CHANNEL");
      this.setStatus("ready");
      if (sel) await this.watchChannel(sel.id);
    } catch (e) {
      if (this.ipc !== ipc) return;
      ipc.close();
      this.setStatus("error", e.message);
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    if (this.ipc) this.ipc.close();
    this.ipc = null;
    this.reset();
  }

  async authenticate() {
    const saved = this.store.getToken();
    if (saved && saved.access_token) {
      try { return await this.useToken(saved.access_token); } catch {}
      if (saved.refresh_token) {
        try {
          const t = await this.tokenRequest({ grant_type: "refresh_token", refresh_token: saved.refresh_token });
          return await this.useToken(t.access_token);
        } catch {}
      }
    }
    // Première fois : Discord affiche une fenêtre « Autoriser Hush ? »
    this.setStatus("authorizing");
    const { redirectUri } = this.store.getConfig();
    const clientId = await this.clientId();
    const { code } = await this.ipc.request("AUTHORIZE", { client_id: clientId, scopes: SCOPES });
    const t = await this.tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
    await this.useToken(t.access_token);
  }

  // Identifiant de l'appli Discord : celui saisi, sinon celui du serveur Hush (connexion directe d'un ami)
  async clientId() {
    const { clientId, botServer } = this.store.getConfig();
    if (clientId) return clientId;
    if (this._serverClientId) return this._serverClientId;
    const info = await fetch(`${botServer.replace(/\/$/, "")}/info`, { signal: AbortSignal.timeout(8000) }).then((r) => r.json()).catch(() => null);
    if (!info || !info.clientId) throw new Error("Le serveur Hush ne répond pas : impossible de préparer la connexion directe.");
    return (this._serverClientId = info.clientId);
  }

  async tokenRequest(params) {
    const { clientSecret, botServer } = this.store.getConfig();
    // Pas de secret sur ce PC (un ami) : c'est le serveur Hush qui fait l'échange, le secret n'en sort jamais
    if (!clientSecret) {
      const res = await fetch(`${botServer.replace(/\/$/, "")}/rpc/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params.grant_type === "refresh_token" ? params : { grant_type: params.grant_type, code: params.code }),
        signal: AbortSignal.timeout(15000),
      }).catch(() => null);
      if (!res) throw new Error("Le serveur Hush ne répond pas (il doit tourner pour la première connexion).");
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.access_token) throw new Error(`Connexion refusée (${res.status}) : ${body.error_description || body.error || "réessaie"}`);
      this.store.setToken(body);
      return body;
    }
    const clientId = await this.clientId();
    const res = await fetch(`${API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Échange du jeton refusé (${res.status}) : ${body.error_description || body.error || "vérifie le Client Secret et l'URL de redirection"}`);
    this.store.setToken(body);
    return body;
  }

  async useToken(accessToken) {
    const data = await this.ipc.request("AUTHENTICATE", { access_token: accessToken });
    const u = data.user;
    this.me = { id: u.id, name: u.global_name || u.username, avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256` : null };
  }

  async watchChannel(channelId) {
    const ipc = this.ipc;
    if (this.channel) {
      for (const evt of CHANNEL_EVENTS) await ipc.unsubscribe(evt, { channel_id: this.channel.id });
    }
    this.members.clear();
    this.channel = null;
    if (!channelId) return this.emit();

    const ch = await ipc.request("GET_CHANNEL", { channel_id: channelId });
    let guild = null;
    if (ch.guild_id) {
      try { guild = (await ipc.request("GET_GUILD", { guild_id: ch.guild_id })).name; } catch {}
    }
    // type 1 : appel privé, 3 : appel de groupe
    const call = ch.type === 1 || ch.type === 3;
    let callee = null;
    if (call) {
      const meId = this.me && this.me.id;
      const users = [...(ch.recipients || []), ...((ch.messages || []).map((m) => m.author))].filter((u) => u && u.id && u.id !== meId);
      const u = users[0];
      if (u) callee = { id: u.id, name: u.global_name || u.username || "?", avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256` : null };
    }
    this.channel = { id: ch.id, name: ch.name || (callee ? callee.name : "Appel privé"), guild, call, callee };
    for (const vs of ch.voice_states || []) {
      if (this.isHushBot(vs)) continue;
      const m = toMember(vs);
      this.members.set(m.id, m);
    }
    for (const evt of CHANNEL_EVENTS) await ipc.subscribe(evt, { channel_id: channelId });
    this.emit();
  }

  // Le bot Hush (1999) dans le salon : on ne l'affiche pas (son compte a le même identifiant que l'appli)
  isHushBot(vs) {
    const u = (vs && vs.user) || {};
    return !!this.appId && u.id === this.appId;
  }

  onEvent(evt, data) {
    switch (evt) {
      case "VOICE_CHANNEL_SELECT":
        this.watchChannel(data.channel_id).catch((e) => this.setStatus("error", e.message));
        return;
      case "VOICE_SETTINGS_UPDATE":
        this.settings = { mute: !!data.mute, deaf: !!data.deaf };
        break;
      case "VOICE_STATE_CREATE":
      case "VOICE_STATE_UPDATE": {
        if (this.isHushBot(data)) return;
        const m = toMember(data);
        const old = this.members.get(m.id);
        if (old) m.speaking = old.speaking && !m.muted;
        this.members.set(m.id, m);
        break;
      }
      case "VOICE_STATE_DELETE":
        this.members.delete(data.user && data.user.id);
        break;
      case "SPEAKING_START":
      case "SPEAKING_STOP": {
        const m = this.members.get(data.user_id);
        if (m) m.speaking = evt === "SPEAKING_START";
        break;
      }
      default:
        return;
    }
    this.emit();
  }

  // Actions depuis la barre d'appel
  setMute(mute) { return this.ipc.request("SET_VOICE_SETTINGS", { mute }); }
  // Menu clic droit en connexion locale : volume (0–200) et muet pour toi seulement, comme dans Discord
  userAction(a) {
    if (a.action === "volume") return this.ipc.request("SET_USER_VOICE_SETTINGS", { user_id: a.target, volume: Math.max(0, Math.min(200, Math.round(a.volume))) });
    if (a.action === "localMute") return this.ipc.request("SET_USER_VOICE_SETTINGS", { user_id: a.target, mute: !!a.on });
    return Promise.reject(new Error("Disponible seulement avec le bot Hush (mode bot)."));
  }
  setDeaf(deaf) { return this.ipc.request("SET_VOICE_SETTINGS", { deaf }); }
  leave() { return this.ipc.request("SELECT_VOICE_CHANNEL", { channel_id: null, force: true }); }
}

module.exports = { VoiceSession };
