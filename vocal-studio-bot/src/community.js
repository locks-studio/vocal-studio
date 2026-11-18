// /installer-hush : monte le serveur Discord communautaire de Hush, rangé comme un vrai serveur pro :
// catégories « ・/info », salons d'annonces qu'on peut suivre, forums (support, suggestions, bugs) avec étiquettes,
// règles officielles, salons réservés (testeurs, équipe), et un vocal « ➕ Créer ton vocal » (vocaux temporaires).
// La Communauté Discord est activée au passage (elle est nécessaire aux salons d'annonces et aux forums).
// On peut relancer la commande autant de fois qu'on veut : ce qui existe déjà (même nom) est laissé tel quel,
// seul ce qui manque est créé. Aucun salon ni rôle n'est jamais supprimé ou modifié.
// Pas de require("discord.js") ici : les valeurs fixes de l'API Discord suffisent, et le test tourne sans les dépendances du bot
const ChannelType = { GuildText: 0, GuildVoice: 2, GuildCategory: 4, GuildAnnouncement: 5, GuildForum: 15 };
const bit = (n) => 1n << BigInt(n);
const P = {
  AddReactions: bit(6), ViewChannel: bit(10), SendMessages: bit(11), ManageMessages: bit(13), ReadMessageHistory: bit(16),
  MentionEveryone: bit(17), Connect: bit(20), MuteMembers: bit(22), MoveMembers: bit(24), ManageThreads: bit(34),
  CreatePublicThreads: bit(35), CreatePrivateThreads: bit(36), SendMessagesInThreads: bit(38), ModerateMembers: bit(40),
};

const SITE = "https://1999.organisationphantom.fr/";
// Le vocal qui crée les vocaux temporaires (géré par le bot : voir bot.js, onTempVoice)
const CREATE_VOICE = "➕ Créer ton vocal";
const TEMP_PREFIX = "🔊 ";

const ROLES = [
  {
    name: "Équipe Hush", color: 0x8b5cf6, hoist: true, mentionable: true,
    permissions: [P.ManageMessages, P.ManageThreads, P.ModerateMembers, P.MuteMembers, P.MoveMembers, P.MentionEveryone],
  },
  { name: "Premium", color: 0xf59e0b, hoist: true, mentionable: false, permissions: [] },
  { name: "Testeurs Preview", color: 0x22c55e, hoist: true, mentionable: true, permissions: [] },
  { name: "Membres", color: 0x64748b, hoist: false, mentionable: false, permissions: [] },
];

// type : "text" (défaut), "news" (annonces qu'on peut suivre), "forum", "voice"
// access : "public" (tout le monde écrit), "lecture" (seule l'équipe écrit), "preview" (testeurs + équipe), "equipe" (équipe seule)
// message(ids) : texte posté à la création (ids : nom du salon → id, pour les liens <#id>)
const link = (ids, name) => (ids[name] ? `<#${ids[name]}>` : `#${name}`);
const CATEGORIES = [
  {
    name: "・/info",
    channels: [
      { name: "règles", access: "lecture", topic: "À lire avant de participer.", message: () => RULES, rules: true },
      { name: "bienvenue", access: "lecture", topic: "Bienvenue sur le serveur officiel de Hush.", message: (ids) => [
        "# Bienvenue sur Hush 👋",
        "Hush transforme tes vocaux Discord en version cinéma : anneaux animés, caméra qui suit celui qui parle, fonds, overlay en jeu.",
        "",
        `**Installer Hush** → ${SITE} (avec le lanceur 1999)`,
        `**Commencer** → lis ${link(ids, "règles")}, puis passe dans ${link(ids, "centre-d-aide")}`,
        `**Un souci** → ${link(ids, "support")} · **Une idée** → ${link(ids, "suggestions")}`,
        `**Discuter** → ${link(ids, "discussion")}`,
      ].join("\n") },
      { name: "annonces", type: "news", access: "lecture", topic: "Les grandes nouvelles de Hush. Clique « Suivre » pour les recevoir sur ton serveur." },
      { name: "mises-à-jour", type: "news", access: "lecture", topic: "Les notes de chaque nouvelle version de Hush et de 1999." },
      { name: "statut", type: "news", access: "lecture", topic: "Panne, maintenance du bot ou du serveur Hush : c'est ici." },
      { name: "sondages", type: "news", access: "lecture", topic: "Vote pour la suite de Hush." },
      { name: "giveaways", type: "news", access: "lecture", topic: "Concours et cadeaux (Premium offerts…)." },
      { name: "boosters", access: "lecture", topic: "Merci à celles et ceux qui boostent le serveur 💜" },
    ],
  },
  {
    name: "・/hush",
    channels: [
      { name: "à-propos", access: "lecture", topic: "Ce que fait Hush.", message: () => [
        "# Hush, c'est quoi ?",
        "Un logiciel pour Windows qui affiche ton salon vocal Discord en grand, en version cinéma :",
        "• des anneaux animés autour de celui qui parle, et une caméra qui le suit ;",
        "• des dispositions (grille, orbite, scène…), des fonds en image, vidéo ou Wallpaper Engine ;",
        "• un overlay en jeu, la musique en cours, des clips, et un bouton Hush posé sur Discord.",
        "",
        `Il s'installe avec le lanceur **1999** : ${SITE}`,
      ].join("\n") },
      { name: "premium", access: "lecture", topic: "Les avantages Premium de Hush.", message: () => [
        "# Hush Premium",
        "Les avantages Premium et leur prix seront annoncés ici. Suis #annonces pour être prévenu.",
      ].join("\n") },
      { name: "centre-d-aide", access: "lecture", topic: "Les réponses aux questions les plus fréquentes.", message: (ids) => [
        "# Centre d'aide",
        `**Installer** : télécharge 1999 sur ${SITE}, connecte ton compte Discord, puis installe Hush depuis 1999.`,
        "**Hush ne voit pas mon vocal** : avec le bot, il doit être invité sur le serveur où tu parles. Tape `/hush` dans le serveur pour le faire venir.",
        "**Connexion directe** : Hush › Modifier la connexion › Connexion directe › Ma propre appli, et suis les 4 étapes.",
        "**L'image de fond est floue** : Paramètres › Fond › « Taille réelle ».",
        `Toujours bloqué ? Ouvre un post dans ${link(ids, "support")} avec ta version de Hush et une capture.`,
      ].join("\n") },
      { name: "support", type: "forum", topic: "Un post par problème : dis ce que tu faisais, ce qui s'est passé, ta version de Hush, et ajoute une capture.",
        tags: ["Question", "Installation", "Connexion Discord", "Résolu"] },
      { name: "suggestions", type: "forum", topic: "Une idée par post. Vote pour les idées des autres avec une réaction.",
        tags: ["Idée", "Acceptée", "En cours", "Ajoutée", "Refusée"] },
      { name: "bugs", type: "forum", topic: "Un bug par post : étapes pour le reproduire, ce que tu attendais, ce qui s'est passé, ta version.",
        tags: ["Nouveau", "Confirmé", "Corrigé", "Preview"] },
    ],
  },
  {
    name: "・/main",
    channels: [
      { name: "discussion", access: "public", topic: "Pour parler de tout et de rien." },
      { name: "partage-configs", access: "public", topic: "Partage tes fichiers de config .hush et récupère ceux des autres." },
      { name: "fonds-et-curseurs", access: "public", topic: "Tes plus beaux fonds d'écran, GIF et curseurs pour Hush." },
      { name: "commandes", access: "public", topic: "Pour taper les commandes des bots (/hush…) sans encombrer les autres salons." },
    ],
  },
  {
    name: "・/vc",
    channels: [
      { name: "comment-rejoindre", access: "lecture", topic: "Comment marchent les vocaux du serveur.", message: () => [
        "# Les vocaux",
        `• Rejoins **${CREATE_VOICE}** : ton propre vocal est créé et tu y es déplacé. Il disparaît quand tout le monde est parti.`,
        "• Dans ton vocal, tu peux le renommer, fixer une limite de places ou le verrouiller (clic droit › Modifier le salon).",
        "• Tape `/hush` pour faire venir le bot et voir le vocal dans Hush.",
      ].join("\n") },
      { name: CREATE_VOICE, type: "voice" },
      { name: "Vocal 1", type: "voice" },
      { name: "Vocal 2", type: "voice" },
      { name: "Détente", type: "voice" },
    ],
  },
  {
    name: "・/preview", access: "preview",
    channels: [
      { name: "testeurs-preview", access: "preview", topic: "Retours sur les versions Preview, avant leur sortie." },
      { name: "Testeurs", type: "voice", access: "preview" },
    ],
  },
  {
    name: "・/staff", access: "equipe",
    channels: [
      { name: "équipe", access: "equipe", topic: "Réservé à l'équipe Hush." },
      { name: "modération", access: "equipe", topic: "Messages de Discord pour les modérateurs (Communauté) et suivi des sanctions.", updates: true },
    ],
  },
];

const RULES = [
  "# Règles du serveur Hush",
  "",
  "**1. Respect.** Pas d'insultes, de harcèlement, de propos haineux ou discriminatoires.",
  "**2. Pas de spam** ni de publicité (serveurs, réseaux, ventes) sans l'accord de l'équipe.",
  "**3. Le bon salon.** Une question ou un problème → #support, une idée → #suggestions, un bug → #bugs.",
  "**4. Contenu sûr.** Rien de choquant, NSFW, illégal ou piraté. Pas de fichiers suspects.",
  "**5. Vie privée.** Ne partage pas d'infos personnelles, ni les tiennes ni celles des autres.",
  "**6. Pseudos et photos corrects**, sans usurper l'identité de l'équipe.",
  "**7. Les règles de Discord s'appliquent** : <https://discord.com/terms> et <https://discord.com/guidelines>.",
  "",
  "L'équipe peut retirer un message, rendre muet ou exclure quelqu'un qui ne respecte pas ces règles.",
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
    { id: preview.id, allow: [P.ViewChannel, P.Connect] },
    { id: equipe.id, allow: [P.ViewChannel, P.Connect] },
  ];
  if (access === "equipe") return [
    { id: everyone.id, deny: [P.ViewChannel] },
    { id: equipe.id, allow: [P.ViewChannel] },
  ];
  return [];
}

const TYPES = { text: ChannelType.GuildText, news: ChannelType.GuildAnnouncement, forum: ChannelType.GuildForum, voice: ChannelType.GuildVoice };
const TEXTLIKE = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum];
// Discord met les noms de salons texte en minuscules avec des tirets : on compare pareil
const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, "-");
const isCommunity = (guild) => Array.isArray(guild.features) && guild.features.includes("COMMUNITY");

// Installe (ou complète) le serveur. dryRun : ne crée rien, dit seulement ce qui serait créé.
// Rend { created: [...], existing: [...], notes: [...] } (textes lisibles).
async function installCommunity(guild, { dryRun = false } = {}) {
  const reason = "Installation du serveur Hush (/installer-hush)";
  const created = [], existing = [], notes = [];
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

  // 2. Catégories, puis salons. Les salons d'annonces et les forums ont besoin de la Communauté :
  //    on crée d'abord les règles et le salon de modération (que la Communauté demande), on l'active, puis le reste.
  const ids = {}, parents = {}, posts = [];
  const findChan = (name, type) => guild.channels.cache.find((c) => norm(c.name) === norm(name)
    && (c.type === type || (TEXTLIKE.includes(type) && TEXTLIKE.includes(c.type))));
  const category = async (cat) => {
    if (parents[cat.name]) return parents[cat.name];
    let parent = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && norm(c.name) === norm(cat.name));
    if (parent) existing.push(`catégorie ${cat.name}`);
    else {
      created.push(`catégorie ${cat.name}`);
      parent = dryRun ? { id: `simulé:${cat.name}` }
        : await guild.channels.create({ name: cat.name, type: ChannelType.GuildCategory, permissionOverwrites: overwrites(cat.access, roles), reason });
    }
    return (parents[cat.name] = parent);
  };
  const channel = async (cat, ch) => {
    let type = TYPES[ch.type || "text"];
    const label = type === ChannelType.GuildVoice ? `vocal ${ch.name}` : type === ChannelType.GuildForum ? `forum #${norm(ch.name)}` : `#${norm(ch.name)}`;
    // Un salon du même nom et du même genre, où qu'il soit sur le serveur (même déplacé à la main), compte comme déjà là
    const found = findChan(ch.name, type);
    if (found) { existing.push(label); ids[norm(ch.name)] = found.id; return found; }
    created.push(label);
    const parent = await category(cat);
    if (dryRun) { ids[norm(ch.name)] = `simulé:${ch.name}`; return null; }
    // Sans la Communauté (refusée par Discord), les annonces et forums deviennent des salons texte normaux
    if ((type === ChannelType.GuildAnnouncement || type === ChannelType.GuildForum) && !isCommunity(guild)) type = ChannelType.GuildText;
    const opts = {
      name: ch.name, type, parent: parent.id, permissionOverwrites: overwrites(ch.access || cat.access, roles), reason,
      topic: type !== ChannelType.GuildVoice ? ch.topic : undefined,
    };
    if (type === ChannelType.GuildForum) {
      opts.availableTags = (ch.tags || []).map((name) => ({ name, moderated: !["Question", "Idée", "Nouveau", "Installation", "Connexion Discord"].includes(name) }));
      opts.defaultReactionEmoji = { id: null, name: "👍" };
    }
    const made = await guild.channels.create(opts);
    ids[norm(ch.name)] = made.id;
    if (ch.message) posts.push([made, ch.message]);
    return made;
  };

  // 2a. Ce que la Communauté demande : un salon de règles et un salon pour les messages de Discord aux modérateurs
  for (const cat of CATEGORIES) await category(cat); // toutes les catégories d'abord, pour qu'elles soient dans l'ordre
  const pick = (flag) => { for (const cat of CATEGORIES) for (const ch of cat.channels) if (ch[flag]) return [cat, ch]; };
  const rulesChan = await channel(...pick("rules"));
  const updChan = await channel(...pick("updates"));

  // 2b. La Communauté (vérification e-mail, filtre des médias, notifications sur mentions)
  if (isCommunity(guild)) existing.push("Communauté Discord");
  else {
    created.push("Communauté Discord (annonces, forums, règles)");
    if (!dryRun) {
      try {
        await guild.edit({
          features: [...(guild.features || []), "COMMUNITY"],
          verificationLevel: Math.max(1, guild.verificationLevel || 0), explicitContentFilter: 2, defaultMessageNotifications: 1,
          rulesChannel: rulesChan ? rulesChan.id : ids["règles"], publicUpdatesChannel: updChan ? updChan.id : ids["modération"], reason,
        });
      } catch (e) {
        notes.push(`La Communauté n'a pas pu être activée (${e.message}) : les annonces et forums sont créés en salons texte. Active-la dans Paramètres du serveur › Activer la Communauté, puis relance la commande.`);
      }
    }
  }

  // 2c. Tout le reste, dans l'ordre
  for (const cat of CATEGORIES) {
    await category(cat);
    for (const ch of cat.channels) if (!ch.rules && !ch.updates) await channel(cat, ch);
  }

  // 3. Les messages des salons d'info, une fois tous les salons connus (pour les liens)
  for (const [made, message] of posts) await made.send(message(ids)).catch(() => {});
  return { created, existing, notes };
}

module.exports = { installCommunity, ROLES, CATEGORIES, RULES, overwrites, norm, ChannelType, P, CREATE_VOICE, TEMP_PREFIX };
