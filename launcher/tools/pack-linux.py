# Emballe le launcher Linux (dist/linux-unpacked) en .tar.gz avec les bons droits « exécutable ».
# Un zip fabriqué sous Windows les perd : après décompression sous Linux, le programme ne se lancerait pas.
# Utilisation : python tools/pack-linux.py
import json, os, tarfile

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
version = json.load(open(os.path.join(root, "package.json"), encoding="utf-8"))["version"]
src = os.path.join(root, "dist", "linux-unpacked")
out = os.path.join(root, "dist", f"1999-Setup-{version}-linux-x64.tar.gz")

def executable(name):
    base = os.path.basename(name)
    return "." not in base or base.endswith(".so") or ".so." in base

def fix(info):
    if info.isdir():
        info.mode = 0o755
    elif info.isfile():
        info.mode = 0o755 if executable(info.name) else 0o644
    info.uid = info.gid = 0
    info.uname = info.gname = ""
    return info

with tarfile.open(out, "w:gz") as tar:
    tar.add(src, arcname="1999", filter=fix)
print("ok", out, round(os.path.getsize(out) / 1e6), "Mo")
