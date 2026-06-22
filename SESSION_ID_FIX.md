# TAM Assistant v2.1 - SESSION_ID Fix & Dashboard Login Guide

## Problem: QR Code Shows Despite SESSION_ID Being Set

**Root Cause**: The SESSION_ID needs to contain ALL session files (creds.json + signal keys), not just a partial session.

---

## Solution 1: Export Session from Working Bot (BEST)

If your bot is currently running with a valid session:

### Step 1: Get Session Export Script

Create `export-session.js` in your bot directory:

```javascript
const fs = require('fs');
const path = require('path');

const SESSION_PATH = './session_assistant';

try {
    const sessionData = {};
    const files = fs.readdirSync(SESSION_PATH);
    
    for (const f of files) {
        const fp = path.join(SESSION_PATH, f);
        if (fs.statSync(fp).isFile() && f.endsWith('.json')) {
            const content = fs.readFileSync(fp, 'utf-8');
            sessionData[f.replace('.json', '')] = JSON.parse(content);
        }
    }
    
    const base64 = Buffer.from(JSON.stringify(sessionData)).toString('base64');
    console.log('\n' + '='.repeat(80));
    console.log('SESSION_ID FOR .env:');
    console.log('='.repeat(80));
    console.log(base64);
    console.log('='.repeat(80) + '\n');
    
} catch (e) {
    console.error('Error:', e.message);
}
```

### Step 2: Run Export

```bash
node export-session.js
```

### Step 3: Copy to Render

1. Go to **Render Dashboard** → Your Service → **Environment**
2. Add/Update: `SESSION_ID=` (paste the long base64 string)
3. Click **"Save"** - Render auto-redeploys
4. Wait 2-3 minutes
5. Check logs for: `[AUTH] ✅ Restored X session files from SESSION_ID`

---

## Solution 2: Use Fresh QR Scan (Quick)

If the above doesn't work:

### Step 1: Clear Session

```bash
# On your local machine
rm -rf session_assistant/

# OR on Render (via logs), it will auto-clear after a few hours
```

### Step 2: Restart Bot

```bash
npm start
```

### Step 3: Scan QR Code

- Check bot logs for QR code
- Scan with WhatsApp on connected device
- Wait for `[CONNECTION] Online! TAM Assistant is live`

### Step 4: Export & Save

Once connected:
- Run `export-session.js` (see Solution 1)
- Save SESSION_ID to .env for next restart

---

## Dashboard Login Information

**URL**: `your-app-name.onrender.com/login`

**Default Password**: `tam2024`

### Change Password (Recommended)

1. Go to **Render Dashboard** → Service → **Environment**
2. Add/Update: `DASHBOARD_PASSWORD=your_new_password`
3. Click **"Save"** - Render auto-redeploys
4. Use new password on next login

---

## Why Still Getting QR Code?

### Issue 1: SESSION_ID Not Set
- Check Render environment variables
- Make sure `SESSION_ID=` has value (not empty)
- Redeploy after saving

### Issue 2: SESSION_ID Wrong Format
- Must be valid base64
- Must decode to JSON
- Must have `creds` key
- Test: `echo "SESSION_ID_value" | base64 -d`

### Issue 3: Session Expired/Invalid
- Signal keys expire after 30 days without device login
- Solution: Do fresh QR scan, export new SESSION_ID

### Issue 4: GITHUB_TOKEN Missing
- Without it, Gist session also fails to load
- Without BOTH, falls back to QR
- Fix: Add `GITHUB_TOKEN` to Render environment

---

## Quick Checklist

- [ ] SESSION_ID is set (not empty)
- [ ] SESSION_ID is valid base64
- [ ] SESSION_ID contains multiple files (not just creds)
- [ ] GITHUB_TOKEN is set
- [ ] Render redeploy completed (2-3 min)
- [ ] Logs show `[AUTH] ✅ Restored X session files`

---

## Testing SESSION_ID

To verify SESSION_ID works before deploying:

```bash
# Local test
SESSION_ID="your_base64_value" npm start
```

Check logs for:
```
[AUTH] ✅ Restored 44 session files from SESSION_ID
[CONNECTION] Online! TAM Assistant is live
```

If you see this, session is working!

---

## Still Having Issues?

Try this order:

1. **Check logs** - Look for `[AUTH]` messages
2. **Verify SESSION_ID** - Make sure it's set and not empty
3. **Clear & rescan** - Delete session, scan fresh QR
4. **Export properly** - Use the script above to export all files
5. **Check GitHub token** - Without it, backup fails

---

## Important Notes

- SESSION_ID changes every time you scan a new QR
- Old SESSION_ID won't work after 30 days
- You can only have one active session per phone number
- Test on a test number first if possible
- Signal keys in session are ENCRYPTED and safe to store in .env

---

**Version**: v2.1 (SESSION-FIX)  
**Updated**: June 2026  
**Status**: Production Ready
