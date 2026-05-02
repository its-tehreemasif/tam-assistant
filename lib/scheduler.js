/**
 * Scheduler — Timely alerts and daily summaries
 * Uses node-cron for scheduled jobs.
 * All alert messages auto-delete after 60 seconds to prevent spam
 * and reduce WhatsApp ban risk.
 */

const cron = require('node-cron');
const moment = require('moment-timezone');
const chalk = require('chalk');

const AUTO_DELETE_DELAY = 60 * 1000; // 60 seconds

/**
 * Send a message and auto-delete it after a delay (for everyone)
 */
async function sendAndDelete(sock, jid, text, mentions = [], deleteAfter = AUTO_DELETE_DELAY) {
    try {
        const sent = await sock.sendMessage(jid, { text, mentions, ai: true });
        setTimeout(async () => {
            try {
                await sock.sendMessage(jid, { delete: sent.key });
                console.log(chalk.gray('[SCHEDULER] Auto-deleted timed alert.'));
            } catch (e) {
                console.error('[SCHEDULER] Delete failed:', e.message);
            }
        }, deleteAfter);
        return sent;
    } catch (e) {
        console.error('[SCHEDULER] Send failed:', e.message);
        return null;
    }
}

/**
 * Build the daily summary message
 */
function buildDailySummary(stats, bannedCount, aiInfo) {
    const topUsers = Object.entries(stats.perUser || {})
        .sort((a, b) => b[1].messages - a[1].messages)
        .slice(0, 5);

    const topStr = topUsers.length
        ? topUsers.map(([jid, u], i) => `   ${i + 1}. +${jid.split('@')[0]} — ${u.messages} msgs`).join('\n')
        : '   _No user data yet_';

    const date = moment().tz('Asia/Karachi').format('dddd, DD MMM YYYY');

    return `🌅 *Good Morning, Taha!*
━━━━━━━━━━━━━━━━━━━━━
📅 *Daily Report — ${date}*

📊 *All-Time Stats:*
• 📨 Messages handled: *${stats.totalMessages}*
• 🤖 AI responses: *${stats.totalAIResponses}*
• 🔍 Vision analyses: *${stats.totalVisionRequests}*
• 🎙 Voice transcriptions: *${stats.totalVoiceTranscriptions || 0}*
• 🔔 Keyword alerts: *${stats.totalKeywordAlerts}*
• 🚫 Banned users: *${bannedCount}*

👥 *Top Users:*
${topStr}

🤖 *AI Engine:* ${aiInfo.model}
🔄 _Active conversations: ${aiInfo.activeConversations}_
━━━━━━━━━━━━━━━━━━━━━
_⏱ This message auto-deletes in 60s_`;
}

/**
 * Initialize all scheduled jobs
 */
function initScheduler(sock, ownerJid, getPersistence, getAI) {
    // ─── Daily Summary — 9:00 AM PKT ────────────────────────────────────────
    cron.schedule('0 9 * * *', async () => {
        console.log(chalk.blue('[SCHEDULER] Sending daily summary...'));
        const { getStats, getBanned } = getPersistence();
        const stats = getStats();
        const bannedCount = getBanned().size;
        const aiInfo = getAI().getInfo();
        const summary = buildDailySummary(stats, bannedCount, aiInfo);
        await sendAndDelete(sock, ownerJid, summary);
    }, {
        timezone: 'Asia/Karachi'
    });

    // ─── Weekly Digest — Every Monday 9:00 AM PKT ───────────────────────────
    cron.schedule('0 9 * * 1', async () => {
        console.log(chalk.blue('[SCHEDULER] Sending weekly digest...'));
        const { getStats } = getPersistence();
        const stats = getStats();
        const started = moment(stats.startedAt).tz('Asia/Karachi').format('DD MMM');
        const msg = `📆 *Weekly Digest*\n\nSince ${started}:\n• ${stats.totalMessages} messages processed\n• ${stats.totalAIResponses} AI responses sent\n• ${stats.totalVisionRequests} images analyzed\n• ${stats.totalKeywordAlerts} keyword alerts fired\n\n_Have a great week, Taha!_ 🚀\n\n_⏱ Auto-deletes in 60s_`;
        await sendAndDelete(sock, ownerJid, msg);
    }, {
        timezone: 'Asia/Karachi'
    });

    console.log(chalk.green('[SCHEDULER] Scheduled jobs active: daily summary (9AM PKT), weekly digest (Monday 9AM PKT)'));
}

/**
 * Send disconnect alert (called from connection.update handler)
 */
async function sendDisconnectAlert(sock, ownerJid, reason) {
    const msg = `⚠️ *Bot Disconnected*\n\n_Reason: ${reason}_\n🔄 Attempting to reconnect...\n\n_⏱ Auto-deletes in 60s_`;
    await sendAndDelete(sock, ownerJid, msg, [], AUTO_DELETE_DELAY);
}

/**
 * Send reconnect alert (called when connection is restored)
 */
async function sendReconnectAlert(sock, ownerJid) {
    const time = moment().tz('Asia/Karachi').format('hh:mm A');
    const msg = `✅ *Bot Reconnected*\n\n_Back online at ${time}_\n🤖 TAM Assistant is ready.\n\n_⏱ Auto-deletes in 60s_`;
    await sendAndDelete(sock, ownerJid, msg, [], AUTO_DELETE_DELAY);
}

module.exports = { initScheduler, sendDisconnectAlert, sendReconnectAlert, sendAndDelete };
