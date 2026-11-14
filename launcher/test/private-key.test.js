// Clés d'accès privées : même dossier secret côté publication et côté launcher, quelle que soit la casse.
const assert = require("assert");
const { folderFor, isFolder, normalize, parseKeys } = require("../src/private-key");

const f = folderFor("CleDeTest42");
assert.ok(isFolder(f), f);
assert.strictEqual(folderFor("  cledetest42 "), f, "majuscules et espaces ne comptent pas");
assert.notStrictEqual(folderFor("CleDeTest43"), f);
assert.ok(!f.includes("cledetest42"), "la clé n'apparaît pas dans le nom du dossier");
assert.strictEqual(normalize(" AbC "), "abc");
assert.ok(!isFolder("prive-../../x") && !isFolder("test-abc"));

assert.deepStrictEqual(parseKeys("cle1:hush-studio; cle2 : a , b\n:rien;sansapps:"), [
  { key: "cle1", apps: ["hush-studio"] },
  { key: "cle2", apps: ["a", "b"] },
]);
assert.deepStrictEqual(parseKeys(""), []);
console.log("private-key.test.js : OK");
