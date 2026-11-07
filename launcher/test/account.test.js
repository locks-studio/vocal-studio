// Connexion du launcher, contre un faux serveur local (aucun compte réel, aucun navigateur)
const assert = require("assert");
const fs = require("fs"), http = require("http"), os = require("os"), path = require("path");
const { Account } = require("../src/account.js");

const file = path.join(os.tmpdir(), `account-test-${process.pid}.json`);
let polls = 0, meStatus = 200, pollError = null;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/") return res.end("ok");
  if (url.pathname === "/auth/poll") {
    polls++;
    res.setHeader("Content-Type", "application/json");
    if (pollError) return res.end(JSON.stringify({ error: pollError }));
    return res.end(JSON.stringify(polls >= 2 ? { token: "session-secrete" } : { token: null, error: null }));
  }
  if (url.pathname === "/auth/me") {
    if (req.headers.authorization !== "Bearer session-secrete" || meStatus === 401) { res.writeHead(401); return res.end(); }
    return res.end(JSON.stringify({ id: "1", name: "Locks", avatar: null }));
  }
  res.writeHead(404).end();
});
const make = (port, opened) => new Account({ file, server: `http://127.0.0.1:${port}/`, openUrl: (u) => opened.push(u), seal: (t) => "#" + t, unseal: (b) => b.slice(1) });

server.listen(0, "127.0.0.1", async () => {
  const port = server.address().port, opened = [];
  try {
    const a = make(port, opened);
    assert.equal(a.info().signedIn, false);
    const r = await a.login();
    assert.equal(r.ok, true);
    assert.equal(r.user.name, "Locks");
    assert(/\/auth\/login\?state=[\w-]{16,}/.test(opened[0]), "le navigateur s'ouvre sur la connexion");
    assert(!fs.readFileSync(file, "utf8").includes('"session":"session-secrete"'), "la session passe par le chiffrement");
    // Rouvert plus tard : toujours connecté
    const b = make(port, opened);
    assert.equal(b.token(), "session-secrete");
    assert.equal((await b.refresh()).signedIn, true);
    // Session refusée par le serveur : on redemande la connexion
    meStatus = 401;
    assert.equal((await b.refresh()).signedIn, false);
    meStatus = 200;
    // Refus côté Discord : l'erreur revient
    polls = 0; pollError = "Connexion annulée.";
    assert.equal((await make(port, opened).login()).error, "Connexion annulée.");
    pollError = null;
    // Annuler pendant l'attente
    polls = -100;
    const c = make(port, opened);
    const waiting = c.login();
    setTimeout(() => c.cancel(), 100);
    assert.equal((await waiting).error, "cancelled");
    // Serveur éteint : le launcher le sait et ne se ferme pas à l'utilisateur
    const off = new Account({ file, server: "http://127.0.0.1:9", openUrl: () => assert.fail("pas de navigateur"), seal: (t) => t, unseal: (t) => t });
    assert.equal((await off.login()).error, "offline");
    console.log("compte : tous les tests passent");
  } catch (e) { console.error(e); process.exitCode = 1; }
  server.close();
  fs.rmSync(file, { force: true });
});
