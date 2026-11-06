// Amis sur Hush : une demande doit être acceptée pour que deux personnes se voient.
// On ajoute avec le code ami de l'autre (ou directement depuis la liste des personnes de ses serveurs).
// Ce qui est gardé sur disque : pseudo, photo, code, amis et demandes. Le vocal en cours reste en mémoire seulement.
const fs = require("fs");
const crypto = require("crypto");

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O ni 1/I : un code se dicte
const MAX_PENDING = 50;
const clean = (s, n) => String(s == null ? "" : s).slice(0, n);

class Friends {
  // voiceOf(id) : le vocal vu par le bot (null si inconnu) ; isOnline(id) : Hush ouvert ? ; notify(id) : prévient cette personne
  constructor(file, { voiceOf = () => null, isOnline = () => false, notify = () => {} } = {}) {
    this.file = file;
    this.voiceOf = voiceOf; this.isOnline = isOnline; this.notify = notify;
    this.presence = new Map();
    this.timer = null;
    try { this.db = JSON.parse(fs.readFileSync(file, "utf8")); } catch { this.db = {}; }
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => fs.writeFile(this.file + ".tmp", JSON.stringify(this.db), (e) => { if (!e) fs.rename(this.file + ".tmp", this.file, () => {}); }), 1000);
    if (this.timer.unref) this.timer.unref();
  }

  newCode() {
    const used = new Set(Object.values(this.db).map((u) => u.code));
    for (;;) {
      const code = [...crypto.randomBytes(6)].map((b) => ALPHABET[b % ALPHABET.length]).join("");
      if (!used.has(code)) return code;
    }
  }

  // À chaque connexion de Hush : pseudo et photo à jour
  touch(user) {
    const u = this.db[user.id] || (this.db[user.id] = { code: this.newCode(), friends: [], incoming: [], outgoing: [], hideVoice: false });
    u.name = clean(user.name, 80);
    u.avatar = user.avatar || null;
    this.save();
    return u;
  }

  view(id, withVoice = true) {
    const u = this.db[id] || {};
    let voice = null;
    if (withVoice && !u.hideVoice) voice = this.presence.get(id) || this.voiceOf(id) || null;
    return { id, name: u.name || "?", avatar: u.avatar || null, online: withVoice ? this.isOnline(id) : false, voice };
  }

  list(id) {
    const u = this.db[id];
    return {
      code: u.code, hideVoice: !!u.hideVoice,
      friends: u.friends.map((x) => this.view(x)),
      incoming: u.incoming.map((x) => this.view(x, false)),
      outgoing: u.outgoing.map((x) => this.view(x, false)),
    };
  }

  // Le vocal annoncé par Hush (aussi en connexion directe, sur les serveurs où le bot n'est pas)
  setPresence(id, voice) {
    let v = null;
    if (voice && typeof voice === "object") {
      if (voice.call) v = { call: true, name: "Appel privé" }; // jamais avec qui : un appel privé reste privé
      else if (/^\d{5,25}$/.test(String(voice.channelId))) {
        v = { channelId: String(voice.channelId), guildId: /^\d{5,25}$/.test(String(voice.guildId)) ? String(voice.guildId) : null, name: clean(voice.name, 100), guild: clean(voice.guild, 100) };
      }
    }
    if (v) this.presence.set(id, v); else this.presence.delete(id);
    this.notifyFriends(id);
  }

  notifyFriends(id) { const u = this.db[id]; if (u) for (const f of u.friends) this.notify(f); }

  op(id, op, arg) {
    const me = this.db[id];
    if (!me) throw new Error("Compte inconnu.");
    const other = () => {
      const t = String(arg || "").trim();
      if (!this.db[t]) throw new Error("Personne inconnue.");
      return t;
    };
    const drop = (list, x) => { const i = list.indexOf(x); if (i >= 0) list.splice(i, 1); };
    if (op === "list") return this.list(id);
    if (op === "add") {
      const raw = String(arg || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      const t = this.db[raw] ? raw : Object.keys(this.db).find((k) => this.db[k].code === raw);
      if (!t) throw new Error("Ce code ami n'existe pas.");
      if (t === id) throw new Error("C'est ton propre code.");
      const you = this.db[t];
      if (me.friends.includes(t)) throw new Error("Vous êtes déjà amis.");
      if (me.incoming.includes(t)) return this.op(id, "accept", t); // il t'avait déjà demandé : c'est bon des deux côtés
      if (!me.outgoing.includes(t)) {
        if (you.incoming.length >= MAX_PENDING) throw new Error("Cette personne a trop de demandes en attente.");
        me.outgoing.push(t); you.incoming.push(id);
      }
      this.notify(t);
    } else if (op === "accept") {
      const t = other();
      if (!me.incoming.includes(t)) throw new Error("Pas de demande de cette personne.");
      const you = this.db[t];
      drop(me.incoming, t); drop(you.outgoing, id);
      me.friends.push(t); you.friends.push(id);
      this.notify(t);
    } else if (op === "refuse" || op === "cancel" || op === "remove") {
      const t = other(), you = this.db[t];
      for (const [a, b] of [[me, t], [you, id]]) { drop(a.friends, b); drop(a.incoming, b); drop(a.outgoing, b); }
      this.notify(t);
    } else if (op === "hide") {
      me.hideVoice = !!arg;
      this.notifyFriends(id);
    } else throw new Error("Action inconnue.");
    this.save();
    return this.list(id);
  }
}

module.exports = { Friends };
