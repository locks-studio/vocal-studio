// Clés d'accès privées : un logiciel « privé » n'est pas dans le catalogue public. Il est rangé sur le site dans
// un dossier dont le nom est calculé à partir de la clé (empreinte SHA-256) : sans la clé, impossible de deviner
// le dossier, et la clé elle-même n'est écrite nulle part (ni sur GitHub, ni sur le site).
// Le launcher fait le même calcul quand quelqu'un tape la clé dans « Code d'accès ».
const crypto = require("crypto");

// Majuscules, minuscules et espaces autour ne comptent pas : « MaCle42 » = « macle42 »
const normalize = (key) => String(key || "").trim().toLowerCase();
const folderFor = (key) => "prive-" + crypto.createHash("sha256").update("1999-prive:" + normalize(key)).digest("hex").slice(0, 32);
const isFolder = (f) => /^prive-[0-9a-f]{32}$/.test(String(f || ""));

// « cle1:app1,app2;cle2:app3 » → [{ key, apps: [...] }] (format du secret CLES_PRIVEES)
function parseKeys(txt) {
  return String(txt || "").split(/[;\n]/).map((s) => s.trim()).filter(Boolean).map((s) => {
    const i = s.lastIndexOf(":");
    return i < 0 ? null : { key: s.slice(0, i).trim(), apps: s.slice(i + 1).split(",").map((x) => x.trim()).filter(Boolean) };
  }).filter((x) => x && x.key && x.apps.length);
}

module.exports = { normalize, folderFor, isFolder, parseKeys };
