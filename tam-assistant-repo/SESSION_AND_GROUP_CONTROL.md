# TAM Assistant v2.1 - SESSION_ID & GROUP CONTROL IMPLEMENTATION

## Problem Solved

1. **SESSION_ID Now Works**: If you provide `SESSION_ID` in environment variables, bot uses it directly - NO QR CODE
2. **Group Filtering**: Bot can be restricted to work only in specific groups
3. **Personal Chat Always Works**: Your personal/self-chat and DMs always work regardless of group settings

---

## Feature 1: SESSION_ID (No QR Code)

### How It Works

When `SESSION_ID` is set in environment variables:
- Bot skips QR code entirely
- Uses stored session from `SESSION_ID`
- Connects directly without waiting for scan

### Setup

**Step 1: Export Your Session (First Time)**

After bot successfully scans QR code once:

```bash
node export-session.js
```

This outputs a long base64 string - copy it.

**Step 2: Add to Render**

1. Go to Render Dashboard → Your Service
2. Click "Environment" in settings
3. Add new variable: `SESSION_ID`
4. Paste the base64 string as value
5. Click "Save" (auto-redeploys)

**Step 3: Bot Connects Directly**

When bot restarts:
- Reads `SESSION_ID` from environment
- Loads all session files
- Connects to WhatsApp
- **No QR code appears** ✅

### Technical Details

Session format:
```javascript
{
  "creds.json": { /* credentials */ },
  "pre-key-1.json": { /* signal key */ },
  "pre-key-2.json": { /* signal key */ },
  // ... all session files
}
```

All converted to base64 for environment variable storage.

---

## Feature 2: Group Access Control

### How It Works

**Scenario 1: Allow Bot in ALL Groups**

```env
ENFORCE_GROUP_WHITELIST=false
ALLOWED_GROUPS=
```

Result: Bot responds in all groups + personal chat

**Scenario 2: Whitelist Specific Groups**

```env
ENFORCE_GROUP_WHITELIST=true
ALLOWED_GROUPS=120363000000000001@g.us,120363000000000002@g.us
```

Result: 
- Bot responds ONLY in those 2 groups
- Bot responds in personal chat (always allowed)
- Bot silently ignores non-whitelisted groups

**Scenario 3: Blacklist Approach (Future)**

Currently not implemented, but can be added.

### Getting Group IDs

**Method 1: From Render Logs**

When bot receives a group message, logs show:

```
[UPSERT] type=notify fromMe=false remote=@g.us
```

Check full logs for group ID format: `120363000000000001@g.us`

**Method 2: Manual**

In WhatsApp:
- Right-click group → Group Info
- Look in URL or notification

### Implementation Rules

```
if ENFORCE_GROUP_WHITELIST = false:
  ✅ Bot works everywhere (all groups + personal chat)

if ENFORCE_GROUP_WHITELIST = true:
  if message from personal chat:
    ✅ Always allowed
  else if message from group:
    if group in ALLOWED_GROUPS:
      ✅ Allowed
    else:
      ❌ Silently ignored
```

---

## Complete Setup Example

### Scenario: Your Use Case

**Goal**: Bot on your personal number, works in:
- Your personal chat (self-chat, Note to Self)
- 2 specific group chats with friends
- Blocks everywhere else

**Configuration**:

```env
# Personal WhatsApp number
OWNER_NUMBER=923001234567
ALERT_NUMBER=923001234567

# Use session so no QR needed
SESSION_ID=eyJjcmVkcy5qc29u...

# Strict group control
ENFORCE_GROUP_WHITELIST=true
ALLOWED_GROUPS=120363111111111111@g.us,120363222222222222@g.us

# Everything else
GROQ_API_KEY=gsk_...
GITHUB_TOKEN=ghp_...
```

**Result**:
- ✅ Personal chat: Responds to all commands
- ✅ Group 1: Responds to all commands
- ✅ Group 2: Responds to all commands
- ❌ Other groups: Silently ignores all messages
- ❌ Strangers: No response

---

## Deployment Steps

### 1. Extract Package

```bash
tar -xzf tam-assistant-v4-SESSION-FIX.tar.gz
cd tam-assistant-v4-SESSION-FIX
```

### 2. First Run (Generate Session)

```bash
npm install
npm start
```

Scan QR code when prompted.

### 3. Export Session

```bash
node export-session.js
```

Copy the output (long base64 string).

### 4. Update Render

1. Disconnect current service
2. Reconnect repository
3. Wait for build
4. In Settings → Environment, add:
   - `SESSION_ID=` (paste base64 string)
   - `ENFORCE_GROUP_WHITELIST=true` (if using whitelist)
   - `ALLOWED_GROUPS=` (paste group IDs)
5. Save (auto-redeploys)

### 5. Verify Connection

Check Render logs:
```
[AUTH] ✅ Session restored from SESSION_ID (5 files) — NO QR NEEDED
[CONNECTION] Online! TAM Assistant v2.1 is live
```

**No QR code message = Success!** ✅

---

## Code Changes Made

### 1. `bootstrapSession()` Function

```javascript
// NEW: Better SESSION_ID loading
if (sid && sid.length > 50) {
    // Decode base64 → JSON
    // Load all session files
    // Log success: "✅ Session restored from SESSION_ID"
    return; // Don't request QR
}
```

**Before**: QR code requested even if SESSION_ID existed  
**After**: Session loaded directly, no QR

### 2. Socket Creation

```javascript
// NEW: Conditional QR printing
const hasSessionId = !!(config.sessionId || process.env.SESSION_ID);
const shouldPrintQR = !hasSessionId; // Only if NO session
makeWASocket({
    printQRInTerminal: shouldPrintQR,
    // ...
});
```

**Before**: QR always printed  
**After**: QR only if no SESSION_ID

### 3. Message Handler

```javascript
// NEW: Group whitelist check
if (isGroup && config.enforceGroupWhitelist && config.allowedGroups.length > 0) {
    if (!config.allowedGroups.includes(from)) {
        return; // Silently ignore
    }
}
```

**Before**: No group filtering  
**After**: Respects ALLOWED_GROUPS whitelist

### 4. Config File

```javascript
allowedGroups: (process.env.ALLOWED_GROUPS || '').split(',').filter(g => g.trim()),
enforceGroupWhitelist: process.env.ENFORCE_GROUP_WHITELIST === 'true',
```

**Before**: No group config  
**After**: Full group access control

---

## FAQ

**Q: Do I need to export session every time?**  
A: No, only once. After first QR scan, export and add to environment.

**Q: What if SESSION_ID is invalid?**  
A: Bot logs error and falls back to QR code on next restart.

**Q: Can I change allowed groups without restarting?**  
A: No, groups are checked at startup. Update env and redeploy.

**Q: Does group whitelist affect personal chat?**  
A: No, personal chat ALWAYS works regardless of settings.

**Q: What format is group ID?**  
A: `{number}@g.us` - example: `120363111111111111@g.us`

**Q: How do I get my group ID?**  
A: Check Render logs when bot receives message, or ask for it via commands.

---

## Professional Notes

- **Security**: SESSION_ID contains cryptographic keys - keep it private
- **Privacy**: Group whitelist silently ignores non-whitelisted groups (no notifications)
- **Scalability**: Can whitelist unlimited groups (comma-separated)
- **Reliability**: If SESSION_ID corrupts, bot falls back to QR
- **Performance**: No performance impact from group filtering (single check per message)

---

## Next Steps

1. Extract the zip file
2. Run bot first time to generate session
3. Run `export-session.js`
4. Add SESSION_ID to Render
5. Set group whitelist if needed
6. Redeploy and verify in logs

---

**Version**: 2.1 (SESSION & GROUP CONTROL)  
**Status**: Production Ready  
**Last Updated**: June 2026
