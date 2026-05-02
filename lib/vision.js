const axios = require('axios');
const FormData = require('form-data');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

/**
 * Vision Module - Embedded OCR.space Logic
 * Directly calls OCR.space API (same as tam-img-2-text-paid worker).
 * No external worker dependency. Zero risk of inactivity.
 */
async function analyzeImage(sock, message, prompt = "Extract text from this image") {
    try {
        let msg = message;

        // 1. ADVANCED MEDIA DETECTION
        const getMediaMessage = (m) => {
            if (!m) return null;
            if (m.imageMessage) return m.imageMessage;
            if (m.viewOnceMessage?.message?.imageMessage) return m.viewOnceMessage.message.imageMessage;
            if (m.viewOnceMessageV2?.message?.imageMessage) return m.viewOnceMessageV2.message.imageMessage;
            if (m.documentMessage && m.documentMessage.mimetype && m.documentMessage.mimetype.startsWith('image/')) return m.documentMessage;
            return null;
        };

        let mediaMessage = getMediaMessage(msg.message);

        // Check for quoted/replied image
        if (!mediaMessage && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            mediaMessage = getMediaMessage(msg.message.extendedTextMessage.contextInfo.quotedMessage);
        }

        if (!mediaMessage || !mediaMessage.mimetype || !mediaMessage.mimetype.startsWith('image/')) {
            throw new Error('No valid image found. Make sure you are replying to a photo or sending one with the .vision command.');
        }

        // 2. Download Media from WhatsApp
        const stream = await downloadContentFromMessage(mediaMessage, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        console.log(`[VISION] Downloaded image: ${buffer.length} bytes`);

        // 3. Call OCR.space API directly (same logic as tam-img-2-text-paid worker)
        const form = new FormData();
        form.append('file', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
        form.append('language', 'eng');
        form.append('isOverlayRequired', 'true');
        form.append('FileType', '.Auto');
        form.append('IsCreateSearchablePDF', 'false');
        form.append('isSearchablePdfHideTextLayer', 'true');
        form.append('detectOrientation', 'false');
        form.append('isTable', 'false');
        form.append('scale', 'true');
        form.append('OCREngine', '1');
        form.append('detectCheckbox', 'false');
        form.append('checkboxTemplate', '0');

        const ocrResponse = await axios.post('https://api8.ocr.space/parse/image', form, {
            headers: {
                ...form.getHeaders(),
                'apikey': 'donotstealthiskey_ip1',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; RMX2185 Build/QP1A.190711.020) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.60 Mobile Safari/537.36',
                'Referer': 'https://ocr.space/'
            },
            timeout: 45000
        });

        const ocrData = ocrResponse.data;

        if (
            ocrData.OCRExitCode === 1 &&
            !ocrData.IsErroredOnProcessing &&
            ocrData.ParsedResults &&
            ocrData.ParsedResults.length > 0
        ) {
            const parsedResult = ocrData.ParsedResults[0];
            const text = parsedResult.ParsedText.trim();

            if (!text || text.length === 0) {
                throw new Error('No text detected in the image. The image might be too blurry or contain no text.');
            }

            // Build detail array (same as worker)
            const detail = [];
            if (parsedResult.TextOverlay && parsedResult.TextOverlay.Lines) {
                parsedResult.TextOverlay.Lines.forEach(line => {
                    if (line.Words && line.Words.length > 0) {
                        let minLeft = Infinity;
                        let maxRight = 0;
                        line.Words.forEach(word => {
                            minLeft = Math.min(minLeft, word.Left);
                            maxRight = Math.max(maxRight, word.Left + word.Width);
                        });
                        detail.push({
                            lineText: line.LineText,
                            top: line.MinTop,
                            height: line.MaxHeight,
                            left: minLeft,
                            width: maxRight - minLeft
                        });
                    }
                });
            }

            console.log(`[VISION] OCR Success: ${text.length} chars extracted`);

            return {
                success: true,
                result: text,
                detail: detail
            };
        } else {
            const errorMsg = ocrData.ErrorMessage || ocrData.ErrorDetails || 'Unknown OCR error';
            throw new Error(`OCR failed: ${errorMsg}`);
        }

    } catch (error) {
        console.error('[VISION] Error:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = { analyzeImage };
