/**
 * Persistence — Unified data layer backed by GitHub Gist + local JSON fallback.
 * All data survives Render free plan restarts and redeployments.
 */

const gistStore = require('./gistStore');
const moment = require('moment-timezone');

const IMAGE_CONTEXT_TTL = 10 * 60 * 1000;

let _data = {
    banned: [],
    imageContext: {},
    stats: {
        totalMessages: 0,
        totalAIResponses: 0,
        totalVisionRequests: 0,
        totalVoiceTranscriptions: 0,
        totalKeywordAlerts: 0,
        startedAt: new Date().toISOString(),
        perUser: {}
    },
    notes: {},
    reminders: []
};

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function load() {
    await gistStore.init();

    const remote = await gistStore.readAll();
    if (remote && !remote._init) {
        _data = { ..._data, ...remote };
        console.log('[PERSISTENCE] Loaded data from GitHub Gist.');
    } else {
        const localBanned  = gistStore.localRead('banned.json', []);
        const localStats   = gistStore.localRead('stats.json', _data.stats);
        const localNotes   = gistStore.localRead('notes.json', {});
        const localRemind  = gistStore.localRead('reminders.json', []);
        _data.banned       = localBanned;
        _data.stats        = { ..._data.stats, ...localStats };
        _data.notes        = localNotes;
        _data.reminders    = localRemind;
        console.log('[PERSISTENCE] Loaded data from local JSON files.');
    }

    _data.stats.startedAt = _data.stats.startedAt || new Date().toISOString();
    return _data;
}

async function save() {
    gistStore.localWrite('banned.json', _data.banned);
    gistStore.localWrite('stats.json', _data.stats);
    gistStore.localWrite('notes.json', _data.notes);
    gistStore.localWrite('reminders.json', _data.reminders);
    await gistStore.writeAll(_data);
}

// ─── Banned Users ─────────────────────────────────────────────────────────────

function getBanned() {
    return new Set(_data.banned);
}

async function setBanned(set) {
    _data.banned = [...set];
    await save();
}

// ─── Image Context ────────────────────────────────────────────────────────────

function getImageContext() {
    const map = new Map();
    const now = Date.now();
    for (const [k, v] of Object.entries(_data.imageContext || {})) {
        if (now - v.timestamp < IMAGE_CONTEXT_TTL) map.set(k, v);
    }
    return map;
}

async function setImageContext(map) {
    const obj = {};
    for (const [k, v] of map.entries()) obj[k] = v;
    _data.imageContext = obj;
    await save();
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function getStats() {
    return _data.stats;
}

async function incrementStat(key, userId) {
    _data.stats[key] = (_data.stats[key] || 0) + 1;
    if (userId) {
        if (!_data.stats.perUser[userId]) _data.stats.perUser[userId] = { messages: 0, aiCalls: 0 };
        if (key === 'totalMessages') _data.stats.perUser[userId].messages++;
        if (key === 'totalAIResponses') _data.stats.perUser[userId].aiCalls++;
    }
    await save();
}

// ─── Notes ────────────────────────────────────────────────────────────────────

function getNotes(userId) {
    return _data.notes[userId] || [];
}

async function addNote(userId, text) {
    if (!_data.notes[userId]) _data.notes[userId] = [];
    _data.notes[userId].push({ text, createdAt: moment().tz('Asia/Karachi').format('DD MMM, hh:mm A') });
    await save();
}

async function deleteNote(userId, index) {
    if (!_data.notes[userId] || !_data.notes[userId][index]) return false;
    _data.notes[userId].splice(index, 1);
    await save();
    return true;
}

async function clearNotes(userId) {
    _data.notes[userId] = [];
    await save();
}

// ─── Reminders ────────────────────────────────────────────────────────────────

function getReminders() {
    return _data.reminders || [];
}

async function addReminder(userId, jid, text, fireAt) {
    const reminder = { id: Date.now().toString(), userId, jid, text, fireAt };
    _data.reminders.push(reminder);
    await save();
    return reminder;
}

async function removeReminder(id) {
    _data.reminders = _data.reminders.filter(r => r.id !== id);
    await save();
}

module.exports = {
    load, save,
    getBanned, setBanned,
    getImageContext, setImageContext,
    getStats, incrementStat,
    getNotes, addNote, deleteNote, clearNotes,
    getReminders, addReminder, removeReminder
};
