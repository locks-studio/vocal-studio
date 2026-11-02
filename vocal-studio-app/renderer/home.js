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
  if (!Home.timer) { Home.timer = setInterval(refreshHome, 10_000); refreshHome(); }
  drawHome();
}

async function refreshHome() {
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
  if (b.textContent !== m.text) { b.textContent = m.text; b.classList.remove("in"); void b.offsetWidth; b.classList.add("in"); }
  b.classList.toggle("act", !!m.act);
  b.disabled = !m.act;
  b.onclick = m.act || null;
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
$("#homeBtn").onclick = () => { Home.forced = $("#home").hidden; renderHome(); };

