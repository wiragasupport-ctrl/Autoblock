const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const P = require("pino");
const path = require("path");
const QRCode = require("qrcode");

let sock = null;
let qrCode = null;
let qrDataUrl = null;

let status = {
  connected: false,
  number: null,
  state: "starting"
};

/*
 * Cache kontak yang diketahui oleh WhatsApp.
 * Hanya kontak dengan isMyContact = true yang aman.
 *
 * chattedJids: nomor yang pernah dichat sebelumnya
 * (disinkron saat bot terhubung via chats.upsert).
 * Nomor di sini TIDAK diblokir meski tidak disimpan.
 */
const contacts = new Map();
const chattedJids = new Set();

function normalizeJid(jid) {
  if (!jid) return null;

  return jid.split(":")[0];
}

function isPrivateUserJid(jid) {
  if (!jid) return false;

  return (
    jid.endsWith("@s.whatsapp.net") &&
    !jid.includes("-")
  );
}

function isKnownContact(jid) {
  const normalized = normalizeJid(jid);

  if (!normalized) {
    return true;
  }

  /*
   * Jika WhatsApp mengirim informasi kontak,
   * kita gunakan informasi tersebut.
   */
  const contact = contacts.get(normalized);

  /*
   * Nomor disimpan di kontak telepon = AMAN.
   */
  if (contact && contact.isMyContact === true) {
    return true;
  }

  /*
   * Pernah dichat sebelumnya = AMAN.
   */
  if (chattedJids.has(normalized)) {
    return true;
  }

  /*
   * Tidak disimpan DAN belum pernah dichat = BLOKIR.
   */
  return false;
}

async function blockNumber(jid) {
  if (!sock) return;

  if (!isPrivateUserJid(jid)) {
    return;
  }

  if (isKnownContact(jid)) {
    console.log(
      `[SAFE] Tidak memblokir kontak dikenal: ${jid}`
    );
    return;
  }

  try {
    await sock.updateBlockStatus(
      jid,
      "block"
    );

    console.log(
      `[BLOCKED] ${jid}`
    );
  } catch (error) {
    console.error(
      `[BLOCK ERROR] ${jid}`,
      error
    );
  }
}

async function processIncomingMessage(message) {
  if (!message) return;

  const remoteJid =
    message.key &&
    message.key.remoteJid;

  /*
   * Hanya chat pribadi.
   * Grup tidak diproses.
   */
  if (!isPrivateUserJid(remoteJid)) {
    return;
  }

  /*
   * Jangan proses pesan yang kita kirim sendiri.
   */
  if (message.key.fromMe) {
    return;
  }

  /*
   * Begitu ada pesan masuk:
   *
   * teks
   * gambar
   * video
   * audio
   * voice note
   * dokumen
   * sticker
   * dll
   *
   * semuanya masuk ke fungsi yang sama.
   */

  await blockNumber(remoteJid);
}

async function startWhatsApp() {
  const authPath = path.join(
    __dirname,
    "..",
    "data",
    "auth"
  );

  const {
    state,
    saveCreds
  } = await useMultiFileAuthState(authPath);

  let version;

  try {
    const latest =
      await fetchLatestBaileysVersion();

    version = latest.version;
  } catch {
    version = [2, 3000, 1015901307];
  }

  sock = makeWASocket({
    version,

    auth: state,

    logger: P({
      level: "silent"
    }),

    printQRInTerminal: false,

    browser: [
      "WA Auto Block",
      "Chrome",
      "1.0.0"
    ],

    markOnlineOnConnect: false,

    syncFullHistory: false
  });

  sock.ev.on(
    "creds.update",
    saveCreds
  );

  /*
   * QR LOGIN
   */
  sock.ev.on(
    "connection.update",
    async (update) => {
      const {
        connection,
        lastDisconnect,
        qr
      } = update;

      if (qr) {
        qrCode = qr;
        qrDataUrl = null;

        status.state = "waiting_qr";
        status.connected = false;

        QRCode.toDataURL(qr, {
          width: 400,
          margin: 2,
          errorCorrectionLevel: "H"
        }).then((url) => {
          qrDataUrl = url;
        }).catch((err) => {
          console.error("QR generation error:", err);
        });

        console.log(
          "QR tersedia di web dashboard."
        );
      }

      if (connection === "open") {
        qrCode = null;
        qrDataUrl = null;

        status.connected = true;
        status.state = "connected";

        status.number =
          sock.user?.id || null;

        console.log(
          "WhatsApp connected:",
          status.number
        );
      }

      if (connection === "close") {
        status.connected = false;
        status.state = "disconnected";

        const error =
          lastDisconnect?.error;

        const shouldReconnect =
          error?.output?.statusCode !==
          DisconnectReason.loggedOut;

        console.log(
          "WhatsApp disconnected."
        );

        if (shouldReconnect) {
          console.log(
            "Reconnecting..."
          );

          setTimeout(
            startWhatsApp,
            3000
          );
        } else {
          console.log(
            "Session logged out. Scan QR again."
          );
        }
      }
    }
  );

  /*
   * CONTACT UPDATE
   */
  sock.ev.on(
    "contacts.upsert",
    (items) => {
      for (const contact of items) {
        if (!contact.id) continue;

        const jid =
          normalizeJid(contact.id);

        contacts.set(jid, {
          id: jid,

          name:
            contact.name ||
            contact.notify ||
            null,

          notify:
            contact.notify ||
            null,

          /*
           * Baileys/WhatsApp dapat memberikan
           * isMyContact pada contact tertentu.
           */
          isMyContact:
            contact.isMyContact === true
        });
      }
    }
  );

  sock.ev.on(
    "contacts.update",
    (items) => {
      for (const contact of items) {
        if (!contact.id) continue;

        const jid =
          normalizeJid(contact.id);

        const old =
          contacts.get(jid) || {};

        contacts.set(jid, {
          ...old,
          ...contact,
          id: jid
        });
      }
    }
  );

  /*
   * CHAT HISTORY SYNC
   * Saat bot terhubung, WhatsApp mengirim daftar
   * chat yang sudah ada. Kita catat semua JID
   * yang pernah dichat agar tidak diblokir.
   */
  sock.ev.on(
    "chats.upsert",
    (chats) => {
      for (const chat of chats) {
        if (!chat.id) continue;

        const jid = normalizeJid(chat.id);

        if (isPrivateUserJid(jid)) {
          chattedJids.add(jid);
        }
      }
    }
  );

  /*
   * PESAN MASUK
   * type "notify" = pesan baru real-time.
   * type "append" = pesan dari history sync (diabaikan).
   */
  sock.ev.on(
    "messages.upsert",
    async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const message of messages) {
        try {
          await processIncomingMessage(
            message
          );
        } catch (error) {
          console.error(
            "Message handler error:",
            error
          );
        }
      }
    }
  );

  /*
   * PANGGILAN MASUK
   */
  sock.ev.on(
    "call",
    async (calls) => {
      for (const call of calls) {
        try {
          /*
           * caller/id dapat berbeda tergantung
           * bentuk event dari WhatsApp.
           */
          const caller =
            call.from ||
            call.chatId ||
            call.id;

          if (!caller) continue;

          await blockNumber(
            normalizeJid(caller)
          );
        } catch (error) {
          console.error(
            "Call handler error:",
            error
          );
        }
      }
    }
  );
}

function getStatus() {
  return {
    connected: status.connected,
    number: status.number,
    state: status.state
  };
}

function getQRCode() {
  return qrDataUrl;
}

module.exports = {
  startWhatsApp,
  getStatus,
  getQRCode
};
