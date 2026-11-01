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

const missing = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Il manque dans .env : ${missing.join(", ")}. Copie .env.example en .env et remplis-le.`);
  process.exit(1);
}

// ——— Sessions des applis connectées (gardées sur disque pour survivre à un redémarrage) ———
const SESSIONS_FILE = path.join(__dirname, "..", "sessions.json");
let sessions = {};
try { sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8")); } catch {}
const saveSessions = () => fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions), () => {});
const pending = new Map(); // state → { at, token?, error? }

function page(res, title, text) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><meta charset="utf-8"><title>Hush</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#000;color:#f4f5f8;font-family:system-ui,sans-serif;text-align:center">
<div><h1 style="font-size:26px">${title}</h1><p style="color:#8a8d99">${text}</p></div></body>`);
}

async function handleCallback(url, res) {
  const state = url.searchParams.get("state");
  const p = pending.get(state);
  if (!p) return page(res, "Lien expiré", "Relance la connexion depuis Hush.");
  const code = url.searchParams.get("code");
  if (!code) { p.error = "Connexion annulée."; return page(res, "Connexion annulée", "Tu peux fermer cet onglet."); }
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
    sessions[token] = { id: user.id, name: user.global_name || user.username, at: Date.now() };
    saveSessions();
    p.token = token;
    page(res, "C'est bon !", "Hush est connecté à ton compte Discord. Tu peux fermer cet onglet.");
  } catch (e) {
    p.error = `Connexion refusée : ${e.message}`;
    page(res, "La connexion a échoué", "Reviens dans Hush pour voir l'erreur.");
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, PUBLIC_URL);
  if (url.pathname === "/auth/login") {
    const state = url.searchParams.get("state") || "";
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(state)) { res.writeHead(400).end("state invalide"); return; }
    pending.set(state, { at: Date.now() });
    const q = new URLSearchParams({ client_id: DISCORD_CLIENT_ID, response_type: "code", redirect_uri: REDIRECT, scope: "identify", state });
    res.writeHead(302, { Location: `https://discord.com/oauth2/authorize?${q}` }).end();
  } else if (url.pathname === "/auth/callback") {
    handleCallback(url, res);
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
      invite: `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&scope=bot%20applications.commands&permissions=${INVITE_PERMS}`,
    }));
  } else if (url.pathname === "/") {
    page(res, "Hush", "Le serveur du bot tourne.");
  } else {
    res.writeHead(404).end();
  }
});

// Les demandes de connexion non terminées expirent après 10 minutes
setInterval(() => { for (const [k, p] of pending) if (Date.now() - p.at > 600_000) pending.delete(k); }, 60_000).unref();

// ——— Liaison en direct avec les applis ———
const bot = new StudioBot(DISCORD_TOKEN);
const wss = new WebSocketServer({ server, path: "/ws" });
const clients = new Set();

function push(c) {
  const s = JSON.stringify({ type: "state", state: bot.snapshot(c.user) });
  if (s !== c.last) { c.last = s; c.ws.send(s); }
}

wss.on("connection", (ws) => {
  const c = { ws, user: null, last: null };
  const authTimer = setTimeout(() => ws.close(4001, "auth"), 10_000);
  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!c.user) {
      const s = msg.type === "auth" && sessions[msg.token];
      if (!s) return ws.close(4001, "session inconnue");
      clearTimeout(authTimer);
      c.user = { id: s.id, name: s.name, avatar: await bot.avatarOf(s.id) };
      clients.add(c);
      ws.send(JSON.stringify({ type: "hello", user: c.user }));
      return push(c);
    }
    try {
      if (msg.type === "summon") await bot.summon(c.user.id);
      else if (msg.type === "dismiss") bot.dismiss(c.user.id);
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
  ws.on("close", () => { clearTimeout(authTimer); clients.delete(c); });
});

// Regroupe les mises à jour (les débuts/fins de parole arrivent en rafale)
let queued = false;
bot.on("change", () => {
  if (queued) return;
  queued = true;
  setTimeout(() => { queued = false; for (const c of clients) push(c); }, 40);
});

// Voir les salons, se connecter, rendre muet, mettre en sourdine, déplacer, gérer les pseudos, gérer les rôles
const INVITE_PERMS = (1n << 10n) | (1n << 20n) | (1n << 22n) | (1n << 23n) | (1n << 24n) | (1n << 27n) | (1n << 28n);
server.listen(PORT, () => {
  console.log(`Serveur Hush sur ${PUBLIC_URL} (port ${PORT})`);
  console.log(`URL de redirection à déclarer sur le portail Discord : ${REDIRECT}`);
  const invite = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&scope=bot%20applications.commands&permissions=${INVITE_PERMS}`;
  console.log(`Lien d'invitation du bot : ${invite}`);
});
bot.start().catch((e) => {
  console.error("Connexion du bot impossible :", e.message);
  process.exitCode = 1;
  bot.client.destroy();
  wss.close();
  server.close();
});
