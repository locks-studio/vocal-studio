// Assistant de configuration du bot Hush : demande les identifiants du portail Discord,
// vérifie qu'ils marchent, écrit le fichier .env et donne le lien d'invitation.
// Les secrets restent sur ce PC (dans .env, ignoré par git) : ils ne sont envoyés qu'à Discord pour la vérification.
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ENV = path.join(__dirname, "..", ".env");
const API = "https://discord.com/api/v10";

function ask(question, { hidden = false, def = "" } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Le jeton ne s'affiche pas pendant qu'on le colle
      rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); else if (s !== "\r\n" && s !== "\n") process.stdout.write("*"); };
    }
    rl.question(question + (def ? ` [${def}] ` : " "), (a) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(a.trim() || def); });
  });
}

(async () => {
  console.log("\n=== Configuration du bot Hush ===\n");
  console.log("Ouvre https://discord.com/developers/applications et ton application Hush (ou crée-la avec « New Application »).\n");

  let env = {};
  try {
    for (const line of fs.readFileSync(ENV, "utf8").split(/\r?\n/)) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line);
      if (m) env[m[1]] = m[2];
    }
    console.log("Un fichier .env existe déjà : appuie sur Entrée pour garder une valeur.\n");
  } catch {}

  console.log("1) Onglet « Bot » → « Reset Token » → copie le jeton.");
  const token = (await ask("   Colle le jeton du bot :", { hidden: true })) || env.DISCORD_TOKEN;
  // Vérification du jeton : Discord renvoie le nom du bot et l'identifiant de l'application
  let botName = "", appId = "";
  try {
    const me = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bot ${token}` } }).then((r) => r.json());
    const appInfo = await fetch(`${API}/oauth2/applications/@me`, { headers: { Authorization: `Bot ${token}` } }).then((r) => r.json());
    if (!me.id) throw new Error(me.message || "jeton refusé");
    botName = me.username;
    appId = appInfo.id || "";
    console.log(`   ✓ Jeton valide : le bot s'appelle « ${botName} ».\n`);
  } catch (e) {
    console.log(`   ✗ Discord refuse ce jeton (${e.message}). Refais « Reset Token » et relance l'assistant.\n`);
    process.exit(1);
  }

  console.log("2) Onglet « OAuth2 » → copie le « Client ID » et le « Client Secret » (Reset Secret si besoin).");
  const clientId = await ask("   Client ID :", { def: appId || env.DISCORD_CLIENT_ID || "" });
  if (appId && clientId !== appId) console.log(`   ⚠ Ce Client ID ne correspond pas au bot (attendu : ${appId}). Vérifie que c'est la même application.`);
  const secret = (await ask("   Client Secret :", { hidden: true })) || env.DISCORD_CLIENT_SECRET;
  if (!secret) { console.log("   ✗ Il faut le Client Secret pour « Se connecter avec Discord »."); process.exit(1); }

  const publicUrl = await ask("3) Adresse du serveur (sur ton PC : http://localhost:8787) :", { def: env.PUBLIC_URL || "http://localhost:8787" });
  const port = env.PORT || "8787";

  fs.writeFileSync(ENV, [
    "# Écrit par l'assistant « Configurer le bot ». Ne partage jamais ce fichier.",
    `DISCORD_TOKEN=${token}`,
    `DISCORD_CLIENT_ID=${clientId}`,
    `DISCORD_CLIENT_SECRET=${secret}`,
    `PUBLIC_URL=${publicUrl.replace(/\/$/, "")}`,
    `PORT=${port}`,
    "",
  ].join("\n"));

  const redirect = `${publicUrl.replace(/\/$/, "")}/auth/callback`;
  const invite = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=${1024 + 1048576}`;
  console.log("\n✓ Fichier .env enregistré.\n");
  console.log("Il reste deux clics sur le portail Discord :");
  console.log(`  • OAuth2 → Redirects → ajoute exactement : ${redirect}  puis « Save Changes »`);
  console.log(`  • Invite le bot sur ton serveur : ${invite}`);
  console.log("\nEnsuite, lance le bot avec « Lancer le bot.bat ».\n");
})();
