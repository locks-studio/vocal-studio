// Serveur Hush : le bot Discord + une petite API pour l'appli.
//  - /auth/login, /auth/callback, /auth/poll : connexion « Se connecter avec Discord » (scope identify)
//  - /ws : l'appli reçoit en direct l'état du salon vocal où se trouve son utilisateur
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");
const { StudioBot } = require("./bot");

try { process.loadEnvFile(path.join(__dirname, "..", ".env")); } catch {}
const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET } = process.env;
const PUBLIC_URL = (process.env.PUBLIC_URL || "http://localhost:8787").replace(/\/$/, "");
const PORT = Number(process.env.PORT || 8787);
const REDIRECT = `${PUBLIC_URL}/auth/callback`;
const API = "https://discord.com/api/v10";
// Connexion directe (RPC) des amis : le serveur fait l'échange du code à leur place, avec le secret qu'il est seul à connaître.
// Doit être une des URL de redirection déclarées sur le portail Discord (la même que la connexion directe du propriétaire).
const RPC_REDIRECT = (process.env.RPC_REDIRECT_URI || PUBLIC_URL).replace(/\/$/, "");

const missing = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Il manque dans .env : ${missing.join(", ")}. Copie .env.example en .env et remplis-le.`);
  process.exit(1);
}

// ——— Sessions des applis connectées (gardées sur disque pour survivre à un redémarrage) ———
// DATA_DIR : dossier qui survit aux mises à jour du code (sur le VPS : /var/lib/hush-bot)
const SESSIONS_FILE = path.join(process.env.DATA_DIR || path.join(__dirname, ".."), "sessions.json");
// Classement : minutes passées en vocal avec Hush, par personne (une minute comptée au plus toutes les 50 s)
const { Friends } = require("./friends");
const { Reports } = require("./reports");
const reports = new Reports(path.join(process.env.DATA_DIR || path.join(__dirname, ".."), "reports.json"));
const STARTED = Date.now();
let reportHits = [];
// Administrateurs en plus du propriétaire : ADMIN_IDS (.env) et admins.json (liste d'identifiants Discord, hors GitHub)
const ADMIN_IDS = new Set(String(process.env.ADMIN_IDS || "").split(",").map((x) => x.trim()).filter(Boolean));
try {
  const extra = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR || path.join(__dirname, ".."), "admins.json"), "utf8"));
  for (const id of Array.isArray(extra) ? extra : []) if (/^\d{5,25}$/.test(String(id))) ADMIN_IDS.add(String(id));
} catch {}
// Toujours décidé ici, d'après le compte vérifié : l'appli ne peut pas se déclarer administrateur
const isAdmin = (id) => bot.owners.has(id) || ADMIN_IDS.has(id);
function adminStats() {
  const seen = new Map();
  for (const x of clients) if (x.user) seen.set(x.user.id, { id: x.user.id, name: x.user.name, avatar: x.user.avatar, version: x.meta.version || "?", os: x.meta.os || "?", inVoice: !!friends.presence.get(x.user.id) });
  const hours = Object.values(usage).reduce((a, u) => a + (u.minutes || 0), 0) / 60;
  return {
    uptime: Date.now() - STARTED, memMB: Math.round(process.memoryUsage().rss / 1e6), botOnline: bot.client.isReady(),
    servers: bot.client.isReady() ? [...bot.client.guilds.cache.values()].map((g) => ({ name: g.name, members: g.memberCount })) : [],
    online: [...seen.values()], accounts: new Set(Object.values(sessions).map((x) => x.id)).size, friendsAccounts: Object.keys(friends.db).length,
    hours: Math.round(hours), reportCount: reports.list.length,
  };
}
const FRIENDS_FILE = path.join(process.env.DATA_DIR || path.join(__dirname, ".."), "friends.json");
const USAGE_FILE = path.join(process.env.DATA_DIR || path.join(__dirname, ".."), "usage.json");
let usage = {};
try { usage = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8")); } catch {}
let usageTimer = null;
const saveUsage = () => { clearTimeout(usageTimer); usageTimer = setTimeout(() => fs.writeFile(USAGE_FILE + ".tmp", JSON.stringify(usage), (e) => { if (!e) fs.rename(USAGE_FILE + ".tmp", USAGE_FILE, () => {}); }), 2000); };
function addMinute(id, name, avatar) {
  if (!/^\d{5,25}$/.test(String(id))) return;
  const u = usage[id] || (usage[id] = { minutes: 0 });
  const now = Date.now();
  if (u.last && now - u.last < 50_000) return;
  u.last = now;
  u.minutes += 1;
  if (name) u.name = String(name).slice(0, 40);
  if (avatar) u.avatar = avatar;
  saveUsage();
}
// Connexion directe : on vérifie le jeton auprès de Discord (gardé 1 h en mémoire, jamais sur disque)
const tokenUsers = new Map();
async function userFromToken(token) {
  const key = crypto.createHash("sha256").update(token).digest("hex");
  const hit = tokenUsers.get(key);
  if (hit && hit.until > Date.now()) return hit.user;
  const r = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  const user = { id: u.id, name: u.global_name || u.username, avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null };
  tokenUsers.set(key, { user, until: Date.now() + 3600_000 });
  if (tokenUsers.size > 500) tokenUsers.delete(tokenUsers.keys().next().value);
  return user;
}
let sessions = {};
try { sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8")); } catch {}
// Écriture dans un fichier temporaire puis renommage : un arrêt brutal ne laisse jamais un fichier à moitié écrit
const saveSessions = () => fs.writeFile(SESSIONS_FILE + ".tmp", JSON.stringify(sessions), (e) => { if (!e) fs.rename(SESSIONS_FILE + ".tmp", SESSIONS_FILE, () => {}); });
const pending = new Map(); // state → { at, token?, error? }

// ——— Sécurité ———
// Une session = un jeton de 43 caractères tiré au hasard. On ne lit jamais sessions[x] avec n'importe quoi :
// « __proto__ » ou « constructor » ne doivent pas passer pour une session.
const SESSION_DAYS = 90;
function sessionOf(token) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,64}$/.test(token) || !Object.prototype.hasOwnProperty.call(sessions, token)) return null;
  const s = sessions[token];
  if (Date.now() - (s.seen || s.at || 0) > SESSION_DAYS * 86_400_000) { delete sessions[token]; saveSessions(); return null; }
  if (Date.now() - (s.seen || 0) > 86_400_000) { s.seen = Date.now(); saveSessions(); } // une fois par jour au plus
  return s;
}
// Limites de vitesse : par adresse (connexions, logins) et par appli connectée (messages, amis, tchat).
// Au-delà, la demande est refusée ; un client qui insiste beaucoup est déconnecté.
const buckets = new Map();
function allow(key, perMinute) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.t > 60_000) { b = { t: now, n: 0 }; buckets.set(key, b); }
  return ++b.n <= perMinute;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.t > 120_000) buckets.delete(k); }, 60_000).unref();
// Adresse du visiteur : derrière le tunnel (Tailscale Funnel), elle arrive dans X-Forwarded-For
const ipOf = (req) => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?").split(",")[0].trim().slice(0, 64);
// En-têtes de sécurité de toutes les pages et réponses du serveur
const SECURE_HEADERS = { "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" };

function page(res, title, text) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><meta charset="utf-8"><title>Hush</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#000;color:#f4f5f8;font-family:system-ui,sans-serif;text-align:center">
<div><h1 style="font-size:26px">${title}</h1><p style="color:#8a8d99">${text}</p></div></body>`);
}

async function handleCallback(url, res) {
  const state = url.searchParams.get("state");
  const p = pending.get(state);
  if (!p) return page(res, "Lien expiré · Link expired", "Relance la connexion depuis Hush. · Start the login again from Hush.");
  const code = url.searchParams.get("code");
  if (!code) { p.error = "Connexion annulée."; return page(res, "Connexion annulée · Login cancelled", "Tu peux fermer cet onglet. · You can close this tab."); }
  try {
    const tok = await fetch(`${API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: REDIRECT }),
    }).then((r) => r.json());
    if (!tok.access_token) throw new Error(tok.error_description || tok.error || "échange du code refusé");
    const user = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json());
    if (!user.id) throw new Error("profil Discord illisible");
    const token = crypto.randomBytes(32).toString("base64url");
    sessions[token] = { id: user.id, name: user.global_name || user.username, at: Date.now(), seen: Date.now() };
    saveSessions();
    p.token = token;
    page(res, "C'est bon ! · All set!", "Hush est connecté à ton compte Discord. Tu peux fermer cet onglet. · Hush is linked to your Discord account. You can close this tab.");
  } catch (e) {
    p.error = `Connexion refusée : ${e.message}`;
    page(res, "La connexion a échoué · Login failed", "Reviens dans Hush pour voir l'erreur. · Go back to Hush to see the error.");
  }
}

const server = http.createServer((req, res) => {
  for (const [k, v] of Object.entries(SECURE_HEADERS)) res.setHeader(k, v);
  // 120 requêtes par minute et par adresse : largement assez pour une appli, trop peu pour attaquer
  if (!allow("http:" + ipOf(req), 120)) { res.writeHead(429).end("Trop de demandes, réessaie dans une minute."); return; }
  if ((req.url || "").length > 2048) { res.writeHead(414).end(); return; }
  const url = new URL(req.url, PUBLIC_URL);
  if (url.pathname === "/auth/login") {
    const state = url.searchParams.get("state") || "";
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(state)) { res.writeHead(400).end("state invalide"); return; }
    // Pas plus de 10 connexions lancées par minute et par adresse, et 5000 en attente au total
    if (!allow("login:" + ipOf(req), 10) || pending.size > 5000) { res.writeHead(429).end("Trop de demandes de connexion, réessaie dans une minute."); return; }
    pending.set(state, { at: Date.now() });
    const q = new URLSearchParams({ client_id: DISCORD_CLIENT_ID, response_type: "code", redirect_uri: REDIRECT, scope: "identify", state });
    res.writeHead(302, { Location: `https://discord.com/oauth2/authorize?${q}` }).end();
  } else if (url.pathname === "/auth/callback") {
    handleCallback(url, res);
  } else if (url.pathname === "/auth/me") {
    // Qui est connecté (launcher 1999) : la session est vérifiée, jamais renvoyée
    const m = /^Bearer (\S{10,200})$/.exec(req.headers.authorization || "");
    const s = m && sessionOf(m[1]);
    if (!s) { res.writeHead(401).end(); return; }
    bot.avatarOf(s.id).then((avatar) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: s.id, name: s.name, avatar }));
    });
  } else if (url.pathname === "/auth/poll") {
    const p = pending.get(url.searchParams.get("state"));
    res.writeHead(p ? 200 : 404, { "Content-Type": "application/json" });
    if (p && (p.token || p.error)) pending.delete(url.searchParams.get("state"));
    res.end(JSON.stringify(p ? { token: p.token || null, error: p.error || null } : { error: "Connexion inconnue ou expirée." }));
  } else if (url.pathname === "/info") {
    // Infos publiques pour l'accueil de l'appli (avant même de se connecter) : le bot est-il en ligne, et son lien d'invitation
    const u = bot.client.user;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      online: bot.client.isReady(),
      name: u ? u.username : null,
      avatar: u ? u.displayAvatarURL({ size: 128, extension: "png" }) : null,
      servers: bot.client.isReady() ? bot.client.guilds.cache.size : 0,
      clientId: DISCORD_CLIENT_ID,
      invite: `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&scope=bot%20applications.commands&permissions=${INVITE_PERMS}`,
    }));
  } else if (url.pathname === "/usage/top") {
    // Les 20 plus gros utilisateurs (pseudo, photo, heures) : public, comme un tableau des scores
    const top = Object.entries(usage).filter(([id]) => !(friends.db[id] && friends.db[id].hideRank)).map(([id, u]) => ({ id, name: u.name || "?", avatar: u.avatar || null, hours: Math.round((u.minutes / 60) * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours).slice(0, 20);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(top));
  } else if (url.pathname === "/usage/beat" && req.method === "POST") {
    const m = /^Bearer (\S{10,200})$/.exec(req.headers.authorization || "");
    req.resume();
    if (!m) { res.writeHead(401).end(); return; }
    userFromToken(m[1]).then((u) => { if (u) addMinute(u.id, u.name, u.avatar); res.writeHead(u ? 204 : 401).end(); }).catch(() => res.writeHead(502).end());
  } else if (url.pathname === "/report" && req.method === "POST") {
    // Rapport d'erreur d'une appli non liée au bot : anonyme, taille et débit limités
    const now = Date.now();
    reportHits = reportHits.filter((t) => now - t < 60_000);
    if (reportHits.length >= 30) { req.resume(); return res.writeHead(429).end(); }
    reportHits.push(now);
    let raw = "";
    req.on("data", (d) => { raw += d; if (raw.length > 8192) req.destroy(); });
    req.on("end", () => { try { reports.add(JSON.parse(raw)); } catch {} res.writeHead(204).end(); });
  } else if (url.pathname === "/rpc/token" && req.method === "POST") {
    rpcToken(req, res);
  } else if (url.pathname === "/") {
    page(res, "Hush", "Le serveur du bot tourne.");
  } else {
    res.writeHead(404).end();
  }
});

// ——— Échange de jeton pour la connexion directe (RPC) d'un ami ———
// Hush reçoit un code de SON Discord (fenêtre « Autoriser Hush ? »), nous l'envoie, et nous le transformons en jeton
// avec le Client Secret, qui ne quitte jamais ce serveur. On ne garde rien : le jeton est renvoyé à Hush, c'est tout.
const rpcHits = new Map(); // ip → [horodatages] (20 demandes par minute au plus)
function rpcToken(req, res) {
  const ip = req.socket.remoteAddress || "?";
  const now = Date.now();
  const hits = (rpcHits.get(ip) || []).filter((t) => now - t < 60_000);
  hits.push(now);
  rpcHits.set(ip, hits);
  const reply = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if (hits.length > 20) return reply(429, { error: "Trop de demandes, réessaie dans une minute." });
  let raw = "";
  req.on("data", (d) => { raw += d; if (raw.length > 4096) req.destroy(); });
  req.on("end", async () => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return reply(400, { error: "Demande illisible." }); }
    const params = msg.grant_type === "refresh_token" && typeof msg.refresh_token === "string"
      ? { grant_type: "refresh_token", refresh_token: msg.refresh_token }
      : msg.grant_type === "authorization_code" && typeof msg.code === "string"
        ? { grant_type: "authorization_code", code: msg.code, redirect_uri: RPC_REDIRECT }
        : null;
    if (!params) return reply(400, { error: "Demande invalide." });
    try {
      const r = await fetch(`${API}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, ...params }),
      });
      const body = await r.json().catch(() => ({}));
      reply(r.status, body);
    } catch (e) { reply(502, { error: `Discord injoignable : ${e.message}` }); }
  });
}
setInterval(() => { const now = Date.now(); for (const [k, v] of rpcHits) if (v.every((t) => now - t > 60_000)) rpcHits.delete(k); }, 60_000).unref();

// Les demandes de connexion non terminées expirent après 10 minutes
setInterval(() => { for (const [k, p] of pending) if (Date.now() - p.at > 600_000) pending.delete(k); }, 60_000).unref();

// ——— Liaison en direct avec les applis ———
const bot = new StudioBot(DISCORD_TOKEN);
// 256 Ko par message au plus (un message énorme ne peut pas faire tomber le serveur)
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 256 * 1024 });
const clients = new Set();

function push(c) {
  const s = JSON.stringify({ type: "state", state: bot.snapshot(c.user) });
  if (s !== c.last) { c.last = s; c.ws.send(s); }
}

// ——— Caméras et partages d'écran entre utilisateurs Hush ———
// La vidéo ne passe jamais par ce serveur : il présente seulement les applis Hush d'un même salon vocal
// (salon vu par le bot, pas déclaré par l'appli : impossible de s'inviter dans un salon où on n'est pas),
// puis relaie leurs messages WebRTC pour qu'elles se connectent directement entre elles.
let nextCid = 0;
const roomOf = (c) => { const l = c.user && bot.findUser(c.user.id); return l ? l.channel.id : null; };
function pushRooms() {
  const byRoom = new Map();
  for (const c of clients) {
    c.room = c.rtc ? roomOf(c) : null;
    if (c.room) { if (!byRoom.has(c.room)) byRoom.set(c.room, []); byRoom.get(c.room).push(c); }
  }
  for (const c of clients) {
    if (!c.rtc) continue;
    const peers = c.room ? byRoom.get(c.room).filter((x) => x !== c && x.user.id !== c.user.id)
      .map((x) => ({ cid: x.cid, id: x.user.id, cam: x.video.cam, screen: x.video.screen })) : [];
    const s = JSON.stringify({ type: "video-room", me: c.cid, peers });
    if (s !== c.lastRoom && c.ws.readyState === 1) { c.lastRoom = s; c.ws.send(s); }
  }
}

// Ping toutes les 30 s : garde la liaison ouverte derrière le proxy HTTPS et repère les applis disparues
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.alive === false) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 30_000).unref();

wss.on("connection", (ws, req) => {
  const ip = req ? ipOf(req) : "?";
  // 30 nouvelles liaisons par minute et par adresse
  if (!allow("ws:" + ip, 30)) return ws.close(4029, "trop de connexions");
  ws.alive = true;
  ws.on("pong", () => { ws.alive = true; });
  const c = { ws, user: null, last: null, cid: ++nextCid, rtc: false, video: { cam: false, screen: false } };
  const authTimer = setTimeout(() => ws.close(4001, "auth"), 10_000);
  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return;
    // Par appli connectée : 300 messages par minute (l'appli en envoie quelques-uns) ; au-delà, déconnexion
    if (!allow("msg:" + (c.user ? c.user.id : ip), 300)) return ws.close(4029, "trop de messages");
    if (!c.user) {
      if (!allow("auth:" + ip, 20)) return ws.close(4029, "trop d'essais");
      const s = msg.type === "auth" && sessionOf(msg.token);
      if (!s) return ws.close(4001, "session inconnue");
      clearTimeout(authTimer);
      c.user = { id: s.id, name: s.name, avatar: await bot.avatarOf(s.id) };
      c.meta = { version: String((msg.meta && msg.meta.version) || "").slice(0, 20), os: String((msg.meta && msg.meta.os) || "").slice(0, 20) };
      clients.add(c);
      friends.touch(c.user);
      friends.notifyFriends(c.user.id); // « Hush ouvert »
      ws.send(JSON.stringify({ type: "hello", user: c.user, admin: isAdmin(c.user.id) }));
      return push(c);
    }
    try {
      if (msg.type === "summon") {
        // Avec rid : l'appli attend la réponse (pour afficher pourquoi le bot ne vient pas)
        try { await bot.summon(c.user.id); if (msg.rid) ws.send(JSON.stringify({ type: "mod-result", rid: msg.rid, ok: true })); }
        catch (e) { if (!msg.rid) throw e; ws.send(JSON.stringify({ type: "mod-result", rid: msg.rid, ok: false, error: e.message })); }
      }
      else if (msg.type === "dismiss") bot.dismiss(c.user.id);
      else if (msg.type === "beat") addMinute(c.user.id, c.user.name, c.user.avatar);
      else if (msg.type === "presence") friends.setPresence(c.user.id, msg.voice);
      else if (msg.type === "report") reports.add(msg.report, c.user);
      else if (msg.type === "video") {
        // Cette appli sait afficher la vidéo des autres ; cam / screen : ce qu'elle montre en ce moment
        c.rtc = true;
        c.video = { cam: !!msg.cam, screen: !!msg.screen };
        c.lastRoom = null; // l'appli vient peut-être de redémarrer son interface : on lui redonne le salon
        pushRooms();
      }
      else if (msg.type === "rtc") {
        // Offre, réponse ou candidat WebRTC : seulement vers une appli du même salon vocal, à l'instant
        const to = [...clients].find((x) => x.cid === msg.to);
        const room = roomOf(c);
        if (!to || !c.rtc || !to.rtc || !room || roomOf(to) !== room || to.ws.readyState !== 1) return;
        const data = JSON.stringify(msg.data === undefined ? null : msg.data);
        if (data.length > 64_000) return;
        to.ws.send(`{"type":"rtc","from":${c.cid},"data":${data}}`);
      }
      else if (msg.type === "admin") {
        try {
          if (!isAdmin(c.user.id)) throw new Error("Réservé à l'administrateur.");
          if (msg.op === "clear") reports.clear();
          const data = msg.op === "reports" || msg.op === "clear" ? reports.list.slice(0, 50) : adminStats();
          ws.send(JSON.stringify({ type: "mod-result", rid: msg.rid, ok: true, data }));
        } catch (e) { ws.send(JSON.stringify({ type: "mod-result", rid: msg.rid, ok: false, error: e.message })); }
      }
      else if (msg.type === "friends" && msg.op === "delete") {
        // « Supprimer mes données » : compte, classement, amis et toutes les sessions de cette personne
        const id = c.user.id;
        friends.removeUser(id);
        delete usage[id];
        saveUsage();
        for (const [t, s] of Object.entries(sessions)) if (s.id === id) delete sessions[t];
        saveSessions();
        ws.send(JSON.stringify({ type: "mod-result", rid: msg.rid, ok: true, data: true }));
      }
      else if (msg.type === "friends" && msg.op === "invite") {
        // Inviter un ami dans son vocal : il reçoit une notification « X t'invite à rejoindre #salon » dans Hush
        try {
          if (!allow("invite:" + c.user.id, 10)) throw new Error("Trop d'invitations : attends une minute.");
          const me = friends.db[c.user.id], to = String(msg.arg || "");
          if (!me || !me.friends.includes(to)) throw new Error("Tu ne peux inviter que tes amis Hush.");
          const voice = friends.presence.get(c.user.id);
          if (!voice || voice.call || !voice.channelId) throw new Error("Rejoins d'abord un salon vocal de serveur.");
          const invite = { type: "friend-invite", from: { id: c.user.id, name: c.user.name, avatar: c.user.avatar || null }, voice, at: Date.now() };
          let sent = 0;
          for (const x of clients) if (x.user && x.user.id === to && x.ws.readyState === 1) { x.ws.send(JSON.stringify(invite)); sent++; }
          if (!sent) throw new Error("Ton ami n'a pas Hush ouvert en ce moment.");
          ws.send(JSON.stringify({ type: "mod-result", rid: msg.rid, ok: true, data: true }));
        } catch (e) { ws.send(JSON.stringify({ type: "mod-result", rid: msg.rid, ok: false, error: e.message })); }
      }
      else if (msg.type === "friends") {
        try {
          if (msg.op === "add" && !allow("friend-add:" + c.user.id, 20)) throw new Error("Trop d'essais : attends une minute.");
          ws.send(JSON.stringify({ type: "mod-result", rid: msg.rid, ok: true, data: friends.op(c.user.id, msg.op, msg.arg) }));
        }
        catch (e) { ws.send(JSON.stringify({ type: "mod-result", rid: msg.rid, ok: false, error: e.message })); }
      }
      else if (msg.type === "chat") {
        try {
          // Tchat : 10 messages par minute au plus, pour que personne ne spamme un salon avec le bot
          if (msg.op === "send" && !allow("chat:" + c.user.id, 10)) throw new Error("Doucement : 10 messages par minute au plus.");
          const data = msg.op === "send" ? await bot.chatSend(c.user.id, msg.text) : await bot.chatHistory(c.user.id);
          ws.send(JSON.stringify({ type: "mod-result", rid: msg.rid, ok: true, data }));
        } catch (e) { ws.send(JSON.stringify({ type: "mod-result", rid: msg.rid, ok: false, error: e.message })); }
      }
      else if (msg.type === "home") {
        // Qui a Hush : toutes les sessions connues ; en ligne : appli ouverte en ce moment
        const hushIds = new Set(Object.values(sessions).map((x) => x.id));
        const onlineIds = new Set([...clients].map((x) => x.user && x.user.id));
        try { ws.send(JSON.stringify({ type: "mod-result", rid: msg.rid, ok: true, data: await bot.home(c.user.id, hushIds, onlineIds) })); }
        catch (e) { ws.send(JSON.stringify({ type: "mod-result", rid: msg.rid, ok: false, error: e.message })); }
      } else if (msg.type === "mod") {
        // Réponse ciblée (rid) : l'appli attend le résultat de cette action précise
        try { ws.send(JSON.stringify({ type: "mod-result", rid: msg.rid, ok: true, data: await bot.moderate(c.user.id, msg) })); }
        catch (e) { ws.send(JSON.stringify({ type: "mod-result", rid: msg.rid, ok: false, error: e.message })); }
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: "error", message: e.message }));
    }
  });
  ws.on("close", () => {
    clearTimeout(authTimer);
    clients.delete(c);
    if (c.rtc) pushRooms();
    if (c.user && ![...clients].some((x) => x.user && x.user.id === c.user.id)) friends.setPresence(c.user.id, null);
  });
});

// Amis : le vocal vu par le bot sert de secours quand Hush de l'ami est fermé
const friends = new Friends(FRIENDS_FILE, {
  voiceOf: (id) => { const l = bot.findUser(id); return l ? { channelId: l.channel.id, guildId: l.guild.id, name: l.channel.name, guild: l.guild.name } : null; },
  isOnline: (id) => [...clients].some((x) => x.user && x.user.id === id),
  notify: (id) => { for (const x of clients) if (x.user && x.user.id === id && x.ws.readyState === 1) x.ws.send(JSON.stringify({ type: "friends-changed" })); },
});

// Nouveau message dans le tchat d'un salon vocal : envoyé à ceux qui sont dans ce salon
bot.on("chat", (channelId, message) => {
  for (const c of clients) {
    const loc = c.user && bot.findUser(c.user.id);
    if (loc && loc.channel.id === channelId && c.ws.readyState === 1) c.ws.send(JSON.stringify({ type: "chat", message }));
  }
});

// Regroupe les mises à jour (les débuts/fins de parole arrivent en rafale)
let queued = false;
bot.on("change", () => {
  if (queued) return;
  queued = true;
  setTimeout(() => { queued = false; for (const c of clients) push(c); pushRooms(); }, 40);
});

// Voir les salons, se connecter, rendre muet, mettre en sourdine, déplacer, gérer les pseudos, gérer les rôles,
// et pour le tchat : envoyer des messages, voir les anciens messages, gérer les webhooks
const INVITE_PERMS = (1n << 10n) | (1n << 11n) | (1n << 16n) | (1n << 20n) | (1n << 22n) | (1n << 23n) | (1n << 24n) | (1n << 27n) | (1n << 28n) | (1n << 29n);
server.listen(PORT, process.env.HOST || undefined, () => {
  console.log(`Serveur Hush sur ${PUBLIC_URL} (port ${PORT})`);
  console.log(`URL de redirection à déclarer sur le portail Discord : ${REDIRECT}`);
  const invite = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&scope=bot%20applications.commands&permissions=${INVITE_PERMS}`;
  console.log(`Lien d'invitation du bot : ${invite}`);
  require("./awake").keepAwake();
});
bot.start().catch((e) => {
  console.error("Connexion du bot impossible :", e.message);
  process.exitCode = 1;
  bot.client.destroy();
  wss.close();
  server.close();
});
