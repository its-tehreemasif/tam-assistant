/**
 * Vision Module — Powered by Groq's native vision model (llama-3.2-11b-vision-preview)
 * Directly understands images: text, diagrams, handwriting, charts, and more.
 * Falls back to OCR.space if Groq vision fails.
 */

const axios = require('axios');
const FormData = require('form-data');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Download an image from a WhatsApp message as a Base64 string
 */
async function downloadImageAsBase64(sock, message) {
    const getMediaMessage = (m) => {
        if (!m) return null;
        if (m.imageMessage) return m.imageMessage;
        if (m.viewOnceMessage?.message?.imageMessage) return m.viewOnceMessage.message.imageMessage;
        if (m.viewOnceMessageV2?.message?.imageMessage) return m.viewOnceMessageV2.message.imageMessage;
        if (m.documentMessage?.mimetype?.startsWith('image/')) return m.documentMessage;
        return null;
    };

    let mediaMessage = getMediaMessage(message.message);

    if (!mediaMessage && message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        mediaMessage = getMediaMessage(message.message.extendedTextMessage.contextInfo.quotedMessage);
    }

    if (!mediaMessage || !mediaMessage.mimetype?.startsWith('image/')) {
        throw new Error('No valid image found. Send or reply to a photo with the .vision command.');
    }

    const stream = await downloadContentFromMessage(mediaMessage, 'image');
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }

    console.log(`[VISION] Downloaded image: ${buffer.length} bytes`);
    return {
        base64: buffer.toString('base64'),
        mimeType: mediaMessage.mimetype || 'image/jpeg',
        buffer
    };
}

/**
 * Analyze image using Groq's native vision model
 */
async function analyzeWithGroqVision(base64, mimeType, userQuestion, apiKey) {
    const systemPrompt = `You are a professional AI assistant responding on WhatsApp.

*WhatsApp Formatting Rules (MANDATORY):*
• *Bold* = single asterisks: *text*
• _Italic_ = single underscores: _text_
• Monospace = triple backticks: \`\`\`code\`\`\`
• Use bullet points (•) and numbered lists (1. 2. 3.)
• Keep paragraphs short — never dump walls of text
• Use relevant emojis naturally throughout responses
• Start every response with a relevant emoji`;

    const imagePrompt = userQuestion
        ? `The user shared an image and asked: "${userQuestion}"\n\nAnalyze the image carefully and answer the question thoroughly. Be detailed and professional.`
        : `Analyze this image comprehensively.\n\n*If it contains questions/assignments:* Answer each one thoroughly with full detail and examples.\n*If it's a receipt/invoice:* Break down all items, charges, and totals.\n*If it's a document/notes:* Explain and expand on the content.\n*If it's a diagram/chart:* Describe and explain what it shows.\n*If it's a conversation/screenshot:* Summarize key points and context.\n\nBe thorough and professional — the user expects premium quality.`;

    const response = await axios.post(
        GROQ_API_URL,
        {
            model: GROQ_VISION_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: { url: `data:${mimeType};base64,${base64}` }
                        },
                        { type: 'text', text: imagePrompt }
                    ]
                }
            ],
            temperature: 0.7,
            max_tokens: 4096
        },
        {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 60000
        }
    );

    return response.data.choices[0].message.content;
}

/**
 * Fallback: OCR.space for plain text extraction
 */
async function analyzeWithOCR(buffer, ocrApiKey) {
    const form = new FormData();
    form.append('file', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
    form.append('language', 'eng');
    form.append('isOverlayRequired', 'false');
    form.append('FileType', '.Auto');
    form.append('scale', 'true');
    form.append('OCREngine', '2');

    const ocrResponse = await axios.post('https://api8.ocr.space/parse/image', form, {
        headers: {
            ...form.getHeaders(),
            'apikey': ocrApiKey || process.env.OCR_API_KEY || 'helloworld'
        },
        timeout: 45000
    });

    const data = ocrResponse.data;
    if (data.OCRExitCode === 1 && !data.IsErroredOnProcessing && data.ParsedResults?.length > 0) {
        const text = data.ParsedResults[0].ParsedText.trim();
        if (!text) throw new Error('No text detected in the image.');
        return text;
    }
    throw new Error(data.ErrorMessage || 'OCR failed to process the image.');
}

/**
 * Main entry point — tries Groq vision first, falls back to OCR.space
 */
async function analyzeImage(sock, message, userQuestion = '') {
    try {
        const { base64, mimeType, buffer } = await downloadImageAsBase64(sock, message);
        const groqApiKey = process.env.GROQ_API_KEY;

        if (groqApiKey) {
            try {
                console.log('[VISION] Analyzing with Groq Vision...');
                const result = await analyzeWithGroqVision(base64, mimeType, userQuestion, groqApiKey);
                console.log(`[VISION] Groq Vision success: ${result.length} chars`);
                return { success: true, result, source: 'groq-vision' };
            } catch (groqErr) {
                console.error('[VISION] Groq vision failed, falling back to OCR:', groqErr.message);
            }
        }

        // Fallback to OCR.space
        console.log('[VISION] Falling back to OCR.space...');
        const ocrText = await analyzeWithOCR(buffer);
        return { success: true, result: ocrText, source: 'ocr' };

    } catch (error) {
        console.error('[VISION] Error:', error.message);
        return { success: false, error: error.message };
    }
}

module.exports = { analyzeImage };
