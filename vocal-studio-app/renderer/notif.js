/* ——— Notifications : la cloche à côté de la maison ———
   Demandes d'ami (accepter / refuser), amis qui arrivent en vocal et invitations à rejoindre un vocal.
   Les demandes viennent de la liste d'amis (toujours à jour) ; le reste est gardé sur ce PC (les 30 dernières). */
const Notif = { items: [], seenReq: new Set(), open: false, filter: "all" };
const NOTIF_KEY = "hush-notifs";
try { const n = JSON.parse(localStorage.getItem(NOTIF_KEY) || "{}"); Notif.items = n.items || []; Notif.seenReq = new Set(n.seenReq || []); } catch {}
const notifSave = () => { try { localStorage.setItem(NOTIF_KEY, JSON.stringify({ items: Notif.items.slice(0, 30), seenReq: [...Notif.seenReq].slice(-100) })); } catch {} };

function notifAdd(item) {
  // Pas deux fois la même chose de suite (ex. un ami qui change de salon puis revient)
  const same = Notif.items[0];
  if (same && same.kind === item.kind && same.from.id === item.from.id && same.voice && item.voice && same.voice.channelId === item.voice.channelId && Date.now() - same.at < 60_000) return;
  if (item.kind === "voice") Notif.items = Notif.items.filter((x) => !(x.kind === "voice" && x.from.id === item.from.id));
  Notif.items.unshift({ ...item, at: Date.now(), read: Notif.open });
  Notif.items = Notif.items.slice(0, 30);
  notifSave();
  notifDraw();
}

// Nombre sur la cloche : demandes d'ami pas encore vues + notifications pas lues
function notifCount() {
  const fr = typeof Home !== "undefined" && Home.friends;
  const req = fr ? fr.incoming.filter((p) => !Notif.seenReq.has(p.id)).length : 0;
  return req + Notif.items.filter((x) => !x.read).length;
}

const notifAgo = (ms) => {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
};

function notifDraw() {
  const n = notifCount();
  const dot = $("#notifDot");
  dot.hidden = !n;
  dot.textContent = n > 9 ? "9+" : String(n);
  $("#notifBtn").classList.toggle("on", Notif.open);
  const pop = $("#notifPop");
  pop.hidden = !Notif.open;
  if (!Notif.open) return;
  const list = $("#notifList");
  list.textContent = "";
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const av = (url) => { const i = el("img", "nt-av"); i.alt = ""; i.src = url || "assets/discord-logo.png"; i.onerror = () => { i.src = "assets/discord-logo.png"; }; return i; };
  const fr = typeof Home !== "undefined" && Home.friends;
  const f = Notif.filter;
  const reqs = (fr && fr.incoming) || [];
  // Filtres : avec le nombre dans chaque catégorie
  const cnt = { all: reqs.length + Notif.items.length, req: reqs.length, invite: Notif.items.filter((x) => x.kind === "invite").length, voice: Notif.items.filter((x) => x.kind !== "invite").length };
  document.querySelectorAll("#notifFilters [data-nf]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.nf === f));
    b.dataset.n = cnt[b.dataset.nf] || "";
  });
  // Demandes d'ami en attente (toujours en haut)
  if (f === "all" || f === "req") if (reqs.length) list.append(el("p", "nt-day", "Demandes d'ami"));
  for (const p of f === "all" || f === "req" ? reqs : []) {
    const row = el("div", "nt-row");
    const t = el("div", "nt-text");
    t.append(el("b", "", p.name), el("span", "", " veut t'ajouter en ami"));
    const acts = el("div", "nt-acts");
    const yes = el("button", "cta small", "Accepter"), no = el("button", "ghost small", "Refuser");
    yes.onclick = () => friendOp("accept", p.id);
    no.onclick = () => friendOp("refuse", p.id);
    acts.append(yes, no);
    t.append(acts);
    row.append(av(p.avatar), t);
    list.append(row);
  }
  // Le reste, du plus récent au plus ancien, rangé par jour
  const dayOf = (ms) => { const d = new Date(ms), t = new Date(); const k = Math.floor((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86_400_000); return k <= 0 ? "Aujourd'hui" : k === 1 ? "Hier" : "Plus ancien"; };
  let lastDay = null;
  const items = [...Notif.items].sort((a, b) => b.at - a.at).filter((x) => f === "all" || (f === "invite" ? x.kind === "invite" : f === "voice" ? x.kind !== "invite" : false));
  for (const x of items) {
    const day = dayOf(x.at);
    if (day !== lastDay) { list.append(el("p", "nt-day", day)); lastDay = day; }
    const row = el("div", "nt-row" + (x.read ? "" : " new") + (x.kind === "invite" ? " invite" : ""));
    const t = el("div", "nt-text");
    const v = x.voice || {};
    if (x.kind === "invite") t.append(el("b", "", x.from.name), el("span", "", " t'invite à rejoindre "), el("b", "", "🔊 " + (v.name || "son vocal")));
    else t.append(el("b", "", x.from.name), el("span", "", " est en vocal dans "), el("b", "", "🔊 " + (v.name || "un salon")));
    if (v.guild) t.append(el("small", "nt-guild", v.guild));
    t.append(el("small", "nt-time", notifAgo(x.at)));
    if (v.channelId) {
      const acts = el("div", "nt-acts");
      const go = el("button", x.kind === "invite" ? "cta small" : "ghost small", "Rejoindre");
      go.onclick = () => { joinVoice(v.channelId, v.guildId, v.name); notifShow(false); };
      acts.append(go);
      t.append(acts);
    }
    row.append(av(x.from.avatar), t);
    list.append(row);
  }
  if (!list.children.length) list.append(el("p", "nt-empty", f === "all" ? "Rien de nouveau. Les demandes d'ami, les invitations et tes amis qui arrivent en vocal s'affichent ici." : "Rien dans cette catégorie."));
  $("#notifClear").hidden = !Notif.items.length;
}

function notifShow(on) {
  Notif.open = on;
  if (on) {
    // Sous la cloche, aligné sur son bord droit
    const r = $("#notifBtn").getBoundingClientRect(), pop = $("#notifPop");
    pop.style.top = Math.round(r.bottom + 8) + "px";
    pop.style.right = Math.max(8, Math.round(innerWidth - r.right - 8)) + "px";
    // Ouvrir la cloche : tout est vu
    const fr = typeof Home !== "undefined" && Home.friends;
    for (const p of (fr && fr.incoming) || []) Notif.seenReq.add(p.id);
    notifDraw();
    for (const x of Notif.items) x.read = true;
    notifSave();
    $("#notifDot").hidden = true;
  } else notifDraw();
}
$("#notifBtn").onclick = (e) => { e.stopPropagation(); notifShow(!Notif.open); };
$("#notifClear").onclick = () => { Notif.items = Notif.filter === "all" || Notif.filter === "req" ? [] : Notif.items.filter((x) => (Notif.filter === "invite" ? x.kind !== "invite" : x.kind === "invite")); notifSave(); notifDraw(); };
document.querySelectorAll("#notifFilters [data-nf]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); Notif.filter = b.dataset.nf; notifDraw(); }));
addEventListener("pointerdown", (e) => { if (Notif.open && !e.target.closest("#notifPop, #notifBtn")) notifShow(false); });
addEventListener("keydown", (e) => { if (e.key === "Escape" && Notif.open) notifShow(false); });

// Invitation d'un ami : notification + petit message avec un bouton pour y aller tout de suite
if (!MINI) window.studio.friends.onInvite((inv) => {
  notifAdd({ kind: "invite", from: inv.from, voice: inv.voice });
  showToast(`${inv.from.name} t'invite à rejoindre ${inv.voice.name || "son vocal"} · ouvre la cloche 🔔 pour y aller`);
});

// Appelé par la liste d'amis à chaque mise à jour : nouvelles demandes, amis qui arrivent en vocal
window.notifOnFriends = (before, now) => {
  if (before) for (const p of now.friends) {
    const was = before.get(p.id);
    if (p.voice && p.voice.channelId && (!was || was.channelId !== p.voice.channelId)) notifAdd({ kind: "voice", from: { id: p.id, name: p.name, avatar: p.avatar }, voice: p.voice });
  }
  notifDraw();
};

// Inviter un ami dans ton vocal
async function inviteFriend(p) {
  const r = await window.studio.friends.op("invite", p.id);
  showToast(r.error || `Invitation envoyée à ${p.name}`);
}

notifDraw();
