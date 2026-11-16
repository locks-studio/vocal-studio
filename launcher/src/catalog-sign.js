// Signature des catalogues : la protection contre un site ou un compte FTP piraté.
// Chaque catalog.json publié porte une signature Ed25519 faite avec la clé SECRÈTE de Locks
// (launcher/cle-signature.pem sur son PC, ou le secret GitHub CATALOG_SIGNING_KEY pour la publication automatique).
// Le launcher contient seulement la clé PUBLIQUE ci-dessous : il refuse tout catalogue qui n'est pas signé par elle.
// Un pirate qui remplace les fichiers du site ne peut donc rien faire installer chez personne : sans la clé secrète,
// il ne peut ni changer une version, ni un lien, ni une empreinte SHA-256.
const crypto = require("crypto");

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAWFRFdhmQlZdNIYdVFgGfb97S4QWG8TsC3OmFej/xAqE=
-----END PUBLIC KEY-----`;

// Ce qui est signé : le catalogue sans son champ « signature », en JSON compact (même ordre des clés qu'à l'écriture)
function canonical(cat) {
  const { signature, ...rest } = cat; // eslint-disable-line no-unused-vars
  return Buffer.from(JSON.stringify(rest), "utf8");
}

function sign(cat, privateKeyPem) {
  const { signature, ...rest } = cat; // eslint-disable-line no-unused-vars
  return { ...rest, signature: crypto.sign(null, canonical(rest), privateKeyPem).toString("base64") };
}

function verify(cat, publicKeyPem = PUBLIC_KEY) {
  if (!cat || typeof cat.signature !== "string" || cat.signature.length > 200) return false;
  try { return crypto.verify(null, canonical(cat), publicKeyPem, Buffer.from(cat.signature, "base64")); }
  catch { return false; }
}

module.exports = { sign, verify, PUBLIC_KEY };
