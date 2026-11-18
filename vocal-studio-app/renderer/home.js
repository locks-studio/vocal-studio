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
  const on = homeWanted();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // L'accueil s'ouvre ou se ferme : l'ancien écran s'efface pendant que le nouveau arrive (zoom et flou)
  if (Home.wasOn !== undefined && on !== Home.wasOn && !Home.inVT && document.startViewTransition && !reduce && !MINI) {
    Home.inVT = true;
    document.documentElement.classList.toggle("vt-home-in", on);
    document.documentElement.classList.toggle("vt-home-out", !on);
    const vt = document.startViewTransition(() => renderHomeNow());
    vt.finished.finally(() => { Home.inVT = false; document.documentElement.classList.remove("vt-home-in", "vt-home-out"); });
    return;
  }
  renderHomeNow();
}
function renderHomeNow() {
  const box = $("#home");
  const on = homeWanted();
  Home.wasOn = on;
  box.hidden = !on;
  document.body.classList.toggle("home-on", on);
  // Hors vocal : la scène (ton avatar et ton pseudo) disparaît de l'accueil ; en vocal, les avatars restent en fond
  document.body.classList.toggle("home-solo", on && !(state.channel && state.status === "ready"));
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
  if (/oauth2|invalid_client|invalid_scope|not authori[sz]ed|tester/i.test(m)) return "Discord refuse la connexion directe : ton compte n'est pas testeur de l'appli Hush. Crée ta propre appli en 2 minutes (Modifier la connexion › Connexion directe › Ma propre appli), ou passe par le bot.";
  return m;
}

// Accueil sobre : un centre vide, avec une seule phrase selon la situation
function homeMessage() {
  const isBot = state.mode === "bot";
  const info = Home.info;
  // En vocal : plus de nom au milieu, on clique directement sur les avatars en fond pour y retourner
  if (state.channel && state.status === "ready") return { text: "" };
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
  b.hidden = !m.text;
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
  // Panneaux du bas (sauf l'admin) : sans boîte, dans l'écriture de la liste de gauche ; rejoue l'entrée à chaque onglet
  const hp = $("#homePanel");
  hp.classList.toggle("hp-free", !!Home.tab && Home.tab !== "admin");
  hp.classList.toggle("glass", !hp.classList.contains("hp-free"));
  if (hp.dataset.tab !== (Home.tab || "")) { hp.dataset.tab = Home.tab || ""; hp.classList.remove("hp-in"); void hp.offsetWidth; hp.classList.add("hp-in"); clearTimeout(Home.hpInT); Home.hpInT = setTimeout(() => hp.classList.remove("hp-in"), 900); }
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
// Accueil ouvert pendant un vocal : un clic sur un avatar en fond ramène dans le vocal
const tileUnder = (x, y) => document.elementsFromPoint(x, y).find((el) => el.closest && el.closest("#stage .tile"));
let homeHoverTile = null;
$("#home").addEventListener("pointermove", (e) => {
  const ok = e.target === $("#home") && state.channel && state.status === "ready";
  const t = ok ? tileUnder(e.clientX, e.clientY) : null;
  const tile = t && t.closest(".tile");
  if (tile === homeHoverTile) return;
  if (homeHoverTile) homeHoverTile.classList.remove("home-hover");
  homeHoverTile = tile;
  if (tile) tile.classList.add("home-hover");
  $("#home").classList.toggle("over-av", !!tile);
});
$("#home").addEventListener("click", (e) => {
  if (e.target !== $("#home") || !state.channel || state.status !== "ready") return;
  if (!tileUnder(e.clientX, e.clientY)) return;
  if (homeHoverTile) homeHoverTile.classList.remove("home-hover");
  homeHoverTile = null; $("#home").classList.remove("over-av");
  Home.forced = false; renderHome();
});
document.querySelectorAll("#homeTabs [data-ht]").forEach((t) => (t.onclick = () => { Home.tab = Home.tab === t.dataset.ht ? null : t.dataset.ht; drawHome(); }));
// Un onglet ouvert se referme d'un clic n'importe où ailleurs (pas dans le panneau, ni dans les fenêtres par-dessus)
addEventListener("pointerdown", (e) => {
  if (!Home.tab || $("#home").hidden || e.button !== 0) return;
  if (e.target.closest("#homePanel, #homeTabs, .settings-wrap, #settingsWrap, .modal, dialog, .toast, #hsStats, .um, [class^='um-'], #wePanel, #notifPop")) return;
  Home.tab = null;
  drawHome();
}, true);

// — Connexion : ton compte en grand, des pastilles d'état, puis les actions en lignes (comme la liste de gauche) —
const hpIcon = (d) => { const i = document.createElementNS("http://www.w3.org/2000/svg", "svg"); i.setAttribute("viewBox", "0 0 24 24"); i.innerHTML = d; i.classList.add("hp-ico"); return i; };
const HP_ICONS = {
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  bot: '<rect x="4" y="8" width="16" height="11" rx="4"/><path d="M12 4v4M9 13h.01M15 13h.01"/>',
  invite: '<circle cx="10" cy="8" r="4"/><path d="M3 21a7 7 0 0 1 14 0"/><path d="M19 8v6M16 11h6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
};
function hpAction(label, sub, icon, fn, hot) {
  const r = h("button", "hp-act" + (hot ? " hot" : ""));
  r.type = "button";
  const t = h("div", "hp-act-t");
  t.append(h("b", "", label));
  if (sub) t.append(h("small", "", sub));
  r.append(hpIcon(HP_ICONS[icon] || ""), t, h("i", "hp-chev", "›"));
  r.onclick = fn;
  return r;
}
// Les panneaux ne sont remplacés que si leur contenu a vraiment changé : avant, ils étaient refaits à chaque
// mise à jour de Hush (plusieurs fois par seconde) et rejouaient leur entrée, d'où le clignotement sans fin
function stableFill(box, build) {
  const tmp = document.createElement("div");
  build(tmp);
  const html = tmp.innerHTML;
  if (box._hpHtml === html && box.childNodes.length) return;
  box._hpHtml = html;
  box.replaceChildren(...tmp.childNodes);
}
function drawAccount() { stableFill($("#homeAccount"), drawAccountIn); }
function drawAccountIn(acc) {
  const isBot = state.mode === "bot";
  const info = Home.info;
  const me = state.me;
  const head = h("div", "hp-hero");
  const av = h("div", "hp-hero-av" + (state.status === "ready" ? " on" : ""));
  av.append(avatarImg(me && me.avatar, "hp-hero-img"));
  const who = h("div", "hp-hero-t");
  who.append(h("small", "hp-kicker", "Connexion"), h("h2", "hp-name", me ? me.name : "Pas connecté"));
  const chips = h("div", "hp-chips");
  const chip = (ok, text) => { const c = h("span", "hp-chip " + (ok === true ? "ok" : ok === false ? "err" : "warn")); c.append(h("i"), text); chips.append(c); };
  if (isBot) chip(state.status === "ready", state.status === "ready" ? "Avec le bot Hush" : state.status === "needs-login" ? "Compte pas encore lié" : (STATUS[state.status] || STATUS.idle)[1]);
  else chip(state.status === "ready", state.status === "ready" ? "Connexion directe à Discord" : (STATUS[state.status] || STATUS.idle)[1]);
  if (!info || info.unreachable) chip(false, "Serveur du bot injoignable");
  else chip(info.online, info.online ? `${info.name || "Bot"} en ligne · ${info.servers} serveur${info.servers > 1 ? "s" : ""}` : "Bot hors ligne");
  who.append(chips);
  head.append(av, who);
  acc.append(head);
  const list = h("div", "hp-list");
  if (isBot && state.status === "needs-login") list.append(hpAction("Lier mon compte", "Une page Discord s'ouvre, puis tu reviens ici tout seul", "link", () => window.studio.bot.login(), true));
  if (!isBot && info && !info.unreachable && !info.linked) list.append(hpAction("Lier au bot", "Pour « Ajouter le bot à la voc », Mes amis et le classement", "link", () => window.studio.bot.login()));
  if (state.channel && state.status === "ready" && !state.channel.call) {
    list.append(hpAction("Ajouter le bot à la voc", "Il rejoint ton vocal en cours", "bot", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      const r = await window.studio.voice.summon();
      btn.disabled = false;
      showToast(r && r.ok ? "Le bot arrive dans ton vocal…" : (r && r.error) || "Le bot n'a pas pu venir.");
    }, true));
  } else if (state.channel && state.channel.call) list.append(h("p", "hint", "Le bot ne peut pas rejoindre un appel privé (seulement les salons de serveur)."));
  if (info && info.invite) list.append(hpAction(`Inviter ${info.name || "le bot"}`, "Sur un serveur que tu gères · retour à Hush ensuite", "invite", () => window.studio.win.inviteBot(info.invite)));
  list.append(hpAction("Modifier la connexion", "Bot Hush ou connexion directe", "edit", () => { Home.forced = false; editingConfig = true; screenKey = ""; renderChrome(); }));
  acc.append(list);
}

// — Sur Hush : les membres de tes serveurs qui ont Hush (en ligne, en vocal) —
function drawPeople() {
  const fr = Home.friends;
  $("#frCode").textContent = fr ? fr.code : "…";
  $("#frHide").checked = !!(fr && fr.hideVoice);
  $("#frRank").checked = !(fr && fr.hideRank);
  stableFill($("#frList"), drawPeopleIn);
}
function drawPeopleIn(ppl) {
  const data = Home.data, fr = Home.friends;
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
      // Inviter dans ton vocal un ami qui a Hush ouvert et n'y est pas déjà
      const here = state.channel && !state.channel.call ? state.channel.id : null;
      if (here && p.online && (!v || v.channelId !== here)) {
        const inv = h("button", "ghost small fr-invite", "Inviter");
        inv.title = `Inviter ${p.name} dans ton vocal`;
        inv.onclick = (e) => { e.stopPropagation(); inviteFriend(p); };
        row.append(inv);
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
    const hadList = !!Home.friends;
    Home.friends = r.data; Home.frError = null;
    if (op === "add") showToast("Demande envoyée.");
    if (window.notifOnFriends) notifOnFriends(hadList ? before : null, r.data);
  }
  if (!$("#home").hidden) drawHome();
}
window.studio.friends.onChanged(() => { if (!MINI) friendOp("list"); });
// Le code ami dans ce qu'on a collé : « Mon code ami : AB12CD », un lien, des espaces… on retrouve les 6 caractères
function pickFriendCode(text) {
  const words = String(text || "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const code = words.filter((w) => /^[A-HJ-NP-Z2-9]{6}$/.test(w)).pop();
  if (code) return code;
  const id = words.find((w) => /^\d{15,22}$/.test(w)); // ou l'identifiant Discord de la personne
  return id || words.join("").slice(0, 6);
}
$("#frInput").addEventListener("paste", (e) => {
  const t = (e.clipboardData || window.clipboardData).getData("text");
  if (!t) return;
  e.preventDefault();
  $("#frInput").value = pickFriendCode(t);
});
$("#frPaste").onclick = async () => {
  const t = await window.studio.voice.paste();
  $("#frInput").value = pickFriendCode(t);
  $("#frInput").focus();
};
$("#frAdd").onsubmit = (e) => {
  e.preventDefault();
  const v = pickFriendCode($("#frInput").value);
  if (!v) return;
  $("#frInput").value = "";
  friendOp("add", v);
};
$("#frCopy").onclick = () => { if (Home.friends) { window.studio.voice.copy(Home.friends.code); showToast("Code ami copié."); } };
$("#frHide").onchange = (e) => friendOp("hide", e.target.checked);
$("#frRank").onchange = (e) => friendOp("rank", e.target.checked);
// Inviter le bot : le geste qui ouvre Hush à tout un serveur
const INVITE_URL = "https://discord.com/oauth2/authorize?client_id=1566055526444568669&scope=bot%20applications.commands&permissions=8";
$("#homeInvite").onclick = () => window.studio.win.inviteBot((Home.info && Home.info.invite) || INVITE_URL);
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
// Les personnes dans un salon en ce moment (données du bot, rafraîchies toutes les 10 s)
function liveFaces(id) {
  const r = Home.data && (Home.data.rooms || []).find((x) => x.channel && x.channel.id === id);
  return r ? r.members.filter((m) => !m.ghost) : [];
}
// Ceux avec qui tu as été dans ce salon (historique des vocaux), les plus récents d'abord
function pastFaces(id) {
  const seen = new Map();
  for (const v of S.history) if (v.id === id) for (const m of v.members || []) if (m && m.name && !seen.has(m.name)) seen.set(m.name, m);
  return [...seen.values()];
}
// Ronds de profil façon Discord, un peu les uns sur les autres. Plus de 4 : les 3 premiers, puis un rond blanc « +N »
function faceStack(faces) {
  const th = h("div", "hs-thumb");
  if (!faces.length) {
    // Personne : le logo du salon vide, en glitch noir et blanc
    th.classList.add("empty");
    th.append(h("i", "hs-gl"), h("i", "hs-gl b"));
    return th;
  }
  const shown = faces.length > 4 ? faces.slice(0, 3) : faces.slice(0, 4);
  th.classList.add("n" + (faces.length > 4 ? 4 : shown.length));
  for (const m of shown) { const im = avatarImg(m.avatar, "hs-face"); im.title = m.name || ""; th.append(im); }
  if (faces.length > 4) th.append(h("b", "hs-more", "+" + (faces.length - 3)));
  return th;
}
const SIDE_MAX = { top: 13, fav: 30 };
function drawSide() {
  const tab = ["fav", "friends", "hist"].includes(S.homeSide) ? S.homeSide : "top";
  document.querySelectorAll("#homeSide [data-hs]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.hs === tab));
  const box = $("#homeSideList");
  // Même règle que les panneaux : on ne refait la liste que si elle a changé (sinon elle remontait en haut
  // à chaque mise à jour et la molette ne servait à rien)
  if (box.dataset.tab !== tab) { box.dataset.tab = tab; box.scrollTop = 0; }
  stableFill(box, (b) => drawSideIn(b, tab));
}
function drawSideIn(box, tab) {
  if (tab === "friends") return drawSideFriends(box);
  if (tab === "hist") return drawSideHistory(box);
  const list = tab === "fav"
    ? S.favChans.slice(0, SIDE_MAX.fav).map((f) => ({ ...f, ...(S.chanStats[f.id] || {}), name: (S.chanStats[f.id] || f).name }))
    : Object.values(S.chanStats).sort((a, b) => b.ms - a.ms).slice(0, SIDE_MAX.top);
  if (!list.length) box.append(h("p", "hint", tab === "fav" ? "Touche l'étoile d'un salon pour l'ajouter ici." : "Tes salons apparaîtront ici après quelques vocaux."));
  list.forEach((c, i) => {
    const row = h("div", "hs-row");
    // Favoris → qui est dans le salon en ce moment ; Top → ceux avec qui tu y as été
    const faces = tab === "fav" ? liveFaces(c.id) : pastFaces(c.id);
    const th = faceStack(faces);
    if (tab === "fav" && faces.length) th.append(h("i", "hs-live", String(faces.length)));
    if (tab === "top") th.append(h("i", "hs-pos", String(i + 1)));
    const t = h("div", "hm-ptext");
    t.append(h("b", "", (c.call ? "📞 " : "") + c.name), h("small", "", [c.guild, c.ms ? dur(c.ms) : null, c.count ? `${c.count} fois` : null].filter(Boolean).join(" · ")));
    const star = h("button", "hs-star" + (isFav(c.id) ? " on" : ""), isFav(c.id) ? "★" : "☆");
    star.title = isFav(c.id) ? "Retirer des favoris" : "Ajouter aux favoris";
    star.onclick = (e) => { e.stopPropagation(); toggleFav(c); };
    row.append(th, t, star);
    row.title = `Rejoindre ${c.name} · clic droit : tes stats`;
    row.onclick = () => joinVoice(c.id, c.guildId, c.name);
    row.oncontextmenu = (e) => { e.preventDefault(); showChanStats(c, e); };
    box.append(row);
  });
}
// Amis : ceux qui sont en vocal en haut (clic : on les rejoint), puis ceux qui ont Hush ouvert
function drawSideFriends(box) {
  const fr = Home.friends;
  if (!fr) return box.append(h("p", "hint", Home.frError || "Chargement de tes amis…"));
  const inVoice = fr.friends.filter((p) => p.voice);
  const online = fr.friends.filter((p) => !p.voice && p.online);
  if (!fr.friends.length) return box.append(h("p", "hint", "Ajoute des amis dans « Mes amis » (en bas) pour les voir ici quand ils sont en vocal."));
  if (!inVoice.length) box.append(h("p", "hint", "Aucun ami en vocal pour l'instant."));
  for (const p of [...inVoice, ...online]) {
    const v = p.voice;
    const row = h("div", "hs-row hs-friend" + (v ? "" : " idle"));
    const th = h("div", "hs-thumb n1");
    th.append(avatarImg(p.avatar, "hs-face"));
    if (v) th.append(h("i", "hs-dot"));
    const t = h("div", "hm-ptext");
    t.append(h("b", "", p.name), h("small", "", v ? (v.call ? "En appel privé" : `🔊 ${v.name}${v.guild ? " · " + v.guild : ""}`) : "Hush ouvert"));
    row.append(th, t);
    if (v && v.channelId) { row.title = `Rejoindre ${v.name}`; row.onclick = () => joinVoice(v.channelId, v.guildId, v.name); }
    box.append(row);
  }
}
// Historique : tes derniers vocaux (clic : on y retourne)
function drawSideHistory(box) {
  if (!S.history.length) return box.append(h("p", "hint", "Tes vocaux apparaîtront ici."));
  for (const v of S.history.slice(0, 12)) {
    const row = h("div", "hs-row");
    const t = h("div", "hm-ptext");
    t.append(h("b", "", (v.call ? "📞 " : "") + v.name), h("small", "", [v.guild, ago(v.at), dur(v.dur)].filter(Boolean).join(" · ")));
    row.append(faceStack(v.members || []), t);
    if (v.id && v.id !== "sandbox" && v.id !== "demo") {
      row.title = `Rejoindre ${v.name} · clic droit : tes stats`;
      row.onclick = () => joinVoice(v.id, v.guildId, v.name);
      row.oncontextmenu = (e) => { e.preventDefault(); showChanStats({ ...(S.chanStats[v.id] || {}), id: v.id, name: v.name, guild: v.guild, guildId: v.guildId, call: v.call }, e); };
    }
    box.append(row);
  }
}
// Clic droit sur un salon : tes stats dans ce salon (temps, fois, moyenne, dernière fois, avec qui)
function showChanStats(c, e) {
  const st = S.chanStats[c.id] || { ms: 0, count: 0 };
  const visits = S.history.filter((v) => v.id === c.id);
  const met = new Map();
  for (const v of visits) for (const m of v.members || []) if (m && m.name) met.set(m.name, { ...m, n: ((met.get(m.name) || {}).n || 0) + 1 });
  const best = [...met.values()].sort((a, b) => b.n - a.n).slice(0, 5);
  const rank = Object.values(S.chanStats).sort((a, b) => b.ms - a.ms).findIndex((x) => x.id === c.id) + 1;
  const longest = visits.reduce((m, v) => Math.max(m, v.dur || 0), 0);
  const box = $("#hsStats");
  box.textContent = "";
  const head = h("header", "hss-head");
  head.append(h("b", "", (c.call ? "📞 " : "🔊 ") + c.name), h("small", "", c.guild || ""));
  const grid = h("div", "hss-grid");
  const cell = (n, l) => { const x = h("div", "hss-cell"); x.append(h("b", "", n), h("small", "", l)); grid.append(x); };
  cell(st.ms ? dur(st.ms) : "0 min", "passées ici");
  cell(String(st.count || 0), st.count > 1 ? "visites" : "visite");
  cell(st.count ? dur(st.ms / st.count) : "—", "en moyenne");
  cell(rank ? "#" + rank : "—", "dans ton top");
  cell(longest ? dur(longest) : "—", "plus long vocal");
  cell(st.last ? ago(st.last) : "—", "dernière fois");
  box.append(head, grid);
  if (best.length) {
    const w = h("div", "hss-met");
    w.append(h("small", "", "Avec qui tu y vas le plus"));
    const row = h("div", "hss-faces");
    for (const m of best) { const f = h("span", "hss-face"); f.append(avatarImg(m.avatar, "hs-face"), h("i", "", m.name)); row.append(f); }
    w.append(row);
    box.append(w);
  }
  box.hidden = false;
  const r = box.getBoundingClientRect();
  box.style.left = Math.min(innerWidth - r.width - 10, e.clientX + 8) + "px";
  box.style.top = Math.min(innerHeight - r.height - 10, Math.max(10, e.clientY - 20)) + "px";
}
addEventListener("pointerdown", (e) => { const b = $("#hsStats"); if (!b.hidden && !e.target.closest("#hsStats")) b.hidden = true; });
addEventListener("keydown", (e) => { if (e.key === "Escape") $("#hsStats").hidden = true; });
document.querySelectorAll("#homeSide [data-hs]").forEach((b) => (b.onclick = () => { S.homeSide = b.dataset.hs; save(); drawSide(); }));

// — Vue administrateur : l'état du service, les chiffres utiles, les rôles, les erreurs reçues —
const Admin = { stats: null, reports: [], users: [], at: 0, error: null, q: "", roleFilter: "" };
const ROLE_INFO = {
  standard: { label: "Standard", color: "#9aa0b4" },
  phantom: { label: "Phantom", color: "#b07cff" },
  premium: { label: "Premium", color: "#ffc93c" },
  limitless: { label: "Limitless", color: "#ff3d9a" },
  testeur: { label: "Testeur", color: "#3ddc97" },
  collaborateur: { label: "Collaborateur", color: "#4fb3ff" },
  streamer: { label: "Streamer", color: "#ff5a3d" },
};
const roleTag = (r) => { const i = ROLE_INFO[r] || ROLE_INFO.standard; const t = h("span", "ad-role", i.label); t.style.setProperty("--rc", i.color); return t; };
const hm = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`; };
async function drawAdmin(force) {
  if (force || Date.now() - Admin.at > 10_000) {
    Admin.at = Date.now();
    const [a, b, c] = await Promise.all([window.studio.admin("stats"), window.studio.admin("reports"), window.studio.admin("users")]);
    Admin.error = a.error || b.error || null;
    Admin.stats = a.data || null; Admin.reports = b.data || []; Admin.users = c.data || [];
  }
  if (Home.tab !== "admin") return;
  const box = $("#homeAdmin");
  // Menu de rôle ouvert ou recherche en cours : on ne redessine pas sous la souris (sinon le menu se referme
  // tout seul à chaque rafraîchissement de l'accueil) ; on le fera dès que le champ perd le focus
  const busy = document.activeElement;
  if (!force && busy && box.contains(busy) && busy.matches("select, input")) {
    if (!Admin.waiting) { Admin.waiting = true; busy.addEventListener("blur", () => { Admin.waiting = false; setTimeout(() => drawAdmin(), 0); }, { once: true }); }
    return;
  }
  const keepScroll = $("#homePanel").scrollTop;
  box.textContent = "";
  if (Admin.error) return box.append(h("p", "hint", Admin.error));
  const s = Admin.stats;
  if (!s) return box.append(h("p", "hint", "Chargement…"));
  // État du service : un gros voyant, puis la durée, la mémoire et le ping
  const st = h("div", "ad-status " + (s.botOnline ? "ok" : "ko"));
  const stTxt = h("div", "ad-st-text");
  stTxt.append(h("b", "", s.botOnline ? "Tout fonctionne" : "Le bot est hors ligne"), h("small", "", [`Serveur allumé depuis ${hm(s.uptime)}`, `${s.memMB} Mo`, s.ping != null && s.ping >= 0 ? `ping ${s.ping} ms` : null].filter(Boolean).join(" · ")));
  const refresh = h("button", "ghost small", "Actualiser");
  refresh.onclick = () => drawAdmin(true);
  st.append(h("i", "ad-led"), stTxt, refresh);
  box.append(st);
  // Les chiffres clés
  const nums = h("div", "ad-nums");
  const tiles = [
    [s.online.length, "en ligne", "on"], [s.inVoice ?? 0, "en vocal", "on"], [s.video ?? 0, "caméra / écran", ""],
    [s.accounts, "comptes liés", ""], [s.active24h ?? "—", "actifs 24 h", ""], [s.active7d ?? "—", "actifs 7 j", ""],
    [s.servers.length, "serveurs", ""], [s.members ?? "—", "membres touchés", ""], [s.hours + " h", "de vocal", ""],
    [s.friendsAccounts ?? "—", "comptes amis", ""], [s.ranked ?? "—", "au classement", ""], [s.reportCount, "erreurs", s.reportCount ? "warn" : ""],
  ];
  for (const [n, l, k] of tiles) { const c = h("div", "ad-num " + k); c.append(h("b", "", String(n)), h("small", "", l)); nums.append(c); }
  box.append(nums);
  const card = (title, count) => {
    const c = h("section", "ad-card");
    const hd = h("header", "ad-head");
    hd.append(h("h3", "ad-title", title));
    if (count != null) hd.append(h("span", "ad-count", String(count)));
    c.append(hd);
    return c;
  };
  // Une répartition en barres (versions, systèmes, rôles)
  const bars = (title, obj, label = (k) => k, color) => {
    const c = card(title);
    const list = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
    if (!list.length) c.append(h("p", "hint", "Rien pour l'instant."));
    const big = Math.max(1, ...list.map((x) => x[1]));
    for (const [k, n] of list) {
      const row = h("div", "ad-server");
      const top = h("div", "ad-sv-top");
      top.append(h("b", "", label(k)), h("small", "", String(n)));
      const bar = h("i", "ad-bar");
      bar.style.setProperty("--w", Math.max(4, Math.round((n / big) * 100)) + "%");
      if (color) bar.style.setProperty("--bc", color(k));
      row.append(top, bar);
      c.append(row);
    }
    return c;
  };
  const cols = h("div", "ad-cols");
  // Connectés maintenant
  const on = card("Connectés maintenant", s.online.length);
  if (!s.online.length) on.append(h("p", "hint", "Personne pour l'instant."));
  for (const p of s.online) {
    const row = h("div", "ad-person");
    const t = h("div", "hm-ptext");
    t.append(h("b", "", p.name));
    const tags = h("div", "ad-tags");
    tags.append(roleTag(p.role), h("span", "ad-tag", "Hush " + p.version), h("span", "ad-tag", p.os));
    if (p.inVoice) tags.append(h("span", "ad-tag live", "en vocal"));
    if (p.cam) tags.append(h("span", "ad-tag live", "caméra"));
    if (p.screen) tags.append(h("span", "ad-tag live", "écran"));
    t.append(tags);
    row.append(avatarImg(p.avatar), t);
    on.append(row);
  }
  // Les plus gros utilisateurs
  const top = card("Top utilisateurs");
  if (!(s.top || []).length) top.append(h("p", "hint", "Personne pour l'instant."));
  (s.top || []).forEach((p, i) => {
    const row = h("div", "ad-person");
    const t = h("div", "hm-ptext");
    t.append(h("b", "", `${i + 1}. ${p.name}`), h("small", "", `${String(p.hours).replace(".", ",")} h en vocal`));
    row.append(avatarImg(p.avatar), t);
    top.append(row);
  });
  // Serveurs, du plus grand au plus petit
  const sv = card("Serveurs", s.servers.length);
  const big = Math.max(1, ...s.servers.map((g) => g.members));
  if (!s.servers.length) sv.append(h("p", "hint", "Aucun."));
  for (const g of [...s.servers].sort((a, b) => b.members - a.members)) {
    const row = h("div", "ad-server");
    const tp = h("div", "ad-sv-top");
    tp.append(h("b", "", g.name), h("small", "", `${g.members} membres`));
    const bar = h("i", "ad-bar");
    bar.style.setProperty("--w", Math.max(4, Math.round((g.members / big) * 100)) + "%");
    row.append(tp, bar);
    sv.append(row);
  }
  cols.append(on, top, sv,
    bars("Versions (en ligne)", s.versions, (k) => "Hush " + k),
    bars("Systèmes (en ligne)", s.systems),
    bars("Rôles donnés", s.roles, (k) => (ROLE_INFO[k] || ROLE_INFO.standard).label, (k) => (ROLE_INFO[k] || ROLE_INFO.standard).color));
  box.append(cols);
  // Gestion des rôles : chercher quelqu'un, puis choisir son rôle
  const rc = card("Rôles", Admin.users.length);
  rc.classList.add("ad-wide");
  const tools = h("div", "ad-role-tools");
  const q = h("input", "field");
  q.type = "search"; q.placeholder = "Chercher un pseudo ou un identifiant"; q.value = Admin.q; q.spellcheck = false;
  const f = h("select", "field");
  f.append(new Option("Tous les rôles", ""));
  for (const [k, v] of Object.entries(ROLE_INFO)) f.append(new Option(v.label, k));
  f.value = Admin.roleFilter;
  tools.append(q, f);
  rc.append(tools);
  const list = h("div", "ad-role-list");
  const drawList = () => {
    list.textContent = "";
    const needle = Admin.q.trim().toLowerCase();
    const shown = Admin.users.filter((u) => (!needle || u.name.toLowerCase().includes(needle) || u.id.includes(needle)) && (!Admin.roleFilter || u.role === Admin.roleFilter)).slice(0, 80);
    if (!shown.length) list.append(h("p", "hint", "Personne ne correspond."));
    for (const u of shown) {
      const row = h("div", "ad-person ad-user" + (u.online ? " online" : ""));
      const t = h("div", "hm-ptext");
      t.append(h("b", "", u.name), h("small", "", [u.online ? "en ligne" : u.last ? "vu " + ago(u.last) : null, u.hours ? `${String(u.hours).replace(".", ",")} h` : null, u.id].filter(Boolean).join(" · ")));
      const sel = h("select", "field ad-role-sel");
      for (const [k, v] of Object.entries(ROLE_INFO)) sel.append(new Option(v.label, k));
      sel.value = u.role;
      sel.style.setProperty("--rc", (ROLE_INFO[u.role] || ROLE_INFO.standard).color);
      sel.onchange = async () => {
        sel.disabled = true;
        const r = await window.studio.admin("setRole", { id: u.id, role: sel.value });
        sel.disabled = false;
        if (r.error) { showToast(r.error); sel.value = u.role; return; }
        Admin.users = r.data || Admin.users;
        showToast(`${u.name} est maintenant ${(ROLE_INFO[sel.value] || ROLE_INFO.standard).label}.`);
        Admin.at = 0; drawAdmin(true);
      };
      row.append(avatarImg(u.avatar), t, sel);
      list.append(row);
    }
  };
  q.oninput = () => { Admin.q = q.value; drawList(); };
  f.onchange = () => { Admin.roleFilter = f.value; drawList(); };
  drawList();
  rc.append(list);
  box.append(rc);
  // Erreurs reçues
  const er = card("Erreurs reçues", Admin.reports.length);
  er.classList.add("ad-wide");
  if (Admin.reports.length) {
    const clear = h("button", "ghost small", "Tout effacer");
    clear.onclick = async () => {
      if (!clear.dataset.sure) { clear.dataset.sure = "1"; clear.textContent = "Confirmer"; return; }
      await window.studio.admin("clear");
      drawAdmin(true);
    };
    er.querySelector(".ad-head").append(clear);
  }
  if (!Admin.reports.length) er.append(h("p", "hint", "Aucune. Seules les personnes qui ont accepté en envoient."));
  for (const r of Admin.reports.slice(0, 30)) {
    const d = document.createElement("details");
    d.className = "ad-err";
    const sum = document.createElement("summary");
    sum.append(h("small", "ad-when", ago(r.at)), h("span", "ad-tag", r.where), h("span", "ad-msg", r.message));
    d.append(sum, h("pre", "", `${r.user || "Anonyme"} · Hush ${r.version} · ${r.os}\n${r.stack || ""}`));
    er.append(d);
  }
  box.append(er);
  $("#homePanel").scrollTop = keepScroll;
}
// — Classement : un podium pour les 3 premiers, puis les autres en lignes —
const Top = { list: null, at: 0, me: null };
async function drawTop() {
  const box = $("#homeTop");
  if (Date.now() - Top.at > 60_000) {
    Top.at = Date.now();
    [Top.list, Top.me] = await Promise.all([window.studio.usage.top().catch(() => null), window.studio.usage.me().catch(() => null)]);
  }
  if (Home.tab !== "top") return;
  stableFill(box, drawTopIn);
}
function drawTopIn(box) {
  const head = h("div", "hp-head");
  head.append(h("h2", "hp-title", "Classement"));
  if (Top.me) head.append(h("span", "hp-badge", `Toi : ${(Top.me.voiceMinutes / 60).toFixed(1).replace(".", ",")} h en vocal`));
  box.append(head);
  if (!Top.list) { box.append(h("p", "hint", "Classement indisponible : le serveur du bot ne répond pas.")); return; }
  if (!Top.list.length) { box.append(h("p", "hint", "Personne pour l'instant : chaque minute en vocal avec Hush compte.")); return; }
  const meId = state.me && state.me.id;
  const hours = (p) => `${String(p.hours).replace(".", ",")} h`;
  // Podium : 2e, 1er, 3e
  const podium = h("div", "hp-podium");
  [1, 0, 2].forEach((i) => {
    const p = Top.list[i];
    if (!p) return;
    const c = h("div", "hp-pod p" + (i + 1) + (p.id === meId ? " me" : ""));
    const avw = h("div", "hp-pod-av");
    avw.append(avatarImg(p.avatar, "hp-pod-img"), h("b", "hp-pod-n", String(i + 1)));
    c.append(avw, h("b", "hp-pod-name", p.name), h("small", "", hours(p)), h("i", "hp-pod-step"));
    podium.append(c);
  });
  box.append(podium);
  const list = h("div", "hp-list");
  Top.list.slice(3).forEach((p, k) => {
    const row = h("div", "hp-row " + (k + 4 <= 10 ? "top10" : "tier") + (p.id === meId ? " me" : ""));
    row.style.setProperty("--i", k);
    row.append(h("span", "hp-rank", String(k + 4)), avatarImg(p.avatar, "hp-av"));
    const t = h("div", "hp-row-t");
    t.append(h("b", "", p.name), h("small", "", hours(p) + " en vocal"));
    row.append(t);
    list.append(row);
  });
  box.append(list);
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
  // La croix cache le bandeau pour ce salon (il revient au prochain salon)
  $("#callBanner").hidden = !alone || (!ringing && Home.callHidden === ch.id);
  $("#callBanner").classList.toggle("ringing", ringing);
  if (alone) {
    $("#callTitle").textContent = ringing ? `Appel à ${ch.callee ? ch.callee.name : "…"}` : `Tu es seul dans #${chanLabel(ch)}`;
    $("#callSub").textContent = ringing ? "Ça sonne : Hush l'affichera dès qu'il décroche." : "En attente : chaque personne qui arrive s'affichera ici.";
  }
}

$("#callClose").onclick = () => { Home.callHidden = state.channel && state.channel.id; $("#callBanner").hidden = true; };
// Bouton maison : ouvre l'accueil, ou le referme s'il est ouvert
$("#homeBtn").onclick = () => {
  // En mode Personnaliser : on en sort et on revient à l'accueil
  if (sandbox) { setSandbox(false); Home.forced = true; return renderHome(); }
  Home.forced = $("#home").hidden; renderHome();
};


/* ——— Liste de gauche : défilement doux, effet tambour et « tic » de molette ———
   La molette ne saute plus : la liste glisse vers sa cible et ralentit en arrivant. Les salons s'inclinent
   un peu en s'éloignant du milieu (comme un tambour), et chaque salon qui passe sous la souris fait un petit « tic »,
   comme la molette d'un casque quand on monte le son. */
const SideScroll = { target: null, raf: 0, lastRow: null };
function sideDrum() {
  const box = $("#homeSideList");
  const mid = box.scrollTop + box.clientHeight / 2, half = Math.max(1, box.clientHeight / 2);
  for (const r of box.children) {
    const c = r.offsetTop + r.offsetHeight / 2;
    const k = Math.max(-1, Math.min(1, (c - mid) / half));
    r.style.setProperty("--drum", k.toFixed(3));
    r.style.setProperty("--drum2", (k * k).toFixed(3));
  }
}
function sideStep() {
  const box = $("#homeSideList");
  const d = SideScroll.target - box.scrollTop;
  box.scrollTop += Math.abs(d) < 0.5 ? d : d * 0.14;
  const first = box.firstElementChild;
  const rowH = (first ? first.offsetHeight : 56) + 6;
  const row = Math.round(box.scrollTop / rowH);
  SideScroll.lastRow = row;
  sideDrum();
  sideHover(); // la liste glisse sous la souris : le vocal survolé change, ça fait « tic »
  if (Math.abs(d) >= 0.5) SideScroll.raf = requestAnimationFrame(sideStep);
  else { SideScroll.raf = 0; SideScroll.target = null; }
}
$("#homeSideList").addEventListener("wheel", (e) => {
  const box = e.currentTarget;
  if (box.scrollHeight <= box.clientHeight + 1) return;
  e.preventDefault(); e.stopPropagation(); // la molette ne zoome pas la scène derrière
  const max = box.scrollHeight - box.clientHeight;
  const step = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
  SideScroll.target = Math.max(0, Math.min(max, (SideScroll.target ?? box.scrollTop) + step));
  if (SideScroll.lastRow === null) SideScroll.lastRow = Math.round(box.scrollTop / 62);
  if (!SideScroll.raf) SideScroll.raf = requestAnimationFrame(sideStep);
}, { passive: false });
// « Tic » quand la souris arrive sur un vocal (en passant dessus, ou parce que la liste défile dessous)
const SideHover = { x: 0, y: 0, inside: false, row: null };
function sideHover() {
  if (!SideHover.inside) return;
  const el = document.elementFromPoint(SideHover.x, SideHover.y);
  const row = el && el.closest && el.closest("#homeSideList .hs-row");
  if (row === SideHover.row) return;
  const prev = SideHover.row;
  SideHover.row = row;
  if (!row) return;
  // Vers le haut ou vers le bas : le « tic » change un peu de hauteur
  const up = prev && prev.isConnected ? row.offsetTop < prev.offsetTop : true;
  Sfx.play("tick", up);
}
$("#homeSideList").addEventListener("pointermove", (e) => { SideHover.x = e.clientX; SideHover.y = e.clientY; SideHover.inside = true; sideHover(); });
$("#homeSideList").addEventListener("pointerleave", () => { SideHover.inside = false; SideHover.row = null; });
new ResizeObserver(() => sideDrum()).observe($("#homeSideList"));
new MutationObserver(() => requestAnimationFrame(sideDrum)).observe($("#homeSideList"), { childList: true });
