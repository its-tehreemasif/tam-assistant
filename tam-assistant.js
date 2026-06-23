/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║           TAM PERSONAL ASSISTANT v2.1                       ║
 * ║              Powered by TAM Tech                          ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

// ⚠️ CRITICAL: Global crypto polyfill for Node.js environments (Render, etc.)
// Required by Baileys for WhatsApp encryption/decryption
const crypto = require('crypto');
if (!global.crypto) global.crypto = crypto;
if (!global.crypto.subtle && crypto.webcrypto) {
    global.crypto.subtle = crypto.webcrypto.subtle;
}

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    delay,
} = require('@whiskeysockets/baileys');

const pino       = require('pino');
const axios      = require('axios');
const express    = require('express');
const app        = express();
app.use(express.urlencoded({ extended: false }));
const PORT       = process.env.PORT || 3000;
const chalk      = require('chalk');
const fs         = require('fs-extra');
const path       = require('path');
const moment     = require('moment-timezone');
const config     = require('./config');
const AIManager  = require('./lib/aiManager');
const { analyzeImage }                        = require('./lib/vision');
const { transcribeVoice, isVoiceMessage }     = require('./lib/voiceTranscription');
const rateLimiter                             = require('./lib/rateLimit');
const persistence                             = require('./lib/persistence');
const { initScheduler, sendDisconnectAlert, sendReconnectAlert, sendAndDelete } = require('./lib/scheduler');
const { getDashboardHTML }                    = require('./lib/dashboard');

// ─── Validate config ──────────────────────────────────────────────────────────
if (!config.aiApiKey) {
    console.error(chalk.red('[FATAL] GROQ_API_KEY is not set.'));
    process.exit(1);
}

if (!config.ownerNumber) {
    console.error(chalk.red('[FATAL] OWNER_NUMBER is not set in environment variables.'));
    process.exit(1);
}

if (!config.alertNumber) {
    console.error(chalk.red('[FATAL] ALERT_NUMBER is not set in environment variables.'));
    process.exit(1);
}

// ─── State ────────────────────────────────────────────────────────────────────
const ai        = new AIManager(config.aiApiKey, config.systemPrompt);
const startTime = Date.now();
let bannedUsers, imageContext, stats;
let activeReminders = new Map(); // id -> timeoutHandle

// Bot socket ref — set once Baileys connects, used by dashboard /cmd endpoint
let _sockRef              = null;
let _ownerJidRef          = null;
let _sessionSaveInterval  = null;
// Owner's LID (Linked ID) — newer WhatsApp uses this for Note to Self instead of phone JID.
// Populated at connection time from sock.user.lid.
let _ownerLid    = null;

// Track IDs of every message the bot itself sends so we can skip their echoes.
// Without this, bot replies to ownerJid come back as isSelfChat=true and the bot
// tries to AI-respond to its own messages → infinite loop.
const _botSentMsgIds = new Set();
setInterval(() => _botSentMsgIds.clear(), 10 * 60 * 1000); // flush every 10 min

// Keyword alert deduplication — prevent recursive alert loops
// Stores: keyword -> Set of (user + keyword_hash) to prevent same keyword from same user triggering twice in 30s
const _keywordAlertDedup = new Map();
setInterval(() => _keywordAlertDedup.clear(), 30 * 1000); // reset every 30s

// Debounced Gist session save. `creds.update` fires many times per minute during
// Signal key rotation. Without coalescing we'd hammer GitHub's 5000/hr rate limit
// AND race against in-flight saveCreds() writes (corrupting the on-disk session).
let _gistSaveTimer = null;
let _savingSession = false;
function debouncedSaveSessionToGist() {
    if (_gistSaveTimer) clearTimeout(_gistSaveTimer);
    _gistSaveTimer = setTimeout(() => {
        _gistSaveTimer = null;
        saveSessionToGist();
    }, 5000); // 5s after the last creds.update — burst-safe
}

const SESSION_PATH = './session_assistant';
// Logger: 'warn' lets real Signal/decryption errors surface without flooding.
// Set LOG_LEVEL=debug temporarily in Render env vars to see EVERYTHING when debugging.
const logger       = pino({ level: process.env.LOG_LEVEL || 'warn' });

// ─── Suppress Baileys/libsignal *cosmetic* session noise ──────────────────────
// We ONLY filter the harmless "old session being garbage collected" lines.
// Bad MAC / Failed to decrypt / Session error are KEPT VISIBLE because they
// are the symptoms you need to see when the bot is misbehaving.
const _NOISE = /Closing open session|Removing old closed session/;
const _origLog   = console.log.bind(console);
const _origWarn  = console.warn.bind(console);
const _origError = console.error.bind(console);
console.log   = (...a) => { if (!_NOISE.test(String(a[0]))) _origLog(...a); };
console.warn  = (...a) => { if (!_NOISE.test(String(a[0]))) _origWarn(...a); };
console.error = (...a) => { if (!_NOISE.test(String(a[0]))) _origError(...a); };

// ─── Session Bootstrap ────────────────────────────────────────────────────────
// Restores the full Baileys session (creds + ALL Signal key files) from Gist.
// Without Signal keys, every incoming message fails MAC verification → null message → ignored.
async function bootstrapSession() {
    fs.ensureDirSync(SESSION_PATH);

    // Priority 1: restore full session (creds + Signal keys) from Gist
    try {
        const sessionData = await persistence.getSessionData();
        if (sessionData && Object.keys(sessionData).length > 0) {
            let count = 0;
            for (const [filename, content] of Object.entries(sessionData)) {
                const filePath = path.join(SESSION_PATH, filename);
                fs.writeFileSync(filePath, typeof content === 'string' ? content : JSON.stringify(content));
                count++;
            }
            console.log(chalk.green(`[AUTH] ✅ Session restored from Gist (${count} files)`));
            return;
        }
    } catch (e) {
        console.error(chalk.yellow('[AUTH] Could not load from Gist:'), e.message);
    }

    // Priority 2: restore session from SESSION_ID env var (CRITICAL: If set, must load or bot won't work)
    const sid = config.sessionId || process.env.SESSION_ID;
    if (sid && sid.length > 50) {
        try {
            const decoded = Buffer.from(sid, 'base64').toString('utf-8');
            const sessionObj = JSON.parse(decoded);
            
            // Full session object with multiple files (creds + signal keys)
            if (typeof sessionObj === 'object' && Object.keys(sessionObj).length > 0) {
                let count = 0;
                for (const [filename, content] of Object.entries(sessionObj)) {
                    const normalizedName = filename.endsWith('.json') ? filename : `${filename}.json`;
                    const filePath = path.join(SESSION_PATH, normalizedName);
                    fs.writeFileSync(filePath, typeof content === 'string' ? content : JSON.stringify(content));
                    count++;
                }
                console.log(chalk.green(`[AUTH] ✅ Session restored from SESSION_ID (${count} files) — NO QR NEEDED`));
                return;
            }
        } catch (e) {
            console.error(chalk.red('[AUTH] SESSION_ID parse failed:'), e.message);
            console.error(chalk.red('[AUTH] Bot cannot proceed without valid session. QR pairing required on next restart.'));
        }
    }

    // If we get here with SESSION_ID set but failed to load, that's a critical error
    if (sid && sid.length > 50) {
        console.error(chalk.red('\n[CRITICAL] SESSION_ID is set but could not be loaded. Bot will not function.'));
        console.error(chalk.red('Please verify SESSION_ID is valid base64-encoded JSON.\n'));
    }
}

// ─── Save full session to Gist ─────────────────────────────────────────────────
async function saveSessionToGist() {
    if (_savingSession) {
        console.log(chalk.gray('[AUTH] Session save already in progress, skipping duplicate'));
        return;
    }
    _savingSession = true;
    try {
        const files = fs.readdirSync(SESSION_PATH);
        const sessionData = {};
        for (const f of files) {
            const fp = path.join(SESSION_PATH, f);
            if (fs.statSync(fp).isFile() && f.endsWith('.json')) {
                try { sessionData[f] = JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch {}
            }
        }
        const count = Object.keys(sessionData).length;
        if (count > 0) {
            await persistence.setSessionData(sessionData);
            console.log(chalk.gray(`[AUTH] Session saved to Gist (${count} files)`));
        }
    } catch (e) {
        console.error(chalk.yellow('[AUTH] Session save failed:'), e.message);
    } finally {
        _savingSession = false;
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Unwrap deviceSentMessage — primary phone messages arrive at linked Render
// device wrapped in this envelope; bot's own outgoing messages do NOT.
function unwrapMessage(msg) {
    return msg?.message?.deviceSentMessage?.message || msg?.message || {};
}

function extractText(msg) {
    try {
        // Try direct fields first (normal incoming messages)
        const raw = msg.message || {};
        if (raw.conversation) return raw.conversation;
        if (raw.extendedTextMessage?.text) return raw.extendedTextMessage.text;
        if (raw.imageMessage?.caption) return raw.imageMessage.caption;
        if (raw.videoMessage?.caption) return raw.videoMessage.caption;
        // Fallback: unwrap deviceSentMessage (primary phone messages to self)
        const inner = raw.deviceSentMessage?.message;
        if (!inner) return '';
        return inner.conversation
            || inner.extendedTextMessage?.text
            || inner.imageMessage?.caption
            || inner.videoMessage?.caption
            || '';
    } catch { return ''; }
}

async function react(sock, msg, emoji) {
    // Skip emoji reactions for dashboard-injected messages (they have no real key to react to)
    if (msg.key.id?.startsWith('DASH_')) return;
    try { await sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } }); } catch {}
}

async function reply(sock, msg, text) {
    const to = msg.key.remoteJid;
    console.log(chalk.blue(`[REPLY] Sending to ${to}: "${String(text).substring(0, 60)}"`));
    try {
        let sent;
        if (msg.key.id?.startsWith('DASH_')) {
            sent = await sock.sendMessage(to, { text });
        } else {
            sent = await sock.sendMessage(to, { text }, { quoted: msg });
        }
        // Track the sent ID so the echo that comes back is ignored
        if (sent?.key?.id) _botSentMsgIds.add(sent.key.id);
    } catch (e) {
        console.error(chalk.red(`[REPLY ERROR] ${e.message}`));
        throw e;
    }
}

// ─── Reminder Scheduler ───────────────────────────────────────────────────────
function scheduleReminder(sock, reminder) {
    const delay_ms = reminder.fireAt - Date.now();
    if (delay_ms <= 0) return;

    const handle = setTimeout(async () => {
        try {
            const msg = `⏰ *Reminder!*\n\n📌 ${reminder.text}\n\n_Set by you earlier._`;
            await sendAndDelete(sock, reminder.jid, msg, [], 120000);
            await persistence.removeReminder(reminder.id);
            activeReminders.delete(reminder.id);
        } catch (e) {
            console.error('[REMINDER] Fire error:', e.message);
        }
    }, delay_ms);

    activeReminders.set(reminder.id, handle);
}

function rescheduleAllReminders(sock) {
    const reminders = persistence.getReminders();
    const now = Date.now();
    for (const r of reminders) {
        if (r.fireAt > now) {
            scheduleReminder(sock, r);
            console.log(chalk.blue(`[REMINDER] Re-scheduled: "${r.text}" in ${Math.round((r.fireAt - now) / 60000)}m`));
        } else {
            persistence.removeReminder(r.id);
        }
    }
}

// ─── Parse reminder time string  ─────────────────────────────────────────────
// Supports: "30min", "2h", "1hour", "45s", "1 hour 30 min"
function parseRemindTime(str) {
    let ms = 0;
    const patterns = [
        { re: /(\d+)\s*h(our)?s?/i, mult: 3600000 },
        { re: /(\d+)\s*m(in)?s?/i,  mult: 60000   },
        { re: /(\d+)\s*s(ec)?s?/i,  mult: 1000    },
    ];
    for (const { re, mult } of patterns) {
        const m = str.match(re);
        if (m) ms += parseInt(m[1]) * mult;
    }
    return ms;
}

// ─── Command: Help (text fallback for dashboard) ──────────────────────────────
function getHelp() {
    return `🤖 *TAM AI — Command Guide*\n━━━━━━━━━━━━━━━━━━━━━\n\n💬 *AI & Vision:*\n• @TAM _[message]_ — Chat with AI\n• !vision — Analyze an image\n• !export — Get your AI chat history\n\n🎙 *Voice:*\n• Send a voice note in DM — auto-transcribes\n• !transcribe — Transcribe voice in a group\n\n📝 *Notes:*  !note add/list/search/del/clear\n⏰ *Reminders:*  !remind [time] [text]\n🌍 *Live Data:*  !weather  !time\n🔧 *Utilities:*  !translate  !calc  !qod  !ping  !reset  !status\n🔒 *Owner:*  !ban  !unban  !banlist  !keyword  !stats  !reset all\n━━━━━━━━━━━━━━━━━━━━━\n_Powered by TAM Tech_ 🚀`;
}

// ─── Command: Help (formatted text) ───────────────────────────────────────────
// User menu — regular users see basic commands
async function sendUserMenu(sock, msg) {
    const menu = `🤖 *TAM AI — Available Commands*
━━━━━━━━━━━━━━━━━━━━━

💬 *Chat & Vision*
› @TAM _[message]_ — Ask a question
› !vision — Analyze a photo

🎙 *Voice*
› Send a voice note — Auto-transcribe
› !transcribe — Transcribe in groups

📝 *Notes*
› !note add _[text]_ / list / search
› !note del _[#]_ / clear

⏰ *Reminders*
› !remind 30min _[text]_
› !remind list / cancel _[#]_

🌍 *Info*
› !weather _[city]_
› !time _[city]_
› !calc _[expression]_
› !ping — Check status

⚙️ *Personal*
› !reset — Clear chat history

━━━━━━━━━━━━━━━━━━━━━
_Need admin? Contact owner_`;
    await reply(sock, msg, menu);
}

// Admin menu — owner gets full command list
async function sendAdminMenu(sock, msg) {
    const help = `🤖 *TAM AI — Admin Command Guide*
━━━━━━━━━━━━━━━━━━━━━

💬 *AI & Vision*
› @TAM _[message]_ — Chat with AI
› !vision — Analyze a photo
› !vision _[question]_ — Ask about image
› !export — Download chat history

🎙 *Voice*
› Send voice note — Auto-transcribe
› !transcribe — Transcribe in groups

📝 *Notes*
› !note add/list/search/del/clear

⏰ *Reminders*
› !remind _[time]_ _[text]_
› !remind list / cancel _[#]_

🌍 *Live Data*
› !weather _[city]_ / !time _[city]_
› !translate _[lang]_ _[text]_
› !calc _[expression]_ / !qod

⚙️ *General*
› !ping / !reset / !status / !stats
› !mydata / !backup

🔐 *Admin Only*
› !ban @user / !unban / !banlist
› !keyword add/del/list
› !!menu — Show user/admin menu
› !reset all — Full reset

🎛️ *Group Control*
› !group enable [link] — Enable bot
› !group disable [link] — Disable bot
› !group list — Show status

━━━━━━━━━━━━━━━━━━━━━
_Powered by TAM Tech_ 🚀`;
    await reply(sock, msg, help);
}

async function sendHelpList(sock, msg, isOwner) {
    if (isOwner) {
        await sendAdminMenu(sock, msg);
    } else {
        await sendUserMenu(sock, msg);
    }
}

// ─── Main ───────────────────────────────────────────────��─────────────────────
let _starting            = false;
let _reconnectTimer      = null;   // single pending reconnect — cancelled if socket opens successfully
let _processStartupSent  = false;  // true after startup msg sent once this process — never re-sends on conflict reconnects
async function startAssistant() {
    if (_starting) { console.log(chalk.yellow('[TAM] Already starting, skipping duplicate call.')); return; }
    _starting = true;
    // Load persistent data
    await persistence.load();
    bannedUsers  = persistence.getBanned();
    imageContext = persistence.getImageContext();
    stats        = persistence.getStats();

    await bootstrapSession();
    console.log(chalk.cyan('\n[TAM] Starting TAM Personal Assistant v2.1 (RENDER-FIXED)...'));

    const { version }          = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

    // Only show QR code if NO SESSION_ID is provided
    const hasSessionId = !!(config.sessionId || process.env.SESSION_ID);
    const shouldPrintQR = !hasSessionId;

    const sock = makeWASocket({
        version,
        logger,
        // Print QR only if no SESSION_ID. If SESSION_ID is set, Baileys will use it directly.
        printQRInTerminal: shouldPrintQR,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        // Don't compete with the primary phone for "online" status — prevents
        // presence-update conflicts and reduces the chance of a logout cascade.
        markOnlineOnConnect: false,
        // Returning undefined lets Baileys use its built-in unavailable-message
        // handling. Returning { conversation: '' } (the previous code) was actively
        // harmful: it told peers "the missing message was an empty string", which
        // corrupts the receiver's Signal ratchet for that conversation.
        getMessage: async (key) => undefined,
        // Reduce unnecessary traffic on free-tier
        generateHighQualityLinkPreview: false,
    });

    // Save credentials to disk (Baileys built-in)
    // Also save full session to Gist so Signal keys survive Render restarts.
    // CRITICAL: await saveCreds() first — otherwise saveSessionToGist() reads
    // session_assistant/ while Baileys is mid-write and snapshots a corrupted
    // creds.json that then gets pushed to the Gist.
    sock.ev.on('creds.update', async () => {
        try {
            await saveCreds();
        } catch (e) {
            console.error(chalk.red('[CREDS] saveCreds error:'), e.message);
        }
        debouncedSaveSessionToGist();
    });

    const ownerJid = config.ownerNumber + '@s.whatsapp.net';
    _ownerJidRef   = ownerJid;
    const alertJid = config.alertNumber.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    let wasConnected = false;

    // ─── Connection Events ────────────────────────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log(chalk.green('[CONNECTION] Online! TAM Assistant v2.1 (RENDER-FIXED) is live.'));
            // Cancel any pending reconnect — this socket made it through successfully
            if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
            _starting = false;
            _sockRef  = sock;

            // Save full session to Gist immediately after connect, then every 10 min
            // as a safety net. The debouncer on creds.update handles real-time saves;
            // this is just a belt-and-braces backup against silent disk-write failures.
            saveSessionToGist();
            if (!_sessionSaveInterval) {
                _sessionSaveInterval = setInterval(saveSessionToGist, 10 * 60 * 1000);
            }

            // Learn owner's LID — newer WhatsApp uses @lid JIDs for Note to Self instead of @s.whatsapp.net
            if (sock.user?.lid) {
                const raw = sock.user.lid;
                // Strip device suffix: "226074646597725.0:11@lid" → "226074646597725.0@lid"
                _ownerLid = raw.includes(':')
                    ? raw.split(':')[0] + '@' + raw.split('@')[1]
                    : raw;
                console.log(chalk.cyan(`[TAM] Owner LID: ${_ownerLid}`));
            }
            initScheduler(sock, ownerJid, () => persistence, () => ai);
            rescheduleAllReminders(sock);

            // Send startup ping — only ONCE per process (conflict reconnects do NOT re-send)
            // Previous process's message is deleted using the persisted key from Gist
            if (!_processStartupSent) {
                _processStartupSent = true;
                try {
                    const prevKey = persistence.getStartupMsgKey();
                    if (prevKey) {
                        try { await sock.sendMessage(ownerJid, { delete: prevKey }); } catch {}
                        await persistence.setStartupMsgKey(null);
                    }
                    const sent = await sock.sendMessage(ownerJid, {
                        text: `✅ *TAM is online*\n_Send !ping to confirm I can read your messages._`
                    });
                    if (sent?.key?.id) _botSentMsgIds.add(sent.key.id);
                    if (sent?.key) await persistence.setStartupMsgKey(sent.key);
                } catch (e) {
                    console.error(chalk.red('[STARTUP MSG ERROR]'), e.message);
                }
            }

            if (wasConnected) {
                await sendReconnectAlert(sock, ownerJid);
            }
            wasConnected = true;
        }

        if (connection === 'close') {
            const code           = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = code !== DisconnectReason.loggedOut;
            const reason         = lastDisconnect?.error?.message || `Code ${code}`;
            console.log(chalk.red(`[CONNECTION] Closed. Reason: ${reason}. Reconnect: ${shouldReconnect}`));

            // If this is still the active socket, clear it so the handler guard drops further events
            if (_sockRef === sock) _sockRef = null;

            if (wasConnected && shouldReconnect) {
                try { await sendDisconnectAlert(sock, ownerJid, reason); } catch {}
            }

            if (shouldReconnect) {
                const isConflict = reason.toLowerCase().includes('conflict');
                _starting = false; // unlock so the scheduled startAssistant can proceed
                // Cancel any existing pending reconnect before scheduling a new one
                if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
                _reconnectTimer = setTimeout(() => {
                    _reconnectTimer = null;
                    // Only reconnect if no socket has taken over during the wait
                    if (!_sockRef) startAssistant();
                }, isConflict ? 30000 : 5000); // 30s for conflicts — gives the other device time to drop
            }
        }
    });

    // ─── Message Handler ──────────────────────────────────────────────────────
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        // Guard: if a newer socket has taken over, discard events from this old one
        if (sock !== _sockRef) return;

        const msg = chatUpdate.messages[0];
        if (!msg) return;

        // Baileys message types:
        //   'notify' — new incoming message (standard DMs, group messages)
        //   'append' — outgoing message sent by this device OR a message synced from
        //              another device (e.g. owner typing in Note to Self on their phone)
        //
        // Note to Self messages sent FROM the primary phone arrive as 'append' on linked
        // devices (the bot). We allow recent append messages that are fromMe+self-chat so
        // the owner's commands in Note to Self are processed. All other append events
        // (history sync, old messages) are dropped via the 90-second recency check.
        if (chatUpdate.type !== 'notify') {
            if (chatUpdate.type === 'append' && msg.key.fromMe) {
                const ts = Number(msg.messageTimestamp || 0) * 1000;
                const age = Date.now() - ts;
                if (age > 90000) return; // older than 90s → history replay, skip
                console.log(chalk.gray(`[MSG-APPEND] fromMe append age=${Math.round(age/1000)}s remote=${msg.key.remoteJid?.split('@')[1]}`));
                // fall through to process this recent self-chat command
            } else {
                return;
            }
        }

        try {
            // ─── Diagnostic: log every event so we can see what's arriving ────
            const _dbgRemote = msg.key.remoteJid?.split('@')[1] || '?';
            const _dbgHasMsg = !!msg.message;
            console.log(chalk.gray(`[UPSERT] type=${chatUpdate.type} fromMe=${msg.key.fromMe} remote=@${_dbgRemote} hasMsg=${_dbgHasMsg}`));

            // Skip echoes of messages the bot itself sent — prevents infinite AI loops
            // where bot replies to ownerJid come back as isSelfChat=true and get re-processed
            if (msg.key.fromMe && _botSentMsgIds.has(msg.key.id)) return;

            // normalizeJid strips device suffix while preserving the correct domain.
            // e.g. 923...:1@s.whatsapp.net → 923...@s.whatsapp.net
            //      226074646597725.0:11@lid → 226074646597725.0@lid   (LID — Note to Self on newer WhatsApp)
            const normalizeJid = (jid) => {
                if (!jid) return jid;
                if (!jid.includes(':')) return jid;
                const [user, rest] = jid.split(':');
                const domain = rest?.includes('@') ? '@' + rest.split('@')[1] : '@s.whatsapp.net';
                return user + domain;
            };

            // Key multidevice insight:
            //   • fromMe=true, remoteJid=ownerJid(@s.whatsapp.net), no deviceSentMessage → Note to Self
            //   • fromMe=true, remoteJid=ownerLid(@lid),             no deviceSentMessage → Note to Self (newer WA)
            //   • fromMe=true, remoteJid=group,    HAS deviceSentMessage → owner typed in group
            //   • fromMe=true, remoteJid=contact,  no deviceSentMessage  → bot's own reply → DROP
            //   • fromMe=true, remoteJid=contact,  HAS deviceSentMessage → owner DMing someone → DROP
            const isFromPrimaryPhone = !!msg.message?.deviceSentMessage;
            const normalizedRemote   = normalizeJid(msg.key.remoteJid);
            const isSelfChat         = msg.key.fromMe && (
                normalizedRemote === ownerJid ||
                (_ownerLid && normalizedRemote === _ownerLid)
            );
            const fromIsGroup        = msg.key.remoteJid?.endsWith('@g.us');

            // Keep: self-chat (Note to Self) and owner commands sent in groups
            // Drop: bot's own outgoing DM replies and owner messages to other contacts
            if (!msg.message) {
                console.log(chalk.red(`[DROP] msg.message=null — Bad MAC / decryption failure for ${msg.key.remoteJid}`));
                return;
            }
            if (msg.key.fromMe && !isSelfChat && !(isFromPrimaryPhone && fromIsGroup)) return;

            // For self-chat, always use phone-number JID for replies so sock.sendMessage works
            // regardless of whether the incoming remoteJid was @s.whatsapp.net or @lid
            const from = isSelfChat ? ownerJid : msg.key.remoteJid;
            // Skip all non-human sources:
            // - Channels/newsletters (any format: @newsletter, @lid, numeric-only @g.us that are channels)
            // - Broadcast lists, status updates
            // - Any private "chat" that isn't a real phone number (@s.whatsapp.net)
            if (from === 'status@broadcast') return;
            if (from.endsWith('@broadcast')) return;
            if (from.endsWith('@newsletter')) return;
            if (!from.endsWith('@g.us') && !from.endsWith('@s.whatsapp.net') && !isSelfChat) return;
            const isGroup     = from.endsWith('@g.us');
            // For self-chat or group messages from primary phone, resolve participant correctly
            // normalizeJid strips device suffix (e.g. 923...:1@s.whatsapp.net → 923...@s.whatsapp.net)
            const rawParticipant = isGroup ? msg.key.participant : (isSelfChat ? ownerJid : from);
            const participant    = normalizeJid(rawParticipant) || rawParticipant;
            const pushName    = msg.pushName || 'User';
            // isOwner must cover BOTH phone JID and LID — in groups the owner's
            // participant arrives as the LID (226074646597725@lid) not the phone JID
            const isOwner     = participant === ownerJid || (_ownerLid && participant === _ownerLid);
            const isDM        = !isGroup;
            const text        = extractText(msg);
            const textLower   = text.toLowerCase().trim();

            // ─── Rate limiting + auto-ban ─────────────────────────────────────
            // Silently ignore — never send ban/rate-limit messages anywhere
            if (!isOwner && text) {
                const check = rateLimiter.checkMessage(participant);
                if (!check.allowed) {
                    if (check.autoban) {
                        bannedUsers = persistence.getBanned();
                        bannedUsers.add(participant);
                        await persistence.setBanned(bannedUsers);
                        console.log(chalk.red(`[AUTOBAN] ${pushName} (${participant}) auto-banned for spam`));
                    }
                    return;
                }
            }

            // ─── Ban check ────────────────────────────────────────────────────
            // Silently ignore banned users everywhere
            bannedUsers = persistence.getBanned();
            if (bannedUsers.has(participant) && !isOwner) {
                return;
            }

            // ─── Group whitelist check ────────────────────────────────────────
            // RULE: Personal chat (self-chat or DM) = ALWAYS allowed
            // RULE: Group with whitelist = only if in allowedGroups
            // RULE: Group without whitelist = check enforceGroupWhitelist flag
            if (isGroup && config.enforceGroupWhitelist && config.allowedGroups.length > 0) {
                const groupId = from.trim();
                if (!config.allowedGroups.some(g => g.trim() === groupId)) {
                    // Silently ignore commands from non-whitelisted groups
                    return;
                }
            }

            // ─── Track message stats ──────────────────────────────────────────
            if (text) await persistence.incrementStat('totalMessages', participant);

            // =================================================================
            // 🎙 VOICE TRANSCRIPTION
            // DMs  → auto-transcribe every voice note
            // Groups → only when someone replies to a voice note with .transcribe
            // =================================================================
            if (isVoiceMessage(msg) && isDM) {
                // Auto-transcribe in DMs only
                console.log(chalk.magenta(`[VOICE] Auto-transcribing DM voice note from ${pushName}`));
                await react(sock, msg, '🎙');
                await sock.sendPresenceUpdate('recording', from);

                const result = await transcribeVoice(msg, config.aiApiKey);
                await persistence.incrementStat('totalVoiceTranscriptions', participant);

                if (result.success) {
                    const durationStr = result.duration ? ` _(${result.duration}s)_` : '';
                    await reply(sock, msg,
                        `🎙 *Voice Transcription*${durationStr}\n\n"${result.text}"\n\n_💡 @TAM can answer questions about this._`
                    );
                    imageContext = persistence.getImageContext();
                    imageContext.set(participant, { text: result.text, timestamp: Date.now() });
                    await persistence.setImageContext(imageContext);
                } else {
                    await reply(sock, msg, `❌ *Transcription failed*\n_${result.error}_`);
                }

                await sock.sendPresenceUpdate('paused', from);
                return;
            }

            console.log(chalk.cyan(`[EXTRACTED] fromMe=${msg.key.fromMe} isSelf=${isSelfChat} text="${text.substring(0,60)}" participant=${participant}`));
            if (!text) return;

            // =================================================================
            // 🎙 .TRANSCRIBE — manual command for groups (reply to a voice note)
            // =================================================================
            if (textLower === '!transcribe') {
                const effectiveMsgContent = unwrapMessage(msg);
                const quotedMsg = effectiveMsgContent?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (!quotedMsg) {
                    await reply(sock, msg, `❌ *Reply to a voice note* with !transcribe`);
                    return;
                }
                // Build a fake message wrapper so transcribeVoice can download it
                const fakeMsg = { ...msg, message: quotedMsg };
                if (!isVoiceMessage(fakeMsg)) {
                    await reply(sock, msg, `❌ *That message isn't a voice note.*`);
                    return;
                }

                console.log(chalk.magenta(`[VOICE] Manual transcribe in group by ${pushName}`));
                await react(sock, msg, '🎙');
                await sock.sendPresenceUpdate('recording', from);

                const result = await transcribeVoice(fakeMsg, config.aiApiKey);
                await persistence.incrementStat('totalVoiceTranscriptions', participant);

                if (result.success) {
                    const durationStr = result.duration ? ` _(${result.duration}s)_` : '';
                    await reply(sock, msg,
                        `🎙 *Voice Transcription*${durationStr}\n\n"${result.text}"\n\n_💡 @TAM can answer questions about this._`
                    );
                    imageContext = persistence.getImageContext();
                    imageContext.set(participant, { text: result.text, timestamp: Date.now() });
                    await persistence.setImageContext(imageContext);
                } else {
                    await reply(sock, msg, `❌ *Transcription failed*\n_${result.error}_`);
                }

                await sock.sendPresenceUpdate('paused', from);
                return;
            }

            console.log(chalk.gray(`[MSG] ${participant} (${isGroup ? 'Group' : 'DM'}): "${text.substring(0, 60)}"`));

            // =================================================================
            // COMMANDS
            // =================================================================

            // .ping
            if (textLower === '!ping') {
                await reply(sock, msg, `🏓 *Pong!* ⚡\n_TAM AI is alive._`);
                return;
            }

            // .help — show appropriate menu based on permissions
            if (textLower === '!help' || textLower === '!menu') {
                await sendHelpList(sock, msg, isOwner);
                return;
            }

            // .reset (own conversation)
            if (textLower === '!reset') {
                ai.resetConversation(participant);
                imageContext = persistence.getImageContext();
                imageContext.delete(participant);
                await persistence.setImageContext(imageContext);
                await reply(sock, msg, `🧹 *Conversation reset!*\n_Starting fresh._ ✨`);
                return;
            }

            // .vision
            if (textLower.startsWith('!vision')) {
                console.log(chalk.green(`[VISION] Request from ${pushName}`));
                await react(sock, msg, '⚡');
                if (isDM) await sock.sendPresenceUpdate('recording', from);

                const userQuestion = text.replace(/^!vision\s*/i, '').trim();
                const result       = await analyzeImage(sock, msg, userQuestion);

                if (result.success) {
                    imageContext = persistence.getImageContext();
                    imageContext.set(participant, { text: result.result, timestamp: Date.now() });
                    await persistence.setImageContext(imageContext);
                    await persistence.incrementStat('totalVisionRequests', participant);

                    if (result.source === 'groq-vision') {
                        await reply(sock, msg,
                            `🔍 *Vision Analysis*\n\n${result.result}\n\n> 💬 _Ask follow-up questions using @TAM!_`
                        );
                    } else {
                        const aiPrompt = userQuestion
                            ? `Image text: "${result.result}"\n\nQuestion: "${userQuestion}"\n\nAnswer thoroughly.`
                            : `Image text: "${result.result}"\n\nAnalyze and explain professionally.`;
                        const aiResult = await ai.chat(participant, aiPrompt);
                        await persistence.incrementStat('totalAIResponses', participant);
                        await reply(sock, msg,
                            `🔍 *Vision Analysis*\n\n${aiResult.success ? aiResult.message : result.result}\n\n> 💬 _Ask follow-up questions using @TAM!_`
                        );
                    }
                } else {
                    await reply(sock, msg, `❌ *Vision Error*\n\n${result.error}`);
                }

                if (isDM) await sock.sendPresenceUpdate('paused', from);
                return;
            }

            // .note
            if (textLower.startsWith('!note')) {
                const parts  = text.replace(/^!note\s*/i, '').trim();
                const cmd    = parts.split(' ')[0]?.toLowerCase();
                const body   = parts.replace(/^\S+\s*/, '').trim();
                const notes  = persistence.getNotes(participant);

                if (cmd === 'add' && body) {
                    await persistence.addNote(participant, body);
                    await reply(sock, msg, `📝 *Note saved!*\n\n"${body}"\n\n_You have ${notes.length + 1} note(s). Use !note list to view._`);
                } else if (cmd === 'list') {
                    if (notes.length === 0) {
                        await reply(sock, msg, `📋 *Notes*\n\n_No notes yet. Use !note add [text] to add one._`);
                    } else {
                        const list = notes.map((n, i) => `${i + 1}. ${n.text}\n   _${n.createdAt}_`).join('\n\n');
                        await reply(sock, msg, `📋 *Your Notes (${notes.length})*\n\n${list}`);
                    }
                } else if (cmd === 'del' || cmd === 'delete') {
                    const idx = parseInt(body) - 1;
                    if (isNaN(idx)) {
                        await reply(sock, msg, `❌ *Usage:* !note del [number]\n_e.g. !note del 2_`);
                    } else {
                        const deleted = await persistence.deleteNote(participant, idx);
                        await reply(sock, msg, deleted
                            ? `🗑 *Note deleted.*`
                            : `❌ *Note #${idx + 1} not found.*`
                        );
                    }
                } else if (cmd === 'search') {
                    if (!body) {
                        await reply(sock, msg, `🔍 *Usage:* !note search [keyword]`);
                    } else {
                        const results = notes
                            .map((n, i) => ({ ...n, idx: i + 1 }))
                            .filter(n => n.text.toLowerCase().includes(body.toLowerCase()));
                        if (results.length === 0) {
                            await reply(sock, msg, `🔍 *No notes matching "${body}"*\n_Try a different keyword._`);
                        } else {
                            const list = results.map(n => `${n.idx}. ${n.text}\n   _${n.createdAt}_`).join('\n\n');
                            await reply(sock, msg, `🔍 *Notes matching "${body}" (${results.length})*\n\n${list}`);
                        }
                    }
                } else if (cmd === 'clear') {
                    await persistence.clearNotes(participant);
                    await reply(sock, msg, `🧹 *All notes cleared.*`);
                } else {
                    await reply(sock, msg, `📝 *Notes Commands:*\n• !note add [text]\n• !note list\n• !note search [keyword]\n• !note del [#]\n• !note clear`);
                }
                return;
            }

            // .remind
            if (textLower.startsWith('!remind')) {
                const body = text.replace(/^!remind\s*/i, '').trim();

                // .remind list
                if (!body || body.toLowerCase() === 'list') {
                    const all = persistence.getReminders().filter(r => r.userId === participant);
                    if (all.length === 0) {
                        await reply(sock, msg, `📋 *No pending reminders.*\n_Use !remind [time] [text] to set one._`);
                    } else {
                        const list = all.map((r, i) => {
                            const fireTime = moment(r.fireAt).tz('Asia/Karachi').format('hh:mm A, DD MMM');
                            return `${i + 1}. 📌 "${r.text}"\n   🕐 ${fireTime}`;
                        }).join('\n\n');
                        await reply(sock, msg, `⏰ *Pending Reminders (${all.length})*\n\n${list}\n\n_Use !remind cancel [#] to cancel one._`);
                    }
                    return;
                }

                // .remind cancel [#]
                if (body.match(/^cancel\s+\d+/i)) {
                    const idx = parseInt(body.replace(/^cancel\s+/i, '')) - 1;
                    const all = persistence.getReminders().filter(r => r.userId === participant);
                    if (idx < 0 || idx >= all.length) {
                        await reply(sock, msg, `❌ *Invalid number.* Use !remind list to see your reminders.`);
                        return;
                    }
                    const r = all[idx];
                    const handle = activeReminders.get(r.id);
                    if (handle) clearTimeout(handle);
                    activeReminders.delete(r.id);
                    await persistence.removeReminder(r.id);
                    await reply(sock, msg, `✅ *Reminder cancelled:* "${r.text}"`);
                    return;
                }

                // .remind [time] [text]
                const timeMatch = body.match(/^([\d\s]+(?:h(?:our)?s?|m(?:in)?s?|s(?:ec)?s?)\s*)+/i);
                if (!timeMatch) {
                    await reply(sock, msg, `❌ *Invalid format.*\n_Examples:_\n• !remind 30min Call client\n• !remind 2h Check emails\n• !remind list\n• !remind cancel 1`);
                    return;
                }

                const timeStr      = timeMatch[0].trim();
                const reminderText = body.replace(timeMatch[0], '').trim();

                if (!reminderText) {
                    await reply(sock, msg, `❌ *Please include a message.*\n_e.g. !remind 30min Call the client_`);
                    return;
                }

                const ms = parseRemindTime(timeStr);
                if (ms <= 0 || ms > 24 * 60 * 60 * 1000) {
                    await reply(sock, msg, `❌ *Invalid time.* Use between 1 minute and 24 hours.`);
                    return;
                }

                const fireAt   = Date.now() + ms;
                const reminder = await persistence.addReminder(participant, from, reminderText, fireAt);
                scheduleReminder(sock, reminder);

                const fireTime = moment(fireAt).tz('Asia/Karachi').format('hh:mm A');
                const minsStr  = Math.round(ms / 60000);
                await reply(sock, msg,
                    `⏰ *Reminder Set!*\n\n📌 "${reminderText}"\n🕐 In ${minsStr < 60 ? `${minsStr} min` : `${Math.round(minsStr / 60)}h`} (at ${fireTime} PKT)\n\n_I'll ping you when it's time._ ✅`
                );
                return;
            }

            // =================================================================
            // OWNER-ONLY COMMANDS
            // =================================================================
            if (isOwner) {
                // .status
                if (textLower === '!status') {
                    stats          = persistence.getStats();
                    bannedUsers    = persistence.getBanned();
                    const uptime   = Date.now() - startTime;
                    const d        = Math.floor(uptime / 86400000);
                    const h        = Math.floor((uptime % 86400000) / 3600000);
                    const m        = Math.floor((uptime % 3600000) / 60000);
                    const uStr     = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
                    const aiInfo   = ai.getInfo();
                    const now      = moment().tz('Asia/Karachi').format('DD MMM YYYY, hh:mm A');
                    await reply(sock, msg,
                        `⚡ *TAM AI — Status*\n\n🟢 Online & Running\n⏱ Uptime: ${uStr}\n🕐 ${now}\n\n🤖 *AI:* ${aiInfo.model}\n• Active chats: ${aiInfo.activeConversations}\n• Total calls: ${aiInfo.totalCalls}\n\n📊 *Stats:*\n• Messages: ${stats.totalMessages}\n• AI responses: ${stats.totalAIResponses}\n• Vision: ${stats.totalVisionRequests}\n• Voice: ${stats.totalVoiceTranscriptions || 0}\n• Alerts: ${stats.totalKeywordAlerts}\n• Banned: ${bannedUsers.size}`
                    );
                    return;
                }

                // .stats
                if (textLower === '!stats') {
                    stats = persistence.getStats();
                    const topUsers = Object.entries(stats.perUser || {})
                        .sort((a, b) => b[1].messages - a[1].messages)
                        .slice(0, 10);
                    let msg2 = `📊 *TAM AI — Usage Stats*\n\n📨 Messages: *${stats.totalMessages}*\n🤖 AI Responses: *${stats.totalAIResponses}*\n🔍 Vision: *${stats.totalVisionRequests}*\n🎙 Voice: *${stats.totalVoiceTranscriptions || 0}*\n🔔 Alerts: *${stats.totalKeywordAlerts}*\n\n`;
                    if (topUsers.length > 0) {
                        msg2 += `👥 *Top Users:*\n`;
                        topUsers.forEach(([jid, u], i) => {
                            msg2 += `${i + 1}. +${jid.split('@')[0]} — ${u.messages} msgs\n`;
                        });
                    }
                    await reply(sock, msg, msg2);
                    return;
                }

                // .reset all
                if (textLower === '!reset all') {
                    const count = ai.conversations.size;
                    ai.conversations.clear();
                    await reply(sock, msg, `🧹 *All ${count} conversation(s) cleared.*`);
                    return;
                }

                // .ban
                if (textLower.startsWith('!ban') && !textLower.startsWith('!banlist')) {
                    const mentioned = unwrapMessage(msg)?.extendedTextMessage?.contextInfo?.mentionedJid || [];
                    let targetJid   = mentioned[0];
                    if (!targetJid) {
                        const raw = text.replace(/^!ban\s*/i, '').replace(/[^0-9]/g, '').trim();
                        if (raw.length >= 10) targetJid = raw + '@s.whatsapp.net';
                    }
                    if (!targetJid) { await reply(sock, msg, '❌ *Usage:* !ban @user _or_ !ban 923xxxxxxxxx'); return; }
                    if (targetJid === ownerJid) { await reply(sock, msg, `😅 _You can't ban yourself!_`); return; }
                    bannedUsers.add(targetJid);
                    await persistence.setBanned(bannedUsers);
                    await reply(sock, msg, `🚫 *Banned:* +${targetJid.split('@')[0]}\n_Use !unban to reverse._`);
                    return;
                }

                // .unban
                if (textLower.startsWith('!unban')) {
                    const mentioned = unwrapMessage(msg)?.extendedTextMessage?.contextInfo?.mentionedJid || [];
                    let targetJid   = mentioned[0];
                    if (!targetJid) {
                        const raw = text.replace(/^!unban\s*/i, '').replace(/[^0-9]/g, '').trim();
                        if (raw.length >= 10) targetJid = raw + '@s.whatsapp.net';
                    }
                    if (!targetJid) { await reply(sock, msg, '❌ *Usage:* !unban @user _or_ !unban 923xxxxxxxxx'); return; }
                    bannedUsers.delete(targetJid);
                    await persistence.setBanned(bannedUsers);
                    await reply(sock, msg, `✅ *Unbanned:* +${targetJid.split('@')[0]}`);
                    return;
                }

                // .keyword — manage alert keywords
                if (textLower.startsWith('!keyword')) {
                    const kParts = text.replace(/^!keyword\s*/i, '').trim();
                    const kCmd   = kParts.split(' ')[0]?.toLowerCase();
                    const kWord  = kParts.replace(/^\S+\s*/, '').trim();
                    if (!kCmd || kCmd === 'list') {
                        const kws = persistence.getKeywords();
                        await reply(sock, msg, `🔔 *Alert Keywords (${kws.length})*\n\n${kws.map((k, i) => `${i + 1}. ${k}`).join('\n')}\n\n_Use !keyword add [word] or !keyword del [word]_`);
                    } else if (kCmd === 'add' && kWord) {
                        const added = await persistence.addKeyword(kWord);
                        await reply(sock, msg, added
                            ? `✅ *Keyword added:* "${kWord}"`
                            : `⚠️ *"${kWord}" is already in your list.*`
                        );
                    } else if ((kCmd === 'del' || kCmd === 'delete') && kWord) {
                        const removed = await persistence.removeKeyword(kWord);
                        await reply(sock, msg, removed
                            ? `🗑 *Keyword removed:* "${kWord}"`
                            : `❌ *"${kWord}" not found.*`
                        );
                    } else {
                        await reply(sock, msg, `🔔 *Keyword Commands:*\n• !keyword list\n• !keyword add [word]\n• !keyword del [word]`);
                    }
                    return;
                }

                // .banlist
                if (textLower === '!banlist') {
                    bannedUsers = persistence.getBanned();
                    if (bannedUsers.size === 0) {
                        await reply(sock, msg, `📋 *Ban List*\n\n_No banned users._ ✅`);
                    } else {
                        let list = `🚫 *Banned Users (${bannedUsers.size})*\n\n`;
                        let i = 1;
                        bannedUsers.forEach(jid => { list += `${i++}. +${jid.split('@')[0]}\n`; });
                        await reply(sock, msg, list);
                    }
                    return;
                }

                // .group enable [link] — enable bot in a group
                if (textLower.startsWith('!group enable')) {
                    const link = text.replace(/^!group enable\s*/i, '').trim();
                    if (!link) {
                        await reply(sock, msg, `🎛️ *Usage:* !group enable [group_link]\n_The bot will only work in whitelisted groups after this._`);
                        return;
                    }
                    // Extract group ID from link if it's a link, otherwise use as direct ID
                    let groupId = link;
                    if (link.includes('chat.whatsapp.com')) {
                        // In production, you'd extract the actual group ID from the link
                        // For now, just store the link as-is
                        groupId = link;
                    }
                    
                    // Add to allowed groups
                    const allowedGroups = persistence.getAllowedGroups() || [];
                    if (!allowedGroups.includes(groupId)) {
                        allowedGroups.push(groupId);
                        persistence.setAllowedGroups(allowedGroups);
                        await reply(sock, msg, `✅ *Group Enabled*\n\n_Bot will now respond in this group._`);
                    } else {
                        await reply(sock, msg, `ℹ️ *Already Enabled*\n\n_This group is already in the whitelist._`);
                    }
                    return;
                }

                // .group disable [link] — disable bot in a group
                if (textLower.startsWith('!group disable')) {
                    const link = text.replace(/^!group disable\s*/i, '').trim();
                    if (!link) {
                        await reply(sock, msg, `🎛️ *Usage:* !group disable [group_link]\n_The bot will stop responding in this group._`);
                        return;
                    }
                    
                    let groupId = link;
                    const allowedGroups = persistence.getAllowedGroups() || [];
                    const idx = allowedGroups.indexOf(groupId);
                    if (idx !== -1) {
                        allowedGroups.splice(idx, 1);
                        persistence.setAllowedGroups(allowedGroups);
                        await reply(sock, msg, `🚫 *Group Disabled*\n\n_Bot will no longer respond in this group._`);
                    } else {
                        await reply(sock, msg, `ℹ️ *Not in Whitelist*\n\n_This group isn't in the whitelist yet._`);
                    }
                    return;
                }

                // .group list — show enabled groups
                if (textLower === '!group list') {
                    const allowedGroups = persistence.getAllowedGroups() || [];
                    if (allowedGroups.length === 0) {
                        await reply(sock, msg, `📋 *Group Whitelist*\n\n_No groups whitelisted. Bot works everywhere._`);
                    } else {
                        let list = `📋 *Enabled Groups (${allowedGroups.length})*\n\n`;
                        allowedGroups.forEach((g, i) => { list += `${i + 1}. ${g.substring(0, 40)}...\n`; });
                        await reply(sock, msg, list);
                    }
                    return;
                }
            }

            // =================================================================
            // 🌐 .TRANSLATE — translate text using AI
            // =================================================================
            if (textLower.startsWith('!translate')) {
                const parts    = text.replace(/^!translate\s*/i, '').trim();
                const spaceIdx = parts.indexOf(' ');
                if (spaceIdx === -1) {
                    await reply(sock, msg, `🌐 *Usage:* !translate [language] [text]\n_e.g. !translate arabic Good morning_`);
                    return;
                }
                const lang     = parts.substring(0, spaceIdx);
                const toTranslate = parts.substring(spaceIdx + 1).trim();
                await react(sock, msg, '🌐');
                if (isDM) await sock.sendPresenceUpdate('recording', from);
                const tKey   = participant + '_translate';
                const result = await ai.chat(tKey, `Translate the following text to ${lang}. Return ONLY the translated text, nothing else:\n\n"${toTranslate}"`);
                ai.resetConversation(tKey);
                await reply(sock, msg, result.success
                    ? `🌐 *Translated to ${lang}:*\n\n${result.message}`
                    : `❌ *Translation failed.* Try again.`
                );
                if (isDM) await sock.sendPresenceUpdate('paused', from);
                return;
            }

            // =================================================================
            // 🧮 .CALC — quick calculations using AI
            // =================================================================
            if (textLower.startsWith('!calc')) {
                const expr = text.replace(/^!calc\s*/i, '').trim();
                if (!expr) {
                    await reply(sock, msg, `🧮 *Usage:* !calc [expression]\n_e.g. !calc 15% of 85000_`);
                    return;
                }
                await react(sock, msg, '🧮');
                const cKey   = participant + '_calc';
                const result = await ai.chat(cKey, `Calculate this and return the answer with a brief one-line explanation. Be concise:\n${expr}`);
                ai.resetConversation(cKey);
                await reply(sock, msg, result.success
                    ? `🧮 *Result*\n\n${result.message}`
                    : `❌ *Could not calculate.*`
                );
                return;
            }

            // =================================================================
            // ✨ .QOD — quote of the day on demand
            // =================================================================
            if (textLower === '!qod') {
                await react(sock, msg, '✨');
                if (isDM) await sock.sendPresenceUpdate('recording', from);
                const qKey   = participant + '_qod';
                const result = await ai.chat(qKey, 'Give me one powerful motivational quote with author name. Format exactly: "Quote" — Author. Nothing else.');
                ai.resetConversation(qKey);
                await reply(sock, msg, result.success
                    ? `✨ *Quote of the Day*\n\n${result.message}`
                    : `❌ *Could not fetch a quote.*`
                );
                if (isDM) await sock.sendPresenceUpdate('paused', from);
                return;
            }

            // =================================================================
            // 📤 .EXPORT — send AI chat history as text
            // =================================================================
            if (textLower === '!export') {
                const history = ai.getHistory(participant);
                if (history.length === 0) {
                    await reply(sock, msg, `📭 *No chat history to export.*\n_Start a conversation with @TAM first._`);
                    return;
                }
                let exportText = `🤖 *TAM AI — Chat Export*\n📅 ${moment().tz('Asia/Karachi').format('DD MMM YYYY, hh:mm A')}\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
                history.forEach(h => {
                    const role = h.role === 'user' ? '👤 *You:*' : '🤖 *TAM AI:*';
                    exportText += `${role}\n${h.content}\n\n`;
                });
                await reply(sock, msg, exportText);
                return;
            }

            // =================================================================
            // 🌤 .WEATHER — live weather via wttr.in (no API key needed)
            // =================================================================
            if (textLower.startsWith('!weather')) {
                const city = text.replace(/^!weather\s*/i, '').trim() || 'Karachi';
                await react(sock, msg, '🌤');
                if (isDM) await sock.sendPresenceUpdate('recording', from);
                try {
                    const res = await axios.get(
                        `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
                        { timeout: 15000 }
                    );
                    const w       = res.data;
                    const cur     = w.current_condition[0];
                    const area    = w.nearest_area[0];
                    const name    = area.areaName[0].value;
                    const country = area.country[0].value;
                    const desc    = cur.weatherDesc[0].value;
                    const tempC   = cur.temp_C;
                    const feelsC  = cur.FeelsLikeC;
                    const humid   = cur.humidity;
                    const wind    = cur.windspeedKmph;
                    const vis     = cur.visibility;
                    await reply(sock, msg,
                        `🌤 *Weather — ${name}, ${country}*\n━━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `🌡 *Temperature:* ${tempC}°C _(feels like ${feelsC}°C)_\n` +
                        `⛅ *Condition:* ${desc}\n` +
                        `💧 *Humidity:* ${humid}%\n` +
                        `💨 *Wind:* ${wind} km/h\n` +
                        `👁 *Visibility:* ${vis} km\n\n` +
                        `_📍 ${name}, ${country}_`
                    );
                } catch {
                    await reply(sock, msg, `❌ *Weather unavailable for "${city}"*\n_Check the city name and try again._`);
                }
                if (isDM) await sock.sendPresenceUpdate('paused', from);
                return;
            }

            // =================================================================
            // 🕐 .TIME — current time in any city/timezone
            // =================================================================
            if (textLower.startsWith('!time')) {
                const input = text.replace(/^!time\s*/i, '').trim();
                if (!input) {
                    const now = moment().tz('Asia/Karachi').format('hh:mm A');
                    const date = moment().tz('Asia/Karachi').format('DD MMM YYYY');
                    await reply(sock, msg, `🕐 *Current Time (PKT)*\n\n*${now}*\n📅 ${date}`);
                    return;
                }
                const allZones = moment.tz.names();
                const lInput   = input.toLowerCase().replace(/\s+/g, '_');
                const match    = allZones.find(z => z.toLowerCase() === lInput) ||
                                 allZones.find(z => z.toLowerCase().endsWith('/' + lInput)) ||
                                 allZones.find(z => z.toLowerCase().includes(lInput));
                if (!match) {
                    await reply(sock, msg, `❌ *City not found: "${input}"*\n\n_Try:_\n• .time London\n• .time Dubai\n• .time New_York\n• .time Tokyo`);
                    return;
                }
                const timeStr = moment().tz(match).format('hh:mm A');
                const dateStr = moment().tz(match).format('DD MMM YYYY');
                const offset  = moment().tz(match).format('Z');
                await reply(sock, msg, `🕐 *Time — ${match.split('/').pop().replace(/_/g, ' ')}*\n\n*${timeStr}*\n📅 ${dateStr}\n🌍 UTC${offset}`);
                return;
            }

            // =================================================================
            // KEYWORD MONITOR — alert owner (with recursion prevention)
            // CRITICAL FIX: Skip bot's own messages + dedup to prevent loops
            // =================================================================
            if (!msg.key.fromMe) { // Never alert on bot's own messages
                const matchedKeyword = persistence.getKeywords().find(kw => {
                    try { return new RegExp(`\\b${kw}\\b`, 'i').test(text); } catch { return false; }
                });
                
                if (matchedKeyword) {
                    // Dedup key: keyword + participant to prevent same user triggering twice
                    const dedupKey = `${matchedKeyword}:${participant}`;
                    const keywordSet = _keywordAlertDedup.get(matchedKeyword) || new Set();
                    
                    // Skip if this exact keyword from this user was already alerted in last 30s
                    if (!keywordSet.has(dedupKey)) {
                        console.log(chalk.yellow(`[MONITOR] Keyword "${matchedKeyword}" from ${pushName}`));
                        let groupName = 'Private Chat';
                        if (isGroup) {
                            try { groupName = (await sock.groupMetadata(from)).subject; } catch {}
                        }
                        const cleanMsg = text.replace(/\n/g, ' ').substring(0, 80);
                        // Professional format - no recursive keywords in alert
                        const alert = `🔔 Keyword Alert\n👤 User: ${pushName}\n💬 "${cleanMsg}"\n📍 ${groupName}\n⏰ ${moment().tz('Asia/Karachi').format('hh:mm A')}`;
                        await sock.sendMessage(alertJid, { text: alert });
                        await persistence.incrementStat('totalKeywordAlerts');
                        
                        // Mark as alerted
                        keywordSet.add(dedupKey);
                        _keywordAlertDedup.set(matchedKeyword, keywordSet);
                    }
                }
            }

            // =================================================================
            // AI RESPONSE - PROFESSIONAL FIX
            // • Owner DMs / Note to Self → respond to EVERY message (no @TAM needed)
            // • OTHER USER DMs            → respond if @TAM mentioned (everyone can use bot)
            // • Groups                    → require @TAM / wake tag / JID mention
            // =================================================================
            const hasTag           = config.wakeTags.some(t => textLower.includes(t));
            const effectiveMsg     = unwrapMessage(msg);
            // mentionedJid entries may carry device suffixes (e.g. 923...:5@s.whatsapp.net)
            // so normalise each before comparing to ownerJid (stripped phone JID)
            const mentionedJids    = effectiveMsg?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const isJidMentioned   = mentionedJids.some(jid => normalizeJid(jid) === ownerJid);
            
            // FIXED: Allow regular users to chat in DMs if they mention @TAM
            const shouldRespond    = (isDM && isOwner) || (isDM && hasTag) || hasTag || isJidMentioned;

            if (shouldRespond) {
                if (!isOwner) {
                    const aiCheck = rateLimiter.checkAI(participant);
                    if (!aiCheck.allowed) {
                        await reply(sock, msg, `⏳ *Too many AI requests.*\n_Wait ${aiCheck.resetIn}s before asking again._`);
                        return;
                    }
                }

                console.log(chalk.cyan(`[AI] Responding to ${pushName}`));
                await react(sock, msg, '⚡');
                // Show "recording audio" status ONLY in DMs (not in group chats)
                if (isDM) await sock.sendPresenceUpdate('recording', from);

                let userMessage = text.replace(/@\S+/g, '').trim();
                if (!userMessage) userMessage = text; // fallback if entire text was @mentions

                // Inject image/voice context if fresh
                imageContext      = persistence.getImageContext();
                const storedCtx   = imageContext.get(participant);
                if (storedCtx && (Date.now() - storedCtx.timestamp) < 10 * 60 * 1000) {
                    userMessage = `[Context from earlier: "${storedCtx.text.substring(0, 500)}"]\n\nUser: ${userMessage}`;
                    console.log(chalk.green('[AI] Injecting stored context'));
                }

                const aiResponse = await ai.chat(participant, userMessage);
                await persistence.incrementStat('totalAIResponses', participant);

                if (aiResponse.success) {
                    await reply(sock, msg, aiResponse.message);
                } else {
                    await reply(sock, msg, `❌ *AI Error*\n\n_${aiResponse.error}_\n_Please try again._`);
                }

                if (isDM) await sock.sendPresenceUpdate('paused', from);
            }

        } catch (e) {
            console.error(chalk.red('[ERROR]'), e.message);
        }
    });
}

// ─── Dashboard Auth ────────────────────────────────────────────────────────���───
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'tam2024';
const SESSION_SECRET_KEY = process.env.SESSION_SECRET || 'tam-secret-key';

function makeCookieToken() {
    return crypto.createHmac('sha256', SESSION_SECRET_KEY).update(DASHBOARD_PASSWORD).digest('hex');
}
function parseCookies(header = '') {
    const out = {};
    header.split(';').forEach(part => {
        const [k, ...v] = part.trim().split('=');
        if (k) out[k.trim()] = decodeURIComponent(v.join('='));
    });
    return out;
}
function isAuthenticated(req) {
    return parseCookies(req.headers.cookie || '').tam_auth === makeCookieToken();
}

function getLoginHTML(error = false) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TAM Assistant — Login</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background: #0a0a0f;
            color: #e2e8f0;
            font-family: 'Segoe UI', system-ui, sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .card {
            background: #0f172a;
            border: 1px solid #1e293b;
            border-radius: 20px;
            padding: 40px 36px;
            width: 100%;
            max-width: 380px;
            text-align: center;
        }
        .logo {
            width: 60px; height: 60px;
            background: linear-gradient(135deg, #25d366, #128c7e);
            border-radius: 16px;
            display: flex; align-items: center; justify-content: center;
            font-size: 28px;
            margin: 0 auto 20px;
        }
        h1 { font-size: 20px; font-weight: 700; color: #f8fafc; margin-bottom: 4px; }
        p  { font-size: 13px; color: #64748b; margin-bottom: 28px; }
        input[type="password"] {
            width: 100%;
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 10px;
            color: #f8fafc;
            font-size: 15px;
            padding: 12px 16px;
            outline: none;
            margin-bottom: 14px;
            transition: border-color 0.2s;
        }
        input[type="password"]:focus { border-color: #25d366; }
        button {
            width: 100%;
            background: linear-gradient(135deg, #25d366, #128c7e);
            color: #fff;
            font-size: 15px;
            font-weight: 600;
            border: none;
            border-radius: 10px;
            padding: 13px;
            cursor: pointer;
            transition: opacity 0.2s;
        }
        button:hover { opacity: 0.9; }
        .error {
            background: #7f1d1d22;
            border: 1px solid #f8717133;
            color: #f87171;
            border-radius: 8px;
            padding: 10px;
            font-size: 13px;
            margin-bottom: 14px;
        }
        .footer { color: #334155; font-size: 12px; margin-top: 24px; }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo">🤖</div>
        <h1>TAM Assistant</h1>
        <p>Enter your dashboard password</p>
        ${error ? '<div class="error">❌ Incorrect password. Try again.</div>' : ''}
        <form method="POST" action="/login">
            <input type="password" name="password" placeholder="Password" autofocus autocomplete="current-password" />
            <button type="submit">Unlock Dashboard</button>
        </form>
        <div class="footer">TAM Tech • Private Access Only</div>
    </div>
</body>
</html>`;
}

// ─── Dashboard Routes ──────────────────────────────────────────────────────────
app.get('/login', (req, res) => {
    if (isAuthenticated(req)) return res.redirect('/');
    res.setHeader('Content-Type', 'text/html');
    res.send(getLoginHTML(false));
});

app.post('/login', (req, res) => {
    if (req.body.password === DASHBOARD_PASSWORD) {
        const token = makeCookieToken();
        res.setHeader('Set-Cookie', `tam_auth=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);
        return res.redirect('/');
    }
    res.setHeader('Content-Type', 'text/html');
    res.send(getLoginHTML(true));
});

app.get('/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'tam_auth=; Path=/; HttpOnly; Max-Age=0');
    res.redirect('/login');
});

app.get('/', (req, res) => {
    if (!isAuthenticated(req)) return res.redirect('/login');
    const s = persistence.getStats();
    const b = persistence.getBanned();
    res.setHeader('Content-Type', 'text/html');
    res.send(getDashboardHTML(s, b.size, ai.getInfo(), Date.now() - startTime));
});

// ─── Dashboard Bot Terminal ────────────────────────────────────────────────────
// Accepts a command from the dashboard and injects it as a fake owner message
// into the existing message pipeline — all command logic runs as normal,
// and the bot replies to the owner's WhatsApp number.
app.post('/cmd', (req, res) => {
    if (!isAuthenticated(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const text = (req.body.text || '').trim();
    if (!text)            return res.json({ ok: false, error: 'Empty command' });
    if (!_sockRef)        return res.json({ ok: false, error: 'Bot not connected yet' });
    if (!_ownerJidRef)    return res.json({ ok: false, error: 'Owner JID not set' });

    // Build a fake incoming message that looks like the owner sent it in a DM
    const fakeMsg = {
        key: {
            remoteJid: _ownerJidRef,
            fromMe:    false,
            id:        'DASH_' + Date.now(),
            participant: undefined
        },
        message:          { conversation: text },
        pushName:         'Taha (Dashboard)',
        messageTimestamp: Math.floor(Date.now() / 1000)
    };

    // Fire it through the normal message handler
    _sockRef.ev.emit('messages.upsert', { messages: [fakeMsg], type: 'notify' });
    res.json({ ok: true });
});

// ─── Session Reset ─────────────────────────────────────────────────────────────
// Wipes session files + Gist session, forces QR re-pair on next reconnect.
// Use this when the bot can't decrypt messages (Bad MAC / stale session).
app.post('/reset-session', async (req, res) => {
    if (!isAuthenticated(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    try {
        // 1. Clear Gist session so restart doesn't reload stale keys
        await persistence.setSessionData({});
        // 2. Wipe local session files
        if (fs.existsSync(SESSION_PATH)) {
            const files = fs.readdirSync(SESSION_PATH);
            for (const f of files) {
                try { fs.unlinkSync(path.join(SESSION_PATH, f)); } catch {}
            }
        }
        // 3. Disconnect — bot will reconnect and show QR code in Render logs
        if (_sockRef) {
            _sockRef = null;
            _ownerLid = null;
            if (_sessionSaveInterval) { clearInterval(_sessionSaveInterval); _sessionSaveInterval = null; }
        }
        _starting = false;
        setTimeout(() => startAssistant(), 3000);
        console.log(chalk.red('[SESSION] ⚠️  Session reset! Scan QR code from Render logs to re-pair.'));
        res.json({ ok: true, message: 'Session cleared. Bot will show QR code in Render logs — scan it with WhatsApp.' });
    } catch (e) {
        res.json({ ok: false, error: e.message });
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: Date.now() - startTime,
        version: '2.0.0',
        connected: !!_sockRef
    });
});

app.listen(PORT, () => {
    console.log(chalk.yellow(`[SERVER] Dashboard on port ${PORT}`));

    // ─── Keep-alive: prevent Render free tier from sleeping ─────────────────
    // Render suspends the process after ~15 min of no HTTP traffic.
    // We self-ping the health endpoint every 5 min to stay awake.
    const SELF_URL = process.env.RENDER_EXTERNAL_URL;
    if (SELF_URL) {
        console.log(chalk.cyan(`[KEEPALIVE] Self-ping active → ${SELF_URL}/health every 5 min`));
        setInterval(async () => {
            try {
                await axios.get(`${SELF_URL}/health`, { timeout: 10000 });
                console.log(chalk.gray(`[KEEPALIVE] ✅ Awake (${new Date().toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi' })})`));
            } catch (e) {
                console.error(chalk.yellow(`[KEEPALIVE] ⚠️ Ping failed: ${e.message}`));
            }
        }, 5 * 60 * 1000);
    } else {
        console.log(chalk.yellow('[KEEPALIVE] RENDER_EXTERNAL_URL not set — self-ping disabled (local dev mode)'));
    }
});

// ─── Global crash guards ───────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
    console.error(chalk.red('[UNCAUGHT EXCEPTION]'), err.message);
});
process.on('unhandledRejection', (reason) => {
    console.error(chalk.red('[UNHANDLED REJECTION]'), reason?.message || reason);
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
startAssistant().catch(console.error);
