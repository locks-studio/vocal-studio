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
    const { clientId } = this.store.getConfig();
    if (!clientId) return this.setStatus("needs-config");

    this.reset();
    this.setStatus("connecting");
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
    // Première fois : Discord affiche une fenêtre « Autoriser Vocal Studio ? »
    this.setStatus("authorizing");
    const { clientId, redirectUri } = this.store.getConfig();
    const { code } = await this.ipc.request("AUTHORIZE", { client_id: clientId, scopes: SCOPES });
    const t = await this.tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
    await this.useToken(t.access_token);
  }

  async tokenRequest(params) {
    const { clientId, clientSecret } = this.store.getConfig();
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
    this.me = { id: u.id, name: u.global_name || u.username };
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
    this.channel = { id: ch.id, name: ch.name || "Appel privé", guild };
    for (const vs of ch.voice_states || []) {
      const m = toMember(vs);
      this.members.set(m.id, m);
    }
    for (const evt of CHANNEL_EVENTS) await ipc.subscribe(evt, { channel_id: channelId });
    this.emit();
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
  setDeaf(deaf) { return this.ipc.request("SET_VOICE_SETTINGS", { deaf }); }
  leave() { return this.ipc.request("SELECT_VOICE_CHANNEL", { channel_id: null, force: true }); }
}

module.exports = { VoiceSession };
