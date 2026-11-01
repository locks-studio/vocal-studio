/* ——— Page d'accueil ———
   S'affiche quand tu n'es dans aucun vocal (ou avec le bouton maison de la barre du haut).
   En fond : toi, seul dans la scène, flouté. Par-dessus :
   - ton compte : lié au bot ou non, le bot en ligne ou pas, et les boutons pour lier / inviter le bot ;
   - « Ça parle en ce moment » : les vocaux de tes serveurs où il y a des gens qui ont Hush (qui parle, qui est en live) ;
   - « Sur Hush » : les membres de tes serveurs qui ont Hush (en ligne, en vocal) ;
   - tes derniers vocaux, et des raccourcis.
   Aussi ici : les arrivées / départs dans ton vocal, et l'écran d'appel quand tu es seul à attendre. */
const Home = { forced: false, info: null, infoAt: 0, data: null, dataAt: 0, timer: null, rooms: new Set(), first: true };

function homeWanted() {
  if (MINI || S.demo || editingConfig) return false;
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
  $("#homeClose").textContent = state.channel ? "Retour au vocal" : "Voir la scène";
  if (!Home.timer) { Home.timer = setInterval(refreshHome, 10_000); refreshHome(); }
  drawHome();
}

async function refreshHome() {
  const isBot = state.mode === "bot";
  if (isBot && Date.now() - Home.infoAt > 15_000) { Home.info = await window.studio.bot.info(); Home.infoAt = Date.now(); }
  if (isBot && state.me && state.status === "ready") {
    try {
      Home.data = await window.studio.voice.home();
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

function drawHome() {
  if ($("#home").hidden) return;
  const isBot = state.mode === "bot";
  const info = Home.info;
  // — Compte —
  const acc = $("#homeAccount");
  acc.textContent = "";
  const me = state.me;
  const top = h("div", "hm-me");
  top.append(avatarImg(me && me.avatar, "hm-av big"));
  const who = h("div");
  who.append(h("h2", "", me ? `Salut ${me.name}` : "Bienvenue sur Hush"));
  const lines = h("div", "hm-status");
  const line = (ok, text) => { const p = h("p", "hm-line " + (ok === true ? "ok" : ok === false ? "err" : "warn")); p.append(h("i", "dot"), text); lines.append(p); };
  if (isBot) {
    if (!info || info.unreachable) line(false, "Serveur du bot injoignable");
    else line(info.online, info.online ? `Bot ${info.name || ""} en ligne · ${info.servers} serveur${info.servers > 1 ? "s" : ""}` : "Bot hors ligne");
    if (state.status === "needs-login") line(false, "Ton compte Discord n'est pas lié au bot");
    else if (me) line(true, `Compte Discord lié : ${me.name}`);
    else line(null, "Connexion au serveur Hush…");
  } else {
    line(state.status === "ready", state.status === "ready" ? "Connecté directement à Discord (RPC)" : (STATUS[state.status] || STATUS.idle)[1]);
  }
  who.append(lines);
  top.append(who);
  acc.append(top);
  const btns = h("div", "hm-actions");
  const b = (label, cls, fn) => { const x = h("button", cls, label); x.onclick = fn; btns.append(x); };
  if (isBot && state.status === "needs-login") b("Lier mon compte Discord", "cta", () => window.studio.bot.login());
  if (isBot && info && info.invite) b(`Inviter ${info.name || "le bot"} sur un serveur`, state.status === "needs-login" ? "ghost" : "cta", () => window.open(info.invite));
  if (state.status === "disconnected" || (isBot && info && info.unreachable)) b("Réessayer", "ghost", () => window.studio.voice.start());
  b("Connexion", "ghost", () => { Home.forced = false; editingConfig = true; screenKey = ""; renderChrome(); });
  acc.append(btns);
  acc.append(h("p", "hint", me && state.status === "ready" ? (isBot ? "Rejoins un salon vocal sur un serveur où le bot est invité : Hush passe tout seul sur ton vocal." : "Rejoins un vocal ou un appel dans Discord : Hush passe tout seul dessus.") : ""));

  // — Ça parle en ce moment —
  const rooms = $("#homeRooms");
  rooms.textContent = "";
  const data = Home.data;
  if (!isBot) rooms.append(h("p", "hint", "Les suggestions de vocaux marchent avec le bot Hush (Connexion › Avec le bot)."));
  else if (!data) rooms.append(h("p", "hint", state.status === "ready" ? "Chargement…" : "Lie ton compte pour voir les vocaux de tes serveurs."));
  else if (!data.rooms.length) rooms.append(h("p", "hint", "Personne avec Hush n'est en vocal sur tes serveurs pour l'instant."));
  for (const r of (data && data.rooms) || []) {
    const card = h("div", "hm-room");
    const head = h("div", "hm-room-head");
    head.append(avatarImg(r.guild.icon, "hm-gicon"));
    const t = h("div", "hm-room-title");
    t.append(h("b", "", "🔊 " + r.channel.name), h("small", "", `${r.guild.name} · ${r.count} en vocal${r.live ? " · Hush en direct" : ""}`));
    head.append(t);
    const join = h("button", "ghost small", "Rejoindre");
    join.onclick = () => window.studio.voice.openChannel(r.guild.id, r.channel.id);
    head.append(join);
    const row = h("div", "hm-faces");
    for (const m of r.members) {
      const f = h("div", "hm-face" + (m.speaking ? " speaking" : "") + (m.hush ? " hush" : ""));
      f.title = m.name + (m.hush ? " · a Hush" : "") + (m.stream ? " · en live" : m.video ? " · caméra" : "");
      f.append(avatarImg(m.avatar), h("span", "", m.name));
      if (m.stream) f.append(h("em", "live", "LIVE"));
      row.append(f);
    }
    card.append(head, row);
    rooms.append(card);
  }

  // — Sur Hush —
  const ppl = $("#homePeople");
  ppl.textContent = "";
  if (!isBot) ppl.append(h("p", "hint", "Avec le bot Hush, tu verras ici les membres de tes serveurs qui ont Hush."));
  else if (!data) ppl.append(h("p", "hint", "…"));
  else if (!data.people.length) ppl.append(h("p", "hint", "Personne d'autre sur tes serveurs n'a encore Hush. Partage-le à tes potes !"));
  for (const p of (data && data.people) || []) {
    const row = h("div", "hm-person" + (p.online ? " online" : ""));
    const avw = h("div", "hm-pav");
    avw.append(avatarImg(p.avatar), h("i", "st"));
    const t = h("div", "hm-ptext");
    t.append(h("b", "", p.name), h("small", "", p.voice ? `🔊 ${p.voice} · ${p.guild}` : p.online ? "Hush ouvert" : `Hors ligne · ${p.guild}`));
    row.append(avw, t);
    if (p.voice && p.channelId) {
      const j = h("button", "ghost small", "Rejoindre");
      j.onclick = () => window.studio.voice.openChannel(p.guildId, p.channelId);
      row.append(j);
    }
    ppl.append(row);
  }

  // — Derniers vocaux —
  const hist = $("#homeHistory");
  hist.textContent = "";
  if (!S.history.length) hist.append(h("p", "hint", "Tes vocaux apparaîtront ici."));
  for (const v of S.history.slice(0, 8)) {
    const row = h("div", "hm-hist");
    const t = h("div", "hm-ptext");
    t.append(h("b", "", (v.call ? "📞 " : "🔊 ") + v.name), h("small", "", [v.guild, ago(v.at), dur(v.dur)].filter(Boolean).join(" · ")));
    const faces = h("div", "hm-mini-faces");
    for (const m of v.members.slice(0, 5)) { const i = avatarImg(m.avatar); i.title = m.name; faces.append(i); }
    row.append(t, faces);
    hist.append(row);
  }
}

/* — Historique des vocaux, arrivées / départs, écran d'appel — */
let curCall = null, prevIds = null;
function homeOnState(s) {
  const ch = s.channel;
  // Historique : une entrée quand on quitte un vocal (au moins 1 minute)
  if (curCall && (!ch || ch.id !== curCall.id)) {
    const d = Date.now() - curCall.start;
    if (d > 60_000) {
      S.history = [{ id: curCall.id, name: curCall.name, guild: curCall.guild, call: curCall.call, at: curCall.start, dur: d, members: [...curCall.members.values()].slice(0, 6) },
        ...S.history.filter((x) => !(x.id === curCall.id && Math.abs(x.at - curCall.start) < 1000))].slice(0, 12);
      save();
    }
    curCall = null; prevIds = null;
  }
  if (ch && s.status === "ready") {
    if (!curCall) curCall = { id: ch.id, name: chanLabel(ch), guild: ch.guild, call: !!ch.call, start: Date.now(), members: new Map() };
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
  // Appel : tu es seul (ça sonne chez l'autre, ou tu attends que quelqu'un arrive)
  const alone = !!(ch && s.status === "ready" && s.members.length <= 1);
  document.body.classList.toggle("calling", alone);
  $("#callBanner").hidden = !alone;
  if (alone) {
    $("#callTitle").textContent = ch.call ? "Appel en cours…" : `Tu es seul dans #${chanLabel(ch)}`;
    $("#callSub").textContent = ch.call ? "Ça sonne : Hush affichera l'autre dès qu'il décroche." : "En attente : Hush affichera chaque personne qui arrive.";
  }
}

// Bouton maison : ouvre l'accueil, ou le referme s'il est ouvert
$("#homeBtn").onclick = () => { Home.forced = $("#home").hidden; renderHome(); };
$("#homeClose").onclick = () => { Home.forced = false; renderHome(); if (!state.channel) showToast("Rejoins un vocal dans Discord pour le voir ici"); };
$("#homeDemo").onclick = () => { Home.forced = false; setDemo(true); };
$("#homeMini").onclick = () => openMini();
$("#homeClips").onclick = () => window.studio.clip.show("");
$("#homeSettings").onclick = () => { S.panel = true; apply(); };
