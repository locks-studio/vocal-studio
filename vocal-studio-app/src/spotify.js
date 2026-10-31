// Lit la musique en cours sur ton compte Spotify (titre, artiste, pochette, progression).
// Connexion OAuth « PKCE » : pas de secret à stocker, seulement le Client ID de ton appli Spotify.
const http = require("http");
const crypto = require("crypto");

const PORT = 43821;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = "user-read-currently-playing user-read-playback-state";
const POLL_MS = 3000;

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

class SpotifySession {
  // store : { getClientId(), getToken(), setToken(t) } ; openUrl(url) ; onState(etat)
  constructor(store, openUrl, onState) {
    this.store = store;
    this.openUrl = openUrl;
    this.onState = onState;
    this.timer = null;
    this.server = null;
    this.state = { status: "off", error: null, track: null };
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }

  start() {
    if (!this.store.getClientId()) return this.set({ status: "needs-config", track: null });
    if (!this.store.getToken()) return this.set({ status: "disconnected", track: null });
    this.set({ status: "connected", error: null });
    this.poll();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  logout() {
    this.stop();
    this.store.setToken(null);
    this.set({ status: "disconnected", track: null });
  }

  // Ouvre la page de connexion Spotify dans le navigateur et attend le retour sur 127.0.0.1
  login() {
    const clientId = this.store.getClientId();
    if (!clientId) return this.set({ status: "needs-config" });
    const verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
    const expected = b64url(crypto.randomBytes(16));

    if (this.server) this.server.close();
    this.server = http.createServer(async (req, res) => {
      const url = new URL(req.url, REDIRECT);
      if (url.pathname !== "/callback") { res.writeHead(404).end(); return; }
      const page = (msg) => {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<body style="font-family:sans-serif;background:#000;color:#fff;display:grid;place-items:center;height:100vh;margin:0"><h2>${msg}</h2></body>`);
      };
      this.server.close();
      this.server = null;
      if (url.searchParams.get("state") !== expected || !url.searchParams.get("code")) {
        page("Connexion annulée. Tu peux fermer cet onglet.");
        return this.set({ status: "error", error: url.searchParams.get("error") || "Connexion refusée par Spotify." });
      }
      try {
        await this.tokenRequest({ grant_type: "authorization_code", code: url.searchParams.get("code"), redirect_uri: REDIRECT, code_verifier: verifier });
        page("Spotify est connecté à Hush. Tu peux fermer cet onglet.");
        this.start();
      } catch (e) {
        page("La connexion a échoué. Reviens dans Hush pour voir l'erreur.");
        this.set({ status: "error", error: e.message });
      }
    });
    this.server.on("error", (e) => this.set({ status: "error", error: `Le port ${PORT} est déjà utilisé (${e.code}).` }));
    this.server.listen(PORT, "127.0.0.1", () => {
      this.set({ status: "authorizing", error: null });
      const q = new URLSearchParams({
        client_id: clientId, response_type: "code", redirect_uri: REDIRECT, scope: SCOPES,
        code_challenge_method: "S256", code_challenge: challenge, state: expected,
      });
      this.openUrl(`https://accounts.spotify.com/authorize?${q}`);
    });
  }

  async tokenRequest(params) {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.store.getClientId(), ...params }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Spotify a refusé le jeton (${res.status}) : ${body.error_description || body.error || "vérifie le Client ID et l'URL de redirection"}`);
    const old = this.store.getToken() || {};
    this.store.setToken({
      access_token: body.access_token,
      refresh_token: body.refresh_token || old.refresh_token,
      expires_at: Date.now() + (body.expires_in - 60) * 1000,
    });
  }

  async accessToken() {
    const t = this.store.getToken();
    if (!t) throw new Error("Spotify n'est pas connecté.");
    if (Date.now() < t.expires_at) return t.access_token;
    await this.tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh_token });
    return this.store.getToken().access_token;
  }

  async poll() {
    clearTimeout(this.timer);
    try {
      const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode", {
        headers: { Authorization: `Bearer ${await this.accessToken()}` },
      });
      if (res.status === 401) { this.store.setToken({ ...this.store.getToken(), expires_at: 0 }); }
      else if (res.status === 204) this.set({ track: null, error: null });
      else if (res.ok) {
        const d = await res.json();
        const it = d.item;
        this.set({
          error: null,
          track: it ? {
            title: it.name,
            artist: (it.artists || []).map((a) => a.name).join(", ") || (it.show && it.show.name) || "",
            cover: ((it.album || it).images || [])[0]?.url || null,
            duration: it.duration_ms,
            progress: d.progress_ms || 0,
            playing: !!d.is_playing,
            at: Date.now(),
          } : null,
        });
      } else if (res.status !== 429) {
        this.set({ error: `Spotify répond ${res.status}.` });
      }
    } catch (e) {
      this.set({ error: e.message });
      if (!this.store.getToken()) return this.set({ status: "disconnected", track: null });
    }
    this.timer = setTimeout(() => this.poll(), POLL_MS);
  }
}

module.exports = { SpotifySession, REDIRECT };
