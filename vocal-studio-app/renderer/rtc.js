/* ——— Caméras et partages d'écran entre amis Hush (WebRTC) ———
   Discord ne donne la vidéo d'un appel à aucune appli. Entre utilisateurs Hush d'un même salon vocal,
   on la fait donc passer à côté : le serveur du bot présente les applis du salon (il vérifie lui-même qui
   est dans quel salon) et relaie seulement la poignée de main ; l'image va ensuite directement d'un PC
   à l'autre, chiffrée par WebRTC, sans passer par le serveur.
   Il faut être connecté au serveur Hush (compte Discord lié). */
const Rtc = {
  me: 0,
  room: [],            // [{ cid, id, cam, screen }] les autres applis Hush du salon
  peers: new Map(),    // cid → connexion (avec les flux reçus : streams.cam / streams.screen)
};
// STUN : sert seulement à trouver l'adresse publique de chacun (aucune image ne passe par là)
const RTC_ICE = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

// Le flux d'un membre, s'il le montre en ce moment (le serveur dit ce que chacun partage)
function remoteMedia(id, kind) {
  for (const p of Rtc.peers.values()) {
    const r = Rtc.room.find((x) => x.cid === p.cid);
    const s = p.streams[kind];
    if (r && r.id === id && r[kind] && s && s.getVideoTracks().some((t) => t.readyState === "live" && !t.muted)) return s;
  }
  return null;
}

// Ma caméra ou mon écran change : le serveur prévient les autres, et chaque connexion suit
function rtcPublish() {
  if (MINI) return;
  window.studio.video.state({ cam: !!Cap.cam, screen: !!Cap.screen });
  rtcSyncRoom();
}

function rtcLocalKinds() {
  const k = {};
  if (Cap.cam) k[Cap.cam.id] = "cam";
  if (Cap.screen) k[Cap.screen.id] = "screen";
  return k;
}

function rtcSend(p, data) { window.studio.video.rtc(p.cid, data); }

function rtcPeer(cid) {
  let p = Rtc.peers.get(cid);
  if (p) return p;
  const pc = new RTCPeerConnection({ iceServers: RTC_ICE });
  // « Négociation parfaite » : en cas d'offres croisées, l'appli au plus grand numéro cède
  p = { cid, pc, polite: Rtc.me > cid, making: false, ignore: false, kinds: {}, sent: { cam: null, screen: null }, streams: { cam: null, screen: null } };
  Rtc.peers.set(cid, p);
  pc.onnegotiationneeded = async () => {
    try {
      p.making = true;
      await pc.setLocalDescription();
      rtcSend(p, { desc: pc.localDescription.toJSON(), kinds: rtcLocalKinds() });
    } catch {} finally { p.making = false; }
  };
  pc.onicecandidate = (e) => { if (e.candidate) rtcSend(p, { cand: e.candidate.toJSON() }); };
  pc.ontrack = (e) => {
    const stream = e.streams[0];
    if (!stream) return;
    p.streams[p.kinds[stream.id] === "screen" ? "screen" : "cam"] = stream;
    const refresh = () => attachLocalMedia();
    e.track.addEventListener("unmute", refresh);
    e.track.addEventListener("mute", refresh);
    e.track.addEventListener("ended", refresh);
    stream.addEventListener("removetrack", refresh);
    refresh();
  };
  pc.onconnectionstatechange = () => {
    // Coupure réseau : on repart de zéro (l'autre côté fera pareil)
    if (pc.connectionState === "failed") { rtcDrop(cid); rtcSyncRoom(); }
  };
  return p;
}

function rtcDrop(cid) {
  const p = Rtc.peers.get(cid);
  if (!p) return;
  Rtc.peers.delete(cid);
  try { p.pc.close(); } catch {}
  attachLocalMedia();
}

// Envoie à une connexion exactement ce que je montre (on ne transmet que l'image : la voix passe par Discord)
function rtcTracks(p) {
  for (const kind of ["cam", "screen"]) {
    const stream = Cap[kind];
    if (p.sent[kind] && p.sent[kind].stream === stream) continue;
    if (p.sent[kind]) { try { p.pc.removeTrack(p.sent[kind].sender); } catch {} p.sent[kind] = null; }
    const track = stream && stream.getVideoTracks()[0];
    if (!track) continue;
    p.sent[kind] = { stream, sender: p.pc.addTrack(track, stream) };
  }
}

// Qui est dans le salon : on se connecte à chacun dès que l'un des deux montre quelque chose
function rtcSyncRoom() {
  const mine = !!(Cap.cam || Cap.screen);
  const want = new Set();
  for (const r of Rtc.room) {
    if (!mine && !r.cam && !r.screen) continue;
    want.add(r.cid);
    rtcTracks(rtcPeer(r.cid));
  }
  for (const cid of [...Rtc.peers.keys()]) if (!want.has(cid)) rtcDrop(cid);
}

if (!MINI) {
  window.studio.video.onSignal(async (m) => {
    if (m.type === "video-room") {
      Rtc.me = m.me;
      Rtc.room = Array.isArray(m.peers) ? m.peers : [];
      // Interface tout juste (re)chargée : les autres gardent peut-être une connexion vers l'ancienne page
      if (!Rtc.started) { Rtc.started = true; for (const r of Rtc.room) window.studio.video.rtc(r.cid, { reset: true }); }
      rtcSyncRoom();
      attachLocalMedia();
      return;
    }
    // Message WebRTC d'une autre appli du salon
    const d = m.data || {};
    if (!Rtc.room.some((x) => x.cid === m.from)) return; // pas (ou plus) dans mon salon
    if (d.reset) { rtcDrop(m.from); return rtcSyncRoom(); }
    const p = rtcPeer(m.from);
    const pc = p.pc;
    try {
      if (d.desc) {
        const collision = d.desc.type === "offer" && (p.making || pc.signalingState !== "stable");
        p.ignore = !p.polite && collision;
        if (p.ignore) return;
        if (d.kinds && typeof d.kinds === "object") Object.assign(p.kinds, d.kinds);
        await pc.setRemoteDescription(d.desc);
        if (d.desc.type === "offer") {
          rtcTracks(p);
          await pc.setLocalDescription();
          rtcSend(p, { desc: pc.localDescription.toJSON(), kinds: rtcLocalKinds() });
        }
      } else if (d.cand) {
        try { await pc.addIceCandidate(d.cand); } catch (e) { if (!p.ignore) throw e; }
      }
    } catch (e) { console.warn("Vidéo Hush :", e.message); }
  });
  // Au démarrage (ou après un rechargement) : le serveur renvoie le salon
  window.studio.video.state({ cam: false, screen: false });
}
