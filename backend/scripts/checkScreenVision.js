// Explicit local-model smoke check using a caller-supplied JPEG fixture.
// Does not capture any screen, write conversation history, or use cloud models.
const fs = require('node:fs');
const { analyzeScreen } = require('../src/devices/screenAnalysis');
async function main() {
    if (!process.argv[2]) throw new Error('Usage: node backend/scripts/checkScreenVision.js <test-image.jpg>');
    const bytes = fs.readFileSync(process.argv[2]);
    if (bytes.length > 3 * 1024 * 1024 || bytes[0] !== 255 || bytes[1] !== 216) throw new Error('Use a JPEG test fixture smaller than 3 MB');
    const started = Date.now();
    const reply = await analyzeScreen({
        capture: { data: bytes.toString('base64'), displayId: 'synthetic-fixture', monitorNumber: 1,
            observationOnly: require('../../electron/screenAwareness').isScreenRequest(process.argv[3] || ''), capturedAt: Date.now() },
        prompt: process.argv[3] || 'Read the large text in this test image and identify the colored shape. Be concise.',
        context: 'You are Alice. Answer based on visible evidence only.', requestId: 'screen-vision-smoke',
    });
    console.log(JSON.stringify({ elapsedMs: Date.now() - started, reply }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
