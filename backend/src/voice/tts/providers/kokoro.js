// backend/src/voice/tts/providers/kokoro.js
const fs = require('fs');
const config = require('../ttsConfig');
const kokoroProcess = require('./kokoroProcess');

async function synthesize(text, options = {}) {
    const voice = options.voice || config.voice;
    const speed = options.speed || config.speed;
    const gradioUrl = config.kokoro.url;
    const endpoint = config.kokoro.endpoint;

    // Step 1: POST to start generation
    const postRes = await fetch(`${gradioUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [text, voice, speed] })
    });

    if (!postRes.ok) throw new Error(`Kokoro POST failed: ${postRes.status}`);
    
    const postData = await postRes.json();
    const eventId = postData.event_id;
    if (!eventId) throw new Error("Kokoro did not return an event_id");

    // Step 2: GET to stream the result
    const getRes = await fetch(`${gradioUrl}${endpoint}/${eventId}`);
    if (!getRes.ok || !getRes.body) throw new Error(`Kokoro GET failed: ${getRes.status}`);

    const reader = getRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let audioPath = null;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const jsonString = line.slice(6).trim();
                if (jsonString === '' || jsonString === 'null') continue;
                
                try {
                    const jsonData = JSON.parse(jsonString);
                    if (Array.isArray(jsonData)) {
                        const audioData = jsonData.find(item => item && typeof item === 'object' && item.path);
                        if (audioData && !audioPath) {
                            audioPath = audioData.path;
                        }
                    }
                } catch (e) {}
            }
        }
    }

    if (!audioPath) throw new Error("Did not find audio path in Kokoro response");

    // Step 3: Read from local disk
    if (!fs.existsSync(audioPath)) throw new Error(`Kokoro audio file not found at: ${audioPath}`);
    
    const audioBuffer = fs.readFileSync(audioPath);
    return {
        buffer: audioBuffer,
        format: 'wav'
    };
}

async function checkServer() {
    try {
        const start = Date.now();
        const res = await fetch(config.kokoro.url, {
            method: 'GET',
            signal: AbortSignal.timeout(2000)
        });
        return {
            available: res.ok,
            provider: 'kokoro',
            latency: Date.now() - start
        };
    } catch (error) {
        return {
            available: false,
            provider: 'kokoro',
            error: error.message
        };
    }
}

async function waitForServer(timeout = config.kokoro.startupTimeout) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
        const result = await checkServer();
        if (result.available) {
            return result;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    return {
        available: false,
        provider: 'kokoro',
        error: `Kokoro did not become available within ${timeout}ms`
    };
}

async function healthCheck() {
    if (!config.enabled) {
        return {
            available: false,
            provider: 'kokoro',
            error: 'TTS_DISABLED'
        };
    }

    // First: see if Kokoro is already running.
    let result = await checkServer();

    if (result.available) {
        return result;
    }

    // Second: optionally start Kokoro.
    if (!config.kokoro.autoStart) {
        return result;
    }

    try {
        console.log('[Kokoro] Server unavailable. Attempting automatic startup...');
        await kokoroProcess.start();
        console.log('[Kokoro] Process started. Waiting for server...');
        
        result = await waitForServer();

        if (result.available) {
            console.log('[Kokoro] Server is ready.');
        }
        return result;
    } catch (error) {
        return {
            available: false,
            provider: 'kokoro',
            error: `Automatic startup failed: ${error.message}`
        };
    }
}

module.exports = {
    synthesize,
    healthCheck
};