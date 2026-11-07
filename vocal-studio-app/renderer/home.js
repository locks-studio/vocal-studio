/* ——— Page d'accueil ———
   S'affiche quand tu n'es dans aucun vocal (ou avec le bouton maison de la barre du haut).
   En fond : toi, seul dans la scène, flouté. Par-dessus :
   - ton compte : lié au bot ou non, le bot en ligne ou pas, et les boutons pour lier / inviter le bot ;
   - « Ça parle en ce moment » : les vocaux de tes serveurs où il y a des gens qui ont Hush (qui parle, qui est en live) ;
   - « Sur Hush » : les membres de tes serveurs qui ont Hush (en ligne, en vocal) ;
   - tes derniers vocaux, et des raccourcis.
   Aussi ici : les arrivées / départs dans ton vocal, et l'écran d'appel quand tu es seul à attendre. */
const Home = { tab: null, forced: false, info: null, infoAt: 0, data: null, dataAt: 0, timer: null, rooms: new Set(), first: true };

function homeWanted() {
  if (MINI || S.demo || sandbox || editingConfig) return false;
  if (Home.forced) return true;
  return !state.channel && ["idle", "connecting", "needs-login", "ready", "disconnected"].includes(state.status);
}

const ago = (ms) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "hier" : `il y a ${d} jours`;
};
const dur = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${Math.max(1, m)} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`; };
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const avatarImg = (src, cls = "hm-av") => { const i = h("img", cls); i.alt = ""; i.src = src || "assets/discord-logo.png"; if (!src) i.classList.add("default"); i.onerror = () => { i.src = "assets/discord-logo.png"; i.classList.add("default"); }; return i; };

function renderHome() {
  const box = $("#home");
  const on = homeWanted();
  box.hidden = !on;
  document.body.classList.toggle("home-on", on);
  $("#homeBtn").classList.toggle("on", on);
  if (!on) { clearInterval(Home.timer); Home.timer = null; return; }
  if (!Home.timer) { Home.timer = setInterval(refreshHome, 10_000); refreshHome(); }
  drawHome();
}

async function refreshHome() {
  friendOp("list");
  // Infos du bot et suggestions : aussi en connexion directe, si ton compte est lié au bot
  if (Date.now() - Home.infoAt > 15_000) { Home.info = await window.studio.bot.info(); Home.infoAt = Date.now(); }
  if (state.me && state.status === "ready") {
    try {
      Home.data = (await window.studio.voice.home()) || null;
      Home.dataAt = Date.now();
      noticeNewRooms(Home.data.rooms);
    } catch { /* bot injoignable : on garde les dernières données */ }
  }
  drawHome();
}

// Un vocal vient de démarrer avec quelqu'un qui a Hush : c'est « quelqu'un qui appelle »
function noticeNewRooms(rooms) {
  const ids = new Set(rooms.map((r) => r.channel.id));
  if (!Home.first) {
    for (const r of rooms) {
      if (Home.rooms.has(r.channel.id)) continue;
      const who = r.members.find((m) => m.hush) || r.members[0];
      showIncoming(r, who);
    }
  }
  Home.first = false;
  Home.rooms = ids;
}
function showIncoming(r, who) {
  const el = $("#incoming");
  $("#incomingAv").src = who.avatar || "assets/discord-logo.png";
  $("#incomingText").textContent = `${who.name} est en vocal`;
  $("#incomingSub").textContent = `#${r.channel.name} · ${r.guild.name}`;
  $("#incomingJoin").onclick = () => { window.studio.voice.openChannel(r.guild.id, r.channel.id); el.hidden = true; };
  $("#incomingClose").onclick = () => (el.hidden = true);
  el.hidden = false;
  clearTimeout(Home.incomingT);
  Home.incomingT = setTimeout(() => (el.hidden = true), 15_000);
}

// Les erreurs techniques en phrases utiles
function plainError(msg) {
  const m = String(msg);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ne répond plus/i.test(m)) return "Le serveur du bot ne répond pas : il est peut-être éteint. Réessaie dans un moment.";
  if (/invalid_grant/i.test(m)) return "La liaison à Discord a expiré. Clique à nouveau sur Lier, puis Autoriser dans Discord.";
  if (/oauth2|invalid_client|invalid_scope|not authori[sz]ed|tester/i.test(m)) return "Discord refuse la connexion directe : ton compte doit être ajouté aux testeurs de l'appli. Passe plutôt par le bot (Modifier la connexion).";
  return m;
}

// Accueil sobre : un centre vide, avec une seule phrase selon la situation
function homeMessage() {
  const isBot = state.mode === "bot";
  const info = Home.info;
  if (state.channel && state.status === "ready") return { text: `Vous êtes dans ${chanLabel(state.channel)}`, act: () => { Home.forced = false; renderHome(); } };
  if (isBot && (state.status === "disconnected" || (info && (info.unreachable || info.online === false)))) return { text: "Hush est en maintenance" };
  if (isBot && state.status === "needs-login") return { text: "Connectez-vous au bot", act: () => window.studio.bot.login() };
  if (!isBot && state.status === "disconnected") return { text: "Ouvrez Discord" };
  if (state.status === "connecting" || state.status === "idle") return { text: "Connexion…" };
  return { text: "Rejoignez une voc" };
}
function drawHome() {
  if ($("#home").hidden) return;
  const m = homeMessage(), b = $("#homeMsg");
  if (b.dataset.msg !== m.text) { b.dataset.msg = m.text; b.textContent = m.text; b.classList.remove("in"); void b.offsetWidth; b.classList.add("in"); }
  $("#homeHint").hidden = !(state.mode === "bot" && state.status === "ready" && !state.channel);
  b.classList.toggle("act", !!m.act);
  b.disabled = !m.act;
  b.onclick = m.act || null;
  // La raison exacte quand ça ne marche pas (message de Discord ou du serveur), en petit sous la phrase
  const why = ["disconnected", "error", "needs-login"].includes(state.status) && state.error ? plainError(state.error) : "";
  $("#homeWhy").hidden = !why;
  $("#homeWhy").textContent = why;
  // Onglets : seul celui qui est ouvert est dessiné
  document.querySelectorAll("#homeTabs [data-ht]").forEach((t) => t.setAttribute("aria-pressed", t.dataset.ht === Home.tab));
  $("#homePanel").hidden = !Home.tab;
  document.querySelectorAll(".home-pane").forEach((p) => (p.hidden = p.dataset.ht !== Home.tab));
  if (Home.tab === "account") drawAccount();
  if (Home.tab === "people") drawPeople();
  if (Home.tab === "history") drawHistory();
  if (Home.tab === "top") drawTop();
  if (Home.tab === "admin") drawAdmin();
  // Vue administrateur : réservée au compte reconnu par le serveur, et masquée en vue utilisateur
  const admin = !!(Home.info && Home.info.admin);
  $("#viewRow").hidden = !admin;
  $("#adminTab").hidden = !(admin && S.adminView);
  if (Home.tab === "admin" && $("#adminTab").hidden) Home.tab = null;
  drawSide();
}
$("#homeStudio").onclick = () => setSandbox(true);
document.querySelectorAll("#homeTabs [data-ht]").forEach((t) => (t.onclick = () => { Home.tab = Home.tab === t.dataset.ht ? null : t.dataset.ht; drawHome(); }));

// — Connexion : ton compte, comment Hush est connecté, et l'état du bot —
function drawAccount() {
  const isBot = state.mode === "bot";
  const info = Home.info;
  const acc = $("#homeAccount");
  acc.textContent = "";
  const me = state.me;
  const top = h("div", "hm-me");
  top.append(avatarImg(me && me.avatar, "hm-av big"));
  const who = h("div");
  who.append(h("h2", "", me ? me.name : "Pas connecté"));
  const lines = h("div", "hm-status");
  const line = (ok, text) => { const p = h("p", "hm-line " + (ok === true ? "ok" : ok === false ? "err" : "warn")); p.append(h("i", "dot"), text); lines.append(p); };
  if (isBot) line(state.status === "ready", state.status === "ready" ? "Connecté avec le bot Hush" : state.status === "needs-login" ? "Compte Discord pas encore lié au bot" : (STATUS[state.status] || STATUS.idle)[1]);
  else line(state.status === "ready", state.status === "ready" ? "Connexion directe à Discord" : (STATUS[state.status] || STATUS.idle)[1]);
  if (!info || info.unreachable) line(false, "Serveur du bot injoignable");
  else line(info.online, info.online ? `Bot ${info.name || ""} en ligne · ${info.servers} serveur${info.servers > 1 ? "s" : ""}` : "Bot hors ligne");
  who.append(lines);
  top.append(who);
  acc.append(top);
  const btns = h("div", "hm-actions");
  const b = (label, cls, fn) => { const x = h("button", cls, label); x.onclick = fn; btns.append(x); };
  if (isBot && state.status === "needs-login") b("Lier mon compte", "cta small", () => window.studio.bot.login());
  // Connexion directe : lier aussi le bot permet « Ajouter le bot à la voc », Mes amis et le classement
  if (!isBot && info && !info.unreachable && !info.linked) b("Lier au bot", "ghost small", () => window.studio.bot.login());
  if (state.channel && state.status === "ready" && !state.channel.call) {
    b("Ajouter le bot à la voc", "cta small", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      const r = await window.studio.voice.summon();
      btn.disabled = false;
      showToast(r && r.ok ? "Le bot arrive dans ton vocal…" : (r && r.error) || "Le bot n'a pas pu venir.");
    });
  } else if (state.channel && state.channel.call) line(null, "Le bot ne peut pas rejoindre un appel privé (seulement les salons de serveur)");
  if (isBot && !state.channel) line(null, "Rejoins un vocal, puis « Ajouter le bot à la voc »");
  if (info && info.invite) b(`Inviter ${info.name || "le bot"}`, "ghost small", () => window.open(info.invite));
  b("Modifier la connexion", "ghost small", () => { Home.forced = false; editingConfig = true; screenKey = ""; renderChrome(); });
  acc.append(btns);
}

// — Sur Hush : les membres de tes serveurs qui ont Hush (en ligne, en vocal) —
function drawPeople() {
  const ppl = $("#frList");
  ppl.textContent = "";
  const data = Home.data, fr = Home.friends;
  $("#frCode").textContent = fr ? fr.code : "…";
  $("#frHide").checked = !!(fr && fr.hideVoice);
  $("#frRank").checked = !(fr && fr.hideRank);
  if (Home.frError) ppl.append(h("p", "hint", Home.frError));
  if (fr) {
    for (const p of fr.incoming) {
      const row = h("div", "hm-person");
      const t = h("div", "hm-ptext");
      t.append(h("b", "", p.name), h("small", "", "veut t'ajouter en ami"));
      const yes = h("button", "cta small", "Accepter"), no = h("button", "ghost small", "Refuser");
      yes.onclick = () => friendOp("accept", p.id);
      no.onclick = () => friendOp("refuse", p.id);
      row.append(avatarImg(p.avatar), t, yes, no);
      ppl.append(row);
    }
    if (!fr.friends.length && !fr.incoming.length) ppl.append(h("p", "hint", "Donne ton code ami à quelqu'un, ou ajoute une personne de tes serveurs ci-dessous. Une fois la demande acceptée, vous voyez quand l'autre est en vocal."));
    // Ceux qui sont en vocal d'abord
    for (const p of [...fr.friends].sort((a, b) => !!b.voice - !!a.voice || !!b.online - !!a.online)) {
      const row = h("div", "hm-person" + (p.online || p.voice ? " online" : ""));
      const avw = h("div", "hm-pav");
      avw.append(avatarImg(p.avatar), h("i", "st"));
      const t = h("div", "hm-ptext");
      const v = p.voice;
      t.append(h("b", "", p.name), h("small", "", v ? (v.call ? "📞 En appel privé" : `🔊 ${v.name}${v.guild ? " · " + v.guild : ""}`) : p.online ? "Hush ouvert" : "Hors ligne"));
      row.append(avw, t);
      if (v && v.channelId) {
        row.classList.add("joinable");
        row.title = `Rejoindre ${v.name}`;
        row.append(h("span", "hm-join", "Rejoindre"));
        row.onclick = () => joinVoice(v.channelId, v.guildId, v.name);
      }
      const del = h("button", "wb fr-del", "×");
      del.title = `Retirer ${p.name} de mes amis`;
      del.setAttribute("aria-label", del.title);
      del.onclick = (e) => {
        e.stopPropagation();
        if (del.dataset.sure) return friendOp("remove", p.id);
        del.dataset.sure = "1";
        showToast(`Clique encore sur × pour retirer ${p.name}.`);
        setTimeout(() => delete del.dataset.sure, 4000);
      };
      row.append(del);
      ppl.append(row);
    }
    for (const p of fr.outgoing) {
      const row = h("div", "hm-person");
      const t = h("div", "hm-ptext");
      t.append(h("b", "", p.name), h("small", "", "demande envoyée"));
      const no = h("button", "ghost small", "Annuler");
      no.onclick = () => friendOp("cancel", p.id);
      row.append(avatarImg(p.avatar), t, no);
      ppl.append(row);
    }
  }
  // Les personnes de tes serveurs qui ont Hush, pas encore ajoutées
  const known = new Set(fr ? [...fr.friends, ...fr.incoming, ...fr.outgoing].map((p) => p.id) : []);
  const others = ((data && data.people) || []).filter((p) => !known.has(p.id));
  if (others.length) ppl.append(h("p", "hint", "Sur tes serveurs"));
  for (const p of others) {
    const row = h("div", "hm-person" + (p.online ? " online" : ""));
    const avw = h("div", "hm-pav");
    avw.append(avatarImg(p.avatar), h("i", "st"));
    const t = h("div", "hm-ptext");
    t.append(h("b", "", p.name), h("small", "", p.voice ? `🔊 ${p.voice} · ${p.guild}` : p.online ? "Hush ouvert" : `Hors ligne · ${p.guild}`));
    row.append(avw, t);
    if (p.voice && p.channelId) {
      // Toute la ligne est cliquable : on rejoint son vocal
      row.classList.add("joinable");
      row.title = `Rejoindre ${p.voice}`;
      row.append(h("span", "hm-join", "Rejoindre"));
      row.onclick = () => joinVoice(p.channelId, p.guildId, p.voice);
    }
    if (fr) {
      const add = h("button", "ghost small", "Ajouter");
      add.onclick = (e) => { e.stopPropagation(); friendOp("add", p.id); };
      row.append(add);
    }
    ppl.append(row);
  }
}

// — Amis Hush : une demande acceptée des deux côtés, puis chacun voit quand l'autre est en vocal —
async function friendOp(op, arg) {
  const r = await window.studio.friends.op(op, arg);
  if (r.error) { if (op === "list") { Home.friends = null; Home.frError = r.error; } else showToast(r.error); }
  else {
    // Un ami vient d'arriver en vocal : petit message, où qu'on soit dans Hush
    const before = new Map(((Home.friends && Home.friends.friends) || []).map((p) => [p.id, p.voice]));
    if (Home.friends) for (const p of r.data.friends) if (p.voice && !p.voice.call && !before.get(p.id) && before.has(p.id)) showToast(`${p.name} est en vocal dans ${p.voice.name}`);
    Home.friends = r.data; Home.frError = null;
    if (op === "add") showToast("Demande envoyée.");
  }
  if (!$("#home").hidden) drawHome();
}
window.studio.friends.onChanged(() => { if (!MINI) friendOp("list"); });
$("#frAdd").onsubmit = (e) => {
  e.preventDefault();
  const v = $("#frInput").value.trim();
  if (!v) return;
  $("#frInput").value = "";
  friendOp("add", v);
};
$("#frCopy").onclick = () => { if (Home.friends) { window.studio.voice.copy(Home.friends.code); showToast("Code ami copié."); } };
$("#frHide").onchange = (e) => friendOp("hide", e.target.checked);
$("#frRank").onchange = (e) => friendOp("rank", e.target.checked);
// Inviter le bot : le geste qui ouvre Hush à tout un serveur
const INVITE_URL = "https://discord.com/oauth2/authorize?client_id=1566055526444568669&scope=bot%20applications.commands&permissions=970001408";
$("#homeInvite").onclick = () => window.open((Home.info && Home.info.invite) || INVITE_URL);
// Annonce le vocal où tu es à tes amis (aussi en connexion directe). Le nom personnalisé d'un salon reste chez toi.
let frKey = "";
function friendsOnState(s) {
  const c = s.status === "ready" && s.channel ? s.channel : null;
  const key = c ? c.id : "";
  if (key === frKey) return;
  frKey = key;
  window.studio.friends.presence(c ? (c.call ? { call: true } : { channelId: c.id, guildId: c.guildId || null, name: c.name, guild: c.guild }) : null);
}

async function joinVoice(c, g, name) {
  await window.studio.voice.join(c, g);
  showToast(`Connexion à ${name}…`);
}

// — Historique : tes derniers vocaux (clic : on y retourne) —
function drawHistory() {
  const hist = $("#homeHistory");
  hist.textContent = "";
  if (!S.history.length) hist.append(h("p", "hint", "Tes vocaux apparaîtront ici."));
  for (const v of S.history.slice(0, 10)) {
    const row = h("div", "hm-hist");
    const t = h("div", "hm-ptext");
    t.append(h("b", "", (v.call ? "📞 " : "🔊 ") + v.name), h("small", "", [v.guild, ago(v.at), dur(v.dur)].filter(Boolean).join(" · ")));
    const faces = h("div", "hm-mini-faces");
    for (const m of v.members.slice(0, 5)) { const i = avatarImg(m.avatar); i.title = m.name; faces.append(i); }
    row.append(t, faces);
    if (v.id && v.id !== "sandbox" && v.id !== "demo") {
      row.classList.add("joinable");
      row.title = `Rejoindre ${v.name}`;
      row.onclick = () => joinVoice(v.id, v.guildId, v.name);
    }
    hist.append(row);
  }
}

// — Sur le côté : tes salons les plus utilisés (temps passé, nombre de fois) et tes favoris —
function addChanStat(c, ms) {
  const s = S.chanStats[c.id] || { id: c.id, ms: 0, count: 0 };
  Object.assign(s, { guildId: c.guildId || s.guildId || null, name: c.name, guild: c.guild, call: !!c.call, last: Date.now() });
  s.ms += ms; s.count += 1;
  S.chanStats[c.id] = s;
  save();
}
// Premier lancement de cette version : on part de l'historique déjà là
if (!Object.keys(S.chanStats).length && S.history.length) {
  for (const v of [...S.history].reverse()) addChanStat({ id: v.id, guildId: v.guildId, name: v.name, guild: v.guild, call: v.call }, v.dur || 0);
}
const isFav = (id) => S.favChans.some((f) => f.id === id);
function toggleFav(c) {
  if (isFav(c.id)) S.favChans = S.favChans.filter((f) => f.id !== c.id);
  else S.favChans = [...S.favChans, { id: c.id, guildId: c.guildId || null, name: c.name, guild: c.guild, call: !!c.call }];
  save();
  drawSide();
}
function drawSide() {
  const tab = S.homeSide === "fav" ? "fav" : "top";
  document.querySelectorAll("#homeSide [data-hs]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.hs === tab));
  const box = $("#homeSideList");
  box.textContent = "";
  const list = tab === "fav"
    ? S.favChans.map((f) => ({ ...f, ...(S.chanStats[f.id] || {}), name: (S.chanStats[f.id] || f).name }))
    : Object.values(S.chanStats).sort((a, b) => b.ms - a.ms).slice(0, 10);
  if (!list.length) box.append(h("p", "hint", tab === "fav" ? "Touche l'étoile d'un salon pour l'ajouter ici." : "Tes salons apparaîtront ici après quelques vocaux."));
  list.forEach((c, i) => {
    const row = h("div", "hs-row");
    if (tab === "top") row.append(h("span", "hs-pos", String(i + 1)));
    const t = h("div", "hm-ptext");
    t.append(h("b", "", (c.call ? "📞 " : "🔊 ") + c.name), h("small", "", [c.guild, c.ms ? dur(c.ms) : null, c.count ? `${c.count} fois` : null].filter(Boolean).join(" · ")));
    const star = h("button", "hs-star" + (isFav(c.id) ? " on" : ""), isFav(c.id) ? "★" : "☆");
    star.title = isFav(c.id) ? "Retirer des favoris" : "Ajouter aux favoris";
    star.onclick = (e) => { e.stopPropagation(); toggleFav(c); };
    row.append(t, star);
    row.title = `Rejoindre ${c.name}`;
    row.onclick = () => joinVoice(c.id, c.guildId, c.name);
    box.append(row);
  });
}
document.querySelectorAll("#homeSide [data-hs]").forEach((b) => (b.onclick = () => { S.homeSide = b.dataset.hs; save(); drawSide(); }));

// — Vue administrateur : l'état du service, les personnes connectées, les erreurs reçues —
const Admin = { stats: null, reports: [], at: 0, error: null };
const hm = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`; };
async function drawAdmin(force) {
  if (force || Date.now() - Admin.at > 10_000) {
    Admin.at = Date.now();
    const [a, b] = await Promise.all([window.studio.admin("stats"), window.studio.admin("reports")]);
    Admin.error = a.error || b.error || null;
    Admin.stats = a.data || null; Admin.reports = b.data || [];
  }
  if (Home.tab !== "admin") return;
  const box = $("#homeAdmin");
  box.textContent = "";
  if (Admin.error) return box.append(h("p", "hint", Admin.error));
  const s = Admin.stats;
  if (!s) return box.append(h("p", "hint", "Chargement…"));
  const nums = h("div", "ad-nums");
  for (const [n, l] of [[s.online.length, "en ligne"], [s.accounts, "comptes"], [s.servers.length, "serveurs"], [s.hours + " h", "de vocal"], [s.reportCount, "erreurs"]]) {
    const c = h("div", "ad-num");
    c.append(h("b", "", String(n)), h("small", "", l));
    nums.append(c);
  }
  box.append(nums, h("p", "hint", `${s.botOnline ? "Bot en ligne" : "Bot hors ligne"} · serveur allumé depuis ${hm(s.uptime)} · ${s.memMB} Mo de mémoire`));
  box.append(h("h3", "ad-title", "Connectés maintenant"));
  if (!s.online.length) box.append(h("p", "hint", "Personne."));
  for (const p of s.online) {
    const row = h("div", "hm-person");
    const t = h("div", "hm-ptext");
    t.append(h("b", "", p.name), h("small", "", `Hush ${p.version} · ${p.os}${p.inVoice ? " · en vocal" : ""}`));
    row.append(avatarImg(p.avatar), t);
    box.append(row);
  }
  box.append(h("h3", "ad-title", "Serveurs"), h("p", "hint", s.servers.map((g) => `${g.name} (${g.members})`).join(" · ") || "Aucun."));
  const head = h("div", "ad-head");
  head.append(h("h3", "ad-title", "Erreurs reçues"));
  if (Admin.reports.length) {
    const clear = h("button", "ghost small", "Tout effacer");
    clear.onclick = async () => {
      if (!clear.dataset.sure) { clear.dataset.sure = "1"; clear.textContent = "Confirmer"; return; }
      await window.studio.admin("clear");
      drawAdmin(true);
    };
    head.append(clear);
  }
  box.append(head);
  if (!Admin.reports.length) box.append(h("p", "hint", "Aucune. Seules les personnes qui ont accepté en envoient."));
  for (const r of Admin.reports.slice(0, 30)) {
    const d = document.createElement("details");
    d.className = "ad-err";
    const sum = document.createElement("summary");
    sum.textContent = `${ago(r.at)} · ${r.where} · ${r.message}`;
    d.append(sum, h("pre", "", `${r.user || "Anonyme"} · Hush ${r.version} · ${r.os}\n${r.stack || ""}`));
    box.append(d);
  }
}

// — Classement : les plus gros utilisateurs de Hush en vocal (heures comptées par le serveur du bot) —
const Top = { list: null, at: 0, me: null };
async function drawTop() {
  const box = $("#homeTop");
  if (Date.now() - Top.at > 60_000) {
    Top.at = Date.now();
    [Top.list, Top.me] = await Promise.all([window.studio.usage.top().catch(() => null), window.studio.usage.me().catch(() => null)]);
  }
  if (Home.tab !== "top") return;
  box.textContent = "";
  if (Top.me) box.append(h("p", "hint", `Toi : ${(Top.me.voiceMinutes / 60).toFixed(1)} h en vocal avec Hush, ${(Top.me.appMinutes / 60).toFixed(1)} h en tout (sur ce PC).`));
  if (!Top.list) { box.append(h("p", "hint", "Classement indisponible : le serveur du bot ne répond pas.")); return; }
  if (!Top.list.length) { box.append(h("p", "hint", "Personne pour l'instant : chaque minute en vocal avec Hush compte.")); return; }
  const meId = state.me && state.me.id;
  Top.list.forEach((p, i) => {
    const row = h("div", "hm-person hm-rank" + (p.id === meId ? " me" : ""));
    row.append(h("span", "hm-pos" + (i < 3 ? " p" + (i + 1) : ""), String(i + 1)), avatarImg(p.avatar));
    const t = h("div", "hm-ptext");
    t.append(h("b", "", p.name), h("small", "", `${String(p.hours).replace(".", ",")} h en vocal`));
    row.append(t);
    box.append(row);
  });
}

/* — Historique des vocaux, arrivées / départs, écran d'appel — */
let curCall = null, prevIds = null;
function homeOnState(s) {
  const ch = s.channel;
  // Historique : une entrée quand on quitte un vocal (au moins 1 minute)
  if (curCall && (!ch || ch.id !== curCall.id)) {
    const d = Date.now() - curCall.start;
    if (d > 60_000) {
      S.history = [{ id: curCall.id, guildId: curCall.guildId, name: curCall.name, guild: curCall.guild, call: curCall.call, at: curCall.start, dur: d, members: [...curCall.members.values()].slice(0, 6) },
        ...S.history.filter((x) => !(x.id === curCall.id && Math.abs(x.at - curCall.start) < 1000))].slice(0, 12);
      save();
    }
    if (d > 60_000) addChanStat(curCall, d);
    curCall = null; prevIds = null;
  }
  if (ch && s.status === "ready") {
    if (!curCall) curCall = { id: ch.id, guildId: ch.guildId || null, name: chanLabel(ch), guild: ch.guild, call: !!ch.call, start: Date.now(), members: new Map() };
    const meId = s.me && s.me.id;
    for (const m of s.members) if (m.id !== meId) curCall.members.set(m.id, { name: m.name, avatar: m.avatar });
    // Arrivées et départs
    const ids = new Set(s.members.map((m) => m.id));
    if (prevIds) {
      for (const m of s.members) if (!prevIds.has(m.id) && m.id !== meId) showToast(`${m.name} a rejoint ${ch.call ? "l'appel" : "le vocal"}`);
      for (const id of prevIds) if (!ids.has(id) && id !== meId) { const n = (curCall.members.get(id) || {}).name; if (n) showToast(`${n} est parti`); }
    }
    prevIds = ids;
  }
  // Appel privé qui sonne : la personne appelée s'affiche (en transparence) avec l'animation de sonnerie.
  // Seul dans un salon de serveur : simple bandeau « en attente », sans sonnerie (ça ne sonne chez personne).
  const alone = !!(ch && s.status === "ready" && s.members.filter((m) => !m.ghost).length <= 1);
  const ringing = alone && !!ch.call;
  document.body.classList.toggle("calling", ringing);
  $("#callBanner").hidden = !alone;
  $("#callBanner").classList.toggle("ringing", ringing);
  if (alone) {
    $("#callTitle").textContent = ringing ? `Appel à ${ch.callee ? ch.callee.name : "…"}` : `Tu es seul dans #${chanLabel(ch)}`;
    $("#callSub").textContent = ringing ? "Ça sonne : Hush l'affichera dès qu'il décroche." : "En attente : chaque personne qui arrive s'affichera ici.";
  }
}

// Bouton maison : ouvre l'accueil, ou le referme s'il est ouvert
$("#homeBtn").onclick = () => {
  // En mode Personnaliser : on en sort et on revient à l'accueil
  if (sandbox) { setSandbox(false); Home.forced = true; return renderHome(); }
  Home.forced = $("#home").hidden; renderHome();
};

