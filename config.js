/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║        TAM PERSONAL ASSISTANT - Configuration               ║
 * ║                  Powered by TAM Tech                      ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

require('dotenv').config();

module.exports = {
    // ═══════════════════════════════════════════════════════════
    // AUTHENTICATION
    // ═══════════════════════════════════════════════════════════
    // Paste your Base64 Session ID here or in .env
    sessionId: process.env.SESSION_ID || "eyJub2lzZUtleSI6eyJwcml2YXRlIjp7InR5cGUiOiJCdWZmZXIiLCJkYXRhIjoid1BwODBHOE10bE15bk05eGxlbGxpcUw2THFuQmZoVm9MV2FXT01saG1YZz0ifSwicHVibGljIjp7InR5cGUiOiJCdWZmZXIiLCJkYXRhIjoiTFVhcjFCOVB4MCtubkFvdms1N212VlpSZ2lZTFlwV2tIdGpNdlZPSnluQT0ifX0sInBhaXJpbmdFcGhlbWVyYWxLZXlQYWlyIjp7InByaXZhdGUiOnsidHlwZSI6IkJ1ZmZlciIsImRhdGEiOiIrSUhjRjIrYUUxdW9iOXFRYUZhbVllTE9qRStrTUEwY0hhNDlqQXJYKzE4PSJ9LCJwdWJsaWMiOnsidHlwZSI6IkJ1ZmZlciIsImRhdGEiOiJxSWNWRjlZTTJZQlEzRW5VcXhzbENtUjhFVWZFUUxzY0E2RWFKNit4VWhrPSJ9fSwic2lnbmVkSWRlbnRpdHlLZXkiOnsicHJpdmF0ZSI6eyJ0eXBlIjoiQnVmZmVyIiwiZGF0YSI6IklLcm1FQjdKUkVOSStpU3YvcURpQ3lCZ1F3ZHo0UGdDRlZ5UTNhSHhIWGs9In0sInB1YmxpYyI6eyJ0eXBlIjoiQnVmZmVyIiwiZGF0YSI6IjVXaC9xRUFOdllSZ0loUWZmT1BFUytYWE9MNzlISklsRVlySVlGTDE4aW89In19LCJzaWduZWRQcmVLZXkiOnsia2V5UGFpciI6eyJwcml2YXRlIjp7InR5cGUiOiJCdWZmZXIiLCJkYXRhIjoiMkpmVHQzN0YzbENXcDl6OURvdjU1VkVFL25aQU04L0xURDFsNVdPcmRXbz0ifSwicHVibGljIjp7InR5cGUiOiJCdWZmZXIiLCJkYXRhIjoiQ044Z29ob3NJWmdUL282andSN2FKb0ZPV3Vzd2lrYkhvRGQwblF2WnBUaz0ifX0sInNpZ25hdHVyZSI6eyJ0eXBlIjoiQnVmZmVyIiwiZGF0YSI6ImtnS2dZdlYyUUpLS2RPNTRJWi9BcXVNZ3BmRkU2MlgvNXV2NkJWd3JFN0ZyWi9tVVFlNW5RRURLWVdjNWVlWlFJcHhZSURvTldNYTdtUzJSaFFzampnPT0ifSwia2V5SWQiOjF9LCJyZWdpc3RyYXRpb25JZCI6MjE2LCJhZHZTZWNyZXRLZXkiOiJpRnVQZ1lBWUloU1FVNnduUnI3UnlBZDZQOWpmWDhnaXN2bGVjMUlwOHJVPSIsInByb2Nlc3NlZEhpc3RvcnlNZXNzYWdlcyI6W10sIm5leHRQcmVLZXlJZCI6MzEsImZpcnN0VW51cGxvYWRlZFByZUtleUlkIjozMSwiYWNjb3VudFN5bmNDb3VudGVyIjowLCJhY2NvdW50U2V0dGluZ3MiOnsidW5hcmNoaXZlQ2hhdHMiOmZhbHNlfSwiZGV2aWNlSWQiOiIwdDM2SjNTc1JZMlRRdU8tRWR1U3hBIiwicGhvbmVJZCI6Ijc2MmY2Y2UzLWEzMDgtNDdlZi04NjhkLThlZmJhMzhlNWJmNCIsImlkZW50aXR5SWQiOnsidHlwZSI6IkJ1ZmZlciIsImRhdGEiOiJTZDBVczNVMDdPczBqaVVPZnFLa1U3M2lCS0k9In0sInJlZ2lzdGVyZWQiOnRydWUsImJhY2t1cFRva2VuIjp7InR5cGUiOiJCdWZmZXIiLCJkYXRhIjoiMmwxOWt3OWhCSzR4NDRmcjMwdU5oelVHRElvPSJ9LCJyZWdpc3RyYXRpb24iOnt9LCJwYWlyaW5nQ29kZSI6IkhWNjExQzI0IiwibWUiOnsiaWQiOiI5MjMzNDQ0NDA5NjQ6MTdAcy53aGF0c2FwcC5uZXQiLCJsaWQiOiIyMjYwNzQ2NDY1OTc3MjU6MTdAbGlkIn0sImFjY291bnQiOnsiZGV0YWlscyI6IkNPRCtoZXdGRU9qOS9zb0dHQXdnQUNnQSIsImFjY291bnRTaWduYXR1cmVLZXkiOiJTU01xOWhEWVZqQnd6REl6VzhTdU9rZTQvalgzWW9kWnpmMndTYnhvcUQ0PSIsImFjY291bnRTaWduYXR1cmUiOiJpQjNZeFZ4K0RnZmZEZjdtbFh5UFIrUUFXOUxzdWRBcURIcjdEdmR5bGFSQXRPUnJaNHhGTzdZSW96QXFRU1dXNkU5Y1JSR2xEME1TMy8zbUNHKy9CZz09IiwiZGV2aWNlU2lnbmF0dXJlIjoiR1NLblhBdVVzcXgyakk3RVJmZ1llZ05YR0RtV2ZGVjNCTlN5VXJCOEQwekJ4c29jOWErNTc2YjZBdi9QT1BYWlVVSFdXRXJscEJjWEx3QWRqVTBpaVE9PSJ9LCJzaWduYWxJZGVudGl0aWVzIjpbeyJpZGVudGlmaWVyIjp7Im5hbWUiOiI5MjMzNDQ0NDA5NjQ6MTdAcy53aGF0c2FwcC5uZXQiLCJkZXZpY2VJZCI6MH0sImlkZW50aWZpZXJLZXkiOnsidHlwZSI6IkJ1ZmZlciIsImRhdGEiOiJCVWtqS3ZZUTJGWXdjTXd5TTF2RXJqcEh1UDQxOTJLSFdjMzlzRW04YUtnKyJ9fV0sInBsYXRmb3JtIjoiYW5kcm9pZCIsInJvdXRpbmdJbmZvIjp7InR5cGUiOiJCdWZmZXIiLCJkYXRhIjoiQ0FnSURRZ1MifSwibGFzdEFjY291bnRTeW5jVGltZXN0YW1wIjoxNzY3ODgyNDg1LCJsYXN0UHJvcEhhc2giOiIyVjc3cVUiLCJteUFwcFN0YXRlS2V5SWQiOiJBQUFBQURSTSJ9",

    // ═══════════════════════════════════════════════════════════
    // OWNER & ALERTING
    // ═══════════════════════════════════════════════════════════
    ownerNumber: "923344440964", // Your personal number
    alertNumber: "923175867622", // The number that receives alerts
    ownerName: "Taha",
    ownerTag: "@Taha",

    // ═══════════════════════════════════════════════════════════
    // MONITORING & STATUS
    // ═══════════════════════════════════════════════════════════
    keywords: ["Taha", "taha", "TAM", "tam"],
    recordingDelay: 20000, // 20 seconds as requested

    // ═══════════════════════════════════════════════════════════
    // AI SETTINGS
    // ═══════════════════════════════════════════════════════════
    aiApiKey: process.env.GROQ_API_KEY || "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",
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
        alertHeader: "🔔 *KEYWORD ALERT*",
        mentionHeader: "", // No header - clean response
        divider: "━━━━━━━━━━━━━━━━━━━━━",
        aiBadge: "ᵃⁱ" // Subtle badge
    }
};
