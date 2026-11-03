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
#   x11     : le plus sûr (XWayland), par défaut
#   wayland : Wayland natif, pour la vraie transparence de l'overlay (niri, Hyprland, Sway)
#   nogpu   : sans accélération graphique, si la fenêtre reste noire
cd "$(dirname "$0")"
MODE=$(cat "${XDG_CONFIG_HOME:-$HOME/.config}/Hush/linux-display" 2>/dev/null)
case "$MODE" in
  wayland) FLAGS="--ozone-platform=wayland" ;;
  nogpu)   FLAGS="--ozone-platform=x11 --disable-gpu" ;;
  *)       FLAGS="--ozone-platform=x11" ;;
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
print("ok", out, round(os.path.getsize(out) / 1e6), "Mo")
