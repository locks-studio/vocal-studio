// /installer-hush : simulation sur un faux serveur Discord (aucune connexion à Discord)
const assert = require("assert");
const { installCommunity, ROLES, CATEGORIES, norm, ChannelType, P, CREATE_VOICE } = require("../src/community.js");

// Sans discord.js (vérification GitHub) : petite Collection maison. Avec : on vérifie en plus nos valeurs fixes.
class Collection extends Map { find(fn) { for (const v of this.values()) if (fn(v)) return v; } }
let resolvePerms = (list) => list.forEach((x) => assert.equal(typeof x, "bigint", "permission inconnue"));
try {
  const d = require("discord.js");
  for (const [k, v] of Object.entries(P)) assert.equal(v, d.PermissionFlagsBits[k], `permission ${k}`);
  for (const [k, v] of Object.entries(ChannelType)) assert.equal(v, d.ChannelType[k], `type de salon ${k}`);
  resolvePerms = (list) => d.PermissionsBitField.resolve(list);
} catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e; }

const NEEDS_COMMUNITY = [ChannelType.GuildAnnouncement, ChannelType.GuildForum];
// Faux serveur : garde en mémoire ce qui est créé, refuse toute suppression ou modification (sauf l'activation de la Communauté)
function fakeGuild({ community = false, refuseCommunity = false } = {}) {
  let n = 0;
  const calls = { roles: 0, channels: 0, sent: [], edits: [] };
  const roles = new Collection(), channels = new Collection();
  const everyone = { id: "everyone", name: "@everyone" };
  roles.set(everyone.id, everyone);
  const forbid = () => { throw new Error("interdit : suppression ou modification"); };
  const guild = {
    calls, everyone, features: community ? ["COMMUNITY"] : [], verificationLevel: 0,
    edit: async (o) => {
      calls.edits.push(o);
      assert.deepEqual(Object.keys(o).sort(), ["defaultMessageNotifications", "explicitContentFilter", "features", "publicUpdatesChannel", "reason", "rulesChannel", "verificationLevel"]);
      assert.ok(channels.has(o.rulesChannel) && channels.has(o.publicUpdatesChannel), "Communauté : salons de règles et de modération créés avant");
      assert.ok(o.verificationLevel >= 1 && o.explicitContentFilter === 2);
      if (refuseCommunity) throw new Error("refusé");
      guild.features = o.features;
    },
    roles: {
      cache: roles, everyone, fetch: async () => roles, delete: forbid, edit: forbid,
      create: async (o) => { calls.roles++; resolvePerms(o.permissions); const r = { id: `r${++n}`, ...o, delete: forbid, edit: forbid }; roles.set(r.id, r); return r; },
    },
    channels: {
      cache: channels, fetch: async () => channels, delete: forbid, edit: forbid,
      create: async (o) => {
        calls.channels++;
        if (NEEDS_COMMUNITY.includes(o.type)) assert.ok(guild.features.includes("COMMUNITY"), "annonces/forums sans Communauté");
        // Discord met les salons texte en minuscules avec des tirets
        const name = o.type === ChannelType.GuildVoice || o.type === ChannelType.GuildCategory ? o.name : norm(o.name);
        for (const ow of o.permissionOverwrites || []) {
          assert.ok(roles.has(ow.id), `droits sur un rôle inconnu : ${ow.id}`);
          resolvePerms(ow.allow || []); resolvePerms(ow.deny || []);
        }
        if (o.parent) assert.ok(channels.get(o.parent).type === ChannelType.GuildCategory, "parent = catégorie");
        const c = { id: `c${++n}`, ...o, name, parentId: o.parent || null, delete: forbid, edit: forbid, send: async (t) => calls.sent.push([name, t]) };
        channels.set(c.id, c);
        return c;
      },
    },
  };
  return guild;
}

const nbSalons = CATEGORIES.reduce((s, c) => s + c.channels.length, 0);
const nbMessages = CATEGORIES.reduce((s, c) => s + c.channels.filter((x) => x.message).length, 0);
const total = ROLES.length + CATEGORIES.length + nbSalons + 1; // + la Communauté

(async () => {
  // 1. Aperçu sur un serveur vide : liste tout, ne crée rien
  const g = fakeGuild();
  let res = await installCommunity(g, { dryRun: true });
  assert.equal(res.created.length, total);
  assert.equal(g.calls.roles + g.calls.channels + g.calls.edits.length, 0, "l'aperçu ne crée rien");

  // 2. Vraie installation
  res = await installCommunity(g);
  assert.equal(res.created.length, total);
  assert.deepEqual(res.notes, []);
  assert.equal(g.calls.roles, ROLES.length);
  assert.equal(g.calls.channels, CATEGORIES.length + nbSalons);
  assert.equal(g.calls.edits.length, 1, "Communauté activée une fois");
  const all = [...g.channels.cache.values()];
  const byName = (n) => all.find((c) => c.name === n);
  for (const want of ["bienvenue", "règles", "annonces", "mises-à-jour", "support", "suggestions", "bugs", "partage-configs", "Vocal 1", CREATE_VOICE]) {
    assert.ok(byName(want), `salon manquant : ${want}`);
  }
  // Les catégories sont créées dans l'ordre, avant tout salon
  assert.deepEqual(all.filter((c) => c.type === ChannelType.GuildCategory).map((c) => c.name), CATEGORIES.map((c) => c.name));
  // Annonces qu'on peut suivre, forums avec étiquettes
  assert.equal(byName("annonces").type, ChannelType.GuildAnnouncement);
  assert.equal(byName("suggestions").type, ChannelType.GuildForum);
  assert.ok(byName("suggestions").availableTags.some((t) => t.name === "Acceptée" && t.moderated));
  assert.ok(byName("support").availableTags.some((t) => t.name === "Question" && !t.moderated));
  assert.equal(g.calls.edits[0].rulesChannel, byName("règles").id);
  assert.equal(g.calls.edits[0].publicUpdatesChannel, byName("modération").id);
  // Messages postés une fois, avec de vrais liens vers les salons
  assert.equal(g.calls.sent.length, nbMessages);
  const bienvenue = g.calls.sent.find(([n]) => n === "bienvenue")[1];
  assert.ok(bienvenue.includes(`<#${byName("support").id}>`) && !bienvenue.includes("simulé"), "liens <#id> dans #bienvenue");

  // Annonces : lecture seule pour tout le monde, l'équipe peut écrire
  const equipe = g.roles.cache.find((r) => r.name === "Équipe Hush");
  const annonces = byName("annonces");
  const ev = annonces.permissionOverwrites.find((o) => o.id === "everyone");
  assert.ok(ev.deny.includes(P.SendMessages) && ev.allow.includes(P.ViewChannel));
  assert.ok(annonces.permissionOverwrites.find((o) => o.id === equipe.id).allow.includes(P.SendMessages));
  // Discussion : tout le monde écrit ; salon équipe : caché
  assert.deepEqual(byName("discussion").permissionOverwrites, []);
  assert.ok(byName("équipe").permissionOverwrites.find((o) => o.id === "everyone").deny.includes(P.ViewChannel));
  // Rangement
  const info = all.find((c) => c.type === ChannelType.GuildCategory && c.name === "・/info");
  assert.equal(annonces.parentId, info.id);
  assert.notEqual(byName("bugs").parentId, info.id);

  // 3. Relance : rien en double, la Communauté n'est pas refaite
  res = await installCommunity(g);
  assert.equal(res.created.length, 0, "relance : rien de créé");
  assert.equal(res.existing.length, total);
  assert.equal(g.calls.edits.length, 1);
  assert.equal(g.calls.sent.length, nbMessages);

  // 4. Discord refuse la Communauté : annonces et forums deviennent des salons texte, et on le dit
  const r = fakeGuild({ refuseCommunity: true });
  res = await installCommunity(r);
  assert.equal(res.notes.length, 1);
  assert.equal([...r.channels.cache.values()].find((c) => c.name === "suggestions").type, ChannelType.GuildText);

  // 5. Serveur déjà en partie monté à la main (casse différente, annonces en texte) : seul le manque est créé
  const h = fakeGuild({ community: true });
  h.roles.cache.set("x1", { id: "x1", name: "Membres" });
  h.channels.cache.set("y1", { id: "y1", name: "Annonces", type: ChannelType.GuildText });
  h.channels.cache.set("y2", { id: "y2", name: "・/INFO", type: ChannelType.GuildCategory });
  h.channels.cache.set("y3", { id: "y3", name: "Vocal 1", type: ChannelType.GuildText }); // texte, pas vocal : le vocal reste à créer
  res = await installCommunity(h);
  assert.equal(h.calls.roles, ROLES.length - 1);
  assert.equal(h.calls.edits.length, 0, "Communauté déjà active");
  assert.ok(!res.created.includes("#annonces") && !res.created.includes("catégorie ・/info"));
  assert.ok(res.created.includes("vocal Vocal 1"));
  assert.equal(res.created.length, total - 4);
  assert.equal([...h.channels.cache.values()].find((c) => c.name === "bienvenue").parentId, "y2");

  console.log(`serveur communautaire : tous les tests passent (${total} éléments)`);
})().catch((e) => { console.error(e); process.exit(1); });
