# TAM ASSISTANT - GitHub Deploy & Commands Guide

## ⚡ QUICK SUMMARY
- **Archive**: `tam-assistant-fixed.tar.gz` (50 KB, excludes node_modules)
- **Status**: ✅ Ready to deploy
- **Git Commands**: 6 simple steps
- **Bot Commands**: 20+ available

---

## 📦 PUSHING TO GITHUB - STEP BY STEP

### **Option A: Fresh Repo (Recommended)**

```bash
# 1. Create new repo on GitHub at github.com/new
#    Name: tam-assistant
#    Private or Public (choose)
#    Leave other options empty

# 2. Extract archive (if needed)
tar -xzf tam-assistant-fixed.tar.gz
cd tam-assistant-fixed

# 3. Initialize git (only if starting fresh)
git init
git add .
git commit -m "Initial commit: TAM Assistant v2.1 Fixed"

# 4. Add remote and push
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/tam-assistant.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

---

### **Option B: Update Existing Repo**

If you already have tam-assistant repo:

```bash
# 1. Go to your repo
cd ~/path/to/your/tam-assistant

# 2. Extract fixed version files
tar -xzf tam-assistant-fixed.tar.gz --strip-components=1

# 3. Commit changes
git add .
git commit -m "Update: TAM Assistant v2.1 - Critical fixes and documentation"

# 4. Push to GitHub
git push origin main
```

---

### **Option C: Force Update (If conflicts)**

```bash
# Remove old files
rm -rf tam-assistant-fixed/

# Extract new version
tar -xzf tam-assistant-fixed.tar.gz

# Go to directory
cd tam-assistant-fixed

# Initialize fresh
rm -rf .git
git init
git add .
git commit -m "TAM Assistant v2.1 - Complete rebuild"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/tam-assistant.git
git push -u origin main --force
```

---

## 🔐 AFTER PUSHING TO GITHUB

### **Create .env file (Local Only, Never Commit)**

```bash
# Copy template
cp .env.example .env

# Edit with your values
nano .env
# or
vim .env
```

Add these required values:
```env
OWNER_NUMBER=923001234567
ALERT_NUMBER=923001234567
GROQ_API_KEY=gsk_xxxxx...
GITHUB_TOKEN=ghp_xxxxx...
```

### **Verify .env is Ignored**

```bash
# Check if .env is in .gitignore
cat .gitignore | grep ".env"

# Should show: .env
# If not, add it:
echo ".env" >> .gitignore
git add .gitignore
git commit -m "Ensure .env is never committed"
git push
```

---

## 📋 GIT COMMANDS QUICK REFERENCE

```bash
# Clone your repo locally
git clone https://github.com/YOUR_USERNAME/tam-assistant.git
cd tam-assistant

# Check status
git status

# See your changes
git diff

# See commit history
git log --oneline -10

# Add all changes
git add .

# Commit with message
git commit -m "Your message here"

# Push to GitHub
git push origin main

# Pull latest from GitHub
git pull origin main

# Create new branch
git checkout -b feature/your-feature-name

# Switch branches
git checkout main

# Delete branch
git branch -d feature/your-feature-name
```

---

## 🤖 ALL BOT COMMANDS

### **Core Commands**

| Command | Usage | Response |
|---------|-------|----------|
| `!ping` | `!ping` | Returns: 🏓 *Pong!* |
| `!help` | `!help` | Shows all available commands |
| `!alive` | `!alive` | Confirms bot is online |
| `!status` | `!status` | Shows bot status & uptime |

### **AI Commands**

| Command | Usage | Response |
|---------|-------|----------|
| `/ai` | `/ai What is AI?` | AI response using Groq |
| `@tam` | `@tam hello` | Mentions bot with question |
| `?` | `? meaning of life` | Quick AI question with ? prefix |
| `/think` | `/think solve this` | Detailed AI thinking |

### **Notes & Memory**

| Command | Usage | Notes |
|---------|-------|-------|
| `!note` | `!note Remember this` | Saves a note |
| `!notes` | `!notes` | Shows all saved notes |
| `!delnote` | `!delnote Remember this` | Delete specific note |
| `!clearnotes` | `!clearnotes` | Delete ALL notes |
| `!search` | `!search keyword` | Search notes by keyword |

### **Reminders**

| Command | Usage | Notes |
|---------|-------|-------|
| `!remind` | `!remind 5min Call mom` | Set reminder (5min, 1hr, 2day) |
| `!reminders` | `!reminders` | List all reminders |
| `!delremind` | `!delremind Call mom` | Delete specific reminder |
| `!clearreminders` | `!clearreminders` | Delete ALL reminders |

### **Statistics & Info**

| Command | Usage | Response |
|---------|-------|----------|
| `!stats` | `!stats` | Shows bot statistics |
| `!uptime` | `!uptime` | Bot running time |
| `!version` | `!version` | Bot version info |
| `!info` | `!info` | Bot information |

### **User Management**

| Command | Usage | Notes |
|---------|-------|-------|
| `!ban` | `!ban @user` | Ban user from bot |
| `!unban` | `!unban @user` | Unban user |
| `!bans` | `!bans` | List banned users |
| `!owner` | `!owner` | Shows owner info |

### **Keyword Alerts**

| Command | Usage | Notes |
|---------|-------|-------|
| `!addkeyword` | `!addkeyword urgent` | Alert on keyword mention |
| `!keywords` | `!keywords` | List watched keywords |
| `!delkeyword` | `!delkeyword urgent` | Stop watching keyword |
| `!clearkeywords` | `!clearkeywords` | Clear all keywords |

### **Media & Files**

| Command | Usage | Notes |
|---------|-------|-------|
| `!ocr` | Send image, then `!ocr` | Extract text from image |
| `!read` | `!read` on document | Extract text from document |
| `!img` | `!img sunset` | Generate/fetch image (if enabled) |

### **Settings & Config**

| Command | Usage | Notes |
|---------|-------|-------|
| `!setprefix` | `!setprefix $` | Change command prefix |
| `!settings` | `!settings` | Show current settings |
| `!reset` | `!reset` | Reset to defaults |

### **Debug & Admin (Owner Only)**

| Command | Usage | Notes |
|---------|-------|-------|
| `!debug` | `!debug` | Shows debug info |
| `!logs` | `!logs` | Shows recent logs |
| `!restart` | `!restart` | Restart bot |
| `!shutdown` | `!shutdown` | Stop bot |

### **Fun Commands**

| Command | Usage | Response |
|---------|-------|----------|
| `!joke` | `!joke` | Tells a random joke |
| `!quote` | `!quote` | Inspirational quote |
| `!fact` | `!fact` | Random fact |
| `!emoji` | `!emoji` | Random emoji |

---

## 📝 COMMAND SYNTAX NOTES

### **Reminder Durations**
```
!remind 5min       → 5 minutes
!remind 30min      → 30 minutes
!remind 1hr        → 1 hour
!remind 2hrs       → 2 hours
!remind 1day       → 1 day
!remind 2days      → 2 days
!remind 1week      → 1 week
```

### **Mention Syntax**
```
@tam your message           → Mention bot by name
!command @username          → Mention specific user
!ban +1234567890           → Use WhatsApp number
```

### **Message Types**
```
Text message      → Direct message
Group message     → Works in groups
Image+command     → Send image, then command
Voice note        → Some commands support audio
```

---

## 🚀 DEPLOYMENT OPTIONS

### **Option 1: Render.com (Easiest)**
```bash
# 1. Push code to GitHub
# 2. Go to render.com
# 3. Create new Web Service
# 4. Connect to GitHub repo
# 5. Add environment variables
# 6. Deploy!
```

### **Option 2: Heroku**
```bash
# 1. Install Heroku CLI
# 2. heroku login
# 3. heroku create your-app-name
# 4. git push heroku main
# 5. heroku config:set VAR=value
```

### **Option 3: Your VPS/Server**
```bash
# 1. SSH into server
# 2. Clone repo: git clone ...
# 3. Install: npm install
# 4. Create .env file
# 5. Run: npm start
# 6. Use PM2 to keep running: pm2 start tam-assistant.js
```

### **Option 4: Docker**
```bash
# Create Dockerfile
docker build -t tam-assistant .
docker run -d --env-file .env tam-assistant
```

---

## ⚠️ IMPORTANT BEFORE DEPLOYING

### **Security Checklist**
```
✅ Never commit .env to GitHub
✅ Add .env to .gitignore
✅ All secrets in environment variables only
✅ Use strong API keys (don't reuse)
✅ Keep GITHUB_TOKEN private
✅ Update dependencies regularly
✅ Monitor logs for errors
```

### **Pre-Deployment Commands**
```bash
# Test locally first
npm install
npm start

# Check for errors
npm run lint          # If available

# Test commands
# Send: !ping
# Expect: 🏓 Pong!

# Then deploy
git push origin main
```

---

## 📊 FOLDER STRUCTURE

```
tam-assistant-fixed/
├── tam-assistant.js          # Main bot file
├── config.js                 # Configuration
├── package.json              # Dependencies
├── .env.example              # Template
├── README.md                 # Full guide
├── QUICK_START.md            # 5-min setup
├── START_HERE.md             # Navigation
├── FIXES_SUMMARY.md          # Technical fixes
├── WHAT_WAS_FIXED.md         # Visual overview
├── PATCH_NOTES.txt           # Release notes
├── FOR_YOU.txt               # Important info
├── lib/
│   ├── aiManager.js          # AI handling
│   ├── rateLimit.js          # Rate limiting
│   ├── gistStore.js          # GitHub Gist
│   └── persistence.js        # Data storage
├── session_assistant/        # WhatsApp session (auto-created)
├── .gitignore                # Git ignore rules
└── data/
    ├── banned.json           # Banned users
    ├── stats.json            # Statistics
    ├── notes.json            # Saved notes
    └── reminders.json        # Reminders
```

---

## 🆘 TROUBLESHOOTING GIT COMMANDS

### **Problem: Changes not showing on GitHub**
```bash
# Check status
git status

# Add everything
git add .

# Commit
git commit -m "message"

# Push
git push origin main
```

### **Problem: Merge conflicts**
```bash
# Pull first
git pull origin main

# Resolve conflicts manually

# Then commit and push
git add .
git commit -m "Resolved conflicts"
git push origin main
```

### **Problem: Wrong commit message**
```bash
# Change last commit message
git commit --amend -m "New message"

# Force push (careful!)
git push origin main --force
```

### **Problem: Accidentally committed .env**
```bash
# Remove from git (but keep local)
git rm --cached .env

# Add to gitignore
echo ".env" >> .gitignore

# Commit
git commit -m "Stop tracking .env"

# Push
git push origin main
```

---

## ✅ VERIFICATION CHECKLIST

After pushing to GitHub:

- [ ] Repository shows on github.com
- [ ] All files are present (check file count)
- [ ] .env is NOT visible in repo
- [ ] node_modules is NOT in repo
- [ ] session_assistant is NOT in repo
- [ ] README.md displays nicely
- [ ] All 7 guides are present
- [ ] Local .env file created with values
- [ ] Bot starts: `npm install && npm start`
- [ ] Bot responds to `!ping` command
- [ ] WhatsApp session established
- [ ] Reminders and notes work

---

## 🎁 BONUS: GitHub Actions (Auto-Deployment)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Render

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy
        run: |
          curl ${{ secrets.RENDER_DEPLOY_HOOK }}
```

---

## 📞 FINAL NOTES

1. **Start with QUICK_START.md** - Get bot running in 5 minutes
2. **Push to GitHub** - Follow Option A or B above
3. **Test locally first** - Before deploying to server
4. **Keep .env secret** - Never commit to GitHub
5. **Monitor logs** - Check for errors regularly
6. **Update regularly** - Security and bug fixes
7. **Backup your data** - GitHub Gist + local JSON backups

---

## 🚀 YOU'RE ALL SET!

Your bot is:
- ✅ Fixed (5 critical bugs resolved)
- ✅ Documented (7 comprehensive guides)
- ✅ Secure (no hardcoded secrets)
- ✅ Ready to deploy (just follow steps above)

**Next Step**: Run these commands:
```bash
cd tam-assistant-fixed
cp .env.example .env
# Edit .env with your values
npm install
npm start
```

**Happy Coding!** 🚀✨

