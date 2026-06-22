# TAM Personal Assistant v2.0

A WhatsApp-based AI personal assistant built with Baileys and powered by Groq AI. Supports voice transcription, image analysis, notes, reminders, keyword alerts, and more.

## Features

- **AI Chat** – Intelligent conversations with context history
- **Voice Transcription** – Transcribe audio messages with OCR support
- **Image Analysis** – Vision-based image recognition and text extraction
- **Notes Management** – Save, list, and delete personal notes
- **Smart Reminders** – Set recurring and one-time reminders
- **Keyword Alerts** – Get notified when specific keywords are mentioned
- **Statistics Tracking** – Monitor usage patterns and bot activity
- **Persistent Storage** – Data survives server restarts (GitHub Gist)
- **Session Management** – Maintain WhatsApp session across deployments

## Setup

### Prerequisites
- Node.js 18+ 
- npm or yarn
- WhatsApp account
- GitHub account (for persistent storage)
- Groq API key (free at https://console.groq.com)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/its-tehreemasif/tam-assistant.git
cd tam-assistant
npm install
```

2. **Create `.env` file**
```bash
cp .env.example .env
```

3. **Configure environment variables** (REQUIRED):
```env
# WhatsApp & Connectivity
OWNER_NUMBER=923001234567        # Your WhatsApp number (country code required)
ALERT_NUMBER=923009876543        # Alert recipient number
SESSION_ID=                       # (Optional) Existing session – leave empty for QR login

# AI Configuration
GROQ_API_KEY=your_groq_api_key  # https://console.groq.com

# GitHub Integration (Optional but recommended)
GITHUB_TOKEN=your_github_token  # Token with 'gist' scope for persistence
GIST_ID=                         # Leave empty for auto-creation

# API Keys (Optional)
OCR_API_KEY=                     # For handwriting OCR (optional)

# Server
PORT=3000
LOG_LEVEL=warn                  # 'warn' for normal, 'debug' for troubleshooting
```

### Getting API Keys

**Groq API Key:**
1. Go to https://console.groq.com
2. Sign up/login
3. Create an API key
4. Copy to `GROQ_API_KEY` in `.env`

**GitHub Token:**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scope: `gist`
4. Copy to `GITHUB_TOKEN` in `.env`

## Running the Bot

```bash
# Development
npm start

# Production
node tam-assistant.js
```

### Initial Login

On first run, the bot will display a **QR code** in the terminal:
1. Open WhatsApp on your phone
2. Settings → Linked Devices
3. Scan the QR code
4. Bot will confirm: "✅ *TAM is online*"

## Commands

Send these commands on WhatsApp:

### AI & Chat
- `/ai [question]` – Ask AI anything
- `!reset` – Clear conversation history
- `!history` – View chat history

### Voice & Vision
- Send an audio message – Automatic transcription
- Send an image – Automatic caption generation
- `!vision` – Analyze image with description

### Notes
- `!note add [text]` – Save a note
- `!note list` – View all notes
- `!note delete [number]` – Delete a note
- `!note clear` – Clear all notes

### Reminders
- `!remind [time] [message]` – Set a reminder
  - Examples: `!remind 30min Call client` or `!remind 2h Check emails`
- `!remind list` – View active reminders
- `!remind cancel [id]` – Cancel a reminder

### Alerts & Management
- `!keyword add [word]` – Add keyword alert
- `!keyword list` – View keyword list
- `!keyword reset` – Reset to default keywords
- `!ban [number]` – Ban a user
- `!unban [number]` – Unban a user
- `!stats` – View bot statistics
- `!ping` – Confirm bot is online
- `!help` – Show command list

### Translation
- `!translate [lang] [text]` – Translate text
- Example: `!translate spanish hello world`

### Calculations
- `!calc [expression]` – Calculate math
- Example: `!calc 2 + 2 * 3`

## Troubleshooting

### Bot Not Responding

**Check 1: Verify Bot is Running**
```bash
# Look for this message in logs:
# ✅ [CONNECTION] Online! TAM Assistant v2.0 is live.
```

**Check 2: Validate Environment Variables**
```bash
echo $OWNER_NUMBER
echo $GROQ_API_KEY
# Make sure both are set and correct format
```

**Check 3: Check Session File**
```bash
ls -la session_assistant/
# Should have: creds.json and other .json files
```

**Check 4: View Detailed Logs**
```bash
# In .env, set:
LOG_LEVEL=debug
# Then restart bot for verbose output
```

### "FATAL: OWNER_NUMBER is not set"
- Edit `.env` and add your WhatsApp number with country code
- Format: `OWNER_NUMBER=923001234567` (for Pakistan +92)

### "FATAL: GROQ_API_KEY is not set"
- Get free key from https://console.groq.com
- Add to `.env`: `GROQ_API_KEY=your_key`

### Session Lost After Restart
- Set `GITHUB_TOKEN` and `GIST_ID` to persist data
- Or save `SESSION_ID` from logs for manual recovery

### Bot Too Slow / Rate Limited
- Check `rateLimiter` config in `config.js`
- Default: 30 messages per 60 seconds
- Reduce request frequency or wait for cooldown

## Architecture

```
tam-assistant/
├── tam-assistant.js           # Main bot loop & message handler
├── config.js                  # Configuration & defaults
├── lib/
│   ├── aiManager.js          # Groq AI interface with history
│   ├── persistence.js        # Data layer (local + GitHub Gist)
│   ├── gistStore.js          # GitHub Gist integration
│   ├── voiceTranscription.js # Audio-to-text with Groq
│   ├── vision.js             # Image analysis (local + remote)
│   ├── rateLimit.js          # Per-user rate limiting
│   ├── scheduler.js          # Reminder scheduling
│   └── dashboard.js          # Web UI for management
└── session_assistant/        # WhatsApp session (auto-generated)
    └── creds.json           # Session credentials
```

## Data Persistence

All data (notes, reminders, stats, bans, keywords) is saved in two places:

1. **Local JSON** (`./data/`) – Immediate fallback
2. **GitHub Gist** – Cloud backup that survives restarts

The bot attempts GitHub first, falls back to local JSON if offline.

## Performance Tips

1. Use `SESSION_ID` for faster logins (skip QR scan)
2. Set `LOG_LEVEL=warn` in production (not `debug`)
3. Limit conversation history: `maxHistory` in `AIManager`
4. Archive old reminders monthly
5. Monitor Groq API quota at https://console.groq.com

## Security Notes

- ⚠️ Never commit `.env` to Git (use `.env.example` as template)
- Store tokens in environment variables, never hardcode
- WhatsApp session files contain encryption keys – don't share
- GitHub Gist is private – only you can access with your token
- Bot runs with user's own WhatsApp account – all conversations are seen by the account holder

## Deployment

### Render (Free Tier)
1. Push repo to GitHub
2. Create Render Web Service
3. Connect GitHub repo
4. Set environment variables in Render Settings
5. Deploy – bot will start automatically

### Replit
1. Import from GitHub
2. Create `.env` with variables
3. Run: `npm start`
4. Keep tab open or use Replit Always-On

### Your Own Server
```bash
npm install -g pm2
pm2 start tam-assistant.js --name "tam-bot"
pm2 startup
pm2 save
```

## Recent Fixes (v2.1)

✅ Fixed critical startup crash – added environment validation  
✅ Removed hardcoded phone numbers (security)  
✅ Added AI response validation – prevents empty replies  
✅ Fixed session save race condition – prevents data corruption  
✅ Improved error recovery for persistence layer  

## Contributing

Found a bug? Have a feature request?
- Open an issue on GitHub
- Submit a pull request
- Email: contact@tamtech.dev

## License

MIT – Feel free to use and modify

## Support

- 📖 Read the README
- 🐛 Check GitHub Issues
- 💬 WhatsApp: Send `!help` to the bot
- 📧 Email support available

---

**Version:** 2.1 | **Last Updated:** June 2026 | **Status:** Stable ✅
