# Faire tester Hush 0.4 à tes potes

## Avant d'envoyer le lien (à faire une seule fois)

1. **Portail Discord** › ton application › Bot : active **Message Content Intent** (sinon le tchat reste illisible).
2. **Lance le bot** avec « Lancer le bot.bat ». Il doit rester allumé pendant les tests : c'est lui qui connecte tout le monde.
3. **Ré-invite le bot** sur tes serveurs (rond rose de l'accueil dans Hush) pour qu'il ait les nouveaux droits.
4. **Hostinger** : envoie `launcher/site/1999-a-envoyer.zip` dans le dossier du sous-domaine `1999.organisationphantom.fr`, puis décompresse-le.
5. **Page de confidentialité** : remplace le contact dans `launcher/website/confidentialite.html` si tu veux donner une adresse.
6. **Essaie toi-même** depuis https://1999.organisationphantom.fr avant d'envoyer le lien.

## Le message à envoyer

> Hey, tu veux tester mon logiciel ? Hush rend tes vocaux Discord beaucoup plus stylés.
>
> 1. Va sur https://1999.organisationphantom.fr et télécharge le launcher.
> 2. Windows va peut-être dire « Windows a protégé votre ordinateur » : c'est parce que je n'ai pas encore de certificat. Clique sur « Informations complémentaires » puis « Exécuter quand même ».
> 3. Connecte-toi avec Discord et installe Hush.
> 4. Rejoins un vocal sur un serveur où le bot est invité.
>
> Dis-moi ce qui bloque, même un petit truc. Si ça plante, va dans Paramètres › Compte › « Copier le diagnostic » et envoie-le-moi.

## Ce qu'il faut leur demander

- À quel moment ont-ils bloqué, et combien de temps ça a pris ?
- Ont-ils compris quoi faire sans ton aide ?
- Qu'est-ce qu'ils ont aimé, et qu'est-ce qu'ils n'ont jamais touché ?
- Reviendraient-ils demain ?

Regarde-les faire sans les aider, si tu peux : c'est là que tu apprends le plus.

## Ce que tu surveilles

La vue administrateur (rond bouclier sur l'accueil) montre qui est connecté, leur version et les erreurs reçues.

## Limites à connaître

- Le bot tourne sur ton PC : s'il s'éteint, plus personne ne peut se connecter. Il faudra un VPS avant d'ouvrir à plus de monde.
- Hush n'affiche un vocal que sur un serveur où le bot est invité. Pour inviter le bot, il faut le droit de gérer le serveur.
- Les appels privés ne marchent qu'en connexion directe, réservée à 50 testeurs (Compte › Modifier la connexion). Ajoute ces personnes sur le portail Discord si besoin.
- La version Mac n'existe pas encore.
- Les clips peuvent enregistrer la voix des autres : préviens tout le monde avant d'en faire.

## Faire tester une nouveauté sans la donner à tout le monde

La version normale ne bouge pas : seuls ceux qui ont le code reçoivent la version de test.

1. Prépare la version (remplace le texte par ce qui change) :
   `node tools/publier-test.js "Ce qui change"`
2. Décompresse `launcher/site/1999-test-a-envoyer.zip` à la racine du site sur Hostinger.
3. Donne le code à tes testeurs. Il est dans `launcher/publish.json`, à la ligne `testCode`.
4. Ils le collent dans le launcher : Réglages › Version de test.

Pour revenir en arrière, le même écran propose « Revenir à la version normale », et le launcher réinstalle la version normale tout seul.

Le code n'est pas un mot de passe : quelqu'un qui le reçoit peut le partager. Change `testCode` dans `publish.json` si ça arrive.
