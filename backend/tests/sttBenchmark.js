// tests/sttBenchmark.js
const fs = require('fs');
const path = require('path');
const { createSttAdapter } = require('../src/voice/stt/sttAdapter');

async function runTest() {
    console.log('🚀 STARTING STT BENCHMARK\n');
    
    const audioPath = path.join(__dirname, 'test.mp3'); // Change to test.wav if you used wav
    
    if (!fs.existsSync(audioPath)) {
        console.error(`❌ Audio file not found at: ${audioPath}`);
        console.error('Please record an audio file and save it in the tests folder.');
        process.exit(1);
    }

    const audioBuffer = fs.readFileSync(audioPath);
    console.log(`Audio file loaded: ${(audioBuffer.length / 1024).toFixed(2)} KB`);

    const stt = createSttAdapter('faster-whisper');
    
    console.log('Sending audio to Faster-Whisper (this may take a moment for initial model load)...\n');
    
    const startTime = Date.now();
    
    try {
        const result = await stt.transcribe(audioBuffer, { model: 'small', language: 'en' });
        const totalTime = Date.now() - startTime;
        
        console.log('=========================================');
        console.log('📊 STT BENCHMARK COMPLETE');
        console.log('=========================================');
        console.log(`Transcript: "${result.text}"`);
        console.log(`Language:   ${result.language}`);
        console.log(`Duration:   ${result.duration}s`);
        console.log(`Total Latency (Model Load + Transcribe): ${totalTime}ms`);
        console.log('=========================================\n');
        
    } catch (error) {
        console.error('❌ STT Benchmark Failed:', error.message);
    }
    
    process.exit(0);
}

runTest();