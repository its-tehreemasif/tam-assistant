#!/usr/bin/env node
/**
 * Export WhatsApp session as base64 string for SESSION_ID
 * Usage: node export-session.js
 */

const fs = require('fs');
const path = require('path');

const SESSION_PATH = './session_assistant';

console.log('\n📱 TAM Assistant - Session Exporter v2.1\n');

try {
    if (!fs.existsSync(SESSION_PATH)) {
        console.error('❌ ERROR: No session found at', SESSION_PATH);
        console.log('   Run bot first with QR scan, then try again.\n');
        process.exit(1);
    }

    const sessionData = {};
    const files = fs.readdirSync(SESSION_PATH);
    let count = 0;

    for (const f of files) {
        const fp = path.join(SESSION_PATH, f);
        if (fs.statSync(fp).isFile() && f.endsWith('.json')) {
            try {
                const content = fs.readFileSync(fp, 'utf-8');
                const parsed = JSON.parse(content);
                sessionData[f.replace('.json', '')] = parsed;
                count++;
            } catch (e) {
                console.warn(`⚠️  Skipped ${f}: Invalid JSON`);
            }
        }
    }

    if (count === 0) {
        console.error('❌ No session files found in', SESSION_PATH);
        process.exit(1);
    }

    const base64 = Buffer.from(JSON.stringify(sessionData)).toString('base64');

    console.log('✅ Successfully exported session files:');
    console.log(`   • Files exported: ${count}`);
    console.log(`   • Size: ${base64.length} characters\n`);

    console.log('════════════════════════════════════════════════════════════════');
    console.log('SESSION_ID FOR .env (Copy everything below):');
    console.log('════════════════════════════════════════════════════════════════\n');
    console.log(base64);
    console.log('\n════════════════════════════════════════════════════════════════\n');

    console.log('📋 Instructions:');
    console.log('   1. Copy the SESSION_ID above (entire base64 string)');
    console.log('   2. Go to Render Dashboard → Environment Variables');
    console.log('   3. Update SESSION_ID with the copied value');
    console.log('   4. Click "Save" - Render will auto-redeploy');
    console.log('   5. Wait 2-3 minutes for deployment');
    console.log('   6. Check logs for: [AUTH] ✅ Restored X session files');
    console.log('   7. Bot should connect WITHOUT QR code!\n');

    console.log('💡 Optional: Set DASHBOARD_PASSWORD');
    console.log('   • Default: tam2024');
    console.log('   • Change in Render → Environment Variables\n');

} catch (e) {
    console.error('❌ Error:', e.message);
    console.log('   Make sure session_assistant/ directory exists');
    process.exit(1);
}
