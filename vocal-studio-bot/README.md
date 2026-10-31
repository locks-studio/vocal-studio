# Serveur du bot Hush

Le bot rejoint un salon vocal et transmet en direct à l'appli Hush qui est là, qui est muet et qui parle. C'est ce qui permet à tout le monde d'utiliser l'appli, sans la connexion directe (RPC) réservée aux testeurs.

Le bot **n'écoute pas et n'enregistre rien** : il reçoit seulement le signal « untel commence / arrête de parler ».

## 1. Créer le bot sur Discord (une fois)

Tu peux réutiliser l'application Discord que tu as déjà créée pour Hush.

1. Va sur <https://discord.com/developers/applications> et ouvre ton application.
2. **Bot** : clique sur **Reset Token** et copie le jeton. Il ne doit jamais être partagé ni publié.
3. **OAuth2** : copie le **Client ID** et le **Client Secret**. Dans **Redirects**, ajoute `http://localhost:8787/auth/callback` puis enregistre.

## 2. Lancer le serveur sur ton PC (pour tester)

Il faut [Node.js](https://nodejs.org) 20.12 ou plus.

1. Copie `.env.example` en `.env` et remplis les trois valeurs.
2. Installe et lance :

```bash
npm install
```

```bash
npm start
```

Sous Windows, tu peux aussi double-cliquer sur `Lancer le bot.bat`.

La console affiche le **lien d'invitation du bot** : ouvre-le pour l'ajouter à ton serveur Discord. Il demande seulement « Voir les salons » et « Se connecter ».

## 3. Utiliser l'appli avec le bot

1. Dans Hush, choisis **Avec le bot** et garde l'adresse `http://localhost:8787`.
2. Clique sur **Se connecter avec Discord** et autorise dans le navigateur.
3. Rejoins un salon vocal, puis clique sur **Faire venir le bot** dans l'appli, ou tape `/hush` dans Discord.
4. `/hush-stop` ou le bouton rouge de l'appli fait partir le bot. Il part aussi tout seul 30 secondes après que tout le monde a quitté le salon.

En mode bot, les boutons micro et sourdine disparaissent : un bot ne peut pas toucher à ceux de chaque personne.

## 4. Mettre le bot en ligne pour tout le monde

Sur ton PC, le bot s'arrête quand tu éteins. Pour le public, il faut l'héberger sur un serveur allumé en permanence (un petit VPS suffit au début) :

1. Copie le dossier sur le serveur, crée le `.env` avec `PUBLIC_URL=https://ton-domaine` et lance `npm start` (de préférence avec un gestionnaire comme pm2 pour le redémarrer automatiquement).
2. Mets le serveur derrière HTTPS (le plus simple : un reverse proxy comme Caddy).
3. Ajoute `https://ton-domaine/auth/callback` dans les Redirects OAuth2 du portail.
4. Dans l'appli, chaque utilisateur met `https://ton-domaine` comme adresse du serveur (on pourra la mettre par défaut dans la version publique).

Au-delà de 100 serveurs, Discord demande de faire vérifier le bot.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `src/bot.js` | Le bot : rejoint les salons, suit les membres et qui parle, commandes `/hush` |
| `src/index.js` | Le serveur : connexion « Se connecter avec Discord » et liaison en direct avec l'appli |
| `.env` | Tes secrets (jamais partagé, ignoré par git) |
| `sessions.json` | Les applis connectées (créé automatiquement, ignoré par git) |
