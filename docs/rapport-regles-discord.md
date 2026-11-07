# Hush face aux règles de Discord

Rapport du 7 novembre 2026. Ce n'est pas un avis juridique.

**Ce que je n'ai pas pu lire :** la Developer Policy et les Developer Terms renvoient une erreur 403 aux lectures automatiques. Ce qui en est dit ici vient d'extraits de recherche, pas de la page complète. Lis-les toi-même avant de communiquer publiquement. Les liens sont en bas.

## Résumé

| Point | Risque | À faire |
|---|---|---|
| Connexion directe (RPC) | **Bloquant au-delà de 50 personnes** | Faire du bot la voie principale |
| Clips avec le son des autres | **Élevé (droit français)** | Prévenir tout le monde dans le vocal, ou clips sans la voix des autres |
| Données conservées par le bot | Moyen | Écrire une politique de confidentialité, permettre la suppression |
| Tchat et Message Content | Faible aujourd'hui | Cocher l'option maintenant, garder une justification pour plus tard |
| Écrire sous le pseudo de quelqu'un | Moyen, non vérifié | Ne jamais écrire pour quelqu'un d'autre que la personne connectée |
| Mesure du volume des voix | Moyen, non vérifié | Ne rien enregistrer, et l'expliquer aux gens |
| Vue administrateur et rapports d'erreur | Faible | Accord de l'utilisateur, aucun contenu de conversation |

## 1. Connexion directe : limitée à 50 personnes

Confirmé sur la documentation officielle : Discord n'autorise pas l'accès RPC aux applications non approuvées, sauf pour les utilisateurs présents sur la liste de testeurs, limitée à **50 places**. La restriction est levée après approbation.

Conséquences :
- Chaque personne en connexion directe doit être ajoutée à la main sur le portail. C'est très probablement la cause de la boucle de liaison chez ton ami.
- Au-delà de 50, cette voie est fermée sans approbation de Discord. Je n'ai pas trouvé de procédure de demande ouverte à tous. Une ancienne version de la documentation parlait d'une bêta privée fermée, sans confirmation sur la page actuelle.
- **Décision à prendre :** le bot doit devenir la connexion par défaut, et la connexion directe rester une option pour toi et tes testeurs.

## 2. Message Content (tchat de la voc)

D'après la documentation Gateway :
- Sous 10 000 utilisateurs, tu actives l'option toi-même sur le portail.
- Au-delà, Discord examine une demande, à renouveler chaque année.
- Un bot vérifié (obligatoire à partir de 100 serveurs) doit faire approuver ces accès.
- Tu ne dois l'activer que si ton usage en a besoin et respecte la Developer Policy.

Hush y a droit aujourd'hui. Prépare une justification simple : afficher le tchat du salon où la personne se trouve, sans rien stocker. C'est bien ce que fait le bot : les messages ne sont ni enregistrés ni conservés côté serveur.

## 3. Données : ce que Hush garde

D'après les extraits de la Developer Policy, les données de l'API ne doivent servir qu'à la fonction annoncée de l'appli, et tout accès non autorisé doit être signalé à Discord et aux personnes touchées. Une ancienne version des conditions (2017) imposait aussi de supprimer les données à la demande. Vérifie la version actuelle, section 5 des Developer Terms.

Ce que le serveur du bot garde sur disque :
- sessions de connexion ;
- heures de vocal, avec pseudo et photo, **visibles publiquement** dans le classement (`/usage/top`) ;
- amis et demandes (`friends.json`) ;
- rapports d'erreur, seulement si la personne a accepté.

À faire :
- une courte page de confidentialité sur le site ;
- un moyen de supprimer son compte ;
- une option pour sortir du classement public, qui montre aujourd'hui les gens sans qu'ils l'aient demandé.

## 4. Clips et enregistrement de la voix

Le risque est légal, pas seulement lié à Discord. En France, l'article 226-1 du Code pénal punit d'un an de prison et de 45 000 € d'amende le fait d'enregistrer sans consentement des paroles prononcées à titre privé. L'article 226-2 vise aussi la conservation et la diffusion.

Hush peut enregistrer des clips avec le son. Si ce son contient la voix des autres participants, chacun doit être au courant. À faire : un rappel clair dans Hush, et idéalement un clip sans le son des autres par défaut.

## 5. Mesure du volume des voix

Le bot reçoit l'audio pour calculer un niveau entre 0 et 1, puis le jette. Rien n'est enregistré, ce qui limite le risque. Je n'ai pas pu lire de règle précise sur la réception audio. Dis-le clairement dans ta politique de confidentialité.

## 6. Écrire sous le pseudo de quelqu'un

Le tchat passe par un webhook, avec le pseudo et la photo de la personne connectée, et Discord affiche l'étiquette APP. Je n'ai pas pu lire de règle précise là-dessus. Le risque serait de permettre à quelqu'un d'écrire au nom d'un autre : le serveur l'empêche, puisqu'il utilise toujours l'identité vérifiée de la personne connectée, avec ses propres droits sur le salon.

Hush n'utilise jamais le compte d'un utilisateur pour écrire : c'est ce qu'on appelle un selfbot, que les règles de Discord interdisent.

## 7. Argent

Je n'ai pas pu vérifier les règles de monétisation. À lire avant de lancer une offre premium.

## Ordre conseillé

1. Passer au bot par défaut (bloquant pour grandir).
2. Rappel sur les clips (risque légal).
3. Page de confidentialité, suppression de compte, sortie du classement.
4. Lire toi-même la Developer Policy et les Developer Terms.

## Sources

- [Documentation RPC de Discord](https://docs.discord.com/developers/topics/rpc)
- [Documentation Gateway de Discord](https://docs.discord.com/developers/topics/gateway)
- [Discord Developer Policy](https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy) (non lisible automatiquement)
- [Discord Developer Terms](https://support-dev.discord.com/hc/en-us/articles/8562894815383-Discord-Developer-Terms-of-Service) (non lisible automatiquement)
- [Conditions développeur 2017](https://support-dev.discord.com/hc/en-us/articles/25280443568791-2017-Discord-Developer-Terms-of-Service)
- [Article 226-1 du Code pénal](https://www.juritravail.com/code/code-penal/article/226-1)
- [Question parlementaire sur le consentement](https://www.assemblee-nationale.fr/dyn/13/questions/QANR5L13QE17430.pdf)
