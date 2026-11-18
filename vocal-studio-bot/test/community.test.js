// /installer-hush : simulation sur un faux serveur Discord (aucune connexion à Discord)
const assert = require("assert");
const { ChannelType, PermissionFlagsBits: P, PermissionsBitField, Collection } = require("discord.js");
const { installCommunity, ROLES, CATEGORIES, norm } = require("../src/community.js");

// Faux serveur : garde en mémoire ce qui est créé, refuse toute suppression ou modification
function fakeGuild() {
  let n = 0;
  const calls = { roles: 0, channels: 0, sent: [] };
  const roles = new Collection(), channels = new Collection();
  const everyone = { id: "everyone", name: "@everyone" };
  roles.set(everyone.id, everyone);
  const forbid = () => { throw new Error("interdit : suppression ou modification"); };
  const guild = {
    calls, everyone,
    roles: {
      cache: roles, everyone, fetch: async () => roles, delete: forbid, edit: forbid,
      create: async (o) => { calls.roles++; PermissionsBitField.resolve(o.permissions); const r = { id: `r${++n}`, ...o, delete: forbid, edit: forbid }; roles.set(r.id, r); return r; },
    },
    channels: {
      cache: channels, fetch: async () => channels, delete: forbid, edit: forbid,
      create: async (o) => {
        calls.channels++;
        // Discord met les salons texte en minuscules avec des tirets
        const name = o.type === ChannelType.GuildText ? norm(o.name) : o.name;
        for (const ow of o.permissionOverwrites || []) {
          assert.ok(roles.has(ow.id), `droits sur un rôle inconnu : ${ow.id}`);
          PermissionsBitField.resolve(ow.allow || []); PermissionsBitField.resolve(ow.deny || []);
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
const total = ROLES.length + CATEGORIES.length + nbSalons;

(async () => {
  // 1. Aperçu sur un serveur vide : liste tout, ne crée rien
  const g = fakeGuild();
  let res = await installCommunity(g, { dryRun: true });
  assert.equal(res.created.length, total);
  assert.equal(g.calls.roles + g.calls.channels, 0, "l'aperçu ne crée rien");

  // 2. Vraie installation
  res = await installCommunity(g);
  assert.equal(res.created.length, total);
  assert.equal(g.calls.roles, 3);
  assert.equal(g.calls.channels, CATEGORIES.length + nbSalons);
  const names = [...g.channels.cache.values()].map((c) => c.name);
  for (const want of ["bienvenue", "règles", "annonces", "mises-à-jour", "aide", "idées", "bugs", "partage-configs", "Vocal 1"]) {
    assert.ok(names.includes(want), `salon manquant : ${want}`);
  }
  assert.equal(g.calls.sent.length, 1, "le message des règles est posté une fois");
  assert.equal(g.calls.sent[0][0], "règles");

  // Annonces : lecture seule pour tout le monde, l'équipe peut écrire
  const equipe = g.roles.cache.find((r) => r.name === "Équipe Hush");
  const annonces = g.channels.cache.find((c) => c.name === "annonces");
  const ev = annonces.permissionOverwrites.find((o) => o.id === "everyone");
  assert.ok(ev.deny.includes(P.SendMessages) && ev.allow.includes(P.ViewChannel));
  assert.ok(annonces.permissionOverwrites.find((o) => o.id === equipe.id).allow.includes(P.SendMessages));
  // Aide : tout le monde écrit
  assert.deepEqual(g.channels.cache.find((c) => c.name === "aide").permissionOverwrites, []);
  // Salon équipe : caché à tout le monde
  const eq = g.channels.cache.find((c) => c.name === "équipe");
  assert.ok(eq.permissionOverwrites.find((o) => o.id === "everyone").deny.includes(P.ViewChannel));
  // Salons rangés dans la bonne catégorie
  const accueil = g.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === "ACCUEIL");
  assert.equal(g.channels.cache.find((c) => c.name === "bugs").parentId !== accueil.id, true);
  assert.equal(annonces.parentId, accueil.id);

  // 3. Relance : rien en double
  res = await installCommunity(g);
  assert.equal(res.created.length, 0, "relance : rien de créé");
  assert.equal(res.existing.length, total);
  assert.equal(g.calls.roles, 3);
  assert.equal(g.calls.sent.length, 1);

  // 4. Serveur déjà en partie monté à la main (noms en casse différente, salon d'annonces Communauté) : seul le manque est créé
  const h = fakeGuild();
  h.roles.cache.set("x1", { id: "x1", name: "Membres" });
  h.channels.cache.set("y1", { id: "y1", name: "Annonces", type: ChannelType.GuildAnnouncement });
  h.channels.cache.set("y2", { id: "y2", name: "accueil", type: ChannelType.GuildCategory });
  h.channels.cache.set("y3", { id: "y3", name: "Vocal 1", type: ChannelType.GuildText }); // texte, pas vocal : le vocal reste à créer
  res = await installCommunity(h);
  assert.equal(h.calls.roles, 2);
  assert.ok(!res.created.includes("#annonces") && !res.created.includes("catégorie ACCUEIL"));
  assert.ok(res.created.includes("vocal Vocal 1"));
  assert.equal(res.created.length, total - 3);
  // Les salons d'ACCUEIL vont dans la catégorie existante
  assert.equal(h.channels.cache.find((c) => c.name === "bienvenue").parentId, "y2");

  console.log(`serveur communautaire : tous les tests passent (${total} éléments)`);
})().catch((e) => { console.error(e); process.exit(1); });
