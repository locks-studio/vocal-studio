/* ——— Accueil guidé ———
   À la première ouverture : un petit parcours en quelques choix, avec un vocal simulé derrière. Chaque choix
   s'applique tout de suite et se voit en direct. On peut passer à tout moment, et le revoir depuis Paramètres › Compte. */
const Onboard = { step: 0, on: false };
const ONBOARD_COLORS = [["#fcbbdd", "Rose pâle"], ["#c9b6ff", "Lilas"], ["#9fd8ff", "Ciel"], ["#a8efc4", "Menthe"], ["#ffd59e", "Pêche"], ["#ff8a8a", "Corail"], ["#2f6bff", "Bleu nuit"], ["#1a1024", "Noir"]];
const ONBOARD_STEPS = [
  { title: "Bienvenue sur Hush", text: "Tes vocaux Discord, en version cinéma. En quelques choix, on règle Hush à ton goût : tu vois le résultat en direct derrière cette fenêtre.", next: "Commencer" },
  { title: "Ta couleur", text: "Elle colore toute l'interface et le lecteur de musique.", draw: (b) => {
    const row = el("div", { className: "ob-colors" });
    for (const [c, name] of ONBOARD_COLORS) {
      const s = el("button", { className: "ob-color" + ((S.accent || "#fcbbdd") === c ? " on" : ""), title: name });
      s.type = "button"; s.style.background = c; s.setAttribute("aria-label", name);
      s.onclick = () => { S.accent = c === "#fcbbdd" ? null : c; apply(); onboardDraw(); };
      row.append(s);
    }
    b.append(row);
  } },
  { title: "Ton fond", text: "Ce qu'on voit derrière les avatars. Tu pourras mettre ton image ou ton GIF ensuite.", choices: ["bg", [["pinkspace", "Espace rose"], ["space", "Espace"], ["gradient", "Dégradé"], ["solid", "Uni"]]] },
  { title: "Quand quelqu'un parle", text: "L'anneau qui s'allume autour de l'avatar.", choices: ["ring", [["aura", "Aura"], ["wave", "Vagues"], ["flame", "Flammes"], ["solid", "Plein"]]] },
  { title: "La disposition", text: "Comment le salon est filmé.", choices: ["layout", [["strip", "Bande"], ["film", "Cinéma 3D"], ["grid", "Grille"], ["discord", "Discord"]]] },
  { title: "Dernière chose", text: "Si Hush plante, il peut envoyer un rapport technique pour que le problème soit corrigé. Il ne contient ni tes messages, ni ta voix.", draw: (b) => {
    const label = el("label", { className: "ob-check" });
    const box = el("input"); box.type = "checkbox"; box.checked = !!S.reports;
    box.onchange = () => { S.reports = box.checked; apply(); };
    label.append(box, " Envoyer les rapports d'erreur");
    b.append(label);
  }, next: "Terminer" },
];

function el(tag, props = {}) { return Object.assign(document.createElement(tag), props); }

function onboardDraw() {
  const box = $("#onboard"), step = ONBOARD_STEPS[Onboard.step];
  box.textContent = "";
  const dots = el("div", { className: "ob-dots" });
  ONBOARD_STEPS.forEach((_, i) => dots.append(el("i", { className: i === Onboard.step ? "on" : "" })));
  const body = el("div", { className: "ob-body" });
  if (step.choices) {
    const [key, list] = step.choices;
    const row = el("div", { className: "ob-choices" });
    for (const [v, name] of list) {
      const b = el("button", { className: "ob-choice" + (S[key] === v ? " on" : ""), textContent: name });
      b.type = "button";
      b.onclick = () => { S[key] = v; apply(); onboardDraw(); };
      row.append(b);
    }
    body.append(row);
  }
  if (step.draw) step.draw(body);
  const foot = el("div", { className: "ob-foot" });
  const skip = el("button", { className: "linkbtn", textContent: "Passer" });
  skip.type = "button"; skip.onclick = () => onboardEnd();
  const go = el("button", { className: "cta", textContent: step.next || "Continuer" });
  go.type = "button";
  go.onclick = () => { if (Onboard.step < ONBOARD_STEPS.length - 1) { Onboard.step++; onboardDraw(); } else onboardEnd(); };
  foot.append(dots, skip, go);
  box.append(el("h2", { textContent: step.title }), el("p", { textContent: step.text }), body, foot);
}

function onboardStart() {
  if (Onboard.on || MINI) return;
  Onboard.on = true; Onboard.step = 0;
  document.body.classList.add("onboarding");
  $("#onboard").hidden = false;
  S.panel = false;
  setSandbox(true, true);
  sandbox.guests = true;
  onboardDraw();
}
function onboardEnd() {
  Onboard.on = false;
  S.onboarded = true;
  document.body.classList.remove("onboarding");
  $("#onboard").hidden = true;
  setSandbox(false);
  save();
  showToast("C'est prêt : tout le reste est dans les paramètres ⚙");
}

$("#onboardAgain").onclick = () => onboardStart();
if (!MINI && !S.onboarded && !S.demo) {
  // Déjà utilisateur de Hush : pas de parcours d'accueil
  if ((S.history && S.history.length) || Object.keys(S.chanStats || {}).length) { S.onboarded = true; save(); }
  else setTimeout(onboardStart, 500);
}
