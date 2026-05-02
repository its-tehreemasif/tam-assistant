/**
 * Rate Limiter — Protects against spam and API cost abuse
 * Configurable per-user message limits within a rolling time window.
 */

const WINDOW_MS = 60 * 1000; // 1 minute rolling window
const MAX_MESSAGES = 10;      // max messages per user per window
const MAX_AI_CALLS = 5;       // max AI calls per user per window

class RateLimiter {
    constructor() {
        this.messageLog = new Map();  // userId -> [timestamps]
        this.aiCallLog = new Map();   // userId -> [timestamps]
    }

    _prune(log, userId) {
        const now = Date.now();
        const timestamps = (log.get(userId) || []).filter(t => now - t < WINDOW_MS);
        log.set(userId, timestamps);
        return timestamps;
    }

    checkMessage(userId) {
        const timestamps = this._prune(this.messageLog, userId);
        if (timestamps.length >= MAX_MESSAGES) {
            const oldest = timestamps[0];
            const resetIn = Math.ceil((WINDOW_MS - (Date.now() - oldest)) / 1000);
            return { allowed: false, resetIn };
        }
        timestamps.push(Date.now());
        this.messageLog.set(userId, timestamps);
        return { allowed: true };
    }

    checkAI(userId) {
        const timestamps = this._prune(this.aiCallLog, userId);
        if (timestamps.length >= MAX_AI_CALLS) {
            const oldest = timestamps[0];
            const resetIn = Math.ceil((WINDOW_MS - (Date.now() - oldest)) / 1000);
            return { allowed: false, resetIn };
        }
        timestamps.push(Date.now());
        this.aiCallLog.set(userId, timestamps);
        return { allowed: true };
    }

    getUsage(userId) {
        const msgs = this._prune(this.messageLog, userId).length;
        const ai = this._prune(this.aiCallLog, userId).length;
        return {
            messages: { used: msgs, max: MAX_MESSAGES },
            aiCalls: { used: ai, max: MAX_AI_CALLS }
        };
    }
}

module.exports = new RateLimiter();
