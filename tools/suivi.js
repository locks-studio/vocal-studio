// Suivi du travail à deux (Locks et Gabinoul) : qui fait quoi, sur quelle branche, et quels fichiers sont touchés.
// Lancé tout seul au début de chaque session Claude Code (hook SessionStart dans .claude/settings.json) :
// son texte est donné à Claude, qui sait ainsi ce que l'autre est en train de faire avant de toucher au code.
//   node tools/suivi.js          → tout le détail
//   node tools/suivi.js --court  → version courte (celle du hook)
// Ne casse jamais une session : sans gh, sans réseau ou hors du dépôt, il le dit en une ligne et s'arrête.
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const COURT = process.argv.includes("--court");
const run = (cmd, args, timeout = 15000) => {
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8", timeout, windowsHide: true });
  return r.status === 0 ? (r.stdout || "").trim() : null;
};
const json = (args) => { const out = run("gh", args); try { return out ? JSON.parse(out) : null; } catch { return null; } };
const lines = [];
const say = (s = "") => lines.push(s);

(() => {
  if (run("git", ["rev-parse", "--is-inside-work-tree"]) !== "true") return say("Suivi : pas dans le dépôt git.");
  run("git", ["fetch", "-q", "--prune", "origin"], 20000); // on voit les branches de l'autre (sans rien modifier chez soi)

  const me = run("gh", ["api", "user", "--jq", ".login"]);
  const branch = run("git", ["branch", "--show-current"]) || "(détachée)";
  const behind = Number(run("git", ["rev-list", "--count", "HEAD..origin/main"]) || 0);
  say("=== SUIVI DU TRAVAIL À DEUX (Locks = lrtdetrox-byte, Gabinoul = Gabinou22s) ===");
  say(`Toi : ${me || "? (gh non connecté : tape « gh auth login »)"} · branche « ${branch} »${behind ? ` · ${behind} commit(s) de main à récupérer (git pull / git merge origin/main)` : ""}`);
  if (branch === "main") say("⚠ Tu es sur main : crée une branche avant de modifier quoi que ce soit (git checkout -b nom-de-la-tache).");

  // Tâches en cours (issues) : qui s'en occupe
  const issues = json(["issue", "list", "--state", "open", "--limit", "50", "--json", "number,title,assignees,labels,updatedAt"]);
  if (!issues) say("Tâches : impossible de lire les issues (gh absent ou pas connecté).");
  else {
    say("");
    say(`Tâches ouvertes (${issues.length}) :`);
    for (const i of issues) {
      const who = i.assignees.map((a) => a.login).join(", ") || "personne";
      const lab = i.labels.map((l) => l.name).join(", ");
      say(`  #${i.number} ${i.title} — ${who}${lab ? ` [${lab}]` : ""}`);
    }
    if (!issues.length) say("  (aucune)");
  }

  // Pull Requests ouvertes : à relire, et les fichiers qu'elles touchent
  const prs = json(["pr", "list", "--state", "open", "--limit", "30", "--json", "number,title,author,headRefName,isDraft,reviewDecision,files"]);
  const busy = new Map(); // fichier → qui le modifie (branche)
  if (prs) {
    say("");
    say(`Pull Requests ouvertes (${prs.length}) :`);
    for (const p of prs) {
      const relire = p.author.login !== me && !p.isDraft && p.reviewDecision !== "APPROVED" ? " ← À RELIRE PAR TOI" : "";
      say(`  #${p.number} ${p.title} — ${p.author.login}, branche ${p.headRefName}${p.isDraft ? " (brouillon)" : ""}${relire}`);
      for (const f of p.files || []) if (p.author.login !== me) busy.set(f.path, `${p.author.login} (#${p.number})`);
    }
    if (!prs.length) say("  (aucune)");
  }

  // Branches de l'autre pas encore fusionnées (même sans Pull Request) : ce qu'elles changent
  const refs = (run("git", ["for-each-ref", "--format=%(refname:short)|%(authorname)|%(committerdate:relative)", "refs/remotes/origin"]) || "").split("\n").filter(Boolean);
  const mine = run("git", ["config", "user.name"]);
  const others = refs.map((r) => r.split("|")).filter(([ref, author]) => ref !== "origin/main" && ref !== "origin/HEAD" && ref !== "origin" && author !== mine);
  for (const [ref, author, when] of others) {
    const files = (run("git", ["diff", "--name-only", `origin/main...${ref}`]) || "").split("\n").filter(Boolean);
    if (!files.length) continue;
    for (const f of files) if (!busy.has(f)) busy.set(f, `${author} (${ref.replace("origin/", "")})`);
    if (!COURT) say(`  Branche ${ref.replace("origin/", "")} — ${author}, dernier envoi ${when} : ${files.length} fichier(s) changé(s)`);
  }

  say("");
  if (busy.size) {
    say(`Fichiers en cours de modification par l'autre (${busy.size}) — ne pas les modifier sans se mettre d'accord :`);
    const list = [...busy.entries()];
    for (const [f, who] of COURT ? list.slice(0, 25) : list) say(`  ${f} — ${who}`);
    if (COURT && list.length > 25) say(`  … et ${list.length - 25} autres (node tools/suivi.js pour tout voir)`);
  } else say("Aucun fichier en cours de modification par l'autre.");

  // Mes changements pas encore envoyés qui croisent ceux de l'autre
  const local = (run("git", ["diff", "--name-only", "origin/main"]) || "").split("\n").filter(Boolean);
  const clash = local.filter((f) => busy.has(f));
  if (clash.length) say(`⚠ Conflit possible : tu modifies aussi ${clash.join(", ")}. Préviens l'autre (commentaire sur sa tâche ou sa PR).`);

  say("");
  say("Règles : une issue par tâche (assignée à celui qui la fait), une branche par tâche, une PR relue par l'autre. Détail dans CLAUDE.md › Suivi à deux.");
})();

process.stdout.write(lines.join("\n") + "\n");
