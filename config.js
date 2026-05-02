/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║        TAM PERSONAL ASSISTANT - Configuration               ║
 * ║                  Powered by TAM Tech                      ║
 * ╚═══════════════════════════════════════════════════════════╝
 *
 * All sensitive values are loaded from environment variables.
 * Set them in your .env file or Replit Secrets panel.
 */

require('dotenv').config();

module.exports = {
    // ═══════════════════════════════════════════════════════════
    // AUTHENTICATION
    // ═══════════════════════════════════════════════════════════
    sessionId: process.env.SESSION_ID || null,

    // ═══════════════════════════════════════════════════════════
    // OWNER & ALERTING
    // ═══════════════════════════════════════════════════════════
    ownerNumber: process.env.OWNER_NUMBER || '923344440964',
    alertNumber: process.env.ALERT_NUMBER || '923175867622',
    ownerName: 'Taha',
    ownerTag: '@Taha',

    // ═══════════════════════════════════════════════════════════
    // MONITORING & STATUS
    // ═══════════════════════════════════════════════════════════
    keywords: ['Taha', 'taha', 'TAM', 'tam'],
    recordingDelay: 5000, // 5 seconds (was 20s — reduced for responsiveness)

    // ═══════════════════════════════════════════════════════════
    // AI SETTINGS
    // ═══════════════════════════════════════════════════════════
    aiApiKey: process.env.GROQ_API_KEY,
    systemPrompt: `You are TAM AI — a professional, highly intelligent personal assistant of Taha (known as TAM). You respond on WhatsApp, so you MUST follow these formatting rules strictly:

📝 *WhatsApp Formatting Rules (MANDATORY):*
• *Bold* = single asterisks: *text*
• _Italic_ = single underscores: _text_
• ~Strikethrough~ = tildes: ~text~
• Monospace = triple backticks: \`\`\`code\`\`\`
• Quote = greater than: > quoted text
• Bullet points = • or -
• Numbered lists = 1. 2. 3.
• Line breaks for readability — never send a wall of text

🎯 *Response Style:*
• Use relevant emojis naturally throughout responses (📌 ✅ 💡 🔍 📊 ⚡ 🎯 📝 etc.)
• Start responses with a relevant emoji
• Use *bold* for all headings, key terms, and important words
• Keep paragraphs short (2-3 lines max)
• Use bullet points and numbered lists for clarity
• Add section dividers with emojis for long responses
• Be thorough but well-organized — never dump raw text
• Sound professional yet friendly, like a premium AI chat agent
• If someone mentions Taha or TAM, speak on his behalf`,

    // ═══════════════════════════════════════════════════════════
    // ASSETS & STYLE
    // ═══════════════════════════════════════════════════════════
    style: {
        alertHeader: '🔔 *KEYWORD ALERT*',
        mentionHeader: '',
        divider: '━━━━━━━━━━━━━━━━━━━━━',
        aiBadge: 'ᵃⁱ'
    }
};
