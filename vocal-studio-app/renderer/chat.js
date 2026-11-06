/* ——— Tchat du salon vocal ———
   Lit et écrit dans le tchat du salon où tu te trouves, par le serveur du bot. Les messages partent sous ton pseudo et
   ta photo (webhook du bot, avec l'étiquette APP) : une appli ne peut pas écrire à ta place avec ton compte Discord. */
const Chat = { open: false, channel: null, unread: 0 };
const fmtHour = (ms) => new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

function chatMsgEl(m) {
  const row = document.createElement("article");
  row.className = "chat-msg";
  const av = document.createElement("img");
  av.className = "chat-av"; av.alt = ""; av.src = m.avatar || "assets/discord-logo.png";
  const body = document.createElement("div");
  body.style.minWidth = "0";
  const who = document.createElement("div");
  who.className = "who";
  const name = document.createElement("b");
  name.textContent = m.name;
  const time = document.createElement("time");
  time.textContent = fmtHour(m.at);
  who.append(name, time);
  body.append(who);
  if (m.text) { const p = document.createElement("p"); p.textContent = m.text; body.append(p); }
  for (const u of m.images || []) { const i = document.createElement("img"); i.className = "pic"; i.alt = ""; i.src = u; i.onload = chatStick; body.append(i); }
  row.append(av, body);
  return row;
}
let chatPinned = true;
function chatStick() { if (chatPinned) { const l = $("#chatList"); l.scrollTop = l.scrollHeight; } }
function chatNote(text) { $("#chatWhy").textContent = text || ""; $("#chatWhy").hidden = !text; }

async function chatLoad() {
  const list = $("#chatList");
  list.textContent = "";
  chatNote("");
  $("#chatForm").hidden = true;
  if (!state.channel || state.status === "demo") { $("#chatTitle").textContent = "Tchat"; return chatNote("Rejoins un salon vocal pour voir son tchat."); }
  Chat.channel = state.channel.id;
  $("#chatTitle").textContent = chanLabel(state.channel);
  if (state.channel.call) return chatNote("Le tchat des appels privés n'est pas accessible : le bot ne peut lire que les salons de serveur.");
  const r = await window.studio.chat.history();
  if (Chat.channel !== (state.channel && state.channel.id)) return; // salon changé entre-temps
  if (r.error) return chatNote(r.error);
  list.textContent = "";
  for (const m of r.data.messages) list.append(chatMsgEl(m));
  if (!r.data.messages.length) list.append(Object.assign(document.createElement("p"), { className: "chat-empty", textContent: "Aucun message pour l'instant." }));
  $("#chatForm").hidden = !r.data.canSend;
  if (!r.data.canSend) chatNote("Tu n'as pas le droit d'écrire dans ce tchat.");
  else if (r.data.noContent) chatNote("Le texte des messages n'est pas lisible : active « Message Content Intent » sur le portail Discord, puis redémarre le bot.");
  chatPinned = true;
  chatStick();
}

function chatShow(on) {
  Chat.open = on;
  $("#chat").hidden = !on;
  $("#chatBtn").classList.toggle("on", on);
  if (on) { Chat.unread = 0; $("#chatDot").hidden = true; chatLoad(); $("#chatInput").focus(); }
}
$("#chatBtn").onclick = () => chatShow(!Chat.open);
$("#chatClose").onclick = () => chatShow(false);
$("#chatList").addEventListener("scroll", (e) => { const l = e.target; chatPinned = l.scrollHeight - l.scrollTop - l.clientHeight < 40; }, { passive: true });

$("#chatForm").onsubmit = async (e) => {
  e.preventDefault();
  const input = $("#chatInput"), text = input.value.trim();
  if (!text) return;
  input.value = "";
  const r = await window.studio.chat.send(text);
  if (r.error) { input.value = text; showToast(r.error); }
};

window.studio.chat.onMessage((m) => {
  if (!Chat.open) { Chat.unread++; $("#chatDot").hidden = false; return; }
  const empty = $("#chatList").querySelector(".chat-empty");
  if (empty) empty.remove();
  $("#chatList").append(chatMsgEl(m));
  chatStick();
});

// Salon changé pendant que le tchat est ouvert : on charge le nouveau
window.chatOnState = () => {
  const id = state.channel ? state.channel.id : null;
  if (id === Chat.channel) return;
  Chat.channel = id;
  Chat.unread = 0;
  $("#chatDot").hidden = true;
  if (Chat.open) chatLoad();
};
