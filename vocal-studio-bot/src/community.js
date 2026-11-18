// /installer-hush : monte le serveur Discord communautaire de Hush (rôles, catégories, salons, permissions).
// On peut le relancer autant de fois qu'on veut : ce qui existe déjà (même nom) est laissé tel quel,
// seul ce qui manque est créé. Rien n'est jamais supprimé ni modifié.
const { ChannelType, PermissionFlagsBits: P } = require("discord.js");

const ROLES = [
  {
    name: "Équipe Hush", color: 0x8b5cf6, hoist: true, mentionable: true,
    permissions: [P.ManageMessages, P.ManageThreads, P.ModerateMembers, P.MuteMembers, P.MoveMembers, P.MentionEveryone],
  },
  { name: "Testeurs Preview", color: 0x22c55e, hoist: true, mentionable: true, permissions: [] },
  { name: "Membres", color: 0x64748b, hoist: false, mentionable: false, permissions: [] },
];

// access : "public" (tout le monde écrit), "lecture" (seule l'équipe écrit), "preview" (testeurs + équipe), "equipe" (équipe seule)
const CATEGORIES = [
  {
    name: "ACCUEIL",
    channels: [
      { name: "bienvenue", access: "lecture", topic: "Bienvenue sur le serveur de Hush, l'overlay vocal pour Discord." },
      { name: "règles", access: "lecture", topic: "À lire avant de participer.", message: "rules" },
      { name: "annonces", access: "lecture", topic: "Les nouvelles importantes de Hush." },
      { name: "mises-à-jour", access: "lecture", topic: "Les notes de version de chaque nouvelle version de Hush." },
    ],
  },
  {
    name: "COMMUNAUTÉ",
    channels: [
      { name: "discussion", access: "public", topic: "Pour parler de tout et de rien." },
      { name: "partage-configs", access: "public", topic: "Partage tes fichiers de config .hush et récupère ceux des autres." },
    ],
  },
  {
    name: "SUPPORT",
    channels: [
      { name: "aide", access: "public", topic: "Une question sur Hush ? Demande ici." },
      { name: "bugs", access: "public", topic: "Un souci ? Dis ce que tu faisais, ce qui s'est passé, et ta version de Hush." },
      { name: "idées", access: "public", topic: "Tes idées pour améliorer Hush." },
    ],
  },
  {
    name: "PREVIEW", access: "preview",
    channels: [
      { name: "testeurs-preview", access: "preview", topic: "Retours sur les versions Preview, avant leur sortie." },
    ],
  },
  {
    name: "VOCAUX",
    channels: [
      { name: "Vocal 1", type: "voice" },
      { name: "Vocal 2", type: "voice" },
      { name: "Testeurs", type: "voice", access: "preview" },
    ],
  },
  {
    name: "ÉQUIPE", access: "equipe",
    channels: [
      { name: "équipe", access: "equipe", topic: "Réservé à l'équipe Hush." },
    ],
  },
];

const RULES = [
  "**Règles du serveur Hush**",
  "",
  "1. Respecte tout le monde : pas d'insultes, de harcèlement ni de propos haineux.",
  "2. Pas de spam ni de publicité sans l'accord de l'équipe.",
  "3. Une question → #aide, un problème → #bugs, une envie → #idées.",
  "4. Dans #partage-configs, ne partage que des fichiers .hush.",
  "5. Les règles de Discord s'appliquent aussi ici : <https://discord.com/terms>.",
  "",
  "L'équipe peut retirer un message ou exclure quelqu'un qui ne respecte pas ces règles.",
].join("\n");

const WRITE = [P.SendMessages, P.SendMessagesInThreads, P.CreatePublicThreads, P.CreatePrivateThreads];

// Droits d'un salon selon son accès. roles : { everyone, equipe, preview } (objets rôle Discord)
function overwrites(access, roles) {
  const { everyone, equipe, preview } = roles;
  if (access === "lecture") return [
    { id: everyone.id, deny: WRITE, allow: [P.ViewChannel, P.ReadMessageHistory, P.AddReactions] },
    { id: equipe.id, allow: WRITE },
  ];
  if (access === "preview") return [
    { id: everyone.id, deny: [P.ViewChannel] },
    { id: preview.id, allow: [P.ViewChannel] },
    { id: equipe.id, allow: [P.ViewChannel] },
  ];
  if (access === "equipe") return [
    { id: everyone.id, deny: [P.ViewChannel] },
    { id: equipe.id, allow: [P.ViewChannel] },
  ];
  return [];
}

// Discord met les noms de salons texte en minuscules avec des tirets : on compare pareil
const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, "-");

// Installe (ou complète) le serveur. dryRun : ne crée rien, dit seulement ce qui serait créé.
// Rend { created: [...], existing: [...] } (textes lisibles).
async function installCommunity(guild, { dryRun = false } = {}) {
  const reason = "Installation du serveur Hush (/installer-hush)";
  const created = [], existing = [];
  await guild.roles.fetch();
  await guild.channels.fetch();

  // 1. Rôles
  const roleByName = {};
  for (const r of ROLES) {
    let role = guild.roles.cache.find((x) => x.name === r.name);
    if (role) existing.push(`rôle ${r.name}`);
    else {
      created.push(`rôle ${r.name}`);
      role = dryRun ? { id: `simulé:${r.name}`, name: r.name }
        : await guild.roles.create({ name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions, reason });
    }
    roleByName[r.name] = role;
  }
  const roles = { everyone: guild.roles.everyone, equipe: roleByName["Équipe Hush"], preview: roleByName["Testeurs Preview"] };

  // 2. Catégories et salons
  for (const cat of CATEGORIES) {
    let parent = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && norm(c.name) === norm(cat.name));
    if (parent) existing.push(`catégorie ${cat.name}`);
    else {
      created.push(`catégorie ${cat.name}`);
      parent = dryRun ? { id: `simulé:${cat.name}` }
        : await guild.channels.create({ name: cat.name, type: ChannelType.GuildCategory, permissionOverwrites: overwrites(cat.access, roles), reason });
    }
    for (const ch of cat.channels) {
      const type = ch.type === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText;
      const label = type === ChannelType.GuildVoice ? `vocal ${ch.name}` : `#${norm(ch.name)}`;
      // Un salon du même nom et du même genre, où qu'il soit sur le serveur (même déplacé à la main), compte comme déjà là
      const found = guild.channels.cache.find((c) => norm(c.name) === norm(ch.name) && (c.type === type || (type === ChannelType.GuildText && c.type === ChannelType.GuildAnnouncement)));
      if (found) { existing.push(label); continue; }
      created.push(label);
      if (dryRun) continue;
      const made = await guild.channels.create({
        name: ch.name, type, parent: parent.id, topic: type === ChannelType.GuildText ? ch.topic : undefined,
        permissionOverwrites: overwrites(ch.access || cat.access, roles), reason,
      });
      if (ch.message === "rules") await made.send(RULES).catch(() => {});
    }
  }
  return { created, existing };
}

module.exports = { installCommunity, ROLES, CATEGORIES, RULES, overwrites, norm };
