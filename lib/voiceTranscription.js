/**
 * Voice Transcription — Powered by Groq Whisper (whisper-large-v3)
 * Automatically transcribes WhatsApp voice notes and audio messages.
 */

const axios = require('axios');
const FormData = require('form-data');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-large-v3';

/**
 * Extract audio message from a WhatsApp message object
 */
function getAudioMessage(msg) {
    const m = msg.message;
    if (!m) return null;
    if (m.audioMessage) return { msg: m.audioMessage, type: 'audio' };
    if (m.videoMessage?.mimetype?.includes('audio')) return { msg: m.videoMessage, type: 'video' };
    if (m.documentMessage?.mimetype?.startsWith('audio/')) return { msg: m.documentMessage, type: 'document' };
    return null;
}

/**
 * Transcribe a WhatsApp audio/voice message
 * @returns {{ success: boolean, text?: string, duration?: number, error?: string }}
 */
async function transcribeVoice(msg, apiKey) {
    try {
        const audio = getAudioMessage(msg);
        if (!audio) {
            return { success: false, error: 'No audio message found. Send or reply to a voice note.' };
        }

        // Download audio from WhatsApp
        const stream = await downloadContentFromMessage(audio.msg, audio.type);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        console.log(`[VOICE] Downloaded audio: ${buffer.length} bytes`);

        const mimeType = audio.msg.mimetype || 'audio/ogg; codecs=opus';
        const ext = mimeType.includes('mp4') ? 'mp4' :
                    mimeType.includes('webm') ? 'webm' :
                    mimeType.includes('mp3') ? 'mp3' : 'ogg';

        // Send to Groq Whisper
        const form = new FormData();
        form.append('file', buffer, { filename: `audio.${ext}`, contentType: mimeType });
        form.append('model', WHISPER_MODEL);
        form.append('response_format', 'verbose_json');
        // No language param — Whisper auto-detects Urdu, Arabic, English, etc.

        const response = await axios.post(GROQ_API_URL, form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${apiKey}`
            },
            timeout: 60000
        });

        const result = response.data;
        const text = result.text?.trim();

        if (!text) {
            return { success: false, error: 'No speech detected in the audio.' };
        }

        const duration = result.duration ? Math.round(result.duration) : null;
        console.log(`[VOICE] Transcribed ${duration || '?'}s: "${text.substring(0, 60)}..."`);

        return { success: true, text, duration };

    } catch (error) {
        const msg_err = error.response?.data?.error?.message || error.message;
        console.error('[VOICE] Error:', msg_err);
        return { success: false, error: msg_err };
    }
}

/**
 * Check if a message contains an audio/voice note
 */
function isVoiceMessage(msg) {
    return !!getAudioMessage(msg);
}

module.exports = { transcribeVoice, isVoiceMessage };
