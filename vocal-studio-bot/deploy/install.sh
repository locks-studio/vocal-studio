#!/usr/bin/env bash
# Installe (ou met à jour) le serveur du bot Hush sur un VPS Ubuntu 24.04.
# Lancé par « Envoyer sur le VPS.bat » : sudo bash install.sh <domaine> <archive.tgz>
#  - Node.js 22 et Caddy (HTTPS automatique avec Let's Encrypt)
#  - le code dans /opt/hush-bot, les sessions dans /var/lib/hush-bot (gardées entre mises à jour)
#  - un service « hush-bot » qui redémarre tout seul (plantage, redémarrage du VPS)
set -euo pipefail
DOMAIN="${1:?usage: install.sh <domaine> <archive.tgz>}"
ARCHIVE="${2:?usage: install.sh <domaine> <archive.tgz>}"
APP=/opt/hush-bot
DATA=/var/lib/hush-bot
export DEBIAN_FRONTEND=noninteractive

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  echo "→ Installation de Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null; then
  echo "→ Installation de Caddy (HTTPS)"
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

id hush >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin hush
mkdir -p "$APP" "$DATA"

echo "→ Copie du code"
# .env (les secrets) et node_modules restent en place ; le reste est remplacé
find "$APP" -mindepth 1 -maxdepth 1 ! -name .env ! -name node_modules -exec rm -rf {} +
tar -xzf "$ARCHIVE" -C "$APP"
# Ancien sessions.json à côté du code : on le déplace dans le dossier des données
[ -f "$APP/sessions.json" ] && [ ! -f "$DATA/sessions.json" ] && mv "$APP/sessions.json" "$DATA/"
chown -R hush:hush "$APP" "$DATA"
chmod 700 "$DATA"
cd "$APP" && sudo -u hush npm ci --omit=dev --no-audit --no-fund

cat > /etc/systemd/system/hush-bot.service <<UNIT
[Unit]
Description=Serveur du bot Hush
After=network-online.target
Wants=network-online.target

[Service]
User=hush
WorkingDirectory=$APP
Environment=DATA_DIR=$DATA
Environment=HOST=127.0.0.1
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
	reverse_proxy 127.0.0.1:8787
}
CADDY

if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 80/tcp; ufw allow 443/tcp; fi

systemctl daemon-reload
systemctl enable hush-bot >/dev/null
systemctl reload-or-restart caddy

if [ -f "$APP/.env" ]; then
  systemctl restart hush-bot
  echo "✓ Serveur Hush (re)démarré : https://$DOMAIN"
else
  echo
  echo "Il reste à entrer les identifiants Discord (une seule fois) :"
  echo "  cd $APP && sudo -u hush node src/setup.js"
  echo "  (adresse du serveur : https://$DOMAIN)"
  echo "puis : sudo systemctl restart hush-bot"
fi
