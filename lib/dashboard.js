/**
 * Admin Dashboard — Real-time bot status and statistics
 * Served at the Express root. Owner-only access via a simple token.
 */

const moment = require('moment-timezone');

function getDashboardHTML(stats, bannedCount, aiInfo, uptime) {
    const uptimeStr = formatUptime(uptime);
    const startedAt = moment(stats.startedAt).tz('Asia/Karachi').format('DD MMM YYYY, hh:mm A');

    const topUsers = Object.entries(stats.perUser || {})
        .sort((a, b) => b[1].messages - a[1].messages)
        .slice(0, 10);

    const userRows = topUsers.length
        ? topUsers.map(([jid, u], i) => `
            <tr>
                <td>${i + 1}</td>
                <td>+${jid.split('@')[0]}</td>
                <td>${u.messages || 0}</td>
                <td>${u.aiCalls || 0}</td>
            </tr>`).join('')
        : '<tr><td colspan="4" style="text-align:center;color:#666">No data yet</td></tr>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TAM Assistant — Dashboard</title>
    <meta http-equiv="refresh" content="30">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background: #0a0a0f;
            color: #e2e8f0;
            font-family: 'Segoe UI', system-ui, sans-serif;
            min-height: 100vh;
            padding: 24px;
        }
        .header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 32px;
            padding-bottom: 20px;
            border-bottom: 1px solid #1e293b;
        }
        .logo {
            width: 48px; height: 48px;
            background: linear-gradient(135deg, #25d366, #128c7e);
            border-radius: 12px;
            display: flex; align-items: center; justify-content: center;
            font-size: 24px;
        }
        .header h1 { font-size: 22px; font-weight: 700; color: #f8fafc; }
        .header p { font-size: 13px; color: #64748b; margin-top: 2px; }
        .badge {
            margin-left: auto;
            background: #16a34a22;
            color: #4ade80;
            border: 1px solid #16a34a44;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            display: flex; align-items: center; gap: 6px;
        }
        .dot { width: 7px; height: 7px; background: #4ade80; border-radius: 50%; animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 28px; }
        .card {
            background: #0f172a;
            border: 1px solid #1e293b;
            border-radius: 14px;
            padding: 20px;
        }
        .card .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
        .card .value { font-size: 28px; font-weight: 700; color: #f8fafc; }
        .card .sub { font-size: 12px; color: #475569; margin-top: 4px; }
        .card.green .value { color: #4ade80; }
        .card.blue .value { color: #60a5fa; }
        .card.yellow .value { color: #fbbf24; }
        .card.red .value { color: #f87171; }
        .card.purple .value { color: #c084fc; }
        .section { background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 20px; margin-bottom: 20px; }
        .section h2 { font-size: 14px; font-weight: 600; color: #94a3b8; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.05em; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; font-size: 12px; color: #475569; padding: 8px 12px; border-bottom: 1px solid #1e293b; text-transform: uppercase; }
        td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #1e293b22; }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: #ffffff05; }
        .info-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #1e293b22; font-size: 13px; }
        .info-row:last-child { border-bottom: none; }
        .info-row .key { color: #64748b; }
        .info-row .val { color: #e2e8f0; font-family: monospace; }
        .footer { text-align: center; color: #334155; font-size: 12px; margin-top: 24px; }
        .logout { background: #1e293b; border: 1px solid #334155; color: #94a3b8; padding: 6px 14px; border-radius: 8px; font-size: 12px; text-decoration: none; transition: background 0.2s; }
        .logout:hover { background: #334155; color: #f8fafc; }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">🤖</div>
        <div>
            <h1>TAM Assistant</h1>
            <p>Personal AI — WhatsApp Bot Dashboard</p>
        </div>
        <div class="badge">
            <span class="dot"></span> LIVE
        </div>
        <a href="/logout" class="logout" style="margin-left:12px">🔒 Logout</a>
    </div>

    <div class="grid">
        <div class="card green">
            <div class="label">Total Messages</div>
            <div class="value">${stats.totalMessages || 0}</div>
            <div class="sub">all time</div>
        </div>
        <div class="card blue">
            <div class="label">AI Responses</div>
            <div class="value">${stats.totalAIResponses || 0}</div>
            <div class="sub">groq api calls</div>
        </div>
        <div class="card yellow">
            <div class="label">Vision Requests</div>
            <div class="value">${stats.totalVisionRequests || 0}</div>
            <div class="sub">image analyses</div>
        </div>
        <div class="card" style="border-color:#7c3aed33">
            <div class="label">Voice Transcriptions</div>
            <div class="value" style="color:#a78bfa">${stats.totalVoiceTranscriptions || 0}</div>
            <div class="sub">voice notes processed</div>
        </div>
        <div class="card purple">
            <div class="label">Keyword Alerts</div>
            <div class="value">${stats.totalKeywordAlerts || 0}</div>
            <div class="sub">triggered</div>
        </div>
        <div class="card red">
            <div class="label">Banned Users</div>
            <div class="value">${bannedCount}</div>
            <div class="sub">restricted</div>
        </div>
        <div class="card">
            <div class="label">Uptime</div>
            <div class="value" style="font-size:20px">${uptimeStr}</div>
            <div class="sub">since ${startedAt}</div>
        </div>
    </div>

    <div class="section">
        <h2>Bot Configuration</h2>
        <div class="info-row"><span class="key">AI Model</span><span class="val">${aiInfo.model}</span></div>
        <div class="info-row"><span class="key">Active Conversations</span><span class="val">${aiInfo.activeConversations}</span></div>
        <div class="info-row"><span class="key">Total API Calls (session)</span><span class="val">${aiInfo.totalCalls}</span></div>
        <div class="info-row"><span class="key">Timezone</span><span class="val">Asia/Karachi (PKT)</span></div>
        <div class="info-row"><span class="key">Auto-refresh</span><span class="val">every 30 seconds</span></div>
    </div>

    <div class="section">
        <h2>Top Users</h2>
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Number</th>
                    <th>Messages</th>
                    <th>AI Calls</th>
                </tr>
            </thead>
            <tbody>${userRows}</tbody>
        </table>
    </div>

    <div class="footer">
        TAM Assistant • Powered by TAM Tech • Auto-refreshes every 30s
    </div>
</body>
</html>`;
}

function formatUptime(ms) {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s % 60}s`;
}

module.exports = { getDashboardHTML };
