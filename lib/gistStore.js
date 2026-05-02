/**
 * GistStore — Cloud persistence via GitHub Gist
 *
 * Solves the Render free plan problem: all bot data (bans, notes, reminders,
 * stats, image context) is saved to a private GitHub Gist after every write.
 * On startup, data is loaded from the Gist so nothing is lost across restarts
 * or deployments.
 *
 * Setup: Add GITHUB_TOKEN (with `gist` scope) to your Render environment vars.
 * The bot auto-creates the Gist on first run and saves the ID to GIST_ID.
 *
 * Fallback: If no GITHUB_TOKEN, falls back silently to local JSON files.
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const GIST_ID_FILE = path.join(DATA_DIR, 'gist_id.txt');
const GIST_FILENAME = 'tam_assistant_data.json';

fs.ensureDirSync(DATA_DIR);

let gistId = null;
const token = process.env.GITHUB_TOKEN;

const headers = token ? {
    Authorization: `token ${token}`,
    'Content-Type': 'application/json'
} : {};

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
    if (!token) {
        console.log('[GIST] No GITHUB_TOKEN found — using local JSON only.');
        return false;
    }
    try {
        // 1. Check env var (survives Render restarts) → 2. local file → 3. create new
        const envGistId = process.env.GIST_ID;
        if (envGistId) {
            gistId = envGistId;
            console.log(`[GIST] Using Gist from GIST_ID env var: ${gistId}`);
        } else if (fs.existsSync(GIST_ID_FILE)) {
            gistId = fs.readFileSync(GIST_ID_FILE, 'utf8').trim();
            console.log(`[GIST] Using existing Gist: ${gistId}`);
        } else {
            const res = await axios.post('https://api.github.com/gists', {
                description: 'TAM Assistant — Persistent Data Store',
                public: false,
                files: {
                    [GIST_FILENAME]: {
                        content: JSON.stringify({ _init: true }, null, 2)
                    }
                }
            }, { headers });
            gistId = res.data.id;
            fs.writeFileSync(GIST_ID_FILE, gistId, 'utf8');
            console.log(`[GIST] Created new Gist: ${gistId}`);
            console.log(`[GIST] ⚠️  ADD THIS TO RENDER ENV VARS TO PERSIST DATA:`);
            console.log(`[GIST]    GIST_ID=${gistId}`);
        }
        return true;
    } catch (e) {
        console.error('[GIST] Init failed:', e.message);
        return false;
    }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

async function readAll() {
    if (!token || !gistId) return null;
    try {
        const res = await axios.get(`https://api.github.com/gists/${gistId}`, { headers });
        const content = res.data.files?.[GIST_FILENAME]?.content;
        if (content) return JSON.parse(content);
    } catch (e) {
        console.error('[GIST] Read failed:', e.message);
    }
    return null;
}

// ─── Write ────────────────────────────────────────────────────────────────────

async function writeAll(data) {
    if (!token || !gistId) return false;
    try {
        await axios.patch(`https://api.github.com/gists/${gistId}`, {
            files: {
                [GIST_FILENAME]: {
                    content: JSON.stringify(data, null, 2)
                }
            }
        }, { headers });
        return true;
    } catch (e) {
        console.error('[GIST] Write failed:', e.message);
        return false;
    }
}

// ─── Local fallback helpers ───────────────────────────────────────────────────

function localRead(file, fallback) {
    try {
        const p = path.join(DATA_DIR, file);
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {}
    return fallback;
}

function localWrite(file, data) {
    try {
        fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('[LOCAL] Write failed:', e.message);
    }
}

module.exports = { init, readAll, writeAll, localRead, localWrite };
