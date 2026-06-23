/**
 * Quick test: Verify OCR.space API works from Node.js
 */
const axios = require('axios');
const FormData = require('form-data');

async function testOCR() {
    console.log('🧪 Testing OCR.space API directly from Node.js...\n');

    // 1. Download a test image
    console.log('📥 Downloading test image...');
    const imgRes = await axios.get('https://i.ibb.co/twhJgGdf/Screenshot-20251113-100358-1.jpg', { responseType: 'arraybuffer' });
    const buffer = Buffer.from(imgRes.data);
    console.log(`✅ Downloaded: ${buffer.length} bytes\n`);

    // 2. Call OCR.space directly (same as the worker)
    console.log('📡 Calling OCR.space API...');
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

    const ocrRes = await axios.post('https://api8.ocr.space/parse/image', form, {
        headers: {
            ...form.getHeaders(),
            'apikey': 'donotstealthiskey_ip1',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; RMX2185 Build/QP1A.190711.020) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.60 Mobile Safari/537.36',
            'Referer': 'https://ocr.space/'
        },
        timeout: 45000
    });

    const data = ocrRes.data;
    console.log(`✅ OCR Exit Code: ${data.OCRExitCode}`);
    console.log(`✅ Errored: ${data.IsErroredOnProcessing}`);
    console.log(`✅ Results Count: ${data.ParsedResults?.length}\n`);

    if (data.OCRExitCode === 1 && data.ParsedResults?.length > 0) {
        const text = data.ParsedResults[0].ParsedText.trim();
        console.log(`📝 EXTRACTED TEXT (first 300 chars):\n"${text.substring(0, 300)}"\n`);
        console.log('🎉 SUCCESS! OCR.space API is WORKING from Node.js!');
    } else {
        console.log('❌ FAILED:', data.ErrorMessage || 'Unknown error');
    }
}

testOCR().catch(e => console.error('❌ Test Error:', e.message));
