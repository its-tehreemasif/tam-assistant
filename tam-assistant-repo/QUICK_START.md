# 🚀 Quick Start - Get Your Bot Running in 5 Minutes

## Step 1: Clone & Install (1 min)

```bash
git clone https://github.com/its-tehreemasif/tam-assistant.git
cd tam-assistant
npm install
```

## Step 2: Create `.env` File (2 min)

Copy this template and fill in YOUR values:

```bash
# Copy template
cp .env.example .env

# Edit .env with your values
nano .env
# or
code .env
```

**What to add:**

```env
# ⚠️ REQUIRED - Your WhatsApp info
OWNER_NUMBER=923001234567        # Your WhatsApp number WITH country code!
ALERT_NUMBER=923001234567        # Same as owner or different number

# ⚠️ REQUIRED - AI API
GROQ_API_KEY=gsk_xxxxxxxxxxxxx   # Get FREE from https://console.groq.com

# OPTIONAL but RECOMMENDED - Cloud backup (survives restarts)
GITHUB_TOKEN=github_xxxxxxxxxxxxx  # Get from https://github.com/settings/tokens
```

### How to Get Each Key:

**GROQ_API_KEY (Free):**
1. Go to https://console.groq.com
2. Click "API Keys"
3. Click "Create API Key"
4. Copy the key
5. Paste into `.env`

**GITHUB_TOKEN (Free):**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Check box: `gist`
4. Click "Generate Token"
5. Copy immediately (you won't see it again!)
6. Paste into `.env`

## Step 3: Start Bot (30 sec)

```bash
npm start
```

## Step 4: QR Code Scan (1 min)

You'll see in terminal:
```
╭─ SCAN ME ─╮
│  [QR CODE APPEARS HERE]
│
╰────────────╯
```

**On your phone:**
1. Open WhatsApp
2. Go to Settings → Linked Devices
3. Click "Link a Device"
4. Point phone camera at the QR code
5. Scan it

## Step 5: Confirm Connection (10 sec)

Bot will send you a message:
```
✅ *TAM is online*
_Send !ping to confirm I can read your messages._
```

**Reply with:**
```
!ping
```

**Bot replies:**
```
🏓 *Pong!*
```

✅ **You're done!** Bot is now running.

---

## Test Commands

Try these to make sure everything works:

| Command | Response |
|---------|----------|
| `!ping` | `🏓 Pong!` |
| `!help` | List of all commands |
| `/ai hello` | AI responds with hello |
| `!stats` | Usage statistics |

---

## Common Issues & Quick Fixes

### Issue: Bot doesn't start
```bash
# Check for error message - it will tell you what's wrong
# Most common: missing OWNER_NUMBER or GROQ_API_KEY

# Fix: Edit .env and try again
nano .env
npm start
```

### Issue: No QR code appears
```bash
# QR might be scrolled up in terminal
# Scroll up to see it, or restart:
npm start
# Look carefully at terminal output
```

### Issue: Scan QR but bot stays offline
```bash
# Wait 30 seconds - it takes time to connect
# Check WhatsApp shows "Linked" in devices

# If still not working, try fresh login:
rm -rf session_assistant/
npm start
# Scan new QR code
```

### Issue: Bot doesn't reply to messages
```bash
# 1. Make sure you sent !ping and got reply first
# 2. Try using EXACT command format:
#    - /ai what is 2+2
#    - !ping
#    - !help

# 3. Check bot is still running (should show "Online!")
```

### Issue: "FATAL: OWNER_NUMBER is not set"
```bash
# Your .env file is missing OWNER_NUMBER
# Add this line to .env:
OWNER_NUMBER=923001234567
# Replace 923001234567 with YOUR WhatsApp number (with country code)
```

---

## Environment Variable Format

**Phone Numbers:**
- Include country code (+92, +1, +91, etc.)
- Format: `923001234567` (no +, no spaces)
- Example: Pakistan `923001234567` = +92 300 1234567

**API Keys:**
- Copy EXACTLY as shown (including prefix like `gsk_`)
- No spaces or extra characters
- Store in quotes in `.env` if it has special chars

**Example `.env`:**
```env
OWNER_NUMBER=923001234567
ALERT_NUMBER=923001234567
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxx
PORT=3000
LOG_LEVEL=warn
```

---

## Where to Get Help

**Bot won't start:**
→ Check `.env` has all required variables (see table below)

**Bot offline after 5 min:**
→ Session might be corrupted. Try: `rm -rf session_assistant/` then restart

**No replies to messages:**
→ First test with `!ping`, make sure that works

**Need detailed logs:**
→ Add to `.env`: `LOG_LEVEL=debug` (then restart)

**Lost session after server restart:**
→ Add `GITHUB_TOKEN` + `GIST_ID` to `.env` for cloud backup

---

## Environment Variables Checklist

✅ = Required  
⚠️ = Recommended  
🟢 = Optional  

| Variable | Value | Required |
|----------|-------|----------|
| `OWNER_NUMBER` | `92300...` | ✅ **YES** |
| `ALERT_NUMBER` | `92300...` | ✅ **YES** |
| `GROQ_API_KEY` | `gsk_...` | ✅ **YES** |
| `GITHUB_TOKEN` | `ghp_...` | ⚠️ Recommended |
| `GIST_ID` | (auto-created) | 🟢 Optional |
| `PORT` | `3000` | 🟢 Optional |
| `LOG_LEVEL` | `warn` or `debug` | 🟢 Optional |

---

## Deployment (After Testing Locally)

### Option 1: Render (Free & Easy)
1. Push code to GitHub
2. Go to https://render.com
3. Create "New" → "Web Service"
4. Connect your GitHub repo
5. Add environment variables in Settings
6. Deploy!

### Option 2: Replit (Free)
1. Import repo from GitHub
2. Create `.env` with variables
3. Run: `npm start`
4. Keep tab open (or pay for Always-On)

### Option 3: Your Own Server
```bash
npm install -g pm2
pm2 start tam-assistant.js --name tam
pm2 startup
pm2 save
# Bot runs forever even after restart
```

---

## Next Steps After Setup

1. ✅ Bot is running and responding
2. 👉 Read `README.md` for all commands
3. 📖 Read `FIXES_SUMMARY.md` to understand the improvements
4. 🔒 Add `GITHUB_TOKEN` for data backup (recommended)
5. 🚀 Deploy to Render or your server

---

## Quick Command Reference

```
!ping              → Check if bot is online
!help              → Show all commands
!stats             → See usage stats
!reset             → Clear chat history

!remind 30min Call  → Set a reminder
!note add TODO     → Save a note
!ban 92300...      → Block a user
!translate es hi   → Translate

/ai What is AI?    → Ask the AI anything
```

---

**Still having issues?**

1. Check your `.env` file one more time
2. Look at console output for error messages
3. Read `README.md` for detailed help
4. Read `FIXES_SUMMARY.md` to understand the fixes

Good luck! 🎉
