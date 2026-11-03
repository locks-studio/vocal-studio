# Emballe Hush pour Linux (dist/linux-unpacked) en .tar.gz prêt à lancer :
# - les droits « exécutable » sont gardés (un zip fait sous Windows les perd) ;
# - un script « lancer-hush.sh » lance Hush avec les options utiles sous Linux
#   (--no-sandbox pour Ubuntu 24.04+/Arch, --ozone-platform=x11 pour éviter les soucis Wayland + puce Intel).
# Utilisation : python tools/pack-linux.py   (après : npx electron-builder --linux dir --x64 ...)
import io, json, os, tarfile, time

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
version = json.load(open(os.path.join(root, "package.json"), encoding="utf-8"))["version"]
src = os.path.join(root, "dist", "linux-unpacked")
out = os.path.join(root, "dist", f"Hush-{version}-linux-x64.tar.gz")

SCRIPT = """#!/bin/sh
# Lance Hush avec les options utiles sous Linux.
# Le mode d'affichage se choisit dans Hush (Paramètres > Vidéo > Linux) et s'applique au lancement suivant :
#   (rien)  : Wayland si le bureau est en Wayland, sinon X11
#   wayland : Wayland natif, avec la vraie transparence de l'overlay (niri, Hyprland, Sway)
#   x11     : par XWayland / X11
#   nogpu   : sans accélération graphique, si la fenêtre reste noire
cd "$(dirname "$0")"
DIR=$(pwd)
# Raccourci dans le menu des applications (lanceur de Noctalia, GNOME, KDE…) : refait à chaque lancement,
# pour qu'il pointe toujours vers ce dossier. Ensuite plus besoin du terminal : on ouvre « Hush » depuis le menu.
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
mkdir -p "$APPS"
cat > "$APPS/.hush.desktop.new" <<FIN
[Desktop Entry]
Type=Application
Name=Hush
Comment=Tes vocaux Discord en version cinéma
Exec="$DIR/lancer-hush.sh"
Icon=$DIR/hush.png
Terminal=false
Categories=AudioVideo;Network;
StartupWMClass=hush
StartupNotify=true
FIN
if cmp -s "$APPS/.hush.desktop.new" "$APPS/hush.desktop"; then rm -f "$APPS/.hush.desktop.new"
else mv -f "$APPS/.hush.desktop.new" "$APPS/hush.desktop"
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" >/dev/null 2>&1
fi
# Carte graphique : on la force (Chromium écarte souvent les puces Intel / AMD sous Linux, et tout passe alors
# par le processeur, en plus lent). « Sans accélération » reste là si elle pose souci.
GPU="--ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy"
MODE=$(cat "${XDG_CONFIG_HOME:-$HOME/.config}/Hush/linux-display" 2>/dev/null)
if [ -z "$MODE" ]; then
  if [ -n "$WAYLAND_DISPLAY" ]; then MODE=wayland; else MODE=x11; fi
fi
case "$MODE" in
  wayland) FLAGS="--ozone-platform=wayland $GPU" ;;
  nogpu)   FLAGS="--ozone-platform=x11 --disable-gpu --enable-transparent-visuals" ;;
  *)       FLAGS="--ozone-platform=x11 --enable-transparent-visuals $GPU" ;;
esac
exec ./hush --no-sandbox $FLAGS "$@"
"""

def executable(name):
    base = os.path.basename(name)
    return "." not in base or base.endswith(".so") or ".so." in base or base.endswith(".sh")

def fix(info):
    info.mode = 0o755 if info.isdir() or executable(info.name) else 0o644
    info.uid = info.gid = 0
    info.uname = info.gname = ""
    return info

with tarfile.open(out, "w:gz") as tar:
    tar.add(src, arcname="Hush", filter=fix)
    data = SCRIPT.encode("utf-8")
    ti = tarfile.TarInfo("Hush/lancer-hush.sh")
    ti.size, ti.mode, ti.mtime = len(data), 0o755, int(time.time())
    tar.addfile(ti, io.BytesIO(data))
    tar.add(os.path.join(root, "build", "icon.png"), arcname="Hush/hush.png", filter=fix)
print("ok", out, round(os.path.getsize(out) / 1e6), "Mo")
