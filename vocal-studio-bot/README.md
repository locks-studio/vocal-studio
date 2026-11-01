# Serveur du bot Hush

Le bot rejoint un salon vocal et transmet en direct à l'appli Hush qui est là, qui est muet et qui parle. C'est ce qui permet à tout le monde d'utiliser l'appli, sans la connexion directe (RPC) réservée aux testeurs.

Le bot **n'enregistre rien** : pour savoir qui parle le plus fort, il mesure le volume de chaque voix (en décibels) au moment où elle arrive, puis jette le son. Seul un niveau entre 0 et 1 est gardé et envoyé à l'appli. Il transmet aussi si quelqu'un a sa caméra ou un live allumé, et l'avatar animé (GIF) quand il y en a un.

Discord ne permet pas aux bots de recevoir la vidéo : les caméras et les partages d'écran ne peuvent pas s'afficher dans Hush, seulement un badge « caméra » ou « LIVE » sur l'avatar.

## 1. Créer le bot sur Discord (une fois)

1. Va sur <https://discord.com/developers/applications>, clique sur **New Application** et nomme-la « Hush » (ou réutilise celle que tu as déjà).
2. Double-clique sur **`Configurer le bot.bat`**. L'assistant te guide :
   - onglet **Bot** → **Reset Token** → colle le jeton (il ne s'affiche pas à l'écran) ;
   - onglet **OAuth2** → colle le **Client ID** et le **Client Secret**.

   Il vérifie le jeton auprès de Discord, écrit le fichier `.env` et t'affiche les deux derniers clics à faire :
   - **OAuth2 → Redirects** : ajouter `http://localhost:8787/auth/callback` ;
   - le **lien d'invitation** du bot pour l'ajouter à ton serveur.

Le jeton et le secret restent dans `.env`, sur ton PC (jamais dans l'historique git). Ne les partage avec personne : avec le jeton, n'importe qui peut contrôler ton bot.

## 2. Lancer le serveur sur ton PC (pour tester)

Il faut [Node.js](https://nodejs.org) 20.12 ou plus.

1. Fais d'abord l'étape 1 (le fichier `.env` doit exister).
2. Installe et lance :

```bash
npm install
```

```bash
npm start
```

Sous Windows, tu peux aussi double-cliquer sur `Lancer le bot.bat`.

La console affiche le **lien d'invitation du bot** : ouvre-le pour l'ajouter à ton serveur Discord. Il demande « Voir les salons » et « Se connecter », plus ce qu'il faut pour le menu clic droit de l'appli : rendre muet, mettre en sourdine, déplacer des membres, gérer les pseudos et les rôles. Si le bot est déjà sur ton serveur, rouvre ce lien pour lui donner ces permissions (ou donne-les à son rôle), et place son rôle assez haut.

Ces actions ne se font que si **la personne qui les demande dans Hush** a elle-même la permission sur le serveur : le bot vérifie ses droits à chaque fois.

**Page d'accueil de l'appli** : le serveur indique si le bot est en ligne (`/info`, avec le lien d'invitation), et, pour chaque personne connectée, les vocaux de ses serveurs où se trouvent des gens qui ont Hush, ainsi que les membres de ses serveurs qui ont Hush. Seuls les salons que cette personne peut voir sur Discord sont montrés.

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
| `src/bot.js` | Le bot : rejoint les salons, suit les membres et qui parle, commandes `/hush`, actions du menu clic droit |
| `src/index.js` | Le serveur : connexion « Se connecter avec Discord » et liaison en direct avec l'appli |
| `.env` | Tes secrets (jamais partagé, ignoré par git) |
| `sessions.json` | Les applis connectées (créé automatiquement, ignoré par git) |
