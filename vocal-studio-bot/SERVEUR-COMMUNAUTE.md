# Monter le serveur Discord de Hush

Personne ne peut créer un serveur Discord à ta place : tu le crées vide avec ton compte, puis le bot 1999 le remplit avec une seule commande. Compte 5 minutes.

## 1. Créer le serveur (vide)

1. Dans Discord, clique sur le **+** en bas de la liste des serveurs.
2. Choisis **Créer le mien** → **Pour moi et mes amis**.
3. Nomme-le « Hush » et ajoute une icône si tu veux, puis **Créer**.

Ne crée rien d'autre : le bot s'en occupe.

## 2. Inviter le bot 1999

1. Lance le bot (`Lancer le bot.bat`).
2. Ouvre le lien d'invitation du bot (celui affiché au démarrage du bot, ou par `Configurer le bot.bat`).
3. Choisis le serveur « Hush » et clique sur **Autoriser**.

Le lien donne au bot le droit « Administrateur » : c'est ce qui lui permet de créer les rôles et les salons.

## 3. Lancer la commande

Dans n'importe quel salon du serveur, tape :

- `/installer-hush apercu:True` pour **voir** ce qui serait créé, sans rien créer ;
- `/installer-hush` pour **tout créer**.

Seul le propriétaire du serveur (toi) peut la lancer. La réponse n'est visible que par toi.

Ce qui est créé :

| | |
|---|---|
| **Rôles** | Équipe Hush, Testeurs Preview, Membres |
| **ACCUEIL** | #bienvenue, #règles (avec les règles déjà écrites), #annonces, #mises-à-jour — lecture seule, seule l'équipe y écrit |
| **COMMUNAUTÉ** | #discussion, #partage-configs (fichiers `.hush`) |
| **SUPPORT** | #aide, #bugs, #idées |
| **PREVIEW** | #testeurs-preview — visible seulement des Testeurs Preview et de l'équipe |
| **VOCAUX** | Vocal 1, Vocal 2, Testeurs (réservé aux testeurs) |
| **ÉQUIPE** | #équipe — visible seulement de l'équipe |

Tu peux relancer la commande quand tu veux : elle repère ce qui existe déjà par son nom et ne crée que ce qui manque. Elle **ne supprime et ne modifie jamais rien**. Si tu as renommé un salon, elle en recréera un avec le nom d'origine : supprime-le à la main si tu n'en veux pas.

Ensuite, donne-toi le rôle **Équipe Hush** (clic droit sur ton nom → Rôles).

Tu peux supprimer le salon #général que Discord a créé tout seul, ou le garder.

## 4. Activer la Communauté

1. Clic sur le nom du serveur → **Paramètres du serveur** → **Activer la Communauté** → **Commencer**.
2. Discord demande deux salons :
   - **salon des règles** : choisis #règles ;
   - **salon des mises à jour de la communauté** : choisis #équipe (Discord y envoie ses messages pour les modérateurs).
3. Accepte les réglages de sécurité proposés et termine.

La Communauté débloque l'écran d'accueil, les salons d'annonces que les autres serveurs peuvent suivre, et l'apparition dans la recherche de serveurs.

Si tu veux que #annonces et #mises-à-jour puissent être suivis depuis d'autres serveurs : clic droit sur le salon → **Modifier le salon** → coche **Salon d'annonces**.

## 5. Inviter du monde

Clic droit sur #bienvenue → **Inviter des gens** → **Modifier le lien d'invitation** → expiration **Jamais**. C'est ce lien que tu partages.
