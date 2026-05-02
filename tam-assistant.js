/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║        TAM PERSONAL ASSISTANT - WhatsApp Bot                ║
 * ║                  Powered by TAM Tech                      ║
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
    jidDecode
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment-timezone');
const config = require('./config');
const AIManager = require('./lib/aiManager');
const { analyzeImage } = require('./lib/vision');

// Initialize AI
const ai = new AIManager(config.aiApiKey, config.systemPrompt);

// Per-user image context store (survives across ai.chat() calls)
const imageContext = new Map(); // participantId -> { text, timestamp }

// Banned users store
const bannedUsers = new Set(); // Set of JIDs (e.g., '923xxxxxxxxx@s.whatsapp.net')

// Session path
const SESSION_PATH = './session_assistant';
const logger = pino({ level: 'silent' });

/**
 * Robust Session ID Injector
 */
async function bootstrapSession() {
    if (!fs.existsSync(SESSION_PATH)) fs.mkdirSync(SESSION_PATH);
    const credsFile = path.join(SESSION_PATH, 'creds.json');

    // If user provided a session ID (Base64), decode and write it
    const sid = config.sessionId || process.env.SESSION_ID;
    if (sid && sid.length > 50 && !fs.existsSync(credsFile)) {
        try {
            const decoded = Buffer.from(sid, 'base64').toString('utf-8');
            fs.writeFileSync(credsFile, decoded);
            console.log(chalk.green('[AUTH] Session ID injected successfully.'));
        } catch (e) {
            console.log(chalk.red('[AUTH] Invalid Session ID format. Falling back to QR.'));
        }
    }
}

/**
 * Main function to start assistant
 */
async function startAssistant() {
    await bootstrapSession();

    console.log(chalk.cyan('\n[TAM ASSISTANT] Starting Taha\'s Personal AI...'));

    const { version, isLatest } = await fetchLatestBaileysVersion();
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

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(chalk.red(`[TAM ASSISTANT] Connection closed (Code: ${statusCode}). Reconnecting: ${shouldReconnect}`));
            if (shouldReconnect) {
                console.log(chalk.yellow('[TAM ASSISTANT] Waiting 5 seconds before reconnecting...'));
                await delay(5000); // 5 second cooldown
                startAssistant();
            }
        } else if (connection === 'open') {
            console.log(chalk.green('[TAM ASSISTANT] Connected successfully! Monitoring keywords & mentions...'));
        }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const msg = chatUpdate.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const from = msg.key.remoteJid;
            const isGroup = from.endsWith('@g.us');
            const participant = isGroup ? msg.key.participant : from;
            const pushName = msg.pushName || 'User';

            // Robust Text Extraction
            const type = Object.keys(msg.message)[0];
            let text = '';
            try {
                const messageContent = msg.message[type];
                text = msg.message.conversation ||
                    (messageContent && messageContent.text) ||
                    (messageContent && messageContent.caption) ||
                    msg.message.extendedTextMessage?.text || '';
            } catch (e) { text = ''; }

            if (!text) return;

            console.log(chalk.gray(`[DEBUG] Msg from ${participant} (Group: ${isGroup}): "${text}"`));

            const textLower = text.toLowerCase();
            const ownerJid = config.ownerNumber + '@s.whatsapp.net';
            const alertJid = config.alertNumber.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            const isOwner = participant === ownerJid;

            // 🚫 BAN CHECK — reply and block banned users (except owner)
            if (bannedUsers.has(participant) && !isOwner) {
                console.log(chalk.red(`[BAN] Blocked message from banned user: ${participant}`));
                await sock.sendMessage(from, {
                    text: `🚫 *Access Denied*\n\n_You have been restricted from using TAM AI._\n_Contact the owner if you think this is a mistake._`,
                    ai: true
                }, { quoted: msg });
                return;
            }

            // 🔒 OWNER COMMANDS: .ban / .unban / .banlist
            if (isOwner && textLower.startsWith('.ban') && !textLower.startsWith('.banlist')) {
                // Extract target number from mention or raw number
                const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                let targetJid = mentioned[0];

                if (!targetJid) {
                    // Try to parse raw number from text: .ban 923xxxxxxxxx
                    const rawNum = text.replace(/^\.ban\s*/i, '').replace(/[^0-9]/g, '').trim();
                    if (rawNum.length >= 10) {
                        targetJid = rawNum + '@s.whatsapp.net';
                    }
                }

                if (!targetJid) {
                    await sock.sendMessage(from, { text: '❌ *Usage:* .ban @user _or_ .ban 923xxxxxxxxx', ai: true }, { quoted: msg });
                    return;
                }

                if (targetJid === ownerJid) {
                    await sock.sendMessage(from, { text: '😅 _You can\'t ban yourself, boss!_', ai: true }, { quoted: msg });
                    return;
                }

                bannedUsers.add(targetJid);
                const num = targetJid.split('@')[0];
                console.log(chalk.red(`[BAN] User banned: ${targetJid}`));
                await sock.sendMessage(from, {
                    text: `🚫 *User Banned*\n\n👤 +${num}\n⛔ This user can no longer use TAM AI\n\n_Use .unban to reverse_`,
                    ai: true
                }, { quoted: msg });
                return;
            }

            if (isOwner && textLower.startsWith('.unban')) {
                const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                let targetJid = mentioned[0];

                if (!targetJid) {
                    const rawNum = text.replace(/^\.unban\s*/i, '').replace(/[^0-9]/g, '').trim();
                    if (rawNum.length >= 10) {
                        targetJid = rawNum + '@s.whatsapp.net';
                    }
                }

                if (!targetJid) {
                    await sock.sendMessage(from, { text: '❌ *Usage:* .unban @user _or_ .unban 923xxxxxxxxx', ai: true }, { quoted: msg });
                    return;
                }

                bannedUsers.delete(targetJid);
                const num = targetJid.split('@')[0];
                console.log(chalk.green(`[BAN] User unbanned: ${targetJid}`));
                await sock.sendMessage(from, {
                    text: `✅ *User Unbanned*\n\n👤 +${num}\n🔓 This user can now use TAM AI again`,
                    ai: true
                }, { quoted: msg });
                return;
            }

            if (isOwner && textLower.startsWith('.banlist')) {
                if (bannedUsers.size === 0) {
                    await sock.sendMessage(from, { text: '📋 *Ban List*\n\n_No users are currently banned_ ✅', ai: true }, { quoted: msg });
                } else {
                    let list = '🚫 *Banned Users*\n\n';
                    let i = 1;
                    bannedUsers.forEach(jid => {
                        list += `${i}. +${jid.split('@')[0]}\n`;
                        i++;
                    });
                    list += `\n_Total: ${bannedUsers.size} banned user(s)_`;
                    await sock.sendMessage(from, { text: list, ai: true }, { quoted: msg });
                }
                return;
            }

            // 1. 🔍 KEYWORD MONITOR (Sequence Format as requested)
            const matchedKeyword = config.keywords.find(kw => textLower.includes(kw.toLowerCase()));
            if (matchedKeyword) {
                console.log(chalk.yellow(`[MONITOR] Keyword "${matchedKeyword}" detected!`));

                let groupName = 'Private Chat';
                if (isGroup) {
                    try {
                        const metadata = await sock.groupMetadata(from);
                        groupName = metadata.subject;
                    } catch (e) { groupName = 'Unknown Group'; }
                }

                // Sequence: 🔔 KEYWORD ALERT 👤 User: +92317... 💬 Message: "Hey TAM, check this out" 📍 Group: GC Name ⏰ Time: 19:15
                const cleanMsg = text.replace(/\n/g, ' ').substring(0, 80);
                const alert = `🔔 *KEYWORD ALERT*\n` +
                    `👤 *User:* @${participant.split('@')[0]}\n` +
                    `💬 *Message:* "${cleanMsg}"\n` +
                    `📍 *Group:* ${groupName}\n` +
                    `⏰ *Time:* ${moment().tz('Asia/Karachi').format('hh:mm A')}`;

                await sock.sendMessage(alertJid, { text: alert, mentions: [participant], ai: true });
            }

            // 2. 🔍 VISION COMMAND (.vision [question])
            if (textLower.startsWith('.vision')) {
                console.log(chalk.green(`[VISION] Command detected from ${pushName}`));

                // ⚡ React to show processing
                await sock.sendMessage(from, {
                    react: { text: '⚡', key: msg.key }
                });

                // Show "typing..."
                await sock.sendPresenceUpdate('composing', from);

                const userQuestion = text.replace(/^\.vision\s*/i, '').trim();
                const result = await analyzeImage(sock, msg);

                if (result.success) {
                    const ocrText = result.result;

                    // Stage 2: Feed OCR text to Groq AI for a PROFESSIONAL response
                    let aiPrompt;
                    if (userQuestion) {
                        aiPrompt = `You are a professional AI assistant responding on WhatsApp. The user shared an image. Here is the extracted text:

---
${ocrText}
---

*User's Question:* "${userQuestion}"

⚠️ *FORMATTING RULES (STRICT):*
• Use WhatsApp formatting ONLY: *bold* with single asterisks, _italic_ with underscores
• DO NOT use markdown: no **double asterisks**, no ## headers, no [links]()
• Use emojis naturally: 📌 ✅ 💡 🔍 📊 ⚡ 🎯 📝 🔢 📋 etc.
• Start with a relevant emoji
• Use • for bullet points, numbered lists (1. 2. 3.) for steps
• Keep paragraphs short (2-3 lines max)
• Use line breaks generously for readability
• Be thorough, detailed, and professional — university-level quality
• Add examples where relevant`;
                    } else {
                        aiPrompt = `You are a professional AI assistant responding on WhatsApp. The user shared an image. Here is the extracted text:

---
${ocrText}
---

⚠️ *FORMATTING RULES (STRICT):*
• Use WhatsApp formatting ONLY: *bold* with single asterisks, _italic_ with underscores
• DO NOT use markdown: no **double asterisks**, no ## headers, no [links]()
• Use emojis naturally: 📌 ✅ 💡 🔍 📊 ⚡ 🎯 📝 🔢 📋 etc.
• Start with a relevant emoji
• Use • for bullet points, numbered lists (1. 2. 3.) for steps
• Keep paragraphs short (2-3 lines max)

📋 *CONTENT RULES:*
• If it contains *QUESTIONS or ASSIGNMENTS*: Answer EACH question thoroughly with detailed explanations, real-world examples, and academic depth. Number each answer. Give complete, university-level responses with proper structure
• If it's a *RECEIPT/INVOICE*: Break down all charges, discounts, taxes in a clean organized format
• If it's a *CONVERSATION*: Summarize key points, tone, and takeaways
• If it's a *DOCUMENT/NOTES*: Explain, expand, and organize the content
• Be thorough and professional — the user expects premium quality`;
                    }

                    // Save OCR context for follow-up questions via @TAM
                    imageContext.set(participant, {
                        text: ocrText,
                        timestamp: Date.now()
                    });
                    console.log(chalk.green(`[VISION] Image context saved for ${participant}`));

                    // Get AI response
                    const aiResult = await ai.chat(participant, aiPrompt);

                    if (aiResult.success) {
                        await sock.sendMessage(from, {
                            text: `🔍 *Vision Analysis*\n\n${aiResult.message}\n\n> 🤖 _Ask follow-up questions about this image using @TAM!_`,
                            ai: true
                        }, { quoted: msg });
                    } else {
                        // AI failed, fallback to raw OCR text
                        await sock.sendMessage(from, {
                            text: `🔍 *Vision Analysis (Raw OCR)*\n\n${ocrText}`,
                            ai: true
                        }, { quoted: msg });
                    }
                } else {
                    await sock.sendMessage(from, {
                        text: `❌ *Vision Error:*\n${result.error}`,
                        ai: true
                    }, { quoted: msg });
                }

                await sock.sendPresenceUpdate('paused', from);
                return; // Stop processing for this message
            }

            // 3. 🤖 AI & PRESENCE LOGIC
            const explicitTags = ['@TAM', '@taha', '@tam', '@taha asif'];
            const hasTag = explicitTags.some(tag => textLower.includes(tag));
            const isJidMentioned = (msg.message.extendedTextMessage?.contextInfo?.mentionedJid || []).includes(ownerJid);
            const shouldRespond = hasTag || isJidMentioned;
            const isDM = !isGroup;

            // RECORDING: Only show in DMs (Private chats)
            if (isDM) {
                console.log(chalk.blue(`[PRESENCE] Showing "recording..." to ${pushName} (DM only)`));
                await sock.sendPresenceUpdate('recording', from);
                await delay(config.recordingDelay);
                await sock.sendPresenceUpdate('paused', from);
            }

            // AI RESPONSE: Reply to @mentions in both DMs and Groups
            if (shouldRespond) {
                console.log(chalk.cyan(`[AI-ASSISTANT] Responding to @mention from ${pushName}`));

                // ⚡ React to show processing
                await sock.sendMessage(from, {
                    react: { text: '⚡', key: msg.key }
                });

                let userMessage = text.replace(/@\S+/g, '').trim();

                // Inject stored image context if available (for follow-up questions)
                const storedContext = imageContext.get(participant);
                if (storedContext && (Date.now() - storedContext.timestamp) < 10 * 60 * 1000) {
                    // Context is less than 10 minutes old — inject it
                    userMessage = `[The user previously shared an image. Here is the text extracted from it: "${storedContext.text}"]\n\nUser's question: ${userMessage}`;
                    console.log(chalk.green(`[AI] Injecting image context for follow-up question`));
                }

                const aiResponse = await ai.chat(participant, userMessage);

                if (aiResponse.success) {
                    await sock.sendMessage(from, {
                        text: aiResponse.message,
                        ai: true
                    }, { quoted: msg });
                }
            }

        } catch (e) {
            console.error('[TAM ASSISTANT] Error:', e);
        }
    });
}

// Express server for Render Keep-Alive
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`
        <html>
            <head><title>TAM Assistant</title></head>
            <body style="background: #000; color: #0f0; font-family: monospace; display: flex; align-items: center; justify-content: center; height: 100vh;">
                <div>
                    <h1>TAM ASSISTANT ACTIVE 🤖</h1>
                    <p>${new Date().toISOString()} - INCOMING HTTP REQUEST DETECTED ...</p>
                </div>
            </body>
        </html>
    `);
});

app.listen(PORT, () => console.log(chalk.yellow(`[SERVER] Keep-Alive server running on port ${PORT}`)));

// Start
startAssistant().catch(console.error);
