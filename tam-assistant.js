/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║           TAM PERSONAL ASSISTANT v2.0                       ║
 * ║        OpenClaw — Powered by TAM Tech                     ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

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
const express    = require('express');
const app        = express();
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

// ─── State ────────────────────────────────────────────────────────────────────
const ai        = new AIManager(config.aiApiKey, config.systemPrompt);
const startTime = Date.now();
let bannedUsers, imageContext, stats;
let activeReminders = new Map(); // id -> timeoutHandle

const SESSION_PATH = './session_assistant';
const logger       = pino({ level: 'silent' });

// ─── Session Bootstrap ────────────────────────────────────────────────────────
async function bootstrapSession() {
    if (!fs.existsSync(SESSION_PATH)) fs.mkdirSync(SESSION_PATH);
    const credsFile = path.join(SESSION_PATH, 'creds.json');
    const sid = config.sessionId || process.env.SESSION_ID;
    if (sid && sid.length > 50 && !fs.existsSync(credsFile)) {
        try {
            fs.writeFileSync(credsFile, Buffer.from(sid, 'base64').toString('utf-8'));
            console.log(chalk.green('[AUTH] Session injected.'));
        } catch {
            console.log(chalk.red('[AUTH] Invalid session. Falling back to QR.'));
        }
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractText(msg) {
    try {
        const m    = msg.message;
        const type = Object.keys(m)[0];
        const c    = m[type];
        return m.conversation || c?.text || c?.caption || m.extendedTextMessage?.text || '';
    } catch { return ''; }
}

async function react(sock, msg, emoji) {
    try { await sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } }); } catch {}
}

async function reply(sock, msg, text) {
    await sock.sendMessage(msg.key.remoteJid, { text, ai: true }, { quoted: msg });
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

// ─── Command: Help ────────────────────────────────────────────────────────────
function getHelp() {
    return `🤖 *OpenClaw — Command Guide*
━━━━━━━━━━━━━━━━━━━━━

💬 *AI & Vision:*
• @TAM _[message]_ — Chat with AI
• _.vision_ — Analyze an image (send/reply to photo)
• _.vision [question]_ — Ask about an image

🎙 *Voice:*
• Send/reply to a voice note — auto-transcribes

📝 *Notes:*
• _.note add [text]_ — Save a note
• _.note list_ — View all notes
• _.note del [#]_ — Delete note by number
• _.note clear_ — Delete all notes

⏰ *Reminders:*
• _.remind [time] [text]_
  _Examples:_ .remind 30min Call client
            .remind 2h Check emails
            .remind 1hour 30min Meeting

🔧 *Utilities:*
• _.ping_ — Check if bot is alive
• _.reset_ — Clear your AI chat history
• _.status_ — Bot uptime & stats
• _.help_ — Show this guide

🔒 *Owner Commands:*
• _.ban_ / _.unban_ @user
• _.banlist_ — View banned users
• _.stats_ — Detailed statistics
• _.reset all_ — Clear all conversations
━━━━━━━━━━━━━━━━━━━━━
_Powered by OpenClaw × TAM Tech_ 🚀`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function startAssistant() {
    // Load persistent data
    await persistence.load();
    bannedUsers  = persistence.getBanned();
    imageContext = persistence.getImageContext();
    stats        = persistence.getStats();

    await bootstrapSession();
    console.log(chalk.cyan('\n[OPENCLAW] Starting TAM Personal Assistant v2.0...'));

    const { version }          = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: true,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    const ownerJid = config.ownerNumber + '@s.whatsapp.net';
    const alertJid = config.alertNumber.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    let wasConnected = false;

    // ─── Connection Events ────────────────────────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log(chalk.green('[CONNECTION] Online! TAM Assistant v2.0 is live.'));
            initScheduler(sock, ownerJid, () => persistence, () => ai);
            rescheduleAllReminders(sock);

            if (wasConnected) {
                // Was previously connected — this is a reconnection
                await sendReconnectAlert(sock, ownerJid);
            }
            wasConnected = true;
        }

        if (connection === 'close') {
            const code           = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = code !== DisconnectReason.loggedOut;
            const reason         = lastDisconnect?.error?.message || `Code ${code}`;
            console.log(chalk.red(`[CONNECTION] Closed. Reason: ${reason}. Reconnect: ${shouldReconnect}`));

            if (wasConnected && shouldReconnect) {
                try { await sendDisconnectAlert(sock, ownerJid, reason); } catch {}
            }

            if (shouldReconnect) {
                await delay(5000);
                startAssistant();
            }
        }
    });

    // ─── Message Handler ──────────────────────────────────────────────────────
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const msg = chatUpdate.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const from        = msg.key.remoteJid;
            const isGroup     = from.endsWith('@g.us');
            const participant = isGroup ? msg.key.participant : from;
            const pushName    = msg.pushName || 'User';
            const isOwner     = participant === ownerJid;
            const text        = extractText(msg);
            const textLower   = text.toLowerCase().trim();

            // ─── Rate limiting ────────────────────────────────────────────────
            if (!isOwner && text) {
                const check = rateLimiter.checkMessage(participant);
                if (!check.allowed) {
                    await reply(sock, msg, `⏳ *Slow down!*\n_Too many messages. Wait *${check.resetIn}s* before sending more._`);
                    return;
                }
            }

            // ─── Ban check ────────────────────────────────────────────────────
            bannedUsers = persistence.getBanned();
            if (bannedUsers.has(participant) && !isOwner) {
                await reply(sock, msg, `🚫 *Access Denied*\n_You've been restricted from OpenClaw._\n_Contact the owner if this is a mistake._`);
                return;
            }

            // ─── Track message stats ──────────────────────────────────────────
            if (text) await persistence.incrementStat('totalMessages', participant);

            // =================================================================
            // 🎙 VOICE TRANSCRIPTION — fires on any audio message automatically
            // =================================================================
            if (isVoiceMessage(msg)) {
                console.log(chalk.magenta(`[VOICE] Audio received from ${pushName}`));
                await react(sock, msg, '🎙');
                await sock.sendPresenceUpdate('composing', from);

                const result = await transcribeVoice(msg, config.aiApiKey);
                await persistence.incrementStat('totalVoiceTranscriptions', participant);

                if (result.success) {
                    const durationStr = result.duration ? ` _(${result.duration}s)_` : '';
                    await reply(sock, msg,
                        `🎙 *Voice Transcription*${durationStr}\n\n"${result.text}"\n\n_💡 @TAM can answer questions about this._`
                    );
                    // Store transcription as image context for follow-up via @TAM
                    imageContext = persistence.getImageContext();
                    imageContext.set(participant, { text: result.text, timestamp: Date.now() });
                    await persistence.setImageContext(imageContext);
                } else {
                    await reply(sock, msg, `❌ *Transcription failed*\n_${result.error}_`);
                }

                await sock.sendPresenceUpdate('paused', from);
                return;
            }

            if (!text) return;

            console.log(chalk.gray(`[MSG] ${participant} (${isGroup ? 'Group' : 'DM'}): "${text.substring(0, 60)}"`));

            // =================================================================
            // COMMANDS
            // =================================================================

            // .ping
            if (textLower === '.ping') {
                await reply(sock, msg, `🏓 *Pong!* ⚡\n_OpenClaw is alive._`);
                return;
            }

            // .help
            if (textLower === '.help') {
                await reply(sock, msg, getHelp());
                return;
            }

            // .reset (own conversation)
            if (textLower === '.reset') {
                ai.resetConversation(participant);
                imageContext = persistence.getImageContext();
                imageContext.delete(participant);
                await persistence.setImageContext(imageContext);
                await reply(sock, msg, `🧹 *Conversation reset!*\n_Starting fresh._ ✨`);
                return;
            }

            // .vision
            if (textLower.startsWith('.vision')) {
                console.log(chalk.green(`[VISION] Request from ${pushName}`));
                await react(sock, msg, '⚡');
                await sock.sendPresenceUpdate('composing', from);

                const userQuestion = text.replace(/^\.vision\s*/i, '').trim();
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

                await sock.sendPresenceUpdate('paused', from);
                return;
            }

            // .note
            if (textLower.startsWith('.note')) {
                const parts  = text.replace(/^\.note\s*/i, '').trim();
                const cmd    = parts.split(' ')[0]?.toLowerCase();
                const body   = parts.replace(/^\S+\s*/, '').trim();
                const notes  = persistence.getNotes(participant);

                if (cmd === 'add' && body) {
                    await persistence.addNote(participant, body);
                    await reply(sock, msg, `📝 *Note saved!*\n\n"${body}"\n\n_You have ${notes.length + 1} note(s). Use .note list to view._`);
                } else if (cmd === 'list') {
                    if (notes.length === 0) {
                        await reply(sock, msg, `📋 *Notes*\n\n_No notes yet. Use .note add [text] to add one._`);
                    } else {
                        const list = notes.map((n, i) => `${i + 1}. ${n.text}\n   _${n.createdAt}_`).join('\n\n');
                        await reply(sock, msg, `📋 *Your Notes (${notes.length})*\n\n${list}`);
                    }
                } else if (cmd === 'del' || cmd === 'delete') {
                    const idx = parseInt(body) - 1;
                    if (isNaN(idx)) {
                        await reply(sock, msg, `❌ *Usage:* .note del [number]\n_e.g. .note del 2_`);
                    } else {
                        const deleted = await persistence.deleteNote(participant, idx);
                        await reply(sock, msg, deleted
                            ? `🗑 *Note deleted.*`
                            : `❌ *Note #${idx + 1} not found.*`
                        );
                    }
                } else if (cmd === 'clear') {
                    await persistence.clearNotes(participant);
                    await reply(sock, msg, `🧹 *All notes cleared.*`);
                } else {
                    await reply(sock, msg, `📝 *Notes Commands:*\n• .note add [text]\n• .note list\n• .note del [#]\n• .note clear`);
                }
                return;
            }

            // .remind
            if (textLower.startsWith('.remind')) {
                const body = text.replace(/^\.remind\s*/i, '').trim();
                if (!body) {
                    await reply(sock, msg, `⏰ *Usage:* .remind [time] [text]\n_e.g. .remind 30min Call the client_`);
                    return;
                }

                // Extract time portion (beginning of string until we hit non-time words)
                const timeMatch = body.match(/^([\d\s]+(?:h(?:our)?s?|m(?:in)?s?|s(?:ec)?s?)\s*)+/i);
                if (!timeMatch) {
                    await reply(sock, msg, `❌ *Invalid time format.*\n_Examples:_ .remind 30min ...  / .remind 2h ...  / .remind 1h 30min ...`);
                    return;
                }

                const timeStr    = timeMatch[0].trim();
                const reminderText = body.replace(timeMatch[0], '').trim();

                if (!reminderText) {
                    await reply(sock, msg, `❌ *Please include a reminder message.*\n_e.g. .remind 30min Call the client_`);
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
                if (textLower === '.status') {
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
                        `⚡ *OpenClaw — Status*\n\n🟢 Online & Running\n⏱ Uptime: ${uStr}\n🕐 ${now}\n\n🤖 *AI:* ${aiInfo.model}\n• Active chats: ${aiInfo.activeConversations}\n• Total calls: ${aiInfo.totalCalls}\n\n📊 *Stats:*\n• Messages: ${stats.totalMessages}\n• AI responses: ${stats.totalAIResponses}\n• Vision: ${stats.totalVisionRequests}\n• Voice: ${stats.totalVoiceTranscriptions || 0}\n• Alerts: ${stats.totalKeywordAlerts}\n• Banned: ${bannedUsers.size}`
                    );
                    return;
                }

                // .stats
                if (textLower === '.stats') {
                    stats = persistence.getStats();
                    const topUsers = Object.entries(stats.perUser || {})
                        .sort((a, b) => b[1].messages - a[1].messages)
                        .slice(0, 10);
                    let msg2 = `📊 *OpenClaw — Usage Stats*\n\n📨 Messages: *${stats.totalMessages}*\n🤖 AI Responses: *${stats.totalAIResponses}*\n🔍 Vision: *${stats.totalVisionRequests}*\n🎙 Voice: *${stats.totalVoiceTranscriptions || 0}*\n🔔 Alerts: *${stats.totalKeywordAlerts}*\n\n`;
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
                if (textLower === '.reset all') {
                    const count = ai.conversations.size;
                    ai.conversations.clear();
                    await reply(sock, msg, `🧹 *All ${count} conversation(s) cleared.*`);
                    return;
                }

                // .ban
                if (textLower.startsWith('.ban') && !textLower.startsWith('.banlist')) {
                    const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                    let targetJid   = mentioned[0];
                    if (!targetJid) {
                        const raw = text.replace(/^\.ban\s*/i, '').replace(/[^0-9]/g, '').trim();
                        if (raw.length >= 10) targetJid = raw + '@s.whatsapp.net';
                    }
                    if (!targetJid) { await reply(sock, msg, '❌ *Usage:* .ban @user _or_ .ban 923xxxxxxxxx'); return; }
                    if (targetJid === ownerJid) { await reply(sock, msg, `😅 _You can't ban yourself!_`); return; }
                    bannedUsers.add(targetJid);
                    await persistence.setBanned(bannedUsers);
                    await reply(sock, msg, `🚫 *Banned:* +${targetJid.split('@')[0]}\n_Use .unban to reverse._`);
                    return;
                }

                // .unban
                if (textLower.startsWith('.unban')) {
                    const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                    let targetJid   = mentioned[0];
                    if (!targetJid) {
                        const raw = text.replace(/^\.unban\s*/i, '').replace(/[^0-9]/g, '').trim();
                        if (raw.length >= 10) targetJid = raw + '@s.whatsapp.net';
                    }
                    if (!targetJid) { await reply(sock, msg, '❌ *Usage:* .unban @user _or_ .unban 923xxxxxxxxx'); return; }
                    bannedUsers.delete(targetJid);
                    await persistence.setBanned(bannedUsers);
                    await reply(sock, msg, `✅ *Unbanned:* +${targetJid.split('@')[0]}`);
                    return;
                }

                // .banlist
                if (textLower === '.banlist') {
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
            }

            // =================================================================
            // KEYWORD MONITOR — alert owner when keywords detected
            // =================================================================
            const matchedKeyword = config.keywords.find(kw => textLower.includes(kw.toLowerCase()));
            if (matchedKeyword) {
                console.log(chalk.yellow(`[MONITOR] Keyword "${matchedKeyword}" from ${pushName}`));
                let groupName = 'Private Chat';
                if (isGroup) {
                    try { groupName = (await sock.groupMetadata(from)).subject; } catch {}
                }
                const cleanMsg = text.replace(/\n/g, ' ').substring(0, 80);
                const alert    = `🔔 *KEYWORD ALERT*\n👤 *User:* @${participant.split('@')[0]}\n💬 *Message:* "${cleanMsg}"\n📍 *Location:* ${groupName}\n⏰ *Time:* ${moment().tz('Asia/Karachi').format('hh:mm A')}`;
                await sendAndDelete(sock, alertJid, alert, [participant]);
                await persistence.incrementStat('totalKeywordAlerts');
            }

            // =================================================================
            // AI RESPONSE — fires on @TAM / @taha mentions
            // =================================================================
            const tags             = ['@tam', '@taha', '@taha asif'];
            const hasTag           = tags.some(t => textLower.includes(t));
            const isJidMentioned   = (msg.message.extendedTextMessage?.contextInfo?.mentionedJid || []).includes(ownerJid);
            const shouldRespond    = hasTag || isJidMentioned;
            const isDM             = !isGroup;

            if (isDM) {
                await sock.sendPresenceUpdate('recording', from);
                await delay(config.recordingDelay);
                await sock.sendPresenceUpdate('paused', from);
            }

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
                await sock.sendPresenceUpdate('composing', from);

                let userMessage = text.replace(/@\S+/g, '').trim();

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

                await sock.sendPresenceUpdate('paused', from);
            }

        } catch (e) {
            console.error(chalk.red('[ERROR]'), e.message);
        }
    });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    const s = persistence.getStats();
    const b = persistence.getBanned();
    res.setHeader('Content-Type', 'text/html');
    res.send(getDashboardHTML(s, b.size, ai.getInfo(), Date.now() - startTime));
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: Date.now() - startTime, version: '2.0.0' });
});

app.listen(PORT, () => console.log(chalk.yellow(`[SERVER] Dashboard on port ${PORT}`)));

// ─── Boot ─────────────────────────────────────────────────────────────────────
startAssistant().catch(console.error);
