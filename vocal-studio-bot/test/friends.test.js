// Module Amis, sans Discord ni token. Lancer : node test/friends.test.js
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const { Friends } = require("../src/friends.js");
const file = path.join(os.tmpdir(), "friends-test-" + process.pid + ".json");
const seen = [];
const online = new Set(["11111", "22222"]);
const f = new Friends(file, { isOnline: (id) => online.has(id), notify: (id) => seen.push(id), voiceOf: (id) => (id === "33333" ? { channelId: "900001", name: "Bot", guild: "G" } : null) });
const A = "11111", B = "22222", C = "33333";
f.touch({ id: A, name: "Locks", avatar: null }); f.touch({ id: B, name: "Ami" }); f.touch({ id: C, name: "Autre" });
const code = f.db[B].code;
assert(/^[A-HJ-NP-Z2-9]{6}$/.test(code), "format du code");
assert.throws(() => f.op(A, "add", "NOPE00"), /n'existe pas/);
assert.throws(() => f.op(A, "add", f.db[A].code), /propre code/);
// Demande : personne ne voit le vocal de l'autre avant l'acceptation
f.setPresence(B, { channelId: "700001", guildId: "800001", name: "Voc", guild: "Srv" });
let la = f.op(A, "add", code.toLowerCase());
assert.equal(la.outgoing.length, 1);
assert.strictEqual(la.outgoing[0].voice, null, "pas de vocal avant acceptation");
assert.strictEqual(la.outgoing[0].online, false, "pas d'état en ligne avant acceptation");
assert.strictEqual(f.op(B, "list").incoming[0].voice, null);
assert(seen.includes(B), "la personne est prévenue");
// Acceptation : le vocal devient visible
f.op(B, "accept", A);
la = f.op(A, "list");
assert.equal(la.friends[0].id, B);
assert.equal(la.friends[0].voice.name, "Voc");
assert.throws(() => f.op(A, "add", code), /déjà amis/);
// Cacher son vocal
f.op(B, "hide", true);
assert.strictEqual(f.op(A, "list").friends[0].voice, null, "vocal caché");
f.op(B, "hide", false);
// Appel privé : jamais avec qui
f.setPresence(B, { call: true, channelId: "700001", name: "Secret", guild: "x" });
assert.deepStrictEqual(f.op(A, "list").friends[0].voice, { call: true, name: "Appel privé" });
f.setPresence(B, null);
assert.strictEqual(f.op(A, "list").friends[0].voice, null);
// Demandes croisées : accepte directement
f.op(C, "add", f.db[A].code);
la = f.op(A, "add", f.db[C].code);
assert.equal(la.friends.length, 2);
assert.equal(la.friends.find((x) => x.id === C).voice.name, "Bot", "vocal vu par le bot en secours");
// Accepter sans demande : refusé
f.op(A, "remove", C);
assert.equal(f.op(C, "list").friends.length, 0, "retiré des deux côtés");
assert.throws(() => f.op(C, "accept", B), /Pas de demande/);
assert.throws(() => f.op(C, "accept", "99999"), /inconnue/);
assert.throws(() => f.op(A, "pirate"), /inconnue/);
// Sortie du classement
assert.strictEqual(f.op(A, "list").hideRank, false);
assert.strictEqual(f.op(A, "rank", false).hideRank, true);
assert.strictEqual(f.op(A, "rank", true).hideRank, false);
// Suppression du compte : plus aucune trace chez les autres
f.op(C, "add", f.db[B].code);
f.removeUser(B);
assert.strictEqual(f.db[B], undefined);
assert.equal(f.op(A, "list").friends.length, 0);
assert.equal(f.op(C, "list").outgoing.length, 0);
assert.throws(() => f.op(B, "list"), /inconnu/);
f.touch({ id: B, name: "Ami" });
// Rechargement depuis le disque
clearTimeout(f.timer);
fs.writeFileSync(file, JSON.stringify(f.db));
const g = new Friends(file, {});
assert.equal(g.op(A, "list").code, f.db[A].code);
fs.rmSync(file, { force: true });
console.log("amis : tous les tests passent");
