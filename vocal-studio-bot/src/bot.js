// Le bot Discord : rejoint un salon vocal à la demande et suit qui est là, qui est muet et qui parle.
// Il n'écoute pas l'audio : il ne garde que le signal « untel commence / arrête de parler ».
const { Client, GatewayIntentBits, Events, MessageFlags, PermissionFlagsBits } = require("discord.js");
const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState } = require("@discordjs/voice");
const { EventEmitter } = require("events");

const EMPTY_LEAVE_MS = 30_000;

class StudioBot extends EventEmitter {
  constructor(token) {
    super();
    this.token = token;
    this.speaking = new Map(); // guildId → Set(userId)
    this.emptyTimers = new Map();
    this.client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

    this.client.once(Events.ClientReady, (c) => this.onReady(c));
    this.client.on(Events.VoiceStateUpdate, (oldS, newS) => this.onVoiceState(oldS, newS));
    this.client.on(Events.InteractionCreate, (i) => this.onInteraction(i).catch((e) => console.error("Commande :", e)));
  }

  start() { return this.client.login(this.token); }

  async onReady(c) {
    console.log(`Bot connecté : ${c.user.tag} (${c.guilds.cache.size} serveur·s)`);
    await c.application.commands.set([
      { name: "hush", description: "Fait venir Hush dans ton salon vocal" },
      { name: "hush-stop", description: "Fait partir Hush du salon vocal" },
    ]);
    this.emit("change");
  }

  // ——— Où se trouve quelqu'un, et le bot y est-il ? ———
  findUser(userId) {
    for (const guild of this.client.guilds.cache.values()) {
      const vs = guild.voiceStates.cache.get(userId);
      if (vs && vs.channel) return { guild, channel: vs.channel, vs };
    }
    return null;
  }

  botChannelId(guildId) {
    const conn = getVoiceConnection(guildId);
    if (!conn || conn.state.status === VoiceConnectionStatus.Destroyed) return null;
    return conn.joinConfig.channelId;
  }

  // État envoyé à l'appli : même forme que la connexion locale (RPC)
  snapshot(user) {
    const me = { id: user.id, name: user.name };
    const base = { mode: "bot", controls: false, me, settings: { mute: false, deaf: false } };
    if (!this.client.isReady()) return { ...base, status: "connecting", channel: null, members: [] };
    const loc = this.findUser(user.id);
    if (!loc) return { ...base, status: "ready", channel: null, members: [] };

    const { guild, channel, vs } = loc;
    const info = { id: channel.id, name: channel.name, guild: guild.name };
    const settings = { mute: !!(vs.selfMute || vs.serverMute), deaf: !!(vs.selfDeaf || vs.serverDeaf) };
    if (this.botChannelId(guild.id) !== channel.id) {
      const perms = channel.permissionsFor(guild.members.me);
      const canJoin = !!perms && perms.has(PermissionFlagsBits.Connect) && perms.has(PermissionFlagsBits.ViewChannel);
      return { ...base, status: "bot-absent", canJoin, channel: info, members: [], settings };
    }
    const speaking = this.speaking.get(guild.id) || new Set();
    const members = [...channel.members.values()]
      .filter((m) => m.id !== this.client.user.id)
      .map((m) => ({
        id: m.id,
        name: m.displayName,
        avatar: m.displayAvatarURL({ size: 256, extension: "png" }),
        muted: !!(m.voice.selfMute || m.voice.serverMute || m.voice.suppress),
        deaf: !!(m.voice.selfDeaf || m.voice.serverDeaf),
        speaking: speaking.has(m.id),
      }));
    return { ...base, status: "ready", channel: info, members, settings };
  }

  // ——— Rejoindre / quitter ———
  async join(channel) {
    const guild = channel.guild;
    const old = getVoiceConnection(guild.id);
    if (old && old.joinConfig.channelId === channel.id && old.state.status !== VoiceConnectionStatus.Destroyed) return;
    if (old) old.destroy();

    // selfDeaf doit rester à false : sinon Discord n'envoie pas le signal « untel parle »
    const conn = joinVoiceChannel({
      channelId: channel.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false, selfMute: true,
    });
    const set = new Set();
    this.speaking.set(guild.id, set);
    conn.receiver.speaking.on("start", (id) => { set.add(id); this.emit("change"); });
    conn.receiver.speaking.on("end", (id) => { set.delete(id); this.emit("change"); });
    conn.on("stateChange", (_o, n) => {
      if (n.status === VoiceConnectionStatus.Destroyed) this.speaking.delete(guild.id);
      this.emit("change");
    });
    conn.on(VoiceConnectionStatus.Disconnected, async () => {
      // Déplacé ou expulsé : on laisse 5 s à Discord pour se reconnecter, sinon on abandonne
      try {
        await Promise.race([
          entersState(conn, VoiceConnectionStatus.Signalling, 5_000),
          entersState(conn, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch { conn.destroy(); }
    });
    try {
      await entersState(conn, VoiceConnectionStatus.Ready, 20_000);
    } catch (e) {
      conn.destroy();
      throw new Error("Impossible de rejoindre le salon vocal (permissions ou réseau).");
    }
  }

  leave(guildId) {
    const conn = getVoiceConnection(guildId);
    if (conn) conn.destroy();
  }

  async summon(userId) {
    const loc = this.findUser(userId);
    if (!loc) throw new Error("Tu n'es dans aucun salon vocal d'un serveur où le bot est invité.");
    await this.join(loc.channel);
  }

  dismiss(userId) {
    const loc = this.findUser(userId);
    if (loc) this.leave(loc.guild.id);
  }

  // ——— Événements Discord ———
  onVoiceState(oldS, newS) {
    const guild = newS.guild;
    const chanId = this.botChannelId(guild.id);
    if (chanId) {
      // Part tout seul si plus aucun humain n'est dans le salon
      const chan = guild.channels.cache.get(chanId);
      const humans = chan ? chan.members.filter((m) => !m.user.bot).size : 0;
      clearTimeout(this.emptyTimers.get(guild.id));
      if (humans === 0) this.emptyTimers.set(guild.id, setTimeout(() => this.leave(guild.id), EMPTY_LEAVE_MS));
    }
    if (oldS.id === newS.id && oldS.channelId !== newS.channelId) {
      const set = this.speaking.get(guild.id);
      if (set) set.delete(newS.id);
    }
    this.emit("change");
  }

  async onInteraction(i) {
    if (!i.isChatInputCommand()) return;
    const voice = i.member && i.member.voice && i.member.voice.channel;
    if (i.commandName === "hush") {
      if (!voice) return i.reply({ content: "Rejoins d'abord un salon vocal.", flags: MessageFlags.Ephemeral });
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        await this.join(voice);
        await i.editReply(`Hush est dans **${voice.name}**. Ouvre l'appli pour voir le salon.`);
      } catch (e) {
        await i.editReply(e.message);
      }
    } else if (i.commandName === "hush-stop") {
      this.leave(i.guildId);
      await i.reply({ content: "Hush a quitté le salon.", flags: MessageFlags.Ephemeral });
    }
  }
}

module.exports = { StudioBot };
